import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from '../decorators';
import { Errors } from '../errors';
import { AuthUser, hasPermission } from '../request-context';

/**
 * Enforces @RequirePermissions / @RequireAnyPermission. Routes without a
 * permission decorator only require authentication (used for self-service
 * endpoints such as /auth/me and notifications).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (!required?.length) return true;
    const mode = this.reflector.getAllAndOverride<'all' | 'any'>(PERMISSIONS_MODE_KEY, targets) ?? 'all';
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw Errors.forbidden();
    const ok = mode === 'any' ? required.some((p) => hasPermission(user, p)) : required.every((p) => hasPermission(user, p));
    if (!ok) throw Errors.forbidden(`Missing permission: ${required.join(mode === 'any' ? ' or ' : ', ')}`);
    return true;
  }
}

export function assertPermission(user: AuthUser, permission: string, message?: string) {
  if (!hasPermission(user, permission)) throw Errors.forbidden(message ?? `Missing permission: ${permission}`);
}
