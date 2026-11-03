import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ActorType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, Errors } from '../../common/errors';
import { assertPermission } from '../../common/guards/permissions.guard';
import { AuthUser, hasPermission, RequestContextStore } from '../../common/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductionService } from '../manufacturing/production.service';
import { ProcurementService } from '../procurement/procurement.service';
import { DashboardService } from '../reports/dashboard.service';
import { ReportsService } from '../reports/reports.service';
import { SalesService } from '../sales/sales.service';
import { InsightsService } from './insights.service';
import { AI_TOOLS, AiTool, toApiTool, ToolDeps, toolsFor } from './tools';

/** Minimal surface of the SDK we use — lets tests inject a scripted fake. */
export interface AiClient {
  beta: { messages: { create: (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } };
}
export const AI_CLIENT = Symbol('AI_CLIENT');

const STATIC_SYSTEM = `You are the PUJA OS Business Copilot for an Indian manufacturer and wholesaler of notebooks, diaries, organizers, PU leather products and corporate gifts.

Business vocabulary:
- Raw materials include PU leather (0.7mm / 1.2mm, rolls or sheets, measured in metres or square metres), cardboard and foam sheets, metal fittings, elastic and ribbon (metres) and pen loops (pieces).
- A finished-goods SKU is a product variant (e.g. "A5 Notebook Cover — Black"). A BOM lists the materials per SKU with a wastage allowance; production orders (numbers like MO/26-27/00012) move through stages such as PU cutting, cardboard cutting, foam cutting, embossing, metal fitting, stitching, assembly and quality control.
- "Reserved" stock is allocated to an order but not consumed; "available" = usable on-hand − reserved. Stock in QC hold, rejected or WIP locations is not available.
- GRN = goods receipt note, PO = purchase order, PR = purchase requisition, SO = sales order, challan = delivery challan (dispatch document), GST = goods and services tax. Money is INR; dates are Indian Standard Time.

How to work:
- Answer only from tool results. Never invent quantities, prices, names or dates. If the tools return nothing, say so plainly.
- Prefer one or two well-chosen tools; call independent tools in parallel.
- Mention the document numbers or item codes your answer is based on so people can trace it.
- You cannot change data. For any change (stock adjustment, purchase requisition or order, cancelling a production order, changing a sales order) use the matching propose_* tool. It creates an approval request; tell the user the request number and that nothing changes until an authorised person approves it.
- If a tool reports missing permission, explain that the user's role does not include that data.
- Be concise. Use short markdown tables for lists of more than three rows. Give quantities with their units.`;

const MAX_HISTORY_MESSAGES = 80;

export interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
  isError: boolean;
  result: unknown;
}

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly deps: ToolDeps;

  constructor(
    @Inject(AI_CLIENT) private readonly client: AiClient | null,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly inventory: InventoryService,
    private readonly production: ProductionService,
    private readonly procurement: ProcurementService,
    private readonly sales: SalesService,
    reports: ReportsService,
    dashboard: DashboardService,
    insights: InsightsService,
  ) {
    this.deps = { prisma, inventory, reports, dashboard, insights, procurement, production, approvals };
  }

  get configured() {
    return !!this.client;
  }

  get model() {
    return env().ANTHROPIC_MODEL;
  }

  status(user: AuthUser) {
    return {
      configured: this.configured,
      model: this.configured ? this.model : null,
      tools: toolsFor(user).map((t) => ({ name: t.name, kind: t.kind, description: t.description })),
      message: this.configured ? null : 'The AI Copilot is not configured. An administrator must set ANTHROPIC_API_KEY on the API server (see DEPLOYMENT_GUIDE.md).',
    };
  }

  // ─── Approval handlers: AI proposals execute as the approving human ──

  onModuleInit() {
    const reg = (action: string, schema: z.ZodTypeAny, fn: (args: never, approver: AuthUser) => Promise<{ entityType?: string; entityId?: string }>) =>
      this.approvals.register(`AI_ACTION:${action}`, async (payload, approver) => {
        const args = schema.parse((payload as { args: unknown }).args);
        return fn(args as never, approver);
      });

    reg(
      'stock_adjustment',
      z.object({ reason: z.string(), lines: z.array(z.object({ itemId: z.string(), quantity: z.number(), locationId: z.string().optional() })).min(1) }),
      async (a: { reason: string; lines: { itemId: string; quantity: number; locationId?: string }[] }, approver) => {
        assertPermission(approver, 'inventory.adjust.approve');
        const r = await this.inventory.adjust({ reason: `[AI proposal] ${a.reason}`, lines: a.lines }, approver, { approvedById: approver.id });
        if (r.status !== 'POSTED') throw Errors.invalidState('Adjustment requires a second approval under current settings');
        return { entityType: 'InventoryTransaction', entityId: (r.transaction as { id: string }).id };
      },
    );
    reg(
      'create_purchase_requisition',
      z.object({ remarks: z.string().optional(), lines: z.array(z.object({ itemId: z.string(), quantity: z.number().positive() })).min(1) }),
      async (a: { remarks?: string; lines: { itemId: string; quantity: number }[] }, approver) => {
        assertPermission(approver, 'procurement.requisition.manage');
        const r = await this.procurement.createRequisition({ source: 'AI', submit: true, remarks: a.remarks ?? 'Proposed by AI Copilot', lines: a.lines }, approver);
        return { entityType: 'PurchaseRequisition', entityId: r.id };
      },
    );
    reg(
      'create_purchase_order',
      z.object({
        supplierId: z.string(),
        expectedDate: z.string().optional(),
        lines: z.array(z.object({ itemId: z.string(), quantity: z.number().positive(), unitPrice: z.number().min(0), uomCode: z.string().optional() })).min(1),
      }),
      async (a: { supplierId: string; expectedDate?: string; lines: { itemId: string; quantity: number; unitPrice: number; uomCode?: string }[] }, approver) => {
        assertPermission(approver, 'procurement.po.manage');
        const po = await this.procurement.createPo({ supplierId: a.supplierId, expectedDate: a.expectedDate ? `${a.expectedDate}T00:00:00+05:30` : undefined, remarks: 'Proposed by AI Copilot', lines: a.lines }, approver);
        return { entityType: 'PurchaseOrder', entityId: po.id };
      },
    );
    reg('cancel_production_order', z.object({ productionOrderId: z.string(), reason: z.string() }), async (a: { productionOrderId: string; reason: string }, approver) => {
      assertPermission(approver, 'production.cancel');
      await this.production.cancel(a.productionOrderId, `[AI proposal] ${a.reason}`, approver);
      return { entityType: 'ProductionOrder', entityId: a.productionOrderId };
    });
    reg(
      'update_sales_order',
      z.object({ salesOrderId: z.string(), cancel: z.boolean(), reason: z.string().optional(), requiredBy: z.string().optional(), customerPoNumber: z.string().optional(), remarks: z.string().optional() }),
      async (a: { salesOrderId: string; cancel: boolean; reason?: string; requiredBy?: string; customerPoNumber?: string; remarks?: string }, approver) => {
        if (a.cancel) {
          assertPermission(approver, 'sales.order.cancel');
          await this.sales.cancelOrder(a.salesOrderId, `[AI proposal] ${a.reason ?? ''}`.trim(), approver);
        } else {
          assertPermission(approver, 'sales.order.manage');
          await this.sales.updateOrder(a.salesOrderId, { requiredBy: a.requiredBy ? `${a.requiredBy}T00:00:00+05:30` : undefined, customerPoNumber: a.customerPoNumber, remarks: a.remarks }, approver);
        }
        return { entityType: 'SalesOrder', entityId: a.salesOrderId };
      },
    );
  }

  // ─── Conversations ────────────────────────────────────────────────

  async conversations(user: AuthUser) {
    return this.prisma.aiConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, title: true, createdAt: true, updatedAt: true } });
  }

  async createConversation(user: AuthUser, title?: string) {
    return this.prisma.aiConversation.create({ data: { userId: user.id, title: title?.slice(0, 80) || 'New conversation' } });
  }

  async deleteConversation(id: string, user: AuthUser) {
    const r = await this.prisma.aiConversation.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) throw Errors.notFound('Conversation', id);
  }

  private async ownConversation(id: string, user: AuthUser) {
    const c = await this.prisma.aiConversation.findUnique({ where: { id } });
    if (!c || c.userId !== user.id) throw Errors.notFound('Conversation', id);
    return c;
  }

  /** UI-friendly transcript: text, tool calls with results, approvals created. */
  async conversation(id: string, user: AuthUser) {
    const c = await this.ownConversation(id, user);
    const rows = await this.prisma.aiMessage.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const results = new Map<string, { isError: boolean; content: unknown }>();
    for (const r of rows.filter((x) => x.role === 'tool')) {
      for (const b of r.content as unknown as Anthropic.Beta.BetaToolResultBlockParam[]) {
        results.set(b.tool_use_id, { isError: !!b.is_error, content: parseResult(b.content) });
      }
    }
    const messages = rows
      .filter((r) => r.role !== 'tool')
      .map((r) => {
        if (r.role === 'user') return { id: r.id, role: 'user' as const, text: String(r.content), createdAt: r.createdAt };
        const blocks = r.content as unknown as Anthropic.Beta.BetaContentBlock[];
        return {
          id: r.id,
          role: 'assistant' as const,
          text: blocks
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n\n'),
          toolCalls: blocks
            .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
            .map((b) => ({ id: b.id, name: b.name, input: b.input, ...(results.get(b.id) ?? { isError: false, content: null }) })),
          model: r.model,
          createdAt: r.createdAt,
        };
      });
    return { id: c.id, title: c.title, createdAt: c.createdAt, messages };
  }

  // ─── The agent loop ────────────────────────────────────────────────

  async send(conversationId: string | null, text: string, user: AuthUser) {
    if (!this.client) throw new AppError('AI_NOT_CONFIGURED', 'The AI Copilot is not configured on this server (ANTHROPIC_API_KEY is missing).', HttpStatus.SERVICE_UNAVAILABLE);
    const message = text.trim();
    if (!message) throw Errors.validation('Message cannot be empty');
    if (message.length > 8000) throw Errors.validation('Message is too long (8000 characters max)');

    const conv = conversationId ? await this.ownConversation(conversationId, user) : await this.createConversation(user, message.slice(0, 60));
    const history = await this.prisma.aiMessage.count({ where: { conversationId: conv.id } });
    if (history > MAX_HISTORY_MESSAGES) throw Errors.rule('CONVERSATION_TOO_LONG', 'This conversation is long. Start a new conversation to continue.');
    await this.prisma.aiMessage.create({ data: { conversationId: conv.id, role: 'user', content: message } });
    if (conv.title === 'New conversation') await this.prisma.aiConversation.update({ where: { id: conv.id }, data: { title: message.slice(0, 60) } });

    // Tools are filtered by the user's permissions and kept in a deterministic order (cache-stable per role).
    const allowed = toolsFor(user);
    const apiTools = allowed.map(toApiTool);
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: STATIC_SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Today is ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} (IST). You are assisting ${user.name} (roles: ${user.roles.join(', ')}). Only the tools provided are available to this user.` },
    ];

    const approvalsBefore = new Date();
    let steps = 0;
    let finalStop: string | null = null;
    while (steps < env().AI_MAX_TOOL_STEPS) {
      steps++;
      const messages = await this.loadMessages(conv.id);
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: env().AI_MAX_TOKENS,
          system,
          tools: apiTools,
          messages,
          output_config: { effort: env().AI_EFFORT },
          cache_control: { type: 'ephemeral' },
          // Server-side refusal fallback: a declined request is re-run on a fallback model chosen by category.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      } catch (err) {
        throw this.mapError(err);
      }

      // Append the full content (thinking/fallback blocks included) — history is append-only.
      await this.prisma.aiMessage.create({
        data: {
          conversationId: conv.id,
          role: 'assistant',
          content: response.content as unknown as Prisma.InputJsonValue,
          inputTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.cache_read_input_tokens ?? 0) + (response.usage?.cache_creation_input_tokens ?? 0),
          outputTokens: response.usage?.output_tokens,
          model: response.model,
        },
      });
      finalStop = response.stop_reason;

      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;

      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      // Execute in parallel; return ALL results in one user message.
      const results = await Promise.all(calls.map((c) => this.executeTool(c, allowed, user, conv.id)));
      await this.prisma.aiMessage.create({ data: { conversationId: conv.id, role: 'tool', content: results as unknown as Prisma.InputJsonValue, toolName: calls.map((c) => c.name).join(',') } });
    }
    await this.prisma.aiConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });

    const approvals = await this.prisma.approvalRequest.findMany({
      where: { requestedById: user.id, requestedVia: ActorType.AI, createdAt: { gte: approvalsBefore } },
      select: { id: true, number: true, title: true, status: true, requiredPermission: true },
    });
    const transcript = await this.conversation(conv.id, user);
    return {
      conversationId: conv.id,
      stopReason: finalStop,
      notice:
        finalStop === 'refusal'
          ? 'The assistant declined this request.'
          : finalStop === 'max_tokens'
            ? 'The answer was cut off because it reached the length limit.'
            : finalStop === 'tool_use'
              ? `Stopped after ${env().AI_MAX_TOOL_STEPS} tool steps. Ask a narrower question or continue.`
              : null,
      approvals,
      conversation: transcript,
    };
  }

  private async loadMessages(conversationId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
    const rows = await this.prisma.aiMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return rows.map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: r.role === 'user' ? String(r.content) : (r.content as unknown as Anthropic.Beta.BetaContentBlockParam[]),
    }));
  }

  /** Validate, permission-check, run as AI-on-behalf-of-user, audit. Errors become is_error results. */
  private async executeTool(call: Anthropic.Beta.BetaToolUseBlock, allowed: AiTool[], user: AuthUser, conversationId: string): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const started = Date.now();
    const tool = allowed.find((t) => t.name === call.name);
    const fail = (message: string): Anthropic.Beta.BetaToolResultBlockParam => ({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: message });
    let outcome: Anthropic.Beta.BetaToolResultBlockParam;
    if (!tool) {
      outcome = fail(AI_TOOLS.some((t) => t.name === call.name) ? `Permission denied: this user cannot use ${call.name}.` : `Unknown tool ${call.name}.`);
    } else if (!tool.permissions.some((p) => hasPermission(user, p))) {
      outcome = fail(`Permission denied: this user cannot use ${call.name}.`);
    } else {
      const parsed = tool.schema.safeParse(call.input);
      if (!parsed.success) {
        outcome = fail(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`);
      } else {
        try {
          const result = await RequestContextStore.withActor(ActorType.AI, () => tool.run(parsed.data, user, this.deps));
          outcome = { type: 'tool_result', tool_use_id: call.id, content: truncate(JSON.stringify(result)) };
        } catch (err) {
          const msg = err instanceof AppError ? `${(err.getResponse() as { code: string }).code}: ${err.message}` : 'Internal error while running the tool.';
          if (!(err instanceof AppError)) this.logger.error({ err, tool: call.name }, 'AI tool failed');
          outcome = fail(msg);
        }
      }
    }
    await this.audit.record({
      action: `ai.tool.${call.name}`,
      entityType: 'AiConversation',
      entityId: conversationId,
      actorId: user.id,
      actorType: ActorType.AI,
      metadata: { input: call.input, isError: !!outcome.is_error, error: outcome.is_error ? outcome.content : undefined, ms: Date.now() - started },
    });
    return outcome;
  }

  private mapError(err: unknown): AppError {
    if (err instanceof Anthropic.RateLimitError) return new AppError('AI_RATE_LIMITED', 'The AI service is rate limited. Please try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      this.logger.error('Anthropic credentials rejected');
      return new AppError('AI_NOT_CONFIGURED', 'The AI service rejected the server credentials. An administrator must check ANTHROPIC_API_KEY.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (err instanceof Anthropic.BadRequestError) {
      this.logger.error({ err: err.message }, 'Anthropic bad request');
      return new AppError('AI_REQUEST_FAILED', 'The AI request was rejected. The conversation may be too long — start a new one.', HttpStatus.BAD_GATEWAY);
    }
    if (err instanceof Anthropic.APIConnectionError) return new AppError('AI_UNAVAILABLE', 'Could not reach the AI service.', HttpStatus.SERVICE_UNAVAILABLE);
    if (err instanceof Anthropic.APIError) {
      return new AppError('AI_UNAVAILABLE', err.status === 529 ? 'The AI service is overloaded. Please try again shortly.' : 'The AI service returned an error.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.logger.error({ err }, 'Unexpected AI error');
    return new AppError('AI_UNAVAILABLE', 'The AI service failed unexpectedly.', HttpStatus.SERVICE_UNAVAILABLE);
  }

  /** One-shot narrative for the daily summary (no tools). Returns null if AI is unavailable. */
  async narrate(facts: unknown): Promise<{ text: string; model: string } | null> {
    if (!this.client) return null;
    try {
      const r = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4000,
        system: [{ type: 'text', text: `${STATIC_SYSTEM}\n\nWrite a short end-of-day operations summary for management from the JSON facts provided: 4–8 bullet points, lead with what needs attention, cite item codes and document numbers. Use only the facts given.`, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: JSON.stringify(facts) }],
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      if (r.stop_reason === 'refusal') return null;
      const text = r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      return text ? { text, model: r.model } : null;
    } catch (err) {
      this.logger.warn(`Daily summary narration failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

function truncate(s: string, max = 60_000) {
  return s.length > max ? `${s.slice(0, max)}… [truncated ${s.length - max} characters; narrow the query]` : s;
}

function parseResult(content: Anthropic.Beta.BetaToolResultBlockParam['content']) {
  if (typeof content !== 'string') return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
