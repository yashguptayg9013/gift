# PUJA OS

Manufacturing operating system for a notebook, diary, organizer and PU-leather goods
manufacturer and wholesaler: inventory ledger, bills of materials, configurable
manufacturing routes, workforce, quality, procurement, B2B sales, analytics and an AI
business copilot — with backend-enforced permissions and a complete audit trail.

| | |
|---|---|
| Web | Next.js 16, React 19, TypeScript, Tailwind 4, Radix primitives (shadcn-style), TanStack Query/Table, Recharts |
| API | NestJS 11, Prisma 6, PostgreSQL 16, Redis + BullMQ, OpenAPI |
| AI | Claude via the Anthropic SDK (server-side, permission-filtered tools, human approval for changes) |
| Ops | Docker images, docker-compose (Postgres, Redis, MinIO, backups), GitHub Actions |

## Quick start (development)

Prerequisites: Node 22, pnpm 10, PostgreSQL 16, Redis 7.

```bash
pnpm install
createuser -P puja && createdb -O puja puja_os && createdb -O puja puja_os_test
cp .env.example apps/api/.env      # set NODE_ENV=development, DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET,
                                   # STORAGE_DRIVER=local, BOOTSTRAP_ADMIN_EMAIL/PASSWORD
pnpm build:shared
pnpm db:migrate
pnpm db:seed                       # structure only + first administrator
pnpm dev:api                       # http://localhost:4000/api/docs
pnpm dev:web                       # http://localhost:3000
```

Production deployment: see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) (`docker compose up -d --build`).

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | system design, inventory ledger, manufacturing engine, AI design, decisions |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | data model and database-enforced invariants |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) · [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) | conventions, auth, workflows · every endpoint with its permission |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | how to run tests and what they prove |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | deployment, configuration, backups and recovery |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | task checklist, status, open business decisions |
| [CLAUDE.md](CLAUDE.md) | rules for AI-assisted development on this codebase |
| [apps/web/README.md](apps/web/README.md) | frontend structure and design system |

## Repository

```
apps/api        NestJS service (prisma/, src/modules/*, test/*.int-spec.ts)
apps/web        Next.js application
packages/shared permissions, roles, status vocabularies, formula engine
docker/         Dockerfiles and entrypoint
scripts/        backup / restore
docs/           generated API endpoint reference
```

## Tests

```bash
pnpm --filter @puja/shared test     # unit
pnpm --filter @puja/api test        # integration against PostgreSQL (concurrency, idempotency, reversals, permissions)
pnpm --filter @puja/web test:e2e    # Playwright
```

The original `create-next-app` README that came with the uploaded project is kept at
`docs/ORIGINAL_NEXT_README.md`.
