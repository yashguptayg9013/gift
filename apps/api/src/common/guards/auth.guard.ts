import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';
import { AppError } from '../errors';
import { RequestContextStore } from '../request-context';
import { AuthService } from '../../modules/auth/auth.service';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'puja_at';
export const REFRESH_COOKIE = 'puja_rt';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.headers.authorization;
    let token: string | undefined;
    let viaCookie = false;
    if (header?.startsWith('Bearer ')) token = header.slice(7).trim();
    else if (req.cookies?.[ACCESS_COOKIE]) {
      token = req.cookies[ACCESS_COOKIE];
      viaCookie = true;
    }
    if (!token) throw new AppError('UNAUTHENTICATED', 'Authentication required', HttpStatus.UNAUTHORIZED);

    // CSRF defence in depth for cookie-authenticated mutations: require a trusted Origin.
    if (viaCookie && !SAFE_METHODS.has(req.method)) assertTrustedOrigin(req);

    const payload = this.auth.verifyAccessToken(token);
    if (!payload) throw new AppError('TOKEN_EXPIRED', 'Access token expired or invalid', HttpStatus.UNAUTHORIZED);
    const user = await this.auth.resolvePrincipal(payload);
    if (!user) throw new AppError('TOKEN_EXPIRED', 'Session is no longer valid', HttpStatus.UNAUTHORIZED);

    req.user = user;
    const ctx = RequestContextStore.get();
    if (ctx) ctx.user = user;
    return true;
  }
}

export function assertTrustedOrigin(req: Request) {
  const origin = (req.headers.origin as string | undefined) ?? refererOrigin(req.headers.referer);
  const allowed = env()
    .CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Same-origin requests proxied by Next.js carry the app's origin; non-browser
  // clients without an Origin header must use Bearer tokens instead of cookies.
  if (!origin || !allowed.includes(origin)) {
    throw new AppError('CSRF_REJECTED', 'Request origin is not allowed', HttpStatus.FORBIDDEN);
  }
}

function refererOrigin(ref?: string) {
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return undefined;
  }
}
