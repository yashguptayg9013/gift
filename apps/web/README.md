# @puja/web — PUJA OS web application

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · TanStack Query/Table · Radix primitives.

```bash
pnpm --filter @puja/shared build   # once, shared types/vocabularies
pnpm --filter @puja/web dev        # http://localhost:3000 (API expected on :4000)
```

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Next.js on port 3000 |
| `typecheck` | `tsc --noEmit` |
| `lint` | ESLint (flat config, `next lint` was removed in Next 16) |
| `test:e2e` | Playwright; starts `next start` on :3100. Set `E2E_EMAIL`/`E2E_PASSWORD` to run authenticated specs against a live API |

## How it talks to the API

The browser only calls same-origin `/api/v1/*`; `next.config.ts` rewrites to `API_URL`
(default `http://localhost:4000`). Auth uses the API's httpOnly cookies. `lib/api/client.ts`
refreshes the session once (single-flight) on `TOKEN_EXPIRED` and redirects to `/login`
otherwise. Stock-changing forms send an `Idempotency-Key` per submission.

`proxy.ts` (Next 16's replacement for middleware) only gates on cookie presence; every
permission is enforced by the API. `useCan()` hides UI the user cannot use.

## Layout

```
app/(auth)/        login, forgot-password, reset-password
app/(app)/         authenticated shell (sidebar + top bar)
  overview/        executive dashboard (/dashboard)
  inventory/       stock, materials, finished goods, ledger, reservations, counts, setup
  approvals/       approval inbox
  admin/           users, roles, settings, numbering, audit log
  account/         profile, sessions, notification preferences
  <module>/        placeholders until their APIs land
app/design-system  component showcase (public, no data)
components/ui/     design-system primitives
components/shell/  app chrome (sidebar, top bar, palette, notifications)
components/inventory, components/admin   feature components
lib/api/           typed client, types, query-key factories and hooks per module
lib/format.ts      en-IN number/currency/date formatting
```
