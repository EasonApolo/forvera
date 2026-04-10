#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_ZIP="${OUT_ZIP:-$ROOT_DIR/../forvera.zip}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/forvera-worktree.XXXXXX")"
STAGE_DIR="$TMP_DIR/forvera"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if ! command -v rsync >/dev/null 2>&1; then
  echo "[Pack] Error: rsync not found"
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "[Pack] Error: zip not found"
  exit 1
fi

mkdir -p "$STAGE_DIR"

echo "[Pack] Staging working tree (excluding gitignored files)..."
rsync -a \
  --delete \
  --exclude='.git/' \
  --exclude='package-lock.json' \
  --filter=':- .gitignore' \
  "$ROOT_DIR/" "$STAGE_DIR/"

echo "[Pack] Creating zip..."
mkdir -p "$(dirname "$OUT_ZIP")"
rm -f "$OUT_ZIP"
(
  cd "$TMP_DIR"
  zip -rq "$OUT_ZIP" forvera
)

echo "[Pack] Done: $OUT_ZIP"
