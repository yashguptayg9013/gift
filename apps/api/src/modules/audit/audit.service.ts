import { Injectable } from '@nestjs/common';
import { ActorType, Prisma } from '@prisma/client';
import { serialize } from '../../common/decimal';
import { RequestContextStore } from '../../common/request-context';
import { Db, PrismaService } from '../../infra/prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /** defaults to the user in the request context */
  actorId?: string | null;
  actorType?: ActorType;
}

const toJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(serialize(v))) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an audit row. Pass `db` (a transaction client) so the audit row commits
   * atomically with the change it describes.
   */
  async record(entry: AuditEntry, db: Db = this.prisma) {
    const ctx = RequestContextStore.get();
    const actorId = entry.actorId !== undefined ? entry.actorId : ctx?.user?.id;
    await db.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? undefined,
        summary: entry.summary,
        before: toJson(entry.before),
        after: toJson(entry.after),
        metadata: toJson(entry.metadata),
        actorId: actorId && actorId !== 'system' ? actorId : null,
        actorType: entry.actorType ?? ctx?.actorType ?? (actorId === 'system' || !actorId ? ActorType.SYSTEM : ActorType.USER),
        requestId: ctx?.requestId,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent?.slice(0, 255),
      },
    });
  }

  async list(q: { entityType?: string; entityId?: string; actorId?: string; action?: string; from?: Date; to?: Date; skip: number; take: number }) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.entityType,
      entityId: q.entityId,
      actorId: q.actorId,
      action: q.action ? { startsWith: q.action } : undefined,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.take,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total };
  }
}
