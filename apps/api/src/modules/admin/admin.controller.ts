import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSION_GROUPS } from '@puja/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, IsBoolean, IsDateString, IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, toPage } from '../../common/dto/pagination.dto';
import { AuthUser } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { AdminService } from './admin.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

class CreateUserDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) roleIds: string[];
  @IsOptional() @IsString() @MinLength(10) @MaxLength(200) password?: string;
}

class UpdateUserDto {
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) roleIds?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(200) password?: string;
}

class RoleDto {
  @IsOptional() @IsString() @MaxLength(40) key?: string;
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(500) permissions: string[];
}

class AuditQueryDto extends PageQueryDto {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class SettingsPatchDto {
  @IsObject() @Type(() => Object) value: Record<string, unknown>;
}

class SequencePatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(8) prefix?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(10) padding?: number;
}

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('users')
  @RequirePermissions('admin.users.manage')
  users(@Query('search') search?: string) {
    return this.admin.listUsers(search);
  }

  @Get('users/:id')
  @RequirePermissions('admin.users.manage')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users')
  @RequirePermissions('admin.users.manage')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.admin.createUser(dto, actor);
  }

  @Patch('users/:id')
  @RequirePermissions('admin.users.manage')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.admin.updateUser(id, dto, actor);
  }

  @Post('users/:id/unlock')
  @HttpCode(204)
  @RequirePermissions('admin.users.manage')
  unlock(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.admin.unlockUser(id, actor);
  }

  @Get('users/:id/sessions')
  @RequirePermissions('admin.users.manage')
  sessions(@Param('id') id: string) {
    return this.auth.listSessions(id);
  }

  @Delete('users/:id/sessions/:sid')
  @HttpCode(204)
  @RequirePermissions('admin.users.manage')
  revoke(@Param('id') id: string, @Param('sid') sid: string, @CurrentUser() actor: AuthUser) {
    return this.auth.revokeSession(id, sid, actor.id);
  }

  @Get('roles')
  @RequirePermissions('admin.roles.manage')
  roles() {
    return this.admin.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('admin.roles.manage')
  permissions() {
    return PERMISSION_GROUPS;
  }

  @Post('roles')
  @RequirePermissions('admin.roles.manage')
  async createRole(@Body() dto: RoleDto, @CurrentUser() actor: AuthUser) {
    return { id: await this.admin.upsertRole(null, dto, actor) };
  }

  @Put('roles/:id')
  @RequirePermissions('admin.roles.manage')
  async updateRole(@Param('id') id: string, @Body() dto: RoleDto, @CurrentUser() actor: AuthUser) {
    return { id: await this.admin.upsertRole(id, dto, actor) };
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions('admin.roles.manage')
  deleteRole(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.admin.deleteRole(id, actor);
  }

  @Get('audit')
  @RequirePermissions('admin.audit.view')
  async auditLog(@Query() q: AuditQueryDto) {
    const { rows, total } = await this.audit.list({
      ...q,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      ...pageArgs(q),
    });
    return toPage(rows, total, q);
  }

  @Get('settings')
  @RequirePermissions('admin.settings.manage')
  allSettings() {
    return this.settings.all();
  }

  @Put('settings/:key')
  @RequirePermissions('admin.settings.manage')
  updateSettings(@Param('key') key: string, @Body() dto: SettingsPatchDto, @CurrentUser() actor: AuthUser) {
    return this.settings.update(key, dto.value, actor.id);
  }

  @Get('sequences')
  @RequirePermissions('admin.settings.manage')
  sequences() {
    return this.prisma.documentSequence.findMany({ orderBy: { key: 'asc' } });
  }

  @Patch('sequences/:key')
  @RequirePermissions('admin.settings.manage')
  async updateSequence(@Param('key') key: string, @Body() dto: SequencePatchDto, @CurrentUser() actor: AuthUser) {
    const before = await this.prisma.documentSequence.findUniqueOrThrow({ where: { key } });
    const after = await this.prisma.documentSequence.update({ where: { key }, data: { prefix: dto.prefix, padding: dto.padding } });
    await this.audit.record({ action: 'sequence.updated', entityType: 'DocumentSequence', entityId: key, before, after, actorId: actor.id });
    return after;
  }
}
