#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SCRIPT="$ROOT_DIR/backup-monthly.sh"
LOG_DIR="$ROOT_DIR/../backup"
LOG_FILE="$LOG_DIR/backup-cron.log"

mkdir -p "$LOG_DIR"

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
  echo "Backup script not found: $BACKUP_SCRIPT"
  exit 1
fi

chmod +x "$BACKUP_SCRIPT"

CRON_EXPR="0 3 1 * *"
CRON_CMD="$CRON_EXPR $BACKUP_SCRIPT >> $LOG_FILE 2>&1"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "backup-monthly.sh" > "$TMP_CRON" || true
echo "$CRON_CMD" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "Installed monthly cron job:"
echo "$CRON_CMD"
echo
crontab -l
