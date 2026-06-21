#!/usr/bin/env bash
set -euo pipefail

# 这个脚本用于生成 forvera 的备份压缩包，并可选发送到 Gmail。
# 1. 收集项目资产目录。
# 2. 使用 `mongodump` 导出 MongoDB 数据库。
# 3. 将资产和数据库导出打包成 zip。
# 4. 如果配置了 Gmail 信息，则把备份文件作为附件发送。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="${ASSETS_DIR:-$ROOT_DIR/../assets}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/../backup}"
DB_NAME="${DB_NAME:-forvera}"
MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017/forvera}"

# Optional Gmail settings (leave empty if you don't want email)
GMAIL_TO="${GMAIL_TO:-}"
GMAIL_FROM="${GMAIL_FROM:-}"
GMAIL_APP_PASSWORD="${GMAIL_APP_PASSWORD:-}"

DATE_TAG="$(date +%Y-%m-%d_%H-%M-%S)"
TMP_DIR="$(mktemp -d)"
WORK_DIR="$TMP_DIR/forvera-backup-$DATE_TAG"
ZIP_PATH="$BACKUP_DIR/forvera-backup-$DATE_TAG.zip"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
mkdir -p "$WORK_DIR"

echo "[Backup] Start: $(date '+%F %T')"
echo "[Backup] ROOT_DIR=$ROOT_DIR"
echo "[Backup] BACKUP_DIR=$BACKUP_DIR"

if ! command -v mongodump >/dev/null 2>&1; then
  echo "[Backup] Error: mongodump not found. Please install MongoDB Database Tools."
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "[Backup] Error: zip not found. Please install zip package."
  exit 1
fi

# 1) Backup assets
if [[ -d "$ASSETS_DIR" ]]; then
  echo "[Backup] Copy assets from $ASSETS_DIR"
  mkdir -p "$WORK_DIR/assets"
  cp -a "$ASSETS_DIR/." "$WORK_DIR/assets/"
else
  echo "[Backup] Warning: assets dir not found: $ASSETS_DIR"
fi

# 2) Backup MongoDB (forvera)
echo "[Backup] Dump MongoDB database: $DB_NAME"
mkdir -p "$WORK_DIR/mongodb"
mongodump --uri="$MONGO_URI" --db="$DB_NAME" --out="$WORK_DIR/mongodb"

# 3) Zip everything
(
  cd "$TMP_DIR"
  zip -r "$ZIP_PATH" "forvera-backup-$DATE_TAG" >/dev/null
)

echo "[Backup] ZIP created: $ZIP_PATH"

# 4) Optional: send to Gmail (requires app password)
if [[ -n "$GMAIL_TO" && -n "$GMAIL_FROM" && -n "$GMAIL_APP_PASSWORD" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    echo "[Backup] Sending backup to Gmail..."
    python3 - "$ZIP_PATH" <<'PY'
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

zip_path = Path(sys.argv[1])
to_addr = os.environ.get("GMAIL_TO", "")
from_addr = os.environ.get("GMAIL_FROM", "")
password = os.environ.get("GMAIL_APP_PASSWORD", "")

msg = EmailMessage()
msg["Subject"] = f"Forvera backup: {zip_path.name}"
msg["From"] = from_addr
msg["To"] = to_addr
msg.set_content("Attached is the latest forvera backup zip.")

with zip_path.open("rb") as f:
    data = f.read()
msg.add_attachment(data, maintype="application", subtype="zip", filename=zip_path.name)

context = ssl.create_default_context()
with smtplib.SMTP("smtp.gmail.com", 587, timeout=60) as server:
    server.starttls(context=context)
    server.login(from_addr, password)
    server.send_message(msg)

print("[Backup] Email sent")
PY
  else
    echo "[Backup] python3 not found, skip Gmail sending"
  fi
else
  echo "[Backup] Gmail env not fully set, skip email"
fi

echo "[Backup] Done: $(date '+%F %T')"
