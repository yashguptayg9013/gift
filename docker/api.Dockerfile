# syntax=docker/dockerfile:1.7
# PUJA OS API — multi-stage build (pnpm workspace)
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @puja/api... --filter @puja/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @puja/shared build \
 && pnpm --filter @puja/api exec prisma generate \
 && pnpm --filter @puja/api build \
 && pnpm --filter @puja/api deploy --legacy --prod /out \
 && cp -r apps/api/dist apps/api/prisma /out/ \
 && cd /out && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
RUN useradd --system --uid 10001 puja && mkdir -p /app/storage && chown puja /app/storage
COPY --from=build --chown=puja /out /app
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
USER puja
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
CMD ["node", "dist/main.js"]
