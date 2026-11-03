import { API, AuthedClient, createMaterial, createTestContext, receive, TestCtx } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('Notifications, jobs and files (integration)', () => {
  let ctx: TestCtx;
  let admin: AuthedClient;
  let inv: AuthedClient;

  beforeAll(async () => {
    ctx = await createTestContext({ aiClient: null });
    admin = await ctx.as('administrator');
    inv = await ctx.as('inventory_manager');
  });
  afterAll(() => ctx.close());

  const waitFor = async (fn: () => Promise<boolean>) => {
    for (let i = 0; i < 40; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('condition not met');
  };

  it('raises one low-stock alert per item per day from inventory events', async () => {
    const m = await createMaterial(admin, { reorderLevel: 10 });
    await receive(inv, m.id, 20);
    await inv.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 15 }], reason: 'use' }).expect(201);
    await waitFor(async () => (await inv.get(`${API}/notifications/unread-count`)).body.count > 0);
    await inv.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 1 }], reason: 'use' }).expect(201);
    await new Promise((r) => setTimeout(r, 200));
    const list = await inv.get(`${API}/notifications?unreadOnly=true`).expect(200);
    const mine = list.body.data.filter((n: { entityId: string }) => n.entityId === m.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: 'inventory.low_stock', severity: 'WARNING' });
    // a sales executive (no inventory management permission) is not alerted
    const sales = await ctx.as('sales_executive');
    expect((await sales.get(`${API}/notifications/unread-count`)).body.count).toBe(0);

    await inv.post(`${API}/notifications/${mine[0].id}/read`).expect(204);
    await inv.post(`${API}/notifications/read-all`).expect(200);
    expect((await inv.get(`${API}/notifications/unread-count`)).body.count).toBe(0);
  });

  it('respects user preferences', async () => {
    const u = await ctx.as('inventory_manager');
    const prefs = await u.get(`${API}/notifications/preferences`).expect(200);
    expect(prefs.body.types.find((t: { type: string }) => t.type === 'inventory.low_stock')).toMatchObject({ inApp: true });
    await u.put(`${API}/notifications/preferences`, { preferences: [{ type: 'inventory.low_stock', inApp: false, email: false, whatsapp: false }] }).expect(200);
    const m = await createMaterial(admin, { reorderLevel: 5 });
    await receive(inv, m.id, 1);
    await new Promise((r) => setTimeout(r, 300));
    const list = await u.get(`${API}/notifications`).expect(200);
    expect(list.body.data.filter((n: { entityId: string }) => n.entityId === m.id)).toHaveLength(0);
    expect((await u.put(`${API}/notifications/preferences`, { preferences: [{ type: 'bogus', inApp: true, email: false, whatsapp: false }] })).status).toBe(400);
  });

  it('notifies approvers of pending approvals and requesters of decisions', async () => {
    const mgmt = await ctx.as('management');
    const m = await createMaterial(admin);
    await receive(inv, m.id, 5);
    const req = await inv.post(`${API}/inventory/adjustments`, { lines: [{ itemId: m.id, quantity: -1 }], reason: 'Damaged in storage' }).expect(201);
    await waitFor(async () => (await mgmt.get(`${API}/notifications`)).body.data.some((n: { entityId: string }) => n.entityId === req.body.approval.id));
    await mgmt.post(`${API}/approvals/${req.body.approval.id}/decision`, { decision: 'approve' }).expect(200);
    await waitFor(async () => (await inv.get(`${API}/notifications`)).body.data.some((n: { type: string; entityId: string }) => n.type === 'approvals.decided' && n.entityId === req.body.approval.id));
  });

  it('runs scheduled jobs on demand (admin only) and produces a daily summary without AI', async () => {
    expect((await inv.post(`${API}/admin/jobs/daily-summary/run`)).status).toBe(403);
    const r = await admin.post(`${API}/admin/jobs/daily-summary/run`).expect(200);
    expect(r.body.result.aiNarrated).toBe(false);
    const summaries = await admin.get(`${API}/ai/summaries`).expect(200);
    expect(summaries.body[0].content).toMatch(/Business summary/);
    for (const name of ['low-stock-scan', 'production-delay-scan', 'po-overdue-scan', 'inspection-pending-scan']) {
      await admin.post(`${API}/admin/jobs/${name}/run`).expect(200);
    }
    expect((await admin.post(`${API}/admin/jobs/drop-tables/run`)).status).toBe(400);
  });

  it('accepts only sniffed image/PDF uploads and enforces entity permissions', async () => {
    const pcats = (await admin.get(`${API}/categories?type=PRODUCT`).expect(200)).body as { id: string }[];
    const p = await admin.post(`${API}/products`, { code: 'IMG-P', name: 'With image', categoryId: pcats[0].id }).expect(201);
    const up = await ctx.http().post(`${API}/files?entityType=Product&entityId=${p.body.id}`).set('Authorization', `Bearer ${admin.token}`).attach('file', PNG, { filename: '../../etc/evil name.png', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ mimeType: 'image/png', filename: 'evil name.png' });

    const exe = await ctx.http().post(`${API}/files?entityType=Product`).set('Authorization', `Bearer ${admin.token}`).attach('file', Buffer.from('MZ\x90\x00 not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(exe.status).toBe(400);

    const viewer = await ctx.as('viewer');
    expect((await ctx.http().post(`${API}/files?entityType=Product`).set('Authorization', `Bearer ${viewer.token}`).attach('file', PNG, 'a.png')).status).toBe(403);
    const dl = await viewer.get(`${API}/files/${up.body.id}`).expect(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    const worker = await ctx.as('production_worker');
    expect((await worker.get(`${API}/files/${up.body.id}`)).status).toBe(200); // production workers have product.view
    const salesless = await ctx.as(['procurement.view']);
    expect((await salesless.get(`${API}/files/${up.body.id}`)).status).toBe(403);
  });
});
