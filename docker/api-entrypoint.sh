#!/bin/sh
# Applies pending migrations and the idempotent bootstrap seed before starting.
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] prisma migrate deploy"
  npx prisma migrate deploy
fi
if [ "${RUN_BOOTSTRAP_SEED:-true}" = "true" ]; then
  echo "[entrypoint] bootstrap seed"
  node dist/cli/seed.js
fi
exec "$@"
