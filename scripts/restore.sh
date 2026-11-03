#!/bin/sh
# Restore a backup into a database. DESTRUCTIVE for the target database.
# Usage: PGHOST=... PGUSER=... PGPASSWORD=... scripts/restore.sh <dump-file> <target-db>
# Recommended: restore into a NEW database, verify, then switch DATABASE_URL.
set -eu
FILE="${1:?dump file}"
TARGET="${2:?target database name}"
echo "Restoring $FILE into database '$TARGET' on ${PGHOST:-localhost}. Type the database name to confirm:"
read -r CONFIRM
[ "$CONFIRM" = "$TARGET" ] || { echo "Aborted."; exit 1; }
createdb "$TARGET" 2>/dev/null || true
pg_restore --clean --if-exists --no-owner --dbname="$TARGET" "$FILE"
echo "Restored. Verify with: psql -d $TARGET -c 'SELECT count(*) FROM \"StockMovement\";' and GET /api/v1/inventory/integrity"
