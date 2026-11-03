# CLAUDE.md — working on PUJA OS

PUJA OS is a manufacturing ERP for a notebook / diary / PU-leather goods manufacturer in
India. Read `ARCHITECTURE.md` first; `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md` and
`TESTING_GUIDE.md` cover the details. `DEVELOPMENT_ROADMAP.md` is the task checklist —
update it when you finish or discover work.

## Layout

* `apps/api` — NestJS 11 + Prisma 6 (PostgreSQL 16). Modules under `src/modules/<name>`.
* `apps/web` — Next.js 16 / React 19 / Tailwind 4. Routes under `app/(app)`, design system in `components/ui`.
* `packages/shared` — permission catalog, role templates, status vocabularies, formula engine (build it before the others: `pnpm build:shared`).

## Non-negotiable rules

1. **Stock changes only through `InventoryLedgerService`** (`post`, `reserve`, `release`, `buildConsumption`). Never write `StockBalance`, `StockMovement` or `StockReservation` directly. Ledger rows are immutable; corrections are reversals.
2. Stock-changing endpoints accept `Idempotency-Key`; run them in `ledger.runIdempotent(...)` and lock the document row (`SELECT … FOR UPDATE`) before checking its state.
3. Every endpoint declares `@RequirePermissions(...)` / `@RequireAnyPermission(...)` (or is explicitly `@Public()`). Add new permissions in `packages/shared/src/permissions.ts` and to role templates. UI checks are cosmetic.
4. Mutations write an audit row (`AuditService.record(entry, tx)`) inside the same transaction.
5. Do not invent business data (customers, prices, materials, company details). Seeds create structure only.
6. The AI copilot never gets raw database access. New AI capabilities are tools in `src/modules/ai/tools.ts` with a zod schema and permissions; anything that changes data must be a `propose_*` tool that creates an approval request.
7. Quantities are `Decimal` (`common/decimal.ts`), never JS floats, in the item's base unit.
8. Don't edit applied migrations — add a new one. Hand-written SQL (checks, partial indexes, triggers) goes into the generated migration file.

## Commands

```bash
pnpm build:shared
pnpm --filter @puja/api typecheck && pnpm --filter @puja/api lint
pnpm --filter @puja/api test                     # integration tests need PostgreSQL (see TESTING_GUIDE.md)
pnpm --filter @puja/api prisma:migrate:dev --name <change>
pnpm --filter @puja/api docs:api > docs/API_ENDPOINTS.md   # after changing routes
pnpm --filter @puja/web typecheck && pnpm --filter @puja/web lint && pnpm --filter @puja/web build
```

Local services: `service postgresql start && service redis-server start`. Dev API env lives in
`apps/api/.env` (git-ignored).

## Conventions

* Errors: throw `Errors.*` / `AppError` with a stable `code`; never leak internals.
* Services return `serialize(...)`d objects (Decimal → number) to controllers.
* Document numbers: `SequenceService.next('<key>', tx)` inside the creating transaction.
* Domain events (`EventEmitter2`) are emitted after commit; notifications listen to them.
* Web: data access through `lib/api/<module>.ts` hooks with query-key factories; invalidate related queries after mutations.
