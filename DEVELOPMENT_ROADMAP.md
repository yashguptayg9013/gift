# PUJA OS — Development roadmap & task checklist

Status legend: ✅ done and covered by automated tests · 🟢 done, verified manually/build only · 🟡 in progress · ⬜ not started.
A feature is only marked ✅ when it works and has tests.

## Stage 1 — Inspection ✅
- ✅ Inspected the uploaded project (create-next-app boilerplate, Next 16.2.7 / React 19.2.4) and moved it to `apps/web`
- ✅ Environment survey; version choices documented in ARCHITECTURE.md §12

## Stage 2 — Architecture & database ✅
- ✅ ARCHITECTURE.md, DATABASE_SCHEMA.md
- ✅ Prisma schema (60+ tables), migrations with NULLS NOT DISTINCT balances, check constraints, partial unique index, immutability triggers

## Stage 3 — Design system & shell 🟢
- 🟢 Tokens (light/dark), primitives, DataTable, charts, empty/error/loading states, `/design-system` page
- 🟢 App shell: sidebar (all 13 modules), global search ⌘K, notifications, quick create, theme, profile
- ✅ Playwright render/redirect tests (desktop + mobile)

## Stage 4 — Authentication & permissions ✅
- ✅ argon2id, JWT + rotating refresh sessions with reuse detection, lockout, password reset, session management
- ✅ 65 fine-grained permissions, 7 editable role templates, backend guards, row-level rules
- ✅ CSRF origin check, rate limiting, strict validation, audit log (append-only)
- 🟢 Login/forgot/reset, account (sessions, preferences), admin users/roles/settings/numbering/audit UI

## Stage 5 — Inventory ✅
- ✅ Ledger engine (row locks, idempotency, deadlock retry, negative-stock policy, FIFO batches)
- ✅ Receipt, issue, transfer, adjustment (approval), damage, return, reversal, reservations, stock counts
- ✅ Materials with configurable category attributes, units & conversions, warehouses/locations
- ✅ Finished goods: products with variants (bulk create)
- 🟢 Inventory and finished-goods UI

## Stage 6 — BOM & manufacturing ✅
- ✅ BOM versions, formulas, wastage allowance, alternatives, duplicate/substitute, compare, requirements
- ✅ Stages, routes per SKU, workstations, departments
- ✅ Production orders: release, availability, reservation, stage actions, backflush, manual issue, wastage, returns, FG receipt, QC stage, reversal, cancellation, history
- 🟡 Manufacturing & production (shop-floor) UI

## Stage 7 — Workforce & quality ✅ (API)
- ✅ Workers, departments, attendance, productivity from production records
- ✅ Defect categories, checklists, inspections, receipt QC hold & disposition, final QC from production
- 🟡 Workforce & quality UI

## Stage 8 — Sales & procurement ✅ (API)
- ✅ Suppliers, multi-supplier items, requisitions, PO approval, GRN (partial, QC), supplier returns, reorder recommendations
- ✅ Customers, customer pricing, inquiries, quotations, sales orders, reservation, challans (partial, reversal), PDFs with GST split
- 🟡 Sales, customers, procurement, suppliers UI

## Stage 9 — Analytics ✅ (API)
- ✅ Dashboard endpoint (real data, date filters)
- ✅ 19 reports with source references; CSV / XLSX / PDF export
- 🟢 Dashboard UI · 🟡 Reports UI

## Stage 10 — AI Copilot ✅ (API)
- ✅ Tool-use loop, 21 permission-filtered tools, safe record query DSL, approvals for changes, audit, error handling
- ✅ Insights: anomalies, bottlenecks, delays, daily summary
- 🟡 Copilot UI
- ⬜ Configure `ANTHROPIC_API_KEY` in the target environment (credential required)

## Stage 11 — Notifications & integrations ✅
- ✅ Event-driven in-app notifications, preferences, dedupe
- ✅ BullMQ schedulers (low stock, delays, overdue POs, stale inspections, daily summary)
- ✅ Email (SMTP) and WhatsApp Cloud API adapters — ⬜ credentials to be configured
- ✅ File uploads (content sniffing, S3/local)

## Stage 12 — Testing & security review 🟡
- ✅ 57 API integration tests incl. concurrency/duplicate/cancellation/reversal; 6 unit tests; Playwright suite
- ✅ Security controls listed in API_DOCUMENTATION.md
- 🟡 E2E coverage for the remaining modules once their UI lands

## Stage 13 — Deployment & docs 🟢
- 🟢 Dockerfiles, compose stack, backups, CI workflow (Docker images could not be built in the development sandbox — no Docker daemon; the API bundle was verified by running the same `pnpm deploy` steps natively)
- ✅ README, ARCHITECTURE, DATABASE_SCHEMA, API_DOCUMENTATION (+ generated endpoint list), TESTING_GUIDE, DEPLOYMENT_GUIDE, CLAUDE.md

## Next (after v1)
- ⬜ React Native / Expo Android app (the API already supports bearer-token mobile clients via `X-Client: mobile`)
- ⬜ Next.js standalone output to shrink the web image; trim the API image
- ⬜ OpenTelemetry tracing; Sentry wired by default
- ⬜ Multi-warehouse transfer documents with in-transit state
- ⬜ Stock valuation method (see decisions)

## Business decisions needed (not assumed)

These are deliberately configurable or out of scope until the business decides:

1. **Stock valuation** — reports value stock at last purchase price (or standard cost). Should the company use weighted-average or FIFO costing?
2. **Tax invoicing** — quotations and challans compute GST, but tax invoices / e-invoicing / e-way bills are not generated. Is invoicing in scope (or done in Tally/another system)?
3. **Approval thresholds** — currently any stock adjustment by a non-approver and every PO need approval (configurable in Settings). Are value-based thresholds wanted?
4. **Worker logins** — workers can be linked to user accounts (to record their own output on the shop floor), or supervisors record on their behalf. Which model fits the 7-user setup?
5. **Rejected finished goods** — final-QC rejects go to a non-saleable location; release to saleable stock needs the `quality.rejection.release` permission. Should "seconds" be sold as a separate SKU instead?
6. **Over-production** — stages may not exceed planned quantity (`production.overProductionPercent` = 0). Is a tolerance wanted?
7. **Dispatch/delivery tracking** — not included (per the brief). Confirm before adding.
