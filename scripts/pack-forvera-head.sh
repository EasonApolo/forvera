#!/usr/bin/env bash
set -euo pipefail

# 这个脚本用于把当前工作树打成可分发的 forvera.zip。
# 1. 准备临时 staging 目录。
# 2. 用 `rsync` 复制工作树并排除不需要的文件。
# 3. 使用 `zip` 打包成发布压缩包。
# 4. 清理临时目录并输出生成结果。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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
