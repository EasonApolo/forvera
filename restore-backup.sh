#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SEARCH_DIR="${BACKUP_SEARCH_DIR:-$ROOT_DIR/../backup}"
ASSETS_DIR="${ASSETS_DIR:-$ROOT_DIR/../assets}"
DB_NAME="${DB_NAME:-forvera}"
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/forvera}"

TARGET_ZIP="${1:-}"
FORCE="${FORCE_RESTORE:-0}"

usage() {
  echo "Usage:"
  echo "  $0                         # restore latest forvera-backup-*.zip from ../backup"
  echo "  $0 /path/to/backup.zip     # restore specified backup zip"
  echo ""
  echo "Env (optional):"
  echo "  BACKUP_SEARCH_DIR  (default: $ROOT_DIR/../backup)"
  echo "  ASSETS_DIR         (default: $ROOT_DIR/../assets)"
  echo "  DB_NAME            (default: forvera)"
  echo "  MONGO_URI          (default: mongodb://127.0.0.1:27017/forvera)"
  echo "  FORCE_RESTORE=1    skip confirmation"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "[Restore] Error: mongorestore not found. Please install MongoDB Database Tools."
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "[Restore] Error: unzip not found. Please install unzip package."
  exit 1
fi

if [[ ! -d "$BACKUP_SEARCH_DIR" ]]; then
  echo "[Restore] Error: backup dir not found: $BACKUP_SEARCH_DIR"
  echo "[Restore] Tip: set BACKUP_SEARCH_DIR explicitly, e.g. BACKUP_SEARCH_DIR=$ROOT_DIR/../backup"
  exit 1
fi

BACKUP_SEARCH_DIR="$(cd "$BACKUP_SEARCH_DIR" && pwd)"

if [[ -z "$TARGET_ZIP" ]]; then
  TARGET_ZIP="$(find "$BACKUP_SEARCH_DIR" -maxdepth 1 -type f -name 'forvera-backup-*.zip' -print0 | xargs -0 ls -1t 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$TARGET_ZIP" ]]; then
  echo "[Restore] Error: no backup zip found in $BACKUP_SEARCH_DIR"
  echo "[Restore] Existing zip files:"
  find "$BACKUP_SEARCH_DIR" -maxdepth 1 -type f -name '*.zip' -print | sed 's/^/  - /' || true
  echo "[Restore] Put backup zip in ../backup and retry, or pass zip path as first arg."
  exit 1
fi

if [[ ! -f "$TARGET_ZIP" ]]; then
  echo "[Restore] Error: backup file not found: $TARGET_ZIP"
  exit 1
fi

echo "[Restore] Start: $(date '+%F %T')"
echo "[Restore] ZIP=$TARGET_ZIP"
echo "[Restore] ASSETS_DIR=$ASSETS_DIR"
echo "[Restore] DB_NAME=$DB_NAME"

if [[ "$FORCE" != "1" ]]; then
  echo "[Restore] Warning: this will overwrite MongoDB '$DB_NAME' and assets in '$ASSETS_DIR'."
  read -r -p "Continue? (yes/no): " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "[Restore] Cancelled"
    exit 0
  fi
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

unzip -q "$TARGET_ZIP" -d "$TMP_DIR"

EXTRACT_ROOT="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)"
if [[ -z "$EXTRACT_ROOT" ]]; then
  echo "[Restore] Error: backup zip content is invalid"
  exit 1
fi

ASSETS_SRC="$EXTRACT_ROOT/assets"
MONGO_SRC="$EXTRACT_ROOT/mongodb"
MONGO_DB_SRC="$MONGO_SRC/$DB_NAME"

if [[ -d "$ASSETS_SRC" ]]; then
  echo "[Restore] Restoring assets..."
  mkdir -p "$ASSETS_DIR"
  find "$ASSETS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$ASSETS_SRC/." "$ASSETS_DIR/"
else
  echo "[Restore] Warning: assets folder not found in backup, skip assets restore"
fi

if [[ -d "$MONGO_SRC" ]]; then
  echo "[Restore] Restoring MongoDB..."
  if [[ -d "$MONGO_DB_SRC" ]]; then
    mongorestore --uri="$MONGO_URI" --drop "$MONGO_DB_SRC"
  else
    mongorestore --uri="$MONGO_URI" --drop "$MONGO_SRC"
  fi
else
  echo "[Restore] Warning: mongodb folder not found in backup, skip db restore"
fi

echo "[Restore] Done: $(date '+%F %T')"
