import { API, AuthedClient, createMaterial, createTestContext, locations, receive, stockOf, TestCtx } from './helpers';

/**
 * End-to-end manufacturing workflow against a real database.
 * Product: A5 notebook cover (Black), route PU cutting → cardboard cutting → assembly → QC.
 */
describe('Manufacturing engine (integration)', () => {
  let ctx: TestCtx;
  let admin: AuthedClient;
  let supervisor: AuthedClient;
  let stages: Record<string, string>;
  let pu: { id: string };
  let board: { id: string };
  let elastic: { id: string };
  let fitting: { id: string };
  let puBlue: { id: string };
  let sku: { id: string };
  let bomVersionId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    admin = await ctx.as('administrator');
    supervisor = await ctx.as('production_supervisor');
    const st = await admin.get(`${API}/manufacturing/stages`).expect(200);
    stages = Object.fromEntries(st.body.map((s: { code: string; id: string }) => [s.code, s.id]));

    const cats = (await admin.get(`${API}/categories?type=MATERIAL`).expect(200)).body as { id: string; code: string }[];
    const cat = (c: string) => cats.find((x) => x.code === c)!.id;
    pu = await createMaterial(admin, { code: 'PU-07-BLK', name: 'PU leather 0.7mm black', uomCode: 'M2', categoryId: cat('PU_LEATHER'), attributes: { thickness_mm: '0.7', colour: 'Black', form: 'ROLL' } });
    puBlue = await createMaterial(admin, { code: 'PU-07-BLU', name: 'PU leather 0.7mm blue', uomCode: 'M2', categoryId: cat('PU_LEATHER'), attributes: { thickness_mm: '0.7', colour: 'Blue' } });
    board = await createMaterial(admin, { code: 'CB-2MM', name: 'Cardboard 2mm', uomCode: 'SHEET', categoryId: cat('CARDBOARD'), attributes: { thickness_mm: 2 } });
    elastic = await createMaterial(admin, { code: 'EL-10', name: 'Elastic 10mm', uomCode: 'M' });
    fitting = await createMaterial(admin, { code: 'MF-CRN', name: 'Metal corner', uomCode: 'PCS' });
    const inv = await ctx.as('inventory_manager');
    await receive(inv, pu.id, 5);
    await receive(inv, puBlue.id, 5);
    await receive(inv, board.id, 100);
    await receive(inv, elastic.id, 20);
    await receive(inv, fitting.id, 200);

    const route = await admin
      .post(`${API}/manufacturing/routes`, {
        code: 'COVER-STD',
        name: 'Notebook cover standard',
        steps: [{ stageDefinitionId: stages.PU_CUTTING }, { stageDefinitionId: stages.CARDBOARD_CUTTING }, { stageDefinitionId: stages.ASSEMBLY }, { stageDefinitionId: stages.QUALITY_CONTROL }],
      })
      .expect(201);
    const pcats = (await admin.get(`${API}/categories?type=PRODUCT`).expect(200)).body as { id: string; code: string }[];
    const product = await admin.post(`${API}/products`, { code: 'A5-COVER', name: 'A5 Notebook Cover', categoryId: pcats.find((c) => c.code === 'NOTEBOOK')!.id, defaultRouteId: route.body.id }).expect(201);
    const variants = await admin
      .post(`${API}/products/${product.body.id}/variants`, {
        variants: [
          { variantName: 'Black', code: 'A5-COVER-BLK', attributes: { length_mm: 210, width_mm: 148 } },
          { variantName: 'Blue', code: 'A5-COVER-BLU', attributes: { length_mm: 210, width_mm: 148 } },
        ],
      })
      .expect(201);
    sku = variants.body[0];

    const bom = await admin
      .post(`${API}/boms`, {
        itemId: sku.id,
        lines: [
          { materialId: pu.id, quantityFormula: '(length_mm + 20) * (width_mm + 20) * 2 / 1000000', wastagePercent: 10, stageDefinitionId: stages.PU_CUTTING, alternatives: [{ materialId: puBlue.id }] },
          { materialId: board.id, quantity: 2, stageDefinitionId: stages.CARDBOARD_CUTTING },
          { materialId: elastic.id, quantity: 0.3, stageDefinitionId: stages.ASSEMBLY },
          { materialId: fitting.id, quantity: 4, stageDefinitionId: stages.ASSEMBLY },
        ],
      })
      .expect(201);
    bomVersionId = bom.body.versions[0].id;
    await admin.post(`${API}/boms/versions/${bomVersionId}/activate`).expect(201);
  });
  afterAll(() => ctx.close());

  it('validates BOM formulas against SKU attributes', async () => {
    const bad = await admin.post(`${API}/boms/versions/${bomVersionId}/duplicate`, { targetItemId: sku.id }).expect(201);
    const r = await admin.put(`${API}/boms/versions/${bad.body.id}`, { lines: [{ materialId: pu.id, quantityFormula: 'depth_mm * 2' }] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/depth_mm/);
  });

  it('computes requirements from the active BOM with formulas and wastage', async () => {
    const r = await admin.post(`${API}/boms/versions/${bomVersionId}/requirements`, { quantity: 10 }).expect(201);
    const puLine = r.body.lines.find((l: { materialId: string }) => l.materialId === pu.id);
    expect(puLine.qtyPerUnit).toBeCloseTo(0.07728, 6);
    expect(puLine.requiredQty).toBeCloseTo(0.8501, 4);
    expect(r.body.lines.find((l: { materialId: string }) => l.materialId === board.id).requiredQty).toBe(20);
  });

  it('duplicates a BOM to another variant with material substitution and compares versions', async () => {
    const blue = (await admin.get(`${API}/items?search=A5-COVER-BLU`).expect(200)).body.data[0];
    const dup = await admin.post(`${API}/boms/versions/${bomVersionId}/duplicate`, { targetItemId: blue.id, substitutions: [{ fromMaterialId: pu.id, toMaterialId: puBlue.id }] }).expect(201);
    expect(dup.body.lines.find((l: { materialId: string }) => l.materialId === puBlue.id)).toBeTruthy();
    expect(dup.body.lines.find((l: { materialId: string }) => l.materialId === pu.id)).toBeFalsy();
    const cmp = await admin.get(`${API}/boms/compare?a=${bomVersionId}&b=${dup.body.id}`).expect(200);
    expect(cmp.body.rows.find((r: { materialId: string }) => r.materialId === pu.id).change).toBe('removed');
    expect(cmp.body.rows.find((r: { materialId: string }) => r.materialId === puBlue.id).change).toBe('added');
  });

  it('runs the full production lifecycle with reservation, backflush, QC and FG receipt', async () => {
    const order = await supervisor.post(`${API}/production/orders`, { itemId: sku.id, quantity: 10, priority: 'HIGH', dueDate: '2030-01-01T00:00:00Z' }).expect(201);
    expect(order.body.status).toBe('DRAFT');
    const id = order.body.id;

    const released = await supervisor.post(`${API}/production/orders/${id}/release`).expect(200);
    expect(released.body.status).toBe('RELEASED');
    expect(released.body.stages.map((s: { stageDefinition: { code: string } }) => s.stageDefinition.code)).toEqual(['PU_CUTTING', 'CARDBOARD_CUTTING', 'ASSEMBLY', 'QUALITY_CONTROL']);
    expect(released.body.materials).toHaveLength(4);

    const avail = await supervisor.get(`${API}/production/orders/${id}/availability`).expect(200);
    expect(avail.body.canReserveAll).toBe(true);

    // Reservation does not change on-hand.
    const puBefore = await stockOf(admin, pu.id);
    const res = await supervisor.post(`${API}/production/orders/${id}/reserve`).expect(200);
    expect(res.body.allCovered).toBe(true);
    expect(res.body.order.status).toBe('MATERIALS_RESERVED');
    const puReserved = await stockOf(admin, pu.id);
    expect(puReserved.onHand).toBe(puBefore.onHand);
    expect(puReserved.reserved).toBeCloseTo(0.8501, 4);

    // Worker linked to a user, assigned only to PU cutting.
    const workerUser = await ctx.as('production_worker');
    const worker = await supervisor.post(`${API}/workforce/workers`, { code: 'W-001', name: 'Cutter One', userId: workerUser.userId, skills: ['PU_CUTTING'] });
    expect([201, 403]).toContain(worker.status);
    const w = worker.status === 201 ? worker.body : (await admin.post(`${API}/workforce/workers`, { code: 'W-001', name: 'Cutter One', userId: workerUser.userId }).expect(201)).body;
    const stagesById = Object.fromEntries(released.body.stages.map((s: { stageDefinition: { code: string }; id: string }) => [s.stageDefinition.code, s.id]));
    await supervisor.put(`${API}/production/stages/${stagesById.PU_CUTTING}/workers`, { workerIds: [w.id] }).expect(200);
    // re-login so the token carries the new worker link (permission version bumped)
    const relogin = await ctx.http().post(`${API}/auth/login`).set('X-Client', 'mobile').send({ email: (await ctx.prisma.user.findUniqueOrThrow({ where: { id: workerUser.userId } })).email, password: 'Test-password-123' }).expect(200);
    const workerToken = relogin.body.accessToken;
    const asWorker = (url: string, body: object) => ctx.http().post(url).set('Authorization', `Bearer ${workerToken}`).send(body);

    // Worker cannot touch a stage they are not assigned to.
    expect((await asWorker(`${API}/production/stages/${stagesById.CARDBOARD_CUTTING}/output`, { qtyGood: 1 })).status).toBe(403);

    // Worker records PU cutting output (idempotent).
    const out1 = await asWorker(`${API}/production/stages/${stagesById.PU_CUTTING}/output`, { qtyGood: 10 }).set('Idempotency-Key', `pu-${id}`);
    expect(out1.status).toBe(201);
    const dup = await asWorker(`${API}/production/stages/${stagesById.PU_CUTTING}/output`, { qtyGood: 10 }).set('Idempotency-Key', `pu-${id}`);
    expect(dup.status).toBe(201);
    expect(dup.body.replayed).toBe(true);
    const afterPu = await stockOf(admin, pu.id);
    expect(afterPu.onHand).toBeCloseTo(puBefore.onHand - 0.7728, 4); // standard consumption, not the wastage allowance
    const stagePu = out1.body.order.stages.find((s: { id: string }) => s.id === stagesById.PU_CUTTING);
    expect(stagePu.status).toBe('COMPLETED');
    expect(stagePu.qtyGood).toBe(10);

    // Cardboard cutting by supervisor.
    await supervisor.post(`${API}/production/stages/${stagesById.CARDBOARD_CUTTING}/output`, { qtyGood: 10 }).expect(201);
    expect((await stockOf(admin, board.id)).onHand).toBe(80);

    // Assembly: cannot exceed input.
    const over = await supervisor.post(`${API}/production/stages/${stagesById.ASSEMBLY}/output`, { qtyGood: 11 });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('QUANTITY_EXCEEDS_INPUT');
    const a1 = await supervisor.post(`${API}/production/stages/${stagesById.ASSEMBLY}/output`, { qtyGood: 6 }).expect(201);
    expect((await stockOf(admin, fitting.id)).onHand).toBe(176);

    // Reverse the first assembly entry (QC hasn't processed it) and re-record.
    const rev = await supervisor.post(`${API}/production/outputs/${a1.body.output.id}/reverse`, { reason: 'Wrong quantity' });
    expect(rev.status).toBe(200);
    expect((await stockOf(admin, fitting.id)).onHand).toBe(200);
    await supervisor.post(`${API}/production/stages/${stagesById.ASSEMBLY}/output`, { qtyGood: 6 }).expect(201);
    await supervisor.post(`${API}/production/stages/${stagesById.ASSEMBLY}/output`, { qtyGood: 4 }).expect(201);

    // Upstream reversal is blocked once downstream consumed.
    const cbOutput = (await supervisor.get(`${API}/production/orders/${id}`).expect(200)).body.outputs.find((o: { stageId: string; reversedAt: string | null }) => o.stageId === stagesById.CARDBOARD_CUTTING && !o.reversedAt);
    const blocked = await supervisor.post(`${API}/production/outputs/${cbOutput.id}/reverse`, { reason: 'test' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('DOWNSTREAM_CONSUMED');

    // Wastage report consumes extra material with a reason.
    await supervisor.post(`${API}/production/orders/${id}/wastage`, { materialLineId: released.body.materials.find((m: { itemId: string }) => m.itemId === elastic.id).id, quantity: 0.5, reason: 'Elastic snapped' }).expect(200);

    // Final QC stage: 8 good, 1 rejected → rejected goes to non-saleable REJECTED location.
    const defect = await admin.post(`${API}/quality/defect-categories`, { code: 'STITCH', name: 'Stitching defect' }).expect(201);
    const qc1 = await supervisor.post(`${API}/production/stages/${stagesById.QUALITY_CONTROL}/output`, { qtyGood: 8, qtyRejected: 1, defects: [{ defectCategoryId: defect.body.id, quantity: 1 }] }).expect(201);
    expect(qc1.body.order.quantityCompleted).toBe(8);
    let fg = await stockOf(admin, sku.id);
    expect(fg).toMatchObject({ onHand: 9, usableOnHand: 8, available: 8 });
    const insp = await admin.get(`${API}/quality/inspections?productionOrderId=${id}`).expect(200);
    expect(insp.body.data[0]).toMatchObject({ type: 'FINAL', status: 'COMPLETED', quantityAccepted: 8, quantityRejected: 1 });

    const qc2 = await supervisor.post(`${API}/production/stages/${stagesById.QUALITY_CONTROL}/output`, { qtyGood: 1 }).expect(201);
    expect(qc2.body.order.status).toBe('COMPLETED');
    expect(qc2.body.order.quantityCompleted).toBe(9);
    fg = await stockOf(admin, sku.id);
    expect(fg.available).toBe(9);

    // Completion released the unused wastage allowance.
    const puAfter = await stockOf(admin, pu.id);
    expect(puAfter.reserved).toBe(0);
    const detail = (await supervisor.get(`${API}/production/orders/${id}`).expect(200)).body;
    const elasticLine = detail.materials.find((m: { itemId: string }) => m.itemId === elastic.id);
    expect(elasticLine.consumedQty).toBeCloseTo(3.5, 4);
    expect(elasticLine.wastageQty).toBeCloseTo(0.5, 4);
    expect(detail.events.some((e: { type: string }) => e.type === 'COMPLETED')).toBe(true);

    // Productivity derives from production records only.
    const prod = await admin.get(`${API}/workforce/productivity?from=2020-01-01T00:00:00Z&to=2100-01-01T00:00:00Z`).expect(200);
    const row = prod.body.rows.find((r: { worker: { id: string } }) => r.worker.id === w.id);
    expect(row).toMatchObject({ good: 10, rejected: 0, entries: 1 });

    const integrity = await admin.get(`${API}/inventory/integrity`).expect(200);
    expect(integrity.body.ok).toBe(true);
  });

  it('prevents over-recording under concurrent requests', async () => {
    const o = (await supervisor.post(`${API}/production/orders`, { itemId: sku.id, quantity: 10 }).expect(201)).body;
    const rel = (await supervisor.post(`${API}/production/orders/${o.id}/release`).expect(200)).body;
    const first = rel.stages[0].id;
    const results = await Promise.all(Array.from({ length: 6 }, () => supervisor.post(`${API}/production/stages/${first}/output`, { qtyGood: 3 })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    const detail = (await supervisor.get(`${API}/production/orders/${o.id}`).expect(200)).body;
    expect(detail.stages[0].qtyGood).toBe(9);
  });

  it('cancels an order and releases reservations; supports substitution', async () => {
    const o = (await supervisor.post(`${API}/production/orders`, { itemId: sku.id, quantity: 5 }).expect(201)).body;
    const rel = (await supervisor.post(`${API}/production/orders/${o.id}/release`).expect(200)).body;
    const puLine = rel.materials.find((m: { itemId: string }) => m.itemId === pu.id);
    const sub = await supervisor.post(`${API}/production/orders/${o.id}/substitute`, { materialLineId: puLine.id, alternativeMaterialId: puBlue.id }).expect(200);
    expect(sub.body.materials.find((m: { id: string }) => m.id === puLine.id).itemId).toBe(puBlue.id);
    await supervisor.post(`${API}/production/orders/${o.id}/reserve`).expect(200);
    expect((await stockOf(admin, puBlue.id)).reserved).toBeGreaterThan(0);

    expect((await supervisor.post(`${API}/production/orders/${o.id}/cancel`, { reason: 'Customer cancelled' })).status).toBe(403);
    const mgmt = await ctx.as('management');
    const c = await mgmt.post(`${API}/production/orders/${o.id}/cancel`, { reason: 'Customer cancelled' }).expect(200);
    expect(c.body.status).toBe('CANCELLED');
    expect((await stockOf(admin, puBlue.id)).reserved).toBe(0);
    const again = await mgmt.post(`${API}/production/orders/${o.id}/cancel`, { reason: 'again' });
    expect(again.status).toBe(409);
  });

  it('refuses release without an active BOM or route', async () => {
    const pcats = (await admin.get(`${API}/categories?type=PRODUCT`).expect(200)).body as { id: string }[];
    const p = await admin.post(`${API}/products`, { code: 'NO-BOM', name: 'No BOM', categoryId: pcats[0].id }).expect(201);
    const v = await admin.post(`${API}/products/${p.body.id}/variants`, { variants: [{ variantName: 'Std', code: 'NO-BOM-STD' }] }).expect(201);
    const o = (await supervisor.post(`${API}/production/orders`, { itemId: v.body[0].id, quantity: 1 }).expect(201)).body;
    const r = await supervisor.post(`${API}/production/orders/${o.id}/release`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('NO_ACTIVE_BOM');
  });

  it('material receipt inspection holds stock until dispositioned', async () => {
    const loc = await locations(ctx.prisma);
    const m = await createMaterial(admin, { requiresInspection: true });
    const inv = await ctx.as('inventory_manager');
    await receive(inv, m.id, 10, { locationId: loc.qc.id });
    const s = await stockOf(admin, m.id);
    expect(s.available).toBe(0);
  });
});
