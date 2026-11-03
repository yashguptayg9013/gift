import Anthropic from '@anthropic-ai/sdk';
import { AiClient } from '../src/modules/ai/ai.service';
import { API, AuthedClient, createMaterial, createTestContext, receive, stockOf, TestCtx } from './helpers';

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Script = (p: Params) => Partial<Anthropic.Beta.BetaMessage> | Error;

/** Scripted stand-in for the Anthropic client: no network, no cost, inspectable requests. */
class FakeClient implements AiClient {
  requests: Params[] = [];
  script: Script[] = [];
  beta = {
    messages: {
      create: async (p: Params) => {
        this.requests.push(JSON.parse(JSON.stringify(p)));
        const next = this.script.shift();
        if (!next) throw new Error('FakeClient: no scripted response left');
        const r = next(p);
        if (r instanceof Error) throw r;
        return {
          id: `msg_${this.requests.length}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 20 },
          content: [],
          ...r,
        } as unknown as Anthropic.Beta.BetaMessage;
      },
    },
  };
}

const text = (t: string) => ({ type: 'text', text: t, citations: null });
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });

describe('AI Copilot (integration, fake model)', () => {
  let ctx: TestCtx;
  let fake: FakeClient;
  let admin: AuthedClient;

  beforeAll(async () => {
    fake = new FakeClient();
    ctx = await createTestContext({ aiClient: fake });
    admin = await ctx.as('administrator');
  });
  afterAll(() => ctx.close());
  beforeEach(() => {
    fake.requests = [];
    fake.script = [];
  });

  it('sends only permitted tools with cached system prompt, fallbacks and no forced tool choice', async () => {
    const user = await ctx.as(['ai.use', 'inventory.view']);
    fake.script.push(() => ({ content: [text('Nothing is low.')] as never }));
    const r = await user.post(`${API}/ai/messages`, { message: 'Which materials are low?' }).expect(200);
    expect(r.body.conversation.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    const req = fake.requests[0];
    const names = (req.tools ?? []).map((t) => (t as { name: string }).name);
    expect(names).toContain('get_low_stock');
    expect(names).toContain('query_records');
    expect(names).not.toContain('get_sales_trend');
    expect(names).not.toContain('propose_stock_adjustment');
    expect(req.model).toBe('claude-opus-5-5');
    expect((req as unknown as { fallbacks: string }).fallbacks).toBe('default');
    expect(req.betas).toContain('server-side-fallback-2026-07-01');
    expect(req.tool_choice).toBeUndefined();
    expect((req.system as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('runs the tool loop: parallel calls, validation errors as is_error, thinking blocks preserved', async () => {
    const inv = await ctx.as('inventory_manager');
    const m = await createMaterial(admin, { code: 'PU-AI-1', reorderLevel: 100 });
    await receive(inv, m.id, 20);
    const thinking = { type: 'thinking', thinking: '', signature: 'sig-abc' };
    fake.script.push(() => ({
      stop_reason: 'tool_use',
      content: [thinking, toolUse('t1', 'get_low_stock', { itemType: 'MATERIAL' }), toolUse('t2', 'search_stock', {})] as never,
    }));
    fake.script.push((p) => {
      const last = p.messages[p.messages.length - 1];
      const blocks = last.content as Anthropic.Beta.BetaToolResultBlockParam[];
      expect(last.role).toBe('user');
      expect(blocks).toHaveLength(2);
      const low = blocks.find((b) => b.tool_use_id === 't1')!;
      expect(low.is_error).toBeFalsy();
      expect(JSON.parse(low.content as string)[0]).toMatchObject({ code: 'PU-AI-1', available: 20, status: 'LOW' });
      const bad = blocks.find((b) => b.tool_use_id === 't2')!;
      expect(bad.is_error).toBe(true);
      expect(bad.content).toMatch(/Invalid arguments/);
      // assistant turn echoed back unchanged, including the thinking block
      expect((p.messages[p.messages.length - 2].content as { type: string }[])[0]).toEqual(thinking);
      return { content: [text('PU-AI-1 has 20 M available against a reorder level of 100.')] as never };
    });
    const r = await inv.post(`${API}/ai/messages`, { message: 'What is running low?' }).expect(200);
    expect(fake.requests).toHaveLength(2);
    const assistant = r.body.conversation.messages.filter((x: { role: string }) => x.role === 'assistant');
    expect(assistant[0].toolCalls.map((c: { name: string; isError: boolean }) => [c.name, c.isError])).toEqual([
      ['get_low_stock', false],
      ['search_stock', true],
    ]);
    expect(assistant[1].text).toMatch(/PU-AI-1/);
    const audits = await ctx.prisma.auditLog.findMany({ where: { action: { startsWith: 'ai.tool.' }, entityId: r.body.conversationId } });
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.actorType === 'AI')).toBe(true);
  });

  it('refuses tools outside the user permissions even if the model asks for them', async () => {
    const user = await ctx.as(['ai.use', 'inventory.view']);
    const m = await createMaterial(admin);
    fake.script.push(() => ({ stop_reason: 'tool_use', content: [toolUse('x1', 'propose_stock_adjustment', { reason: 'force it', lines: [{ itemCode: m.code, quantity: 5 }] })] as never }));
    fake.script.push((p) => {
      const res = (p.messages[p.messages.length - 1].content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
      expect(res.is_error).toBe(true);
      expect(res.content).toMatch(/Permission denied/);
      return { content: [text('I cannot do that.')] as never };
    });
    await user.post(`${API}/ai/messages`, { message: 'Add 5 to stock' }).expect(200);
    expect(await ctx.prisma.approvalRequest.count({ where: { type: 'AI_ACTION' } })).toBe(0);
  });

  it('write tools create approval requests; execution happens only on human approval and is attributed to AI', async () => {
    const inv = await ctx.as('inventory_manager');
    const m = await createMaterial(admin, { code: 'EL-AI-1' });
    await receive(inv, m.id, 10);
    fake.script.push(() => ({ stop_reason: 'tool_use', content: [toolUse('p1', 'propose_stock_adjustment', { reason: 'Physical count found 2 extra', lines: [{ itemCode: 'el-ai-1', quantity: 2 }] })] as never }));
    fake.script.push(() => ({ content: [text('Created an approval request.')] as never }));
    const r = await inv.post(`${API}/ai/messages`, { message: 'We counted 12 of EL-AI-1, fix it' }).expect(200);
    expect(r.body.approvals).toHaveLength(1);
    expect(r.body.approvals[0].status).toBe('PENDING');
    expect((await stockOf(admin, m.id)).onHand).toBe(10);

    // Users without ai.approve cannot decide AI requests, even with the underlying permission.
    const noAi = await ctx.as(['inventory.adjust.approve', 'approvals.view', 'inventory.view']);
    expect((await noAi.post(`${API}/approvals/${r.body.approvals[0].id}/decision`, { decision: 'approve' })).status).toBe(403);

    const mgmt = await ctx.as('management');
    const d = await mgmt.post(`${API}/approvals/${r.body.approvals[0].id}/decision`, { decision: 'approve' }).expect(200);
    expect(d.body.status).toBe('EXECUTED');
    expect((await stockOf(admin, m.id)).onHand).toBe(12);
    const tx = await ctx.prisma.inventoryTransaction.findUniqueOrThrow({ where: { id: d.body.resultEntityId } });
    expect(tx.actorType).toBe('AI');
    expect(tx.approvedById).toBeTruthy();
    expect(tx.reason).toMatch(/AI proposal/);
  });

  it('maps API errors to clear responses', async () => {
    const user = await ctx.as(['ai.use', 'inventory.view']);
    fake.script.push(() => Object.assign(Object.create(Anthropic.RateLimitError.prototype), { status: 429, message: 'rate limited' }));
    const r = await user.post(`${API}/ai/messages`, { message: 'hi' });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('AI_RATE_LIMITED');
    fake.script.push(() => Object.assign(Object.create(Anthropic.APIError.prototype), { status: 529, message: 'overloaded' }));
    const r2 = await user.post(`${API}/ai/messages`, { message: 'hi again' });
    expect(r2.status).toBe(503);
    expect(r2.body.error.message).toMatch(/overloaded/);
  });

  it('conversations are private to their owner', async () => {
    const a = await ctx.as(['ai.use']);
    const b = await ctx.as(['ai.use']);
    const c = await a.post(`${API}/ai/conversations`, { title: 'Mine' }).expect(201);
    expect((await b.get(`${API}/ai/conversations/${c.body.id}`)).status).toBe(404);
    expect((await ctx.as('production_worker')).userId).toBeTruthy();
  });

  it('serves deterministic insights without the model', async () => {
    const inv = await ctx.as('inventory_manager');
    const r = await inv.get(`${API}/ai/insights/anomalies`).expect(200);
    expect(r.body).toHaveProperty('consumptionSpikes');
    const s = await admin.get(`${API}/ai/summary/today`).expect(200);
    expect(s.body.text).toMatch(/Business summary/);
  });
});

describe('AI Copilot without configuration', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestContext({ aiClient: null });
  });
  afterAll(() => ctx.close());

  it('reports not configured and refuses chat with 503', async () => {
    const u = await ctx.as('management');
    const s = await u.get(`${API}/ai/status`).expect(200);
    expect(s.body.configured).toBe(false);
    const r = await u.post(`${API}/ai/messages`, { message: 'hello' });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});
