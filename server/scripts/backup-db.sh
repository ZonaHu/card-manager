#!/bin/bash
# Atomic SQLite backup. Uses sqlite3's online .backup command rather than
# `cp`, so it's safe to run while the server is reading/writing — the backup
# is taken in one consistent snapshot.
#
# Usage:
#   ./server/scripts/backup-db.sh                       # default dir, keep 30 most recent
#   BACKUP_DIR=/path/to/store ./server/scripts/backup-db.sh
#   BACKUP_KEEP=7 ./server/scripts/backup-db.sh         # prune older than 7
#
# Suggested cron (daily at 02:00):
#   0 2 * * * /Users/zuomiaohu/Desktop/card-manager/server/scripts/backup-db.sh >> /tmp/card-manager-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
DB_PATH="$SERVER_DIR/database.db"
BACKUP_DIR="${BACKUP_DIR:-$SERVER_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-30}"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] no database at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/database-$STAMP.db"

sqlite3 "$DB_PATH" ".backup '$TARGET'"
echo "[backup] wrote $TARGET ($(du -h "$TARGET" | cut -f1))"

# Prune all but the BACKUP_KEEP most recent backups. ls -t orders newest first.
cd "$BACKUP_DIR"
ls -1t database-*.db 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  echo "[backup] pruning $old"
  rm -f -- "$old"
done
