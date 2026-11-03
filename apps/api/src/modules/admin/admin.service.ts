import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, isPermission } from '@puja/shared';
import { randomBytes } from 'node:crypto';
import { Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

export interface UpsertUserInput {
  email?: string;
  name?: string;
  phone?: string | null;
  roleIds?: string[];
  isActive?: boolean;
  password?: string;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, key: true, name: true } } } },
  worker: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  // ─── Users ──────────────────────────────────────────────

  async listUsers(search?: string) {
    const users = await this.prisma.user.findMany({
      where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : undefined,
      select: userSelect,
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role) }));
  }

  async getUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!u) throw Errors.notFound('User', id);
    return { ...u, roles: u.roles.map((r) => r.role) };
  }

  /** Creates a user. If no password is supplied a random one is generated and returned once. */
  async createUser(input: UpsertUserInput, actor: AuthUser) {
    if (!input.email || !input.name) throw Errors.validation('Email and name are required');
    const generated = !input.password;
    const password = input.password ?? `${randomBytes(9).toString('base64url')}7a`;
    this.auth.assertPolicy(password);
    await this.assertRoles(input.roleIds ?? []);
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: input.email!.toLowerCase().trim(),
          name: input.name!.trim(),
          phone: input.phone ?? null,
          isActive: input.isActive ?? true,
          passwordHash: await AuthService.hashPassword(password),
          roles: { create: (input.roleIds ?? []).map((roleId) => ({ roleId })) },
        },
        select: userSelect,
      });
      await this.audit.record({ action: 'user.created', entityType: 'User', entityId: u.id, after: { email: u.email, name: u.name, roles: input.roleIds }, actorId: actor.id }, tx);
      return u;
    });
    return { user: { ...user, roles: user.roles.map((r) => r.role) }, temporaryPassword: generated ? password : undefined };
  }

  async updateUser(id: string, input: UpsertUserInput, actor: AuthUser) {
    const before = await this.getUser(id);
    if (input.roleIds) await this.assertRoles(input.roleIds);
    if (input.password) this.auth.assertPolicy(input.password);
    if (id === actor.id && input.isActive === false) throw Errors.rule('SELF_DEACTIVATION', 'You cannot deactivate your own account');
    if (input.roleIds && id === actor.id) {
      const adminRole = await this.prisma.role.findUnique({ where: { key: 'administrator' } });
      if (adminRole && before.roles.some((r) => r.key === 'administrator') && !input.roleIds.includes(adminRole.id)) {
        throw Errors.rule('SELF_DEMOTION', 'You cannot remove the Administrator role from yourself');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          phone: input.phone,
          email: input.email?.toLowerCase().trim(),
          isActive: input.isActive,
          ...(input.roleIds || input.isActive === false ? { permissionVersion: { increment: 1 } } : {}),
          ...(input.password ? { passwordHash: await AuthService.hashPassword(input.password), passwordChangedAt: new Date() } : {}),
        },
      });
      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: input.roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (input.isActive === false || input.password) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: input.password ? 'admin_password_reset' : 'user_deactivated' } });
      }
      await this.audit.record(
        { action: 'user.updated', entityType: 'User', entityId: id, before: { ...before, password: undefined }, after: { ...input, password: input.password ? '***' : undefined }, actorId: actor.id },
        tx,
      );
    });
    await this.ensureAnAdministratorRemains();
    this.auth.invalidate(id);
    return this.getUser(id);
  }

  async unlockUser(id: string, actor: AuthUser) {
    await this.prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
    await this.audit.record({ action: 'user.unlocked', entityType: 'User', entityId: id, actorId: actor.id });
  }

  private async assertRoles(roleIds: string[]) {
    if (!roleIds.length) return;
    const count = await this.prisma.role.count({ where: { id: { in: roleIds } } });
    if (count !== new Set(roleIds).size) throw Errors.validation('One or more roles do not exist');
  }

  private async ensureAnAdministratorRemains() {
    const n = await this.prisma.user.count({ where: { isActive: true, roles: { some: { role: { key: 'administrator' } } } } });
    if (n === 0) throw Errors.rule('LAST_ADMIN', 'At least one active Administrator is required');
  }

  // ─── Roles ──────────────────────────────────────────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { name: 'asc' } });
    return roles.map((r) => ({ ...r, permissions: r.permissions.map((p) => p.permission), userCount: r._count.users, _count: undefined }));
  }

  async upsertRole(id: string | null, input: { key?: string; name: string; description?: string; permissions: string[] }, actor: AuthUser) {
    const invalid = input.permissions.filter((p) => !isPermission(p));
    if (invalid.length) throw Errors.validation(`Unknown permissions: ${invalid.join(', ')}`);
    const permissions = [...new Set(input.permissions)];
    return this.prisma.$transaction(async (tx) => {
      let roleId = id;
      if (id) {
        const before = await tx.role.findUnique({ where: { id }, include: { permissions: true } });
        if (!before) throw Errors.notFound('Role', id);
        if (before.key === 'administrator' && permissions.length !== ALL_PERMISSIONS.length) {
          throw Errors.rule('ADMIN_ROLE_LOCKED', 'The Administrator role always has every permission');
        }
        await tx.role.update({ where: { id }, data: { name: input.name, description: input.description } });
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await this.audit.record({ action: 'role.updated', entityType: 'Role', entityId: id, before: { ...before, permissions: before.permissions.map((p) => p.permission) }, after: { ...input, permissions }, actorId: actor.id }, tx);
      } else {
        if (!input.key || !/^[a-z][a-z0-9_]{2,40}$/.test(input.key)) throw Errors.validation('Role key must be lower_snake_case (3–40 chars)');
        const role = await tx.role.create({ data: { key: input.key, name: input.name, description: input.description } });
        roleId = role.id;
        await this.audit.record({ action: 'role.created', entityType: 'Role', entityId: role.id, after: { ...input, permissions }, actorId: actor.id }, tx);
      }
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: roleId!, permission })) });
      // force permission refresh for affected users
      await tx.user.updateMany({ where: { roles: { some: { roleId: roleId! } } }, data: { permissionVersion: { increment: 1 } } });
      return roleId!;
    });
  }

  async deleteRole(id: string, actor: AuthUser) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw Errors.notFound('Role', id);
    if (role.isSystem) throw Errors.rule('SYSTEM_ROLE', 'System roles cannot be deleted');
    if (role._count.users > 0) throw Errors.rule('ROLE_IN_USE', 'Remove this role from all users first');
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.record({ action: 'role.deleted', entityType: 'Role', entityId: id, before: role, actorId: actor.id }, tx);
    });
  }
}
