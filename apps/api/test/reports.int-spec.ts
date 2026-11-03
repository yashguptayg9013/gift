import { API, AuthedClient, createMaterial, createTestContext, receive, TestCtx } from './helpers';

describe('Dashboard and reports (integration)', () => {
  let ctx: TestCtx;
  let admin: AuthedClient;
  let matId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await ctx.as('administrator');
    const m = await createMaterial(admin, { reorderLevel: 50, standardCost: 12.5 });
    matId = m.id;
    await receive(admin, m.id, 40);
    await admin.post(`${API}/inventory/issues`, { lines: [{ itemId: m.id, quantity: 15 }], reason: 'Sampling' }).expect(201);
  });
  afterAll(() => ctx.close());

  it('dashboard returns real aggregates with zero-filled series', async () => {
    const from = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const r = await admin.get(`${API}/dashboard?from=${from}&to=${new Date().toISOString()}`).expect(200);
    expect(r.body.rawMaterials).toMatchObject({ skuCount: 1, inStockSkuCount: 1, lowStockCount: 1, valuedSkuCount: 1 });
    expect(r.body.rawMaterials.valueEstimate).toBeCloseTo(25 * 12.5, 2);
    expect(r.body.inventoryMovement.length).toBeGreaterThanOrEqual(7);
    const totalReceipts = r.body.inventoryMovement.reduce((s: number, d: { receipts: number }) => s + d.receipts, 0);
    expect(totalReceipts).toBe(1);
    expect(r.body.monthlyActivity).toHaveLength(12);
    expect(r.body.lowStock[0]).toMatchObject({ id: matId, available: 25 });
    expect(r.body.recentTransactions.length).toBe(2);
  });

  it('runs every report the user may see, in every export format', async () => {
    const catalog = (await admin.get(`${API}/reports`).expect(200)).body as { key: string }[];
    expect(catalog.length).toBeGreaterThanOrEqual(18);
    for (const { key } of catalog) {
      const r = await admin.get(`${API}/reports/${key}`);
      expect({ key, status: r.status }).toEqual({ key, status: 200 });
      expect(Array.isArray(r.body.rows)).toBe(true);
      for (const row of r.body.rows) expect(row.source).toBeDefined();
    }
    const consumption = (await admin.get(`${API}/reports/material-consumption`).expect(200)).body;
    expect(consumption.rows[0]).toMatchObject({ issues: 15, total: 15 });
    const movement = (await admin.get(`${API}/reports/stock-movement`).expect(200)).body;
    expect(movement.rows[0]).toMatchObject({ opening: 0, inward: 40, outward: 15, closing: 25 });

    const csv = await admin.get(`${API}/reports/current-stock?format=csv`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/Code,Name/);
    const xlsx = await admin.get(`${API}/reports/current-stock?format=xlsx`).buffer(true).parse(binary).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await admin.get(`${API}/reports/stock-movement?format=pdf`).buffer(true).parse(binary).expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('enforces report permissions', async () => {
    const sales = await ctx.as('sales_executive');
    const catalog = (await sales.get(`${API}/reports`).expect(200)).body as { group: string }[];
    expect(catalog.every((c) => c.group === 'sales')).toBe(true);
    expect((await sales.get(`${API}/reports/current-stock`)).status).toBe(403);
    const viewer = await ctx.as('viewer');
    expect((await viewer.get(`${API}/reports/current-stock`)).status).toBe(403);
    const noExport = await ctx.as(['reports.inventory']);
    expect((await noExport.get(`${API}/reports/current-stock`)).status).toBe(200);
    expect((await noExport.get(`${API}/reports/current-stock?format=csv`)).status).toBe(403);
  });
});

function binary(res: NodeJS.ReadableStream & { on: (e: string, cb: (c?: Buffer) => void) => void }, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c?: Buffer) => c && chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
