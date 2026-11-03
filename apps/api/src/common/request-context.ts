import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActorType } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  sessionId: string | null;
  roles: string[];
  permissions: Set<string>;
  workerId: string | null;
}

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  user?: AuthUser;
  /** set when the AI copilot (or a job) acts on behalf of a user */
  actorType?: ActorType;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
  /** run with an overridden actor type (e.g. AI tools) */
  withActor<T>(actorType: ActorType, fn: () => T): T {
    const cur = storage.getStore();
    return storage.run({ ...(cur ?? { requestId: 'system' }), actorType }, fn);
  },
};

/** A synthetic user for system jobs (all permissions). Never exposed via HTTP. */
export function systemUser(): AuthUser {
  return {
    id: 'system',
    email: 'system@puja-os.local',
    name: 'System',
    sessionId: null,
    roles: ['system'],
    permissions: new Set(['*']),
    workerId: null,
  };
}

export function hasPermission(user: Pick<AuthUser, 'permissions'>, permission: string): boolean {
  return user.permissions.has('*') || user.permissions.has(permission);
}
