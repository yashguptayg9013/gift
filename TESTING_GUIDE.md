# PUJA OS — Testing guide

## Test layers

| Layer | Tool | Location | Runs against |
|---|---|---|---|
| Unit | Vitest | `packages/shared/src/*.test.ts` | formula engine and pure helpers |
| Integration (API) | Jest + Supertest | `apps/api/test/*.int-spec.ts` | the real Nest app (same pipeline as production) and a real PostgreSQL test database |
| End-to-end (web) | Playwright | `apps/web/e2e/` | built Next.js app (desktop + mobile projects) |

The API tests deliberately use PostgreSQL rather than mocks: row locks, `NULLS NOT DISTINCT`
indexes, check constraints and immutability triggers are part of the behaviour under test.

## Running

```bash
# one-time: PostgreSQL 16 + Redis running, test database created
createdb -O puja puja_os_test

pnpm --filter @puja/shared test          # unit
pnpm --filter @puja/api test             # all API tests (migrates the test DB first)
pnpm --filter @puja/api test -- test/manufacturing   # one suite
pnpm --filter @puja/web test:e2e         # Playwright (builds must exist: pnpm --filter @puja/web build)
```

`TEST_DATABASE_URL` overrides the default `postgresql://puja:puja_dev_password@localhost:5432/puja_os_test`.
Each suite truncates all tables (TRUNCATE bypasses the row-level immutability triggers) and
re-runs the bootstrap seed. Background jobs are disabled (`JOBS_ENABLED=false`); rate limiting
is skipped except in the dedicated rate-limit test. The AI suite injects a scripted fake
client — no network calls and no API cost.

Authenticated web e2e tests run only when `E2E_EMAIL` / `E2E_PASSWORD` (and a running API) are provided.

## What is covered

| Suite | Critical behaviour verified |
|---|---|
| `inventory` | ledger + balance + audit per posting; insufficient stock rejected with no side effects; reason required; idempotent replays; key reuse with a different body → 409; **8 concurrent duplicate requests → exactly one posting**; **12 concurrent issues against 50 units → exactly 5 succeed, stock 0**; reservations protect stock and release; FIFO by batch; batch number required for tracked items; purchase-unit conversion; rejected-stock release needs permission; adjustment approval flow with segregation of duties and double-decision protection; reversal once only and blocked when stock was consumed; negative stock only with warehouse flag **and** permission; stock count reconciliation via approval; backend permission enforcement; ledger immutability; ledger/balance integrity |
| `manufacturing` | formula validation against SKU attributes; requirements with formulas and wastage; BOM duplicate with substitution and compare; full lifecycle — release, availability, reservation without consumption, worker-only-own-stage, idempotent output, standard backflush (allowance not consumed), input limits, output reversal restoring stock, downstream reversal blocked, wastage report, final QC with rejects to non-saleable stock, inspection record, completion releasing leftover reservations, productivity from records; **6 concurrent outputs → only the 3 that fit succeed**; substitution; cancellation releases reservations and is permission-gated; release blocked without BOM/route |
| `procurement-sales` | GSTIN validation; PO approval (creator cannot approve); receipt blocked before approval; partial GRNs, idempotent GRN, over-receipt guard, last price per base unit; QC hold until inspection disposition; supplier return; reorder recommendation maths and that recommendations never create POs; requisition approval → conversion; customer-specific vs list price; quotation totals; PDF generation; SO confirm/reserve; partial challan consuming the SO reservation; over-dispatch guard; challan reversal; production planning for shortages; cancellation permission and reservation release; ledger integrity |
| `reports` | dashboard aggregates from real data with zero-filled series; every report in the catalog returns 200 with a `source` on each row; exact movement/consumption maths; CSV/XLSX/PDF exports; report and export permissions |
| `ai` | tool list filtered by permissions; cached system prompt; refusal fallbacks enabled; no forced tool choice; parallel tool results in one message; invalid arguments returned as `is_error`; thinking blocks echoed unchanged; tools outside permissions refused even if requested; proposals create approvals only; execution needs `ai.approve`; executed actions attributed to AI with approver recorded; rate-limit and overload error mapping; private conversations; deterministic insights; not-configured state |
| `auth` | refresh rotation and reuse → session revoked; lockout without account enumeration; single-use reset tokens revoke sessions; CSRF origin enforcement for cookie auth; httpOnly/SameSite cookies; permission-version refresh; last-admin protection; strict validation; login rate limit; audit immutability |
| `notifications-files` | low-stock alerts routed by permission and deduplicated per day; preferences; approval notifications to approvers and requesters; scheduled jobs on demand (admin only); daily summary without AI; uploads accepted only by content sniffing, filename sanitised, entity-based read/write permissions |

## Writing new tests

* Use `createTestContext()` and `ctx.as('<role key>' | ['perm', …])` from `test/helpers.ts` — it logs a fresh user in and returns an authenticated client.
* Assert behaviour through the HTTP API; use `ctx.prisma` only to inspect results or for setup that has no API.
* Any new stock-changing feature needs: a happy path, an insufficient-stock path, an idempotent replay, a permission check and an `/inventory/integrity` assertion.
* Concurrency tests: fire requests with `Promise.all` and assert the final state, not the order.
