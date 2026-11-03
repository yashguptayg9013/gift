# PUJA OS — Deployment guide

## 1. Requirements

* A Linux host (2 vCPU / 4 GB RAM is ample for ~10 users) with Docker Engine + Compose v2.
* A domain name and TLS termination (Caddy, nginx or a cloud load balancer) in front of the `web` service.
* Optional: SMTP account (password-reset and notification email), WhatsApp Cloud API number,
  Anthropic API key (AI Copilot), Sentry DSN.

## 2. First deployment

```bash
git clone <repo> puja-os && cd puja-os
cp .env.example .env
```

Fill in `.env` — at minimum:

| Variable | How to generate |
|---|---|
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `S3_SECRET_ACCESS_KEY` | `openssl rand -base64 32` |
| `S3_ACCESS_KEY_ID` | any username, e.g. `puja-storage` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` (the API refuses to start in production with a dev secret) |
| `APP_URL`, `CORS_ORIGINS` | your public URL, e.g. `https://erp.example.com` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | the first administrator (only used while no users exist) |

```bash
docker compose up -d --build
docker compose logs -f api        # migrations + bootstrap seed run automatically
```

Open the site, sign in as the bootstrap administrator, **change the password**, then:

1. Administration → Company settings: legal/trade name, address, state + state code, GSTIN, quotation terms (printed on PDFs; nothing is pre-filled).
2. Administration → Users: create the team's accounts and assign roles.
3. Inventory → Setup: review the warehouse/locations, categories and units created by the bootstrap seed.
4. Enter materials, products/variants, BOMs, routes, suppliers and customers; record opening stock with **adjustments** (reason "Opening balance").

The bootstrap seed creates only structure (roles, units, default warehouse and location
types, the manufacturing stages and material/product categories from the business brief).
It never creates business records. It is idempotent and safe to re-run.

### Reverse proxy (example: Caddy)

```
erp.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Only the `web` port is published. The API, database, Redis and MinIO stay on the internal
Docker network; the web app proxies `/api/*` to the API.

## 3. Configuration that requires external services

| Feature | Variables | Without it |
|---|---|---|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | password-reset links and email notifications are written to the API log instead of being sent |
| WhatsApp | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME` | WhatsApp channel is hidden/inactive. Business-initiated messages need an approved template with one body parameter. Users need a phone number on their profile. |
| AI Copilot | `ANTHROPIC_API_KEY` (optional `ANTHROPIC_MODEL`, `AI_EFFORT`) | Copilot page shows "not configured"; insights, reports and the template daily summary still work |
| Error monitoring | `SENTRY_DSN` + `pnpm --filter @puja/api add @sentry/node` | errors are only in structured logs |
| S3 instead of MinIO | `S3_ENDPOINT` empty, AWS credentials, `S3_BUCKET`, `S3_REGION` | — |

## 4. Upgrades

```bash
git pull
docker compose build api web
docker compose up -d            # api entrypoint applies new migrations before starting
```

Take a backup first (below). Migrations are forward-only; to roll back code, restore the
backup taken before the upgrade.

## 5. Backups and recovery

* The `backup` service runs `scripts/backup.sh` daily at `BACKUP_HOUR` (container time):
  `pg_dump` custom format → `./backups/puja_os-YYYYMMDD-HHMMSS.dump`, verified with
  `pg_restore --list`, pruned after `BACKUP_RETENTION_DAYS`.
* **Copy `./backups` off the host** (rclone/rsync to cloud storage) — a backup on the same disk is not a backup.
* MinIO data (`miniodata` volume) holds product images and attachments; back it up with `mc mirror`.
* Manual backup: `docker compose exec backup /usr/local/bin/backup.sh`.

### Restore drill (do this quarterly)

```bash
docker compose cp backups/puja_os-<stamp>.dump postgres:/tmp/restore.dump
docker compose exec postgres sh -c 'createdb -U $POSTGRES_USER puja_os_restore && \
  pg_restore --no-owner -U $POSTGRES_USER -d puja_os_restore /tmp/restore.dump'
```

Point a staging API at `puja_os_restore`, sign in, and call `GET /api/v1/inventory/integrity`
(must return `{"ok": true}`). To recover production, stop `api`, restore into the main database
(`scripts/restore.sh` prompts for confirmation), start `api`.

## 6. Environments

| Environment | Notes |
|---|---|
| development | `apps/api/.env`, `pnpm dev:api` + `pnpm dev:web`; Swagger at `/api/docs` |
| test | used by the test suites (`NODE_ENV=test`, separate database) |
| staging | same compose file with its own `.env` and database; restore production backups here to rehearse upgrades |
| production | `NODE_ENV=production`: secure cookies, Swagger off (unless `SWAGGER_ENABLED=true`), dev secrets rejected |

## 7. Operations checklist

* `GET /api/v1/health` — database and Redis status (used by the container healthcheck).
* Logs are JSON (pino) with `requestId` and `userId`; secrets and cookies are redacted.
* Administration → Jobs can run scans and the daily summary on demand.
* Inventory → Integrity (`GET /api/v1/inventory/integrity`) verifies balances against the ledger.
* Review the audit log for adjustments, approvals and AI actions.

## 8. Local development without Docker

```bash
pnpm install
createuser -P puja && createdb -O puja puja_os && createdb -O puja puja_os_test
cp .env.example apps/api/.env   # set NODE_ENV=development, DATABASE_URL, REDIS_URL, JWT secret, STORAGE_DRIVER=local
pnpm build:shared
pnpm db:migrate && pnpm db:seed
pnpm dev:api     # http://localhost:4000/api/docs
pnpm dev:web     # http://localhost:3000
```
