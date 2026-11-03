import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@puja/shared';
import type { AuthUser } from '../request-context';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissionsMode';
/** Require ALL listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
/** Require ANY of the listed permissions. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions), SetMetadata(PERMISSIONS_MODE_KEY, 'any'));

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});

/** Reads the Idempotency-Key header (optional). */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest();
  const v = req.headers['idempotency-key'];
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim().slice(0, 128);
});
