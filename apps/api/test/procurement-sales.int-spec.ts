import { API, AuthedClient, createMaterial, createTestContext, locations, receive, stockOf, TestCtx } from './helpers';

describe('Procurement (integration)', () => {
  let ctx: TestCtx;
  let admin: AuthedClient;
  let buyer: AuthedClient;
  let mgmt: AuthedClient;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await ctx.as('administrator');
    buyer = await ctx.as('inventory_manager');
    mgmt = await ctx.as('management');
  });
  afterAll(() => ctx.close());

  it('validates GSTIN on suppliers', async () => {
    const r = await buyer.post(`${API}/procurement/suppliers`, { code: 'BADGST', name: 'Bad', gstin: '123' });
    expect(r.status).toBe(400);
  });

  it('runs PO approval, partial receipts, over-receipt guard and idempotent GRN', async () => {
    const m = await createMaterial(admin, { uomCode: 'M', conversions: [{ uomCode: 'ROLL', factorToBase: 25 }] });
    const s = await buyer.post(`${API}/procurement/suppliers`, { code: 'SUP-PU', name: 'Leather Supplier', gstin: '27ABCDE1234F1Z5', leadTimeDays: 10 }).expect(201);
    await buyer.put(`${API}/procurement/suppliers/${s.body.id}/items`, { itemId: m.id, purchaseUomCode: 'ROLL', conversionFactor: 25, isPreferred: true }).expect(200);

    const po = await buyer.post(`${API}/procurement/orders`, { supplierId: s.body.id, expectedDate: '2020-01-01T00:00:00Z', lines: [{ itemId: m.id, quantity: 4, uomCode: 'ROLL', unitPrice: 1000, taxRate: 12 }] }).expect(201);
    expect(po.body).toMatchObject({ status: 'DRAFT', subtotal: 4000, taxTotal: 480, total: 4480 });

    const early = await buyer.post(`${API}/procurement/receipts`, { purchaseOrderId: po.body.id, lines: [{ purchaseOrderLineId: po.body.lines[0].id, quantity: 1 }] });
    expect(early.status).toBe(409);

    await buyer.post(`${API}/procurement/orders/${po.body.id}/submit`).expect(200);
    const self = await ctx.as(['procurement.po.approve', 'procurement.po.manage', 'procurement.view']);
    const own = await self.post(`${API}/procurement/orders`, { supplierId: s.body.id, lines: [{ itemId: m.id, quantity: 1, uomCode: 'ROLL', unitPrice: 1 }] }).expect(201);
    await self.post(`${API}/procurement/orders/${own.body.id}/submit`).expect(200);
    expect((await self.post(`${API}/procurement/orders/${own.body.id}/decision`, { decision: 'approve' })).status).toBe(403);

    const approved = await mgmt.post(`${API}/procurement/orders/${po.body.id}/decision`, { decision: 'approve' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.isOverdue).toBe(true);

    const lineId = po.body.lines[0].id;
    const g1 = await buyer.post(`${API}/procurement/receipts`, { purchaseOrderId: po.body.id, supplierInvoiceNo: 'INV-1', lines: [{ purchaseOrderLineId: lineId, quantity: 2 }] }, { 'Idempotency-Key': `grn-${po.body.id}-1` }).expect(201);
    const g1b = await buyer.post(`${API}/procurement/receipts`, { purchaseOrderId: po.body.id, supplierInvoiceNo: 'INV-1', lines: [{ purchaseOrderLineId: lineId, quantity: 2 }] }, { 'Idempotency-Key': `grn-${po.body.id}-1` }).expect(201);
    expect(g1b.body.id).toBe(g1.body.id);
    expect((await stockOf(admin, m.id)).onHand).toBe(50);
    let detail = (await buyer.get(`${API}/procurement/orders/${po.body.id}`).expect(200)).body;
    expect(detail.status).toBe('PARTIALLY_RECEIVED');
    expect(detail.lines[0].pendingQty).toBe(2);

    const over = await buyer.post(`${API}/procurement/receipts`, { purchaseOrderId: po.body.id, lines: [{ purchaseOrderLineId: lineId, quantity: 3 }] });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('OVER_RECEIPT');

    await buyer.post(`${API}/procurement/receipts`, { purchaseOrderId: po.body.id, lines: [{ purchaseOrderLineId: lineId, quantity: 2, batchNumber: 'LOT-2' }] }).expect(201);
    detail = (await buyer.get(`${API}/procurement/orders/${po.body.id}`).expect(200)).body;
    expect(detail.status).toBe('RECEIVED');
    const item = (await admin.get(`${API}/items/${m.id}`).expect(200)).body;
    expect(item.lastPurchasePrice).toBe(40);
    expect((await stockOf(admin, m.id)).onHand).toBe(100);
  });

  it('holds inspected materials in QC until dispositioned, then returns rejects to supplier', async () => {
    const loc = await locations(ctx.prisma);
    const m = await createMaterial(admin, { requiresInspection: true, uomCode: 'PCS' });
    const s = await buyer.post(`${API}/procurement/suppliers`, { code: 'SUP-MF', name: 'Fittings Co' }).expect(201);
    const g = await buyer.post(`${API}/procurement/receipts`, { supplierId: s.body.id, lines: [{ itemId: m.id, quantity: 10 }] }).expect(201);
    expect(g.body.lines[0].inspection.status).toBe('PENDING');
    let st = await stockOf(admin, m.id);
    expect(st).toMatchObject({ onHand: 10, available: 0 });

    const bad = await buyer.post(`${API}/quality/inspections/${g.body.lines[0].inspection.id}/complete`, { quantityAccepted: 5, quantityRejected: 1 });
    expect(bad.status).toBe(400);
    await buyer.post(`${API}/quality/inspections/${g.body.lines[0].inspection.id}/complete`, { quantityAccepted: 8, quantityRejected: 2 }).expect(200);
    st = await stockOf(admin, m.id);
    expect(st).toMatchObject({ onHand: 10, available: 8, usableOnHand: 8 });

    await buyer.post(`${API}/procurement/returns`, { supplierId: s.body.id, goodsReceiptId: g.body.id, reason: 'Defective finish', lines: [{ itemId: m.id, quantity: 2, locationId: loc.rejected.id }] }).expect(201);
    st = await stockOf(admin, m.id);
    expect(st).toMatchObject({ onHand: 8, available: 8 });
  });

  it('recommends reorders from stock policy and consumption, and never orders without approval', async () => {
    const m = await createMaterial(admin, { reorderLevel: 100, minStock: 50, reorderQty: 200 });
    await receive(buyer, m.id, 60);
    await buyer.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 30 }], reason: 'Production use' }).expect(201);
    const rec = await buyer.get(`${API}/procurement/reorder-recommendations`).expect(200);
    const r = rec.body.recommendations.find((x: { item: { id: string } }) => x.item.id === m.id);
    expect(r.triggered).toBe(true);
    expect(r.available).toBe(30);
    expect(r.consumedInWindow).toBe(30);
    expect(r.suggestedQty).toBeGreaterThanOrEqual(200);
    expect(r.basis).toMatch(/Available 30/);

    const poCountBefore = await ctx.prisma.purchaseOrder.count();
    const req = await buyer.post(`${API}/procurement/reorder-recommendations/requisition`, { lines: [{ itemId: m.id, quantity: r.suggestedQty }] }).expect(201);
    expect(req.body.status).toBe('SUBMITTED');
    expect(await ctx.prisma.purchaseOrder.count()).toBe(poCountBefore);
    expect((await buyer.post(`${API}/procurement/requisitions/${req.body.id}/action`, { action: 'approve' })).status).toBe(403);
    await mgmt.post(`${API}/procurement/requisitions/${req.body.id}/action`, { action: 'approve' }).expect(200);
    const sup = await buyer.post(`${API}/procurement/suppliers`, { code: 'SUP-RE', name: 'Reorder supplier' }).expect(201);
    const conv = await buyer.post(`${API}/procurement/requisitions/${req.body.id}/convert`, { supplierByLine: { [req.body.lines[0].id]: sup.body.id } }).expect(201);
    const po = (await buyer.get(`${API}/procurement/orders/${conv.body.purchaseOrderIds[0]}`).expect(200)).body;
    expect(po.status).toBe('DRAFT');
  });
});

describe('Sales (integration)', () => {
  let ctx: TestCtx;
  let admin: AuthedClient;
  let sales: AuthedClient;
  let sku: { id: string };
  let customerId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await ctx.as('administrator');
    sales = await ctx.as('sales_executive');
    const pcats = (await admin.get(`${API}/categories?type=PRODUCT`).expect(200)).body as { id: string }[];
    const p = await admin.post(`${API}/products`, { code: 'DIARY-A5', name: 'A5 Diary', categoryId: pcats[0].id }).expect(201);
    const v = await admin.post(`${API}/products/${p.body.id}/variants`, { variants: [{ variantName: 'Tan', code: 'DIARY-A5-TAN', sellingPrice: 250, taxRate: 12, hsnCode: '4820' }] }).expect(201);
    sku = v.body[0];
    await admin.put(`${API}/admin/settings/company`, { value: { legalName: 'Test Manufacturing Pvt Ltd', gstin: '27AAAAA0000A1Z5', state: 'Maharashtra' } }).expect(200);
    const c = await sales.post(`${API}/customers`, { code: 'CUST-1', companyName: 'Acme Gifting', gstin: '27BBBBB1111B1Z5', state: 'Maharashtra', city: 'Mumbai' }).expect(201);
    customerId = c.body.id;
  });
  afterAll(() => ctx.close());

  it('quotes with customer-specific pricing and renders a PDF', async () => {
    await sales.post(`${API}/customers/${customerId}/prices`, { itemId: sku.id, unitPrice: 220, minQty: 50 }).expect(201);
    const price = await sales.get(`${API}/sales/price?customerId=${customerId}&itemId=${sku.id}&quantity=100`).expect(200);
    expect(price.body).toMatchObject({ unitPrice: 220, source: 'CUSTOMER_PRICE' });
    const small = await sales.get(`${API}/sales/price?customerId=${customerId}&itemId=${sku.id}&quantity=10`).expect(200);
    expect(small.body).toMatchObject({ unitPrice: 250, source: 'LIST_PRICE' });

    const q = await sales.post(`${API}/sales/quotations`, { customerId, lines: [{ itemId: sku.id, quantity: 100, discountPct: 5 }] }).expect(201);
    expect(q.body.lines[0].unitPrice).toBe(220);
    expect(q.body).toMatchObject({ subtotal: 22000, discountTotal: 1100, taxTotal: 2508, total: 23408 });
    const pdf = await sales.get(`${API}/sales/quotations/${q.body.id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('confirms, reserves, partially fulfils via challans, reverses a challan, and plans production for shortages', async () => {
    await admin.post(`${API}/inventory/receipts`, { lines: [{ itemId: sku.id, quantity: 6 }] }).expect(201);
    const so = await sales.post(`${API}/sales/orders`, { customerId, lines: [{ itemId: sku.id, quantity: 10 }] }).expect(201);
    expect(so.body.status).toBe('DRAFT');
    await sales.post(`${API}/sales/orders/${so.body.id}/confirm`).expect(200);
    const r = await sales.post(`${API}/sales/orders/${so.body.id}/reserve`).expect(200);
    expect(r.body.results[0]).toMatchObject({ requested: 10, reserved: 6 });
    expect(await stockOf(admin, sku.id)).toMatchObject({ onHand: 6, reserved: 6, available: 0 });

    const lineId = so.body.lines[0].id;
    const ch = await sales.post(`${API}/sales/challans`, { salesOrderId: so.body.id, post: true, vehicleNo: 'MH01AB1234', lines: [{ salesOrderLineId: lineId, quantity: 4 }] }).expect(201);
    expect(ch.body.status).toBe('POSTED');
    expect(await stockOf(admin, sku.id)).toMatchObject({ onHand: 2, reserved: 2 });
    let order = (await sales.get(`${API}/sales/orders/${so.body.id}`).expect(200)).body;
    expect(order.status).toBe('PARTIALLY_FULFILLED');
    expect(order.lines[0]).toMatchObject({ quantityFulfilled: 4, pendingQty: 6, reservedQty: 2 });

    const over = await sales.post(`${API}/sales/challans`, { salesOrderId: so.body.id, post: true, lines: [{ salesOrderLineId: lineId, quantity: 7 }] });
    expect(over.status).toBe(422);

    const pdf = await sales.get(`${API}/sales/challans/${ch.body.id}/pdf`);
    expect(pdf.status).toBe(200);

    await sales.post(`${API}/sales/challans/${ch.body.id}/cancel`, { reason: 'Vehicle did not leave' }).expect(200);
    expect((await stockOf(admin, sku.id)).onHand).toBe(6);
    order = (await sales.get(`${API}/sales/orders/${so.body.id}`).expect(200)).body;
    expect(order.status).toBe('CONFIRMED');

    const plan = await sales.post(`${API}/sales/orders/${so.body.id}/plan-production`, {}).expect(201);
    expect(plan.body.created).toHaveLength(1);
    // pending 10 − reserved 2 − free 4 (returned by the reversed challan; consumed reservations are not re-created)
    expect(plan.body.created[0].quantityPlanned).toBe(4);

    expect((await sales.post(`${API}/sales/orders/${so.body.id}/cancel`, { reason: 'x' })).status).toBe(403);
    const mgmt = await ctx.as(['sales.order.cancel', 'sales.view']);
    await mgmt.post(`${API}/sales/orders/${so.body.id}/cancel`, { reason: 'Customer withdrew' }).expect(200);
    expect(await stockOf(admin, sku.id)).toMatchObject({ onHand: 6, reserved: 0 });

    const integrity = await admin.get(`${API}/inventory/integrity`).expect(200);
    expect(integrity.body.ok).toBe(true);
  });
});
