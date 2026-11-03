import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType, ApprovalStatus, ApprovalType, Prisma } from '@prisma/client';
import { Errors } from '../../common/errors';
import { AuthUser, hasPermission, RequestContextStore } from '../../common/request-context';
import { Db, PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SequenceService } from '../settings/sequence.service';

export interface ApprovalHandlerResult {
  entityType?: string;
  entityId?: string;
}

/** Executes an approved request as the approver. Must validate the payload again. */
export type ApprovalHandler = (payload: Record<string, unknown>, approver: AuthUser, request: { id: string; number: string; requestedById: string }) => Promise<ApprovalHandlerResult>;

export interface CreateApprovalInput {
  type: ApprovalType;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
  requiredPermission: string;
  requestedBy: AuthUser;
  via?: ActorType;
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  private handlers = new Map<string, ApprovalHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  /** handler key = ApprovalType, or `AI_ACTION:<action>` for AI-proposed actions */
  register(key: string, handler: ApprovalHandler) {
    this.handlers.set(key, handler);
  }

  private handlerKey(type: ApprovalType, payload: Record<string, unknown>) {
    return type === ApprovalType.AI_ACTION ? `AI_ACTION:${String(payload.action)}` : type;
  }

  async create(input: CreateApprovalInput, db: Db = this.prisma) {
    if (!this.handlers.has(this.handlerKey(input.type, input.payload))) {
      throw Errors.validation(`No approval handler registered for ${this.handlerKey(input.type, input.payload)}`);
    }
    const req = await db.approvalRequest.create({
      data: {
        number: await this.sequences.next('approval', db),
        type: input.type,
        title: input.title,
        description: input.description,
        payload: input.payload as Prisma.InputJsonValue,
        requiredPermission: input.requiredPermission,
        requestedById: input.requestedBy.id,
        requestedVia: input.via ?? RequestContextStore.get()?.actorType ?? ActorType.USER,
      },
    });
    await this.audit.record(
      { action: 'approval.requested', entityType: 'ApprovalRequest', entityId: req.id, summary: `${req.number}: ${req.title}`, after: input.payload, actorId: input.requestedBy.id },
      db,
    );
    this.events.emit('approvals.pending', { approvalId: req.id, number: req.number, title: req.title, requiredPermission: req.requiredPermission });
    return req;
  }

  async list(q: { status?: ApprovalStatus; type?: ApprovalType; mine?: boolean; user: AuthUser; skip: number; take: number }) {
    const where: Prisma.ApprovalRequestWhereInput = {
      status: q.status,
      type: q.type,
      ...(q.mine ? { requestedById: q.user.id } : {}),
    };
    // users without approvals.view only see their own requests
    if (!hasPermission(q.user, 'approvals.view')) where.requestedById = q.user.id;
    const [rows, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.take,
        include: { requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);
    return {
      rows: rows.map((r) => ({ ...r, canDecide: r.status === 'PENDING' && this.canDecide(q.user, r) })),
      total,
    };
  }

  async get(id: string, user: AuthUser) {
    const r = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: { requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } },
    });
    if (!r) throw Errors.notFound('Approval request', id);
    if (!hasPermission(user, 'approvals.view') && r.requestedById !== user.id) throw Errors.forbidden();
    return { ...r, canDecide: r.status === 'PENDING' && this.canDecide(user, r) };
  }

  private canDecide(user: AuthUser, r: { requiredPermission: string; requestedById: string; requestedVia: ActorType }) {
    if (!hasPermission(user, r.requiredPermission)) return false;
    // AI-proposed actions additionally need ai.approve; the requester may approve their own
    // AI proposal (human-in-the-loop) only if they hold the underlying permission.
    if (r.requestedVia === ActorType.AI) return hasPermission(user, 'ai.approve');
    // segregation of duties: a human cannot approve their own request
    return r.requestedById !== user.id;
  }

  async decide(id: string, decision: 'approve' | 'reject', user: AuthUser, note?: string) {
    // Claim the request atomically so two approvers cannot both execute it.
    const req = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!req) throw Errors.notFound('Approval request', id);
    if (req.status !== ApprovalStatus.PENDING) throw Errors.invalidState(`Request is already ${req.status.toLowerCase()}`);
    if (!this.canDecide(user, req)) throw Errors.forbidden('You cannot decide this request (missing permission or it is your own request)');

    const claimed = await this.prisma.approvalRequest.updateMany({
      where: { id, status: ApprovalStatus.PENDING },
      data: {
        status: decision === 'approve' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note,
      },
    });
    if (claimed.count !== 1) throw Errors.invalidState('Request was decided by someone else');
    await this.audit.record({ action: `approval.${decision === 'approve' ? 'approved' : 'rejected'}`, entityType: 'ApprovalRequest', entityId: id, summary: `${req.number}: ${req.title}`, metadata: { note } });

    if (decision === 'reject') {
      this.events.emit('approvals.decided', { approvalId: id, number: req.number, title: req.title, status: 'REJECTED', requestedById: req.requestedById });
      return this.get(id, user);
    }

    const handler = this.handlers.get(this.handlerKey(req.type, req.payload as Record<string, unknown>));
    try {
      if (!handler) throw new Error('No handler registered');
      // Execute with the approver's own permissions (never elevated).
      const approver = await this.auth.principalFor(user.id);
      const result = await RequestContextStore.withActor(req.requestedVia === ActorType.AI ? ActorType.AI : ActorType.USER, () =>
        handler(req.payload as Record<string, unknown>, approver, { id: req.id, number: req.number, requestedById: req.requestedById }),
      );
      await this.prisma.approvalRequest.update({
        where: { id },
        data: { status: ApprovalStatus.EXECUTED, executedAt: new Date(), resultEntityType: result.entityType, resultEntityId: result.entityId },
      });
      await this.audit.record({ action: 'approval.executed', entityType: 'ApprovalRequest', entityId: id, metadata: { ...result } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Approval ${req.number} execution failed: ${message}`);
      await this.prisma.approvalRequest.update({ where: { id }, data: { status: ApprovalStatus.FAILED, error: message.slice(0, 1000) } });
      await this.audit.record({ action: 'approval.failed', entityType: 'ApprovalRequest', entityId: id, metadata: { error: message } });
    }
    const final = await this.get(id, user);
    this.events.emit('approvals.decided', { approvalId: id, number: req.number, title: req.title, status: final.status, requestedById: req.requestedById });
    return final;
  }

  async cancel(id: string, user: AuthUser) {
    const r = await this.prisma.approvalRequest.updateMany({ where: { id, status: ApprovalStatus.PENDING, requestedById: user.id }, data: { status: ApprovalStatus.CANCELLED } });
    if (!r.count) throw Errors.invalidState('Only your own pending requests can be cancelled');
    await this.audit.record({ action: 'approval.cancelled', entityType: 'ApprovalRequest', entityId: id });
  }
}
