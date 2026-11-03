# PUJA OS — API documentation

* Base URL: `/api/v1` (the web app proxies `/api/*` to the API, so browsers use same-origin paths).
* Interactive docs: `GET /api/docs` (Swagger UI) and `GET /api/docs/openapi.json` — enabled outside production, or with `SWAGGER_ENABLED=true`.
* **Endpoint reference with required permissions:** [`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md) — generated from route metadata (`pnpm --filter @puja/api docs:api > docs/API_ENDPOINTS.md`), so it always matches the code.

## Authentication

| Client | How |
|---|---|
| Web (browser) | `POST /auth/login {email, password}` sets httpOnly `SameSite=Strict` cookies: `puja_at` (access JWT, 15 min), `puja_rt` (refresh token, path `/api/v1/auth`), and a non-secret `puja_session` hint. On `401 TOKEN_EXPIRED`, call `POST /auth/refresh` once and retry. |
| Mobile / integrations | Send `X-Client: mobile` to `/auth/login` and `/auth/refresh`; tokens are returned in the body. Use `Authorization: Bearer <accessToken>`; refresh with `{ "refreshToken": "…" }`. |

* Refresh tokens rotate on every use; replaying a rotated token revokes the session (theft detection).
* Cookie-authenticated mutating requests must carry an `Origin` listed in `CORS_ORIGINS` (CSRF defence in depth).
* Accounts lock for `LOGIN_LOCK_MINUTES` after `LOGIN_MAX_ATTEMPTS` failures. Password policy: ≥ 10 characters with a letter and a digit.
* Changing a user's roles bumps their permission version; their next request gets `401 TOKEN_EXPIRED` and the refreshed token carries the new permissions.
* `/auth/forgot-password` always returns 202 (does not reveal whether an account exists).

## Authorisation

Every endpoint declares its permission(s) (see the generated reference). Permissions are defined in `packages/shared/src/permissions.ts`; roles are editable bundles of permissions. Some rules are row-level and enforced in services, e.g. production workers may only update stages they are assigned to, PO creators cannot approve their own PO, requesters cannot approve their own approval requests.

## Conventions

| Topic | Convention |
|---|---|
| Errors | `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": {…}, "requestId": "…" } }`. Codes are stable strings (`VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `INVALID_STATE`, `CONFLICT`, `DUPLICATE`, `IDEMPOTENCY_KEY_REUSED`, `INSUFFICIENT_STOCK`, `QUANTITY_EXCEEDS_INPUT`, `OVER_RECEIPT`, `AI_NOT_CONFIGURED`, …). |
| Status codes | 400 validation · 401 unauthenticated/expired · 403 forbidden/CSRF · 404 · 409 state conflict/duplicate · 422 business rule · 423 locked · 429 rate limited · 503 dependency unavailable |
| Request IDs | Every response has `x-request-id` (you may send your own, 8–64 chars). It appears in logs, audit rows and error bodies. |
| Pagination | `?page=1&pageSize=25` (max 200), optional `search`, `sort`, `order`. Response `{ data: [...], meta: { page, pageSize, total, pageCount } }`. |
| Quantities | Decimal numbers in the item's **base unit** unless a `uomCode` is supplied (converted with the item's conversion table). Up to 4 decimal places. |
| Money | INR, 2 decimal places. GST rate per line; CGST/SGST vs IGST is decided on documents from GSTIN state codes. |
| Dates | ISO-8601 in requests/responses. Day buckets in reports use Asia/Kolkata. |
| Validation | Unknown fields are rejected (`whitelist` + `forbidNonWhitelisted`). |
| Idempotency | Stock-changing POSTs accept `Idempotency-Key: <uuid>`. Replays return the original result; reusing a key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`. Applies to inventory movements, reversals, GRNs, supplier returns, production output / material issue / wastage / return, and challan posting. |
| Rate limits | 300 requests/min per client; login 10/min; password reset 5/min; AI messages 20/min. |

## Key workflows

### Inventory
```
POST /inventory/receipts      {lines:[{itemId, quantity, uomCode?, locationId?, batchNumber?, unitCost?}], reason?}
POST /inventory/issues        {lines:[{itemId, quantity, locationId?, batchId?}], reason}        FIFO if no location
POST /inventory/transfers     {fromLocationId, toLocationId, lines:[…], reason?}
POST /inventory/adjustments   {lines:[{itemId, quantity(±)}], reason} → POSTED or PENDING_APPROVAL
POST /inventory/transactions/:id/reverse {reason}
GET  /inventory/stock?type=&categoryId=&search=&lowStockOnly=&productId=&itemIds=
GET  /inventory/integrity     verifies every balance equals the sum of its ledger lines
```

### Manufacturing
```
POST /production/orders {itemId, quantity, priority?, dueDate?}       → DRAFT
POST /production/orders/:id/release                                     freezes BOM version + route
GET  /production/orders/:id/availability
POST /production/orders/:id/reserve                                     reservation ≠ consumption
POST /production/stages/:stageId/output {qtyGood, qtyRejected?, qtyRework?, workerId?, defects?, checklistResults?}
     → backflushes materials of this stage; final stage receives finished goods (rejects → REJECTED location)
POST /production/outputs/:id/reverse {reason}
POST /production/orders/:id/cancel {reason}                             releases reservations
```

### Procurement and sales
```
POST /procurement/orders → /submit → /decision {approve|reject} → POST /procurement/receipts (partial OK)
POST /sales/quotations → /convert → /sales/orders/:id/confirm → /reserve → POST /sales/challans {post:true}
GET  /sales/quotations/:id/pdf, /sales/challans/:id/pdf
GET  /reports/:key?format=json|csv|xlsx|pdf
```

### AI Copilot
```
GET  /ai/status
POST /ai/messages {conversationId?, message} → {conversationId, stopReason, notice, approvals, conversation}
```
The model only sees tools the caller is permitted to use. Write tools create approval requests (`/approvals`); they execute only when a user with `ai.approve` **and** the underlying permission approves.
