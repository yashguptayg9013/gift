# PUJA OS — Architecture

PUJA OS is a manufacturing operating system (ERP) for a notebook, diary, organizer
and PU-leather goods manufacturer/wholesaler. This document is the authoritative
description of how the system is built. Keep it current when the design changes.

---

## 1. Goals and non-goals

| Goal | How it is met |
|------|---------------|
| Stock is always correct and explainable | Append-only inventory ledger; balances are a cache maintained in the same DB transaction as the ledger line that changed them |
| No double posting | Idempotency keys on every stock-changing command + row locks + state machines |
| Real operational data only | No hard-coded statistics; every dashboard/report figure is a query over source records and links back to them |
| Configurable manufacturing | Material categories with attribute schemas, BOM versions with formulas, routes per SKU, QC checklists — all data, not code |
| Security by default | Backend-enforced RBAC on every endpoint, audit log on every mutation, AI restricted to an allow-listed, permission-filtered tool catalog |
| Scale from 7 users to hundreds, 1 warehouse to many | Multi-warehouse/location model from day one, stateless API, Redis-backed jobs, Postgres |

Non-goals for v1 (explicitly *not* assumed): dispatch/delivery tracking, accounting
ledgers/invoicing (GST is computed on quotations/challans only), payroll.

---

## 2. System overview

```
                ┌──────────────────────────────────────────────┐
 Browser ──────▶│ apps/web  (Next.js 16, React 19, Tailwind 4)  │
 (desktop/      │  • App Router, client data via TanStack Query │
  mobile web)   │  • /api/* rewritten to the API (same-origin   │
                │    cookies, no CORS in production)            │
                └──────────────────────┬───────────────────────┘
                                       │ HTTPS (JSON, cookies)
                ┌──────────────────────▼───────────────────────┐
 Future Expo ──▶│ apps/api  (NestJS 11, REST, OpenAPI)          │
 Android app    │  Guards: JWT auth → Permissions → Throttler   │
 (Bearer token) │  Modules: auth, users, inventory, catalog,    │
                │  bom, manufacturing, workforce, quality,      │
                │  procurement, sales, reports, dashboard,      │
                │  notifications, ai, files, settings, audit    │
                └──────┬───────────────┬───────────────┬───────┘
                       │ Prisma        │ BullMQ        │ HTTPS
                ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼──────────┐
                │ PostgreSQL │  │   Redis    │  │ Claude API      │
                │ 16         │  │ queues,    │  │ (server-side    │
                │            │  │ rate-limit │  │  only)          │
                └────────────┘  └────────────┘  └─────────────────┘
                       │
                ┌──────▼─────────────────┐
                │ Object storage (S3 /   │  product images, PDFs,
                │ MinIO; local in dev)   │  attachments
                └────────────────────────┘
```

### Repository layout

```
apps/
  api/                 NestJS service
    prisma/            schema.prisma, migrations/, seed scripts
    src/
      common/          guards, decorators, filters, pagination, idempotency, decimal helpers
      infra/           prisma, redis, queue, storage, mail, logger
      modules/<name>/  controller + service + dto per bounded context
    test/              integration tests (real Postgres)
  web/                 Next.js application
    app/               routes ((auth) and (app) route groups)
    components/ui/     design-system primitives (shadcn-style, Radix based)
    components/        app shell, data table, charts, forms
    lib/               api client, query hooks, formatters
packages/
  shared/              permission catalog, role templates, enums, formula engine,
                       shared TS types — used by API and web
docker/                Dockerfiles, backup scripts
.github/workflows/     CI
```

---

## 3. Backend architecture

### 3.1 Layers inside a module

```
Controller  → validates DTO (class-validator, whitelist + forbidNonWhitelisted),
              declares @RequirePermissions(...), never touches Prisma directly
Service     → business rules, state machines, runs inside prisma.$transaction
Ledger      → InventoryLedgerService: the ONLY code allowed to write
              StockBalance / StockMovement / StockReservation
Prisma      → data access; raw SQL only for row locking (SELECT … FOR UPDATE)
              and ON CONFLICT upserts, always parameterised
Events      → after commit, domain events (EventEmitter2) feed notifications,
              audit enrichment and background jobs
```

### 3.2 Request pipeline

1. `helmet`, cookie parser, request-id, structured logging (pino, secrets redacted).
2. `ThrottlerGuard` — global limit + stricter limits on `/auth/*`.
3. `JwtAuthGuard` — access token from `Authorization: Bearer` (mobile/API) or the
   `puja_at` httpOnly cookie (web). `@Public()` opts out.
4. `PermissionsGuard` — checks `@RequirePermissions()` against the permissions
   resolved from the user's roles (cached per token, refreshed on token rotation).
5. Origin check for cookie-authenticated mutating requests (CSRF defence in depth on
   top of `SameSite=Strict` cookies).
6. `ValidationPipe` — DTO validation and transformation.
7. Global exception filter → uniform error envelope
   `{ error: { code, message, details?, requestId } }`; Prisma errors mapped
   (P2002 → 409, P2025 → 404); internals never leaked.

### 3.3 Authentication and sessions

* Passwords: **argon2id**. Account lockout after configurable failed attempts.
* Access token: JWT, 15 min, contains `sub`, `sid` (session id), `pv` (permission
  version). Refresh token: 256-bit random, stored **hashed** in `Session`, rotated on
  every refresh; reuse of a rotated token revokes the whole session (theft detection).
* Web uses httpOnly, `Secure`, `SameSite=Strict` cookies; the Next.js server rewrites
  `/api/*` to the API so cookies stay first-party.
* Password reset: single-use, hashed, 30-minute token; delivered by the mail adapter
  (logged to console in development when SMTP is not configured). Resetting revokes
  all sessions.
* Sessions are listable/revocable by the user and administrators.

### 3.4 Authorisation (RBAC)

* Permissions are fine-grained strings (`inventory.adjust`, `production.stage.update`,
  `procurement.po.approve`, …) defined once in `packages/shared/src/permissions.ts`.
* Roles are **data** (`Role`, `RolePermission`) so administrators can create and edit
  roles. Seven system role templates are seeded: Administrator, Management, Inventory
  Manager, Production Supervisor, Production Worker, Sales Executive, Viewer.
* Row-level rules where needed, e.g. a Production Worker may only record output on
  stages they are assigned to (`production.stage.update.own` vs `.any`).
* The web UI hides actions the user cannot perform, but **every** rule is enforced in
  the API; the UI is never trusted.

### 3.5 Audit

`AuditLog` records actor (user / AI-on-behalf-of-user / system job), action,
entity, before/after snapshots (diff-friendly JSON), request id, IP and user agent.
Written inside the same transaction as the change it describes for stock and status
transitions, so an audit row exists if and only if the change committed.

---

## 4. Inventory design (the core invariant)

### 4.1 Model

* **Item** — anything stocked. `type = MATERIAL | PRODUCT`. A finished-goods SKU is an
  Item that belongs to a **Product** (variant template). Base UoM per item; optional
  per-item UoM conversions (e.g. 1 ROLL = 25 M for a specific leather).
* **Warehouse → Location**. Location types: `STORAGE` (usable/saleable), `RECEIVING`,
  `QC_HOLD`, `REJECTED`, `PRODUCTION` (WIP), `DISPATCH`. Only `STORAGE` stock is
  *available* for reservation, production issue or sale.
* **Batch** — optional per item (`trackBatches`). Receipts create batches; issues pick
  FIFO by receipt date unless a batch is specified.
* **InventoryTransaction** (document header): type, status, reference to the source
  document, reason, idempotency key, creator/approver, reversal link.
* **StockMovement** (ledger line, immutable): item, location, batch, `bucket`
  (`ON_HAND` or `RESERVED`), signed quantity in base UoM, unit cost, and the balance
  *after* the movement (makes every balance auditable line by line).
* **StockBalance** (cache): `(item, location, batch)` → `onHand`, `reserved`.
  Unique index uses `NULLS NOT DISTINCT` so unbatched stock has exactly one row.
* **StockReservation**: soft allocation of available stock to a source document line
  (production-order material requirement or sales-order line), tracking reserved /
  consumed / released quantities.

### 4.2 Posting algorithm (`InventoryLedgerService.post`)

```
BEGIN (READ COMMITTED)
  if idempotencyKey exists → return the existing transaction (same request hash)
                             or 409 if the payload differs
  ensure balance rows exist (INSERT … ON CONFLICT DO NOTHING)
  SELECT … FROM stock_balance WHERE id IN (…) ORDER BY id FOR UPDATE   -- deadlock-free order
  for each line: compute new onHand / reserved
      reject if onHand < 0          unless warehouse.allowNegativeStock AND user has
                                    inventory.negative_stock.override
      reject if reserved < 0 or reserved > onHand (for available buckets)
  UPDATE balances; INSERT movements with balance-after values
  INSERT inventory_transaction (+ audit row)
COMMIT  → emit events (low-stock check, notifications)
```

Unique-violation races on the idempotency key are caught and resolved to the winning
transaction, so concurrent duplicate requests produce exactly one posting.

### 4.3 Operations supported

Receipt, issue, reservation, release, adjustment (+/-), transfer (location→location,
incl. cross-warehouse), return (to stock / to supplier), damage write-off, physical
stock count & reconciliation, production consumption, production output, sales
dispatch, purchase receipt, and generic reversal (negating transaction linked to the
original; blocked if it would make stock negative).

Adjustments above a configurable value/quantity threshold, or made by users without
`inventory.adjust.approve`, become **approval requests** and post only when approved.

---

## 5. Product, BOM and formula engine

* **Product** groups variants (e.g. *A5 Notebook Cover* → Black, Blue, Brown, Tan,
  Grey). Each variant is a PRODUCT Item with its own SKU, attributes (colour, size
  dimensions), stock and BOM.
* **BOM** per finished-goods SKU, with immutable **versions** (`DRAFT → ACTIVE →
  ARCHIVED`; exactly one active version per BOM, enforced by a partial unique index).
* **BOM line**: material, quantity (constant **or formula**), unit, wastage allowance %,
  consumption stage, consumption mode (`BACKFLUSH` on stage output or `MANUAL` issue),
  specification text, alternatives with conversion factors and priority.
* **Formula engine** (`packages/shared/src/formula.ts`): a small, safe arithmetic
  parser (no `eval`): numbers, `+ - * / ^ ( )`, variables and `min max ceil floor round
  abs`. Variables come from the SKU's attributes (`length_mm`, `width_mm`, …) and
  production parameters (`qty`). Unknown variables are rejected at save time.
* Requirement = `qtyPerUnit × plannedQty / outputQty × (1 + wastage%/100)`. The BOM
  version used is frozen on the production order.
* BOM tools: duplicate (with a material substitution map, e.g. black PU → blue PU),
  compare two versions (line-level diff), calculate requirements for a quantity.

---

## 6. Manufacturing engine

### 6.1 Configuration

* **StageDefinition** — shop-floor operations (seeded from the business brief: PU
  cutting, cardboard cutting, foam cutting, embossing, metal fitting, stitching,
  assembly, quality control). Editable/extendable.
* **Workstation**, **Department**.
* **Route** = ordered stage list; assigned per SKU (defaulting from its product).
  Not every product passes every stage.

### 6.2 Production order lifecycle

```
DRAFT ──release──▶ RELEASED ──reserve──▶ MATERIALS_RESERVED ──first output──▶ IN_PROGRESS
  │                    │                       │                                  │
  └──────cancel────────┴───────cancel──────────┴────────cancel────────────────────┤
                                                                                 ▼
                         COMPLETED (last stage complete) ──close──▶ CLOSED   CANCELLED
```

* *Release* freezes BOM version + route and creates requirement lines and stage rows.
* *Material availability check* is available at any time (required vs available vs
  reserved, with shortages and alternatives).
* *Reservation* allocates available STORAGE stock FIFO; partial reservation allowed.
  **Reservation is not consumption** — on-hand does not change.
* *Stage actions* (supervisor or assigned worker): start, pause, resume, record output
  (good / rejected / rework, worker, defect category), report wastage, assign workers,
  add remarks, complete.
* *Consumption*: BACKFLUSH lines are consumed when output is recorded at their
  consumption stage (standard quantity × processed units, drawing reservation first);
  MANUAL lines are issued explicitly. Wastage reports consume additional material with
  a reason and are reported against the BOM allowance.
* *Quantity rules*: at each stage `good + rejected ≤ input`, where input = good output
  of the previous stage (or planned qty for the first stage).
* *Finished goods*: good output of the final stage is received into FG stock
  immediately (partial completion supported). If the final stage is a QC stage, the
  output is recorded through a quality inspection; rejected units go to the
  non-saleable `REJECTED` location and can be released to saleable stock only with
  `quality.rejection.release` permission (audited).
* *Cancellation*: releases open reservations; consumed material can be returned to
  stock through a material-return transaction; FG already received stays.
* *Reversal*: an output entry can be reversed if downstream stages have not consumed
  it; consumption and FG receipt are reversed with linked ledger postings.
* Every action writes a `ProductionEvent` (complete history) with idempotency keys.

---

## 7. Other modules (summary)

| Module | Key entities | Notes |
|---|---|---|
| Workforce | Worker, Department, Attendance | Productivity derived only from `ProductionOutput` rows (no arbitrary scores) |
| Quality | DefectCategory, QcChecklist(+items), QualityInspection(+results, defects) | Material inspection on GRN (QC_HOLD → STORAGE/REJECTED), in-process and final inspections |
| Procurement | Supplier(+contacts), SupplierItem, PurchaseRequisition, PurchaseOrder, GoodsReceipt, SupplierReturn | PO approval workflow; partial deliveries; reorder recommendations never auto-order |
| Sales | Customer(+contacts, categories), CustomerPrice, SalesInquiry, Quotation, SalesOrder, DeliveryChallan | GST split (CGST/SGST vs IGST) from company and customer state; PDF quotation & challan; partial fulfilment |
| Reports | registry of report definitions | JSON / CSV / XLSX / PDF; each row carries source document references |
| Notifications | Notification, NotificationPreference | Event-driven + scheduled scans (BullMQ); in-app, email (SMTP), WhatsApp (Cloud API adapter) |
| AI Copilot | AiConversation, AiMessage, ApprovalRequest | Claude tool-use loop; see §8 |
| Settings | Setting, DocumentSequence | Company profile, numbering, thresholds, reorder parameters |
| Files | FileObject | S3-compatible storage; type sniffing, size limits, private keys, auth'd download |

---

## 8. AI Business Copilot

```
User ─▶ POST /ai/conversations/:id/messages
          │
          ▼
   AiService: builds system prompt (business glossary, date, user role)
          │   tools = TOOL_CATALOG.filter(t => user has t.permission)
          ▼
   Claude Messages API (server-side key) ⇄ tool_use / tool_result loop (max N steps)
          │
          ├─ read tools  → validated with zod → call domain services as the user
          │                (same permission checks as REST)  → structured JSON result
          └─ write tools → NEVER execute: create ApprovalRequest(type=AI_ACTION)
                           → human approves in UI → executed by normal service with
                             the approver's permissions → audited (actor=AI, approvedBy)
```

* No raw SQL or unrestricted DB access. "Natural language to query" is served by a
  `query_records` tool: whitelisted entities/fields/filters/aggregations compiled to
  Prisma queries, row limit enforced, permission per entity.
* Deterministic analytics (reorder recommendations, anomaly detection, bottleneck and
  delay analysis, wastage analysis, sales trends) live in normal services so they are
  testable and also power the Reports module; the model narrates and combines them.
* Every tool call is logged (`AiMessage` + `AuditLog`).
* Without `ANTHROPIC_API_KEY` the copilot endpoints return a clear
  `AI_NOT_CONFIGURED` error; analytics remain available through Reports.

---

## 9. Background jobs (BullMQ on Redis)

| Queue | Jobs |
|---|---|
| `notifications` | fan-out delivery (in-app, email, WhatsApp) |
| `scans` (repeatable) | low-stock scan, production-delay scan, overdue-PO scan, pending-inspection scan |
| `ai` | daily business summary |

Jobs are idempotent (dedupe keys on notifications). With `JOBS_ENABLED=false`
(tests/dev) delivery runs inline.

---

## 10. Frontend architecture

* **Route groups**: `(auth)` (login, forgot/reset password) and `(app)` (shell).
* **Data**: TanStack Query, typed fetch client (`lib/api.ts`) that handles 401 →
  refresh → retry once, and normalises the error envelope.
* **Design system**: tokens as CSS variables (light/dark), Tailwind 4 `@theme`,
  shadcn-style primitives on Radix, Lucide icons, Recharts charts, TanStack Table data
  grid (sorting, filtering, column visibility, pagination, CSV export of current view).
* **Shell**: collapsible left sidebar (module nav), top bar (global search ⌘K, quick
  create, notifications, theme, profile). Mobile: sidebar becomes a drawer.
* Permission-aware rendering via a `useCan()` hook fed by `/auth/me`.

---

## 11. Deployment

* Docker images for `api` and `web`; `docker-compose.yml` with Postgres, Redis, MinIO,
  api, web, and a backup sidecar (daily `pg_dump`, retention policy).
* Environments: `development`, `test`, `staging`, `production` via env vars only
  (`.env.example` documents every variable; no secrets in the repository).
* Migrations: `prisma migrate deploy` on release; seed only bootstrap data
  (roles, permissions, UoMs, stage definitions, categories, first admin).
* CI (GitHub Actions): install → lint → typecheck → unit + integration tests against
  Postgres/Redis service containers → build.
* Monitoring: structured logs; optional Sentry (`SENTRY_DSN`); `/health` endpoint
  (DB + Redis).

---

## 12. Key technology decisions

| Decision | Rationale |
|---|---|
| NestJS **11.x** (not 12) | Nest 12 is ESM-only; 11.x is actively patched and is the stable CommonJS line used by the Prisma/Jest ecosystem. Re-evaluate for upgrade in 2027. |
| Prisma **6.19.x** (not 7) | Prisma 7 requires driver adapters and an ESM generated client; 6.19 is stable and CJS-compatible. |
| TypeScript **5.9** | Nest relies on `emitDecoratorMetadata`, not yet a target of the native TS 7 compiler. |
| Next.js **16.2.7** / React **19.2** | Versions from the uploaded project, kept as-is. |
| Decimal(18,4) quantities | Lengths/areas (metres, m²) need fractions; floats are never used for stock. |
| Ledger + cached balance | O(1) stock reads, full traceability, and a rebuild/verify job can recompute balances from the ledger. |
