import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { AppError, Errors } from '../../common/errors';
import { AuthUser } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../../infra/mail/mail.service';

export interface AccessPayload {
  sub: string;
  sid: string;
  pv: number;
}

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, raw: false } as const;

export const PASSWORD_POLICY = {
  minLength: 10,
  describe: 'At least 10 characters including a letter and a number',
  test: (p: string) => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p),
};

interface CacheEntry {
  user: AuthUser;
  pv: number;
  expires: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** short-lived cache of resolved principals (userId:sid) → avoids a DB hit per request */
  private cache = new Map<string, CacheEntry>();
  private static readonly CACHE_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private dummy?: Promise<string>;
  /** a real hash used to equalise timing for unknown emails */
  private dummyHash() {
    this.dummy ??= AuthService.hashPassword(randomBytes(16).toString('hex'));
    return this.dummy;
  }

  static hashPassword(password: string) {
    return argon2.hash(password, ARGON_OPTS);
  }

  // ─── Login / tokens ────────────────────────────────────────────────

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    // Constant-ish time: always run a verify even for unknown users.
    const hash: string = user?.passwordHash ?? (await this.dummyHash());
    const invalid = () => new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect', HttpStatus.UNAUTHORIZED);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.', HttpStatus.LOCKED);
    }
    let ok = false;
    try {
      ok = await argon2.verify(hash, password);
    } catch {
      ok = false;
    }
    if (!user || !ok) {
      if (user) {
        const attempts = user.failedLoginCount + 1;
        const lock = attempts >= env().LOGIN_MAX_ATTEMPTS;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: lock ? 0 : attempts,
            lockedUntil: lock ? new Date(Date.now() + env().LOGIN_LOCK_MINUTES * 60_000) : null,
          },
        });
        await this.audit.record({
          action: lock ? 'auth.locked' : 'auth.login_failed',
          entityType: 'User',
          entityId: user.id,
          actorId: user.id,
          metadata: { ip: meta.ip },
        });
      }
      throw invalid();
    }
    if (!user.isActive) throw new AppError('ACCOUNT_DISABLED', 'This account is disabled', HttpStatus.FORBIDDEN);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const tokens = await this.createSession(user.id, user.permissionVersion, meta);
    await this.audit.record({ action: 'auth.login', entityType: 'User', entityId: user.id, actorId: user.id, metadata: { ip: meta.ip } });
    return tokens;
  }

  private async createSession(userId: string, pv: number, meta: { ip?: string; userAgent?: string }): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TTL_DAYS * 86_400_000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    return { ...this.signAccess({ sub: userId, sid: session.id, pv }), refreshToken, refreshExpiresAt };
  }

  private signAccess(payload: AccessPayload) {
    const ttl = env().JWT_ACCESS_TTL_SECONDS;
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: ttl }),
      accessExpiresAt: new Date(Date.now() + ttl * 1000),
    };
  }

  /**
   * Rotate a refresh token. Reuse of an already-rotated token is treated as theft:
   * the whole session is revoked.
   */
  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }): Promise<IssuedTokens> {
    const hash = sha256(refreshToken);
    const unauthorized = (msg = 'Session expired. Please sign in again.') =>
      new AppError('SESSION_INVALID', msg, HttpStatus.UNAUTHORIZED);

    const reused = await this.prisma.session.findUnique({ where: { previousHash: hash } });
    if (reused) {
      await this.prisma.session.update({
        where: { id: reused.id },
        data: { revokedAt: new Date(), revokedReason: 'refresh_token_reuse' },
      });
      this.invalidate(reused.userId);
      await this.audit.record({ action: 'auth.refresh_reuse_detected', entityType: 'Session', entityId: reused.id, actorId: reused.userId, metadata: { ip: meta.ip } });
      throw unauthorized();
    }
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) throw unauthorized();

    const next = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TTL_DAYS * 86_400_000);
    // optimistic rotation: only succeeds if the hash did not change concurrently
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: {
        previousHash: hash,
        refreshTokenHash: sha256(next),
        lastUsedAt: new Date(),
        expiresAt: refreshExpiresAt,
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    if (rotated.count !== 1) throw unauthorized();
    return {
      ...this.signAccess({ sub: session.userId, sid: session.id, pv: session.user.permissionVersion }),
      refreshToken: next,
      refreshExpiresAt,
    };
  }

  async logout(sessionId: string | null, userId: string) {
    if (sessionId) {
      await this.prisma.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'logout' },
      });
    }
    this.cache.delete(`${userId}:${sessionId}`);
    await this.audit.record({ action: 'auth.logout', entityType: 'User', entityId: userId, actorId: userId });
  }

  // ─── Principal resolution (used by the auth guard) ─────────────────

  verifyAccessToken(token: string): AccessPayload | null {
    try {
      return this.jwt.verify<AccessPayload>(token);
    } catch {
      return null;
    }
  }

  async resolvePrincipal(payload: AccessPayload): Promise<AuthUser | null> {
    const key = `${payload.sub}:${payload.sid}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now() && hit.pv === payload.pv) return hit.user;

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, userId: true },
    });
    if (!session || session.revokedAt || session.userId !== payload.sub || session.expiresAt < new Date()) return null;

    const user = await this.loadUser(payload.sub);
    if (!user || !user.isActive) return null;
    // permission version changed since token was issued: force refresh so the new token
    // carries the new version (the client refreshes transparently on 401).
    if (user.permissionVersion !== payload.pv) return null;

    const principal = this.toPrincipal(user, payload.sid);
    this.cache.set(key, { user: principal, pv: payload.pv, expires: Date.now() + AuthService.CACHE_MS });
    return principal;
  }

  private loadUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: { include: { permissions: true } } } }, worker: { select: { id: true } } },
    });
  }

  private toPrincipal(user: NonNullable<Awaited<ReturnType<AuthService['loadUser']>>>, sid: string | null): AuthUser {
    const permissions = new Set<string>();
    for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      sessionId: sid,
      roles: user.roles.map((r) => r.role.key),
      permissions,
      workerId: user.worker?.id ?? null,
    };
  }

  /** Build a principal for an arbitrary user (used by approvals executing as the approver). */
  async principalFor(userId: string): Promise<AuthUser> {
    const user = await this.loadUser(userId);
    if (!user) throw Errors.notFound('User', userId);
    return this.toPrincipal(user, null);
  }

  invalidate(userId: string) {
    for (const k of this.cache.keys()) if (k.startsWith(`${userId}:`)) this.cache.delete(k);
  }

  // ─── Profile / passwords ───────────────────────────────────────────

  async me(user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, email: true, name: true, phone: true, lastLoginAt: true, roles: { select: { role: { select: { key: true, name: true } } } } },
    });
    return {
      ...u,
      roles: u.roles.map((r) => r.role),
      permissions: [...user.permissions].sort(),
      workerId: user.workerId,
    };
  }

  async changePassword(user: AuthUser, current: string, next: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await argon2.verify(u.passwordHash, current))) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect', HttpStatus.BAD_REQUEST);
    }
    this.assertPolicy(next);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await AuthService.hashPassword(next), passwordChangedAt: new Date() } }),
      // revoke every other session
      this.prisma.session.updateMany({
        where: { userId: u.id, revokedAt: null, NOT: { id: user.sessionId ?? '' } },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
    this.invalidate(u.id);
    await this.audit.record({ action: 'auth.password_changed', entityType: 'User', entityId: u.id, actorId: u.id });
  }

  assertPolicy(password: string) {
    if (!PASSWORD_POLICY.test(password)) throw Errors.validation(`Password policy: ${PASSWORD_POLICY.describe}`);
  }

  /** Always resolves (does not reveal whether the email exists). */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.isActive) return;
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    const link = `${env().APP_URL}/reset-password?token=${token}`;
    await this.mail.send({
      to: user.email,
      subject: 'PUJA OS password reset',
      text: `Hello ${user.name},\n\nUse this link within 30 minutes to reset your password:\n${link}\n\nIf you did not request this, ignore this email.`,
    });
    await this.audit.record({ action: 'auth.password_reset_requested', entityType: 'User', entityId: user.id, actorId: user.id });
  }

  async resetPassword(token: string, password: string) {
    this.assertPolicy(password);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new AppError('RESET_TOKEN_INVALID', 'This reset link is invalid or has expired', HttpStatus.BAD_REQUEST);
    }
    const consumed = await this.prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw new AppError('RESET_TOKEN_INVALID', 'This reset link has already been used', HttpStatus.BAD_REQUEST);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await AuthService.hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password_reset' } }),
    ]);
    this.invalidate(record.userId);
    await this.audit.record({ action: 'auth.password_reset', entityType: 'User', entityId: record.userId, actorId: record.userId });
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, lastUsedAt: true, ip: true, userAgent: true, expiresAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string, actorId: string) {
    const r = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: actorId === userId ? 'user_revoked' : 'admin_revoked' },
    });
    if (!r.count) throw Errors.notFound('Session', sessionId);
    this.cache.delete(`${userId}:${sessionId}`);
    await this.audit.record({ action: 'auth.session_revoked', entityType: 'Session', entityId: sessionId, actorId });
  }
}
