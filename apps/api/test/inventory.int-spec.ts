import { API, AuthedClient, createMaterial, createTestContext, locations, receive, stockOf, TestCtx } from './helpers';

describe('Inventory ledger (integration)', () => {
  let ctx: TestCtx;
  let admin: AuthedClient;
  let invMgr: AuthedClient;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await ctx.as('administrator');
    invMgr = await ctx.as('inventory_manager');
  });
  afterAll(() => ctx.close());

  it('receipt posts a ledger transaction, movement, balance and audit row', async () => {
    const m = await createMaterial(admin);
    const tx = await receive(invMgr, m.id, 50.5);
    expect(tx.type).toBe('RECEIPT');
    expect(tx.movements).toHaveLength(1);
    expect(tx.movements[0].quantity).toBe(50.5);
    expect(tx.movements[0].onHandAfter).toBe(50.5);
    const s = await stockOf(invMgr, m.id);
    expect(s).toMatchObject({ onHand: 50.5, reserved: 0, available: 50.5 });
    const audit = await ctx.prisma.auditLog.findFirst({ where: { entityType: 'InventoryTransaction', entityId: tx.id } });
    expect(audit?.action).toBe('inventory.receipt');
  });

  it('rejects issues beyond available stock and leaves stock unchanged', async () => {
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 10);
    const res = await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 11 }], reason: 'Test' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await stockOf(invMgr, m.id)).onHand).toBe(10);
    await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 4 }], reason: 'Sampling' }).expect(201);
    expect((await stockOf(invMgr, m.id)).onHand).toBe(6);
  });

  it('requires a reason for issues and adjustments', async () => {
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 5);
    const r = await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 1 }] });
    expect(r.status).toBe(400);
  });

  it('is idempotent: the same key replays the original transaction', async () => {
    const m = await createMaterial(admin);
    const body = { lines: [{ itemId: m.id, quantity: 7 }] };
    const a = await invMgr.post(`${API}/inventory/receipts`, body, { 'Idempotency-Key': `rcpt-${m.id}` }).expect(201);
    const b = await invMgr.post(`${API}/inventory/receipts`, body, { 'Idempotency-Key': `rcpt-${m.id}` }).expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect((await stockOf(invMgr, m.id)).onHand).toBe(7);
    const c = await invMgr.post(`${API}/inventory/receipts`, { lines: [{ itemId: m.id, quantity: 8 }] }, { 'Idempotency-Key': `rcpt-${m.id}` });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('concurrent duplicate requests with one idempotency key post exactly once', async () => {
    const m = await createMaterial(admin);
    const body = { lines: [{ itemId: m.id, quantity: 3 }] };
    const results = await Promise.all(Array.from({ length: 8 }, () => invMgr.post(`${API}/inventory/receipts`, body, { 'Idempotency-Key': `dup-${m.id}` })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect((await stockOf(invMgr, m.id)).onHand).toBe(3);
    expect(await ctx.prisma.inventoryTransaction.count({ where: { idempotencyKey: `dup-${m.id}` } })).toBe(1);
  });

  it('concurrent issues never oversell (row locks)', async () => {
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 50);
    const results = await Promise.all(Array.from({ length: 12 }, () => invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 10 }], reason: 'Concurrency' })));
    const ok = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 422).length;
    expect(ok).toBe(5);
    expect(rejected).toBe(7);
    const s = await stockOf(invMgr, m.id);
    expect(s.onHand).toBe(0);
  });

  it('reservation protects stock from other issues and can be released', async () => {
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 50);
    const r = await invMgr.post(`${API}/inventory/reservations`, { itemId: m.id, quantity: 30 }).expect(201);
    expect(r.body.reserved).toBe(30);
    let s = await stockOf(invMgr, m.id);
    expect(s).toMatchObject({ onHand: 50, reserved: 30, available: 20 });
    const fail = await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 25 }], reason: 'x' });
    expect(fail.status).toBe(422);
    await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 20 }], reason: 'x' }).expect(201);
    await invMgr.post(`${API}/inventory/reservations/${r.body.reservationIds[0]}/release`, {}).expect(200);
    s = await stockOf(invMgr, m.id);
    expect(s).toMatchObject({ onHand: 30, reserved: 0, available: 30 });
  });

  it('cannot reserve more than available', async () => {
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 5);
    const r = await invMgr.post(`${API}/inventory/reservations`, { itemId: m.id, quantity: 6 });
    expect(r.status).toBe(422);
    expect((await stockOf(invMgr, m.id)).reserved).toBe(0);
  });

  it('issues FIFO by batch receipt date', async () => {
    const m = await createMaterial(admin, { trackBatches: true });
    await receive(invMgr, m.id, 10, { batchNumber: 'B-OLD' });
    await new Promise((r) => setTimeout(r, 20));
    await receive(invMgr, m.id, 10, { batchNumber: 'B-NEW' });
    const res = await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 12 }], reason: 'FIFO' }).expect(201);
    const byBatch = Object.fromEntries(res.body.movements.map((mv: { batch: { batchNumber: string }; quantity: number }) => [mv.batch.batchNumber, mv.quantity]));
    expect(byBatch).toEqual({ 'B-OLD': -10, 'B-NEW': -2 });
    const noBatch = await invMgr.post(`${API}/inventory/receipts`, { lines: [{ itemId: m.id, quantity: 1 }] });
    expect(noBatch.status).toBe(400);
  });

  it('converts purchase units to base units', async () => {
    const m = await createMaterial(admin, { conversions: [{ uomCode: 'ROLL', factorToBase: 25 }] });
    const tx = await receive(invMgr, m.id, 2, { uomCode: 'ROLL' });
    expect(tx.movements[0].quantity).toBe(50);
    const bad = await invMgr.post(`${API}/inventory/receipts`, { lines: [{ itemId: m.id, quantity: 1, uomCode: 'KG' }] });
    expect(bad.status).toBe(400);
  });

  it('transfers between locations and guards release of rejected stock', async () => {
    const loc = await locations(ctx.prisma);
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 10, { locationId: loc.rejected.id });
    let s = await stockOf(invMgr, m.id);
    expect(s).toMatchObject({ onHand: 10, usableOnHand: 0, available: 0 });
    const denied = await invMgr.post(`${API}/inventory/transfers`, { fromLocationId: loc.rejected.id, toLocationId: loc.store.id, lines: [{ itemId: m.id, quantity: 4 }], reason: 'release' });
    expect(denied.status).toBe(403);
    const mgmt = await ctx.as(['inventory.transfer', 'quality.rejection.release', 'inventory.view']);
    await mgmt.post(`${API}/inventory/transfers`, { fromLocationId: loc.rejected.id, toLocationId: loc.store.id, lines: [{ itemId: m.id, quantity: 4 }], reason: 'Approved as saleable' }).expect(201);
    s = await stockOf(invMgr, m.id);
    expect(s).toMatchObject({ onHand: 10, usableOnHand: 4, available: 4 });
  });

  it('adjustments by non-approvers go through approval; requester cannot self-approve', async () => {
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 10);
    const req = await invMgr.post(`${API}/inventory/adjustments`, { lines: [{ itemId: m.id, quantity: -3 }], reason: 'Count difference' }).expect(201);
    expect(req.body.status).toBe('PENDING_APPROVAL');
    expect((await stockOf(invMgr, m.id)).onHand).toBe(10);
    const approvalId = req.body.approval.id;

    const approverWithSameUser = await invMgr.post(`${API}/approvals/${approvalId}/decision`, { decision: 'approve' });
    expect(approverWithSameUser.status).toBe(403);

    const management = await ctx.as('management');
    const decided = await management.post(`${API}/approvals/${approvalId}/decision`, { decision: 'approve', note: 'ok' }).expect(200);
    expect(decided.body.status).toBe('EXECUTED');
    expect((await stockOf(invMgr, m.id)).onHand).toBe(7);
    const again = await management.post(`${API}/approvals/${approvalId}/decision`, { decision: 'approve' });
    expect(again.status).toBe(409);
    expect((await stockOf(invMgr, m.id)).onHand).toBe(7);
  });

  it('administrators post adjustments directly', async () => {
    const m = await createMaterial(admin);
    const r = await admin.post(`${API}/inventory/adjustments`, { lines: [{ itemId: m.id, quantity: 4 }], reason: 'Opening balance' }).expect(201);
    expect(r.body.status).toBe('POSTED');
    expect((await stockOf(admin, m.id)).onHand).toBe(4);
  });

  it('reverses manual transactions once, and not when stock was consumed', async () => {
    const m = await createMaterial(admin);
    const t1 = await receive(invMgr, m.id, 10);
    await admin.post(`${API}/inventory/transactions/${t1.id}/reverse`, { reason: 'Entered twice' }).expect(201);
    expect((await stockOf(admin, m.id)).onHand).toBe(0);
    const again = await admin.post(`${API}/inventory/transactions/${t1.id}/reverse`, { reason: 'again' });
    expect(again.status).toBe(409);

    const t2 = await receive(invMgr, m.id, 10);
    await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 8 }], reason: 'use' }).expect(201);
    const blocked = await admin.post(`${API}/inventory/transactions/${t2.id}/reverse`, { reason: 'mistake' });
    expect(blocked.status).toBe(422);
    expect((await stockOf(admin, m.id)).onHand).toBe(2);
  });

  it('negative stock requires warehouse setting AND override permission', async () => {
    const loc = await locations(ctx.prisma);
    const m = await createMaterial(admin);
    const overrider = await ctx.as(['inventory.issue', 'inventory.negative_stock.override', 'inventory.view']);
    const r1 = await overrider.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 2, locationId: loc.store.id }], reason: 'x' });
    expect(r1.status).toBe(422);
    await ctx.prisma.warehouse.update({ where: { id: loc.warehouseId }, data: { allowNegativeStock: true } });
    try {
      const r2 = await invMgr.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 2, locationId: loc.store.id }], reason: 'x' });
      expect(r2.status).toBe(422);
      await overrider.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 2, locationId: loc.store.id }], reason: 'x' }).expect(201);
      expect((await stockOf(admin, m.id)).onHand).toBe(-2);
    } finally {
      await ctx.prisma.warehouse.update({ where: { id: loc.warehouseId }, data: { allowNegativeStock: false } });
    }
  });

  it('stock count reconciliation posts variances after approval', async () => {
    const loc = await locations(ctx.prisma);
    const m = await createMaterial(admin);
    await receive(invMgr, m.id, 20);
    const count = await invMgr.post(`${API}/inventory/stock-counts`, { warehouseId: loc.warehouseId, locationId: loc.store.id, itemIds: [m.id] }).expect(201);
    const line = count.body.lines.find((l: { itemId: string }) => l.itemId === m.id);
    expect(line.systemQty).toBe(20);
    await invMgr.post(`${API}/inventory/stock-counts/${count.body.id}/lines`, { lines: count.body.lines.map((l: { id: string; itemId: string; systemQty: number }) => ({ lineId: l.id, countedQty: l.itemId === m.id ? 18 : l.systemQty })) }).expect(200);
    const sub = await invMgr.post(`${API}/inventory/stock-counts/${count.body.id}/submit`).expect(200);
    expect(sub.body.status).toBe('PENDING_APPROVAL');
    expect((await stockOf(admin, m.id)).onHand).toBe(20);
    const mgmt = await ctx.as('management');
    const d = await mgmt.post(`${API}/approvals/${sub.body.approval.id}/decision`, { decision: 'approve' }).expect(200);
    expect(d.body.status).toBe('EXECUTED');
    expect((await stockOf(admin, m.id)).onHand).toBe(18);
    const posted = await admin.get(`${API}/inventory/stock-counts/${count.body.id}`).expect(200);
    expect(posted.body.status).toBe('POSTED');
  });

  it('enforces permissions on the backend', async () => {
    const viewer = await ctx.as('viewer');
    const worker = await ctx.as('production_worker');
    const m = await createMaterial(admin);
    expect((await viewer.post(`${API}/inventory/receipts`, { lines: [{ itemId: m.id, quantity: 1 }] })).status).toBe(403);
    expect((await viewer.get(`${API}/inventory/stock`)).status).toBe(200);
    expect((await worker.get(`${API}/inventory/movements`)).status).toBe(403);
    expect((await viewer.post(`${API}/items`, { type: 'MATERIAL', code: 'X1', name: 'x', uomCode: 'M' })).status).toBe(403);
  });

  it('ledger rows are immutable and balances match the ledger', async () => {
    const mv = await ctx.prisma.stockMovement.findFirst();
    await expect(ctx.prisma.stockMovement.update({ where: { id: mv!.id }, data: { quantity: 999 } })).rejects.toThrow(/immutable/);
    await expect(ctx.prisma.stockMovement.delete({ where: { id: mv!.id } })).rejects.toThrow(/immutable/);
    const integrity = await admin.get(`${API}/inventory/integrity`).expect(200);
    expect(integrity.body).toEqual({ ok: true, mismatches: [] });
  });
});
