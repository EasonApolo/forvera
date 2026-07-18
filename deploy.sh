#!/usr/bin/env bash
set -euo pipefail

# SSH 部署脚本：把 forvera 必要文件同步到远端 ~/forvera 并启动。
# 默认连接：ssh -i ~/.ssh/aliyun-server.pem root@47.82.96.3

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

APP_DIR="$ROOT_DIR/app"
SERVER_DIR="$ROOT_DIR/server"

SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-47.82.96.3}"
SSH_TARGET="${SSH_USER}@${SSH_HOST}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/aliyun-server.pem}"
REMOTE_DIR="${REMOTE_DIR:-forvera}"
SKIP_BUILD="${SKIP_BUILD:-0}"

# npm/sharp 镜像，可通过环境变量覆盖默认值。
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
SHARP_BINARY_HOST="${SHARP_BINARY_HOST:-https://npmmirror.com/mirrors/sharp}"
SHARP_LIBVIPS_HOST="${SHARP_LIBVIPS_HOST:-https://npmmirror.com/mirrors/sharp-libvips}"

# 在本地一次性构建前后端产物（dist），供 rsync 同步到服务器免编译运行。
build_local() {
  echo "[build] Configuring npm mirrors..."
  npm config set registry "$NPM_REGISTRY"

  export npm_config_registry="$NPM_REGISTRY"
  export npm_config_sharp_binary_host="$SHARP_BINARY_HOST"
  export npm_config_sharp_libvips_binary_host="$SHARP_LIBVIPS_HOST"
  export npm_config_sharp_dist_base_url="$SHARP_LIBVIPS_HOST"
  export SHARP_DIST_BASE_URL="$SHARP_LIBVIPS_HOST"

  echo "[build] Installing dependencies..."
  cd "$SERVER_DIR"
  npm install
  cd "$APP_DIR"
  npm install

  echo "[build] Building server..."
  cd "$SERVER_DIR"
  npm run build

  echo "[build] Building app..."
  cd "$APP_DIR"
  npm run build

  echo "[build] Done. server dist: $SERVER_DIR/dist, app dist: $APP_DIR/dist"
}

if [[ ! -f "$KEY_PATH" ]]; then
  echo "Error: private key not found: $KEY_PATH"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync is required"
  exit 1
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "[0/4] Building app + server dist locally ..."
  build_local
else
  echo "[0/4] SKIP_BUILD=1, skip local build"
fi

echo "[1/4] Syncing project files (including dist) to $SSH_TARGET:~/$REMOTE_DIR ..."
rsync -az --delete \
  -e "ssh -i $KEY_PATH -o IdentitiesOnly=yes" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.runtime' \
  --exclude '*.log' \
  "$ROOT_DIR/" "$SSH_TARGET:~/$REMOTE_DIR/"

echo "[2/4] Preparing remote runtime ..."
ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "bash -s" <<'EOF'
set -euo pipefail

cd ~/forvera
chmod +x start.sh

if ! command -v node >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl ca-certificates gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

if ! command -v zip >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y zip
fi

mkdir -p ~/assets ~/backup
EOF

echo "[3/4] Starting service on remote host ..."
ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "bash -s" <<'EOF'
set -euo pipefail
cd ~/forvera
mkdir -p .runtime/logs .runtime/pids
nohup ./start.sh > .runtime/logs/deploy-start.log 2>&1 < /dev/null &
echo $! > .runtime/pids/deploy-start.pid
echo "remote start launched (pid=$(cat .runtime/pids/deploy-start.pid))"
EOF

echo "[3/4] Waiting for remote ports ..."
for i in $(seq 1 60); do
  if ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "ss -lntp | grep -q ':3000' && ss -lntp | grep -q ':10000'"; then
    echo "forvera is running (3000 + 10000 listening)"
    break
  fi
  sleep 1
done

if ! ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "ss -lntp | grep -q ':3000' && ss -lntp | grep -q ':10000'"; then
  echo "Error: remote ports 3000/10000 are not both listening"
  ssh -i "$KEY_PATH" -o IdentitiesOnly=yes "$SSH_TARGET" "tail -n 120 ~/forvera/.runtime/logs/deploy-start.log || true"
  exit 1
fi

echo "[4/4] Deployment done"
