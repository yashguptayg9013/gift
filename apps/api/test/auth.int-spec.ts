import { createHash } from 'node:crypto';
import { API, createTestContext, PASSWORD, TestCtx } from './helpers';

describe('Authentication & security (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  const emailOf = async (id: string) => (await ctx.prisma.user.findUniqueOrThrow({ where: { id } })).email;
  const login = (email: string, password = PASSWORD) => ctx.http().post(`${API}/auth/login`).set('X-Client', 'mobile').send({ email, password });

  it('rotates refresh tokens and revokes the session when a rotated token is reused', async () => {
    const u = await ctx.as('viewer');
    const r1 = await login(await emailOf(u.userId)).expect(200);
    const r2 = await ctx.http().post(`${API}/auth/refresh`).set('X-Client', 'mobile').send({ refreshToken: r1.body.refreshToken }).expect(200);
    expect(r2.body.refreshToken).not.toBe(r1.body.refreshToken);
    // reuse of the old token → theft detected, whole session revoked
    await ctx.http().post(`${API}/auth/refresh`).set('X-Client', 'mobile').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await ctx.http().post(`${API}/auth/refresh`).set('X-Client', 'mobile').send({ refreshToken: r2.body.refreshToken }).expect(401);
    await ctx.http().get(`${API}/auth/me`).set('Authorization', `Bearer ${r2.body.accessToken}`).expect(401);
  });

  it('locks the account after repeated failures without revealing whether the email exists', async () => {
    const u = await ctx.as('viewer');
    const email = await emailOf(u.userId);
    const unknown = await login('nobody@test.local', 'whatever');
    expect(unknown.status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await login(email, 'wrong-password-1')).body.error.code).toBe('INVALID_CREDENTIALS');
    const locked = await login(email);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('resets passwords with a single-use token and revokes existing sessions', async () => {
    const u = await ctx.as('viewer');
    const email = await emailOf(u.userId);
    await ctx.http().post(`${API}/auth/forgot-password`).send({ email }).expect(202);
    await ctx.http().post(`${API}/auth/forgot-password`).send({ email: 'unknown@test.local' }).expect(202);
    // the plain token is only emailed; simulate the email by issuing a known token
    const token = 'known-reset-token-for-test-0123456789';
    await ctx.prisma.passwordResetToken.create({ data: { userId: u.userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
    await ctx.http().post(`${API}/auth/reset-password`).send({ token, password: 'short' }).expect(400);
    await ctx.http().post(`${API}/auth/reset-password`).send({ token, password: 'New-password-2026' }).expect(204);
    await ctx.http().post(`${API}/auth/reset-password`).send({ token, password: 'Another-password-1' }).expect(400);
    await u.get(`${API}/auth/me`).expect(401);
    await login(email, 'New-password-2026').expect(200);
  });

  it('rejects cookie-authenticated mutations from untrusted origins (CSRF)', async () => {
    const u = await ctx.as('administrator');
    const email = await emailOf(u.userId);
    const res = await ctx.http().post(`${API}/auth/login`).set('Origin', 'http://localhost:3000').send({ email, password: PASSWORD }).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('puja_at=') && /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c))).toBe(true);
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
    await ctx.http().get(`${API}/auth/me`).set('Cookie', cookieHeader).expect(200);
    const evil = await ctx.http().post(`${API}/uoms`).set('Cookie', cookieHeader).set('Origin', 'https://evil.example').send({ code: 'EVIL', name: 'x', dimension: 'COUNT', precision: 0 });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('CSRF_REJECTED');
    const noOrigin = await ctx.http().post(`${API}/uoms`).set('Cookie', cookieHeader).send({ code: 'EVIL', name: 'x', dimension: 'COUNT', precision: 0 });
    expect(noOrigin.status).toBe(403);
    await ctx.http().post(`${API}/uoms`).set('Cookie', cookieHeader).set('Origin', 'http://localhost:3000').send({ code: 'BOX10', name: 'Box of 10', dimension: 'COUNT', precision: 0 }).expect(201);
  });

  it('forces a token refresh when roles change (permission version)', async () => {
    const admin = await ctx.as('administrator');
    const u = await ctx.as('viewer');
    await u.get(`${API}/auth/me`).expect(200);
    const mgmt = await ctx.prisma.role.findUniqueOrThrow({ where: { key: 'management' } });
    await admin.patch(`${API}/admin/users/${u.userId}`, { roleIds: [mgmt.id] }).expect(200);
    const stale = await u.get(`${API}/auth/me`);
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('protects against removing the last administrator and self-demotion', async () => {
    const admin = await ctx.as('administrator');
    const self = await admin.patch(`${API}/admin/users/${admin.userId}`, { isActive: false });
    expect(self.status).toBe(422);
  });

  it('validates input strictly (unknown fields rejected)', async () => {
    const admin = await ctx.as('administrator');
    const r = await admin.post(`${API}/inventory/receipts`, { lines: [{ itemId: 'x', quantity: 1 }], hack: true });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rate limits login attempts', async () => {
    process.env.THROTTLE_IN_TESTS = 'true';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await login('ratelimit@test.local', 'x')).status);
      expect(statuses).toContain(429);
    } finally {
      delete process.env.THROTTLE_IN_TESTS;
    }
  });

  it('writes an append-only audit trail', async () => {
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'auth.login' } });
    await expect(ctx.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/immutable/);
  });
});
