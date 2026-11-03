import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { CurrentUser, Public } from '../../common/decorators';
import { ACCESS_COOKIE, assertTrustedOrigin, REFRESH_COOKIE } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/request-context';
import { AppError } from '../../common/errors';
import { AuthService, IssuedTokens } from './auth.service';

class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

class RefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

class ResetPasswordDto {
  @IsString()
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;
}

function cookieOpts(expires: Date, path = '/'): CookieOptions {
  const secure = env().COOKIE_SECURE ?? env().NODE_ENV === 'production';
  return { httpOnly: true, secure, sameSite: 'strict', expires, path };
}

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookies(res: Response, t: IssuedTokens) {
    res.cookie(ACCESS_COOKIE, t.accessToken, cookieOpts(t.accessExpiresAt));
    res.cookie(REFRESH_COOKIE, t.refreshToken, cookieOpts(t.refreshExpiresAt, '/api/v1/auth'));
  }

  /**
   * Web clients receive httpOnly cookies. Native/mobile clients send
   * `X-Client: mobile` and receive tokens in the body instead.
   */
  private respond(req: Request, res: Response, t: IssuedTokens) {
    if (req.headers['x-client'] === 'mobile') {
      return { accessToken: t.accessToken, accessExpiresAt: t.accessExpiresAt, refreshToken: t.refreshToken, refreshExpiresAt: t.refreshExpiresAt };
    }
    this.setCookies(res, t);
    return { accessExpiresAt: t.accessExpiresAt };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.headers['x-client'] !== 'mobile' && req.headers.origin) assertTrustedOrigin(req);
    const tokens = await this.auth.login(dto.email, dto.password, meta(req));
    return this.respond(req, res, tokens);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (fromCookie) assertTrustedOrigin(req);
    const token = dto.refreshToken ?? fromCookie;
    if (!token) throw new AppError('SESSION_INVALID', 'No refresh token', 401);
    const tokens = await this.auth.refresh(token, meta(req));
    return this.respond(req, res, tokens);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId, user.id);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.auth.revokeSession(user.id, id, user.id);
  }
}
