import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { ROLE_TEMPLATES } from '@puja/shared';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { bootstrap } from '../prisma/bootstrap';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { loadEnv } from '../src/config/env';
import { AuthService } from '../src/modules/auth/auth.service';
import { AI_CLIENT, AiClient } from '../src/modules/ai/ai.service';

export const PASSWORD = 'Test-password-123';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaClient;
  http: () => TestAgent;
  /** authenticated agent factory for a user with the given role keys (or explicit permissions) */
  as: (roleOrPerms: string | string[]) => Promise<AuthedClient>;
  close: () => Promise<void>;
}

export interface AuthedClient {
  userId: string;
  token: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object, headers?: Record<string, string>) => request.Test;
  put: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
}

/** Remove all business data (keeps migrations). TRUNCATE bypasses row-level immutability triggers. */
export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

let userSeq = 0;

export async function createTestContext(opts: { aiClient?: AiClient | null } = {}): Promise<TestCtx> {
  loadEnv();
  const prisma = new PrismaClient();
  await resetDb(prisma);
  await bootstrap(prisma);
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.aiClient !== undefined) builder = builder.overrideProvider(AI_CLIENT).useValue(opts.aiClient);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const server = app.getHttpServer();
  server.setMaxListeners(100);
  const http = () => request(server) as unknown as TestAgent;

  const as = async (roleOrPerms: string | string[]): Promise<AuthedClient> => {
    userSeq++;
    let roleId: string;
    if (typeof roleOrPerms === 'string') {
      if (!ROLE_TEMPLATES.some((r) => r.key === roleOrPerms)) throw new Error(`unknown role ${roleOrPerms}`);
      roleId = (await prisma.role.findUniqueOrThrow({ where: { key: roleOrPerms } })).id;
    } else {
      const role = await prisma.role.create({
        data: { key: `test_role_${userSeq}_${Date.now()}`, name: `Test role ${userSeq}`, permissions: { create: roleOrPerms.map((permission) => ({ permission })) } },
      });
      roleId = role.id;
    }
    const email = `user${userSeq}_${Date.now()}@test.local`;
    const user = await prisma.user.create({
      data: { email, name: `Test User ${userSeq}`, passwordHash: await AuthService.hashPassword(PASSWORD), roles: { create: [{ roleId }] } },
    });
    const res = await request(server).post('/api/v1/auth/login').set('X-Client', 'mobile').send({ email, password: PASSWORD }).expect(200);
    const token: string = res.body.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    return {
      userId: user.id,
      token,
      get: (url) => auth(request(server).get(url)),
      post: (url, body, headers) => {
        let r = auth(request(server).post(url));
        for (const [k, v] of Object.entries(headers ?? {})) r = r.set(k, v);
        return r.send(body ?? {});
      },
      put: (url, body) => auth(request(server).put(url)).send(body ?? {}),
      patch: (url, body) => auth(request(server).patch(url)).send(body ?? {}),
      del: (url) => auth(request(server).delete(url)),
    };
  };

  return {
    app,
    prisma,
    http,
    as,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export const API = '/api/v1';

/** Create a material item via the API. */
export async function createMaterial(c: AuthedClient, overrides: Record<string, unknown> = {}) {
  const code = (overrides.code as string) ?? `MAT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const res = await c.post(`${API}/items`, { type: 'MATERIAL', code, name: `Material ${code}`, uomCode: 'M', ...overrides });
  if (res.status !== 201) throw new Error(`createMaterial failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; code: string };
}

export async function locations(prisma: PrismaClient) {
  const all = await prisma.location.findMany({ include: { warehouse: true } });
  const by = (code: string) => all.find((l) => l.code === code)!;
  return { store: by('STORE'), recv: by('RECEIVING'), qc: by('QC-HOLD'), rejected: by('REJECTED'), wip: by('WIP'), warehouseId: by('STORE').warehouseId };
}

export async function receive(c: AuthedClient, itemId: string, quantity: number, extra: Record<string, unknown> = {}) {
  const res = await c.post(`${API}/inventory/receipts`, { lines: [{ itemId, quantity, ...extra }] });
  if (res.status !== 201) throw new Error(`receive failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function stockOf(c: AuthedClient, itemId: string) {
  const res = await c.get(`${API}/inventory/stock`).expect(200);
  return (res.body as { id: string; onHand: number; reserved: number; available: number; usableOnHand: number }[]).find((r) => r.id === itemId)!;
}
