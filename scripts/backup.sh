#!/bin/sh
# Logical backup of the PUJA OS database (custom format, compressed) with retention.
# Uses libpq env vars: PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD.
set -eu
DIR="${BACKUP_DIR:-/backups}"
KEEP="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DIR/puja_os-$STAMP.dump"
mkdir -p "$DIR"
pg_dump --format=custom --compress=9 --no-owner --file="$FILE.partial"
mv "$FILE.partial" "$FILE"
# verify the archive is readable before pruning old ones
pg_restore --list "$FILE" > /dev/null
find "$DIR" -name 'puja_os-*.dump' -type f -mtime +"$KEEP" -delete
echo "[backup] wrote $FILE ($(du -h "$FILE" | cut -f1)); retention $KEEP days"
