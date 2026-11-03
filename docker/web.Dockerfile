# syntax=docker/dockerfile:1.7
# PUJA OS web (Next.js). API_URL is read at runtime by the /api rewrite.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @puja/web... --filter @puja/shared
COPY packages/shared packages/shared
COPY apps/web apps/web
# rewrites are compiled at build time: set the in-cluster API address here
ARG API_URL=http://api:4000
ENV API_URL=$API_URL
RUN pnpm --filter @puja/shared build && pnpm --filter @puja/web build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /repo
RUN useradd --system --uid 10001 puja
COPY --from=build --chown=puja /repo /repo
USER puja
EXPOSE 3000
CMD ["pnpm", "--filter", "@puja/web", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
