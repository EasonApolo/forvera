#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/app"
SERVER_DIR="$ROOT_DIR/server"
RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"

APP_PORT="${APP_PORT:-10000}"
SERVER_PORT="${SERVER_PORT:-3000}"
SSL_CERT_PATH="${SSL_CERT_PATH:-/etc/letsencrypt/live/eason-s.life/fullchain.pem}"
SSL_KEY_PATH="${SSL_KEY_PATH:-/etc/letsencrypt/live/eason-s.life/privkey.pem}"
FORVERA_FORCE_HTTP="${FORVERA_FORCE_HTTP:-0}"

# npm/sharp mirrors (can be overridden by environment variables)
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
SHARP_BINARY_HOST="${SHARP_BINARY_HOST:-https://npmmirror.com/mirrors/sharp}"
SHARP_LIBVIPS_HOST="${SHARP_LIBVIPS_HOST:-https://npmmirror.com/mirrors/sharp-libvips}"

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
NODE_MINOR="$(node -p "process.versions.node.split('.')[1]")"

if (( NODE_MAJOR < 18 )) || { (( NODE_MAJOR == 18 )) && (( NODE_MINOR < 17 )); }; then
  echo "Error: Node.js $(node -v) is too old. Please use Node.js >= 18.17, recommended: 20 LTS."
  exit 1
fi

echo "[0/4] Configuring npm mirrors..."
npm config set registry "$NPM_REGISTRY"

export npm_config_registry="$NPM_REGISTRY"
export npm_config_sharp_binary_host="$SHARP_BINARY_HOST"
export npm_config_sharp_libvips_binary_host="$SHARP_LIBVIPS_HOST"
export npm_config_sharp_dist_base_url="$SHARP_LIBVIPS_HOST"
export SHARP_DIST_BASE_URL="$SHARP_LIBVIPS_HOST"

mkdir -p "$LOG_DIR" "$PID_DIR"
mkdir -p "$ROOT_DIR/../assets"

echo "[pre] Stopping existing services before start..."
"$ROOT_DIR/stop-prod.sh" || true

# Force-kill any remaining processes still holding the ports
force_kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[pre] Force killing leftover processes on port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

# Wait until a port is no longer in use (up to 10 s)
wait_port_free() {
  local port="$1"
  for ((i=1; i<=10; i++)); do
    if ! lsof -ti tcp:"$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "[pre] Warning: port $port still in use after waiting"
  return 1
}

force_kill_port "$SERVER_PORT"
force_kill_port "$APP_PORT"
wait_port_free "$SERVER_PORT" || true
wait_port_free "$APP_PORT"    || true

stop_if_running() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping existing $name process (pid=$pid)..."
      kill "$pid" || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  local retries="${4:-20}"
  local curl_args="${5:-}"

  for ((i=1; i<=retries; i++)); do
    if curl -fsS $curl_args "$url" >/dev/null 2>&1; then
      echo "[$name] health check passed: $url"
      return 0
    fi
    sleep 1
  done

  echo "[$name] health check failed: $url"
  if [[ -f "$log_file" ]]; then
    echo "----- $name log tail -----"
    tail -n 80 "$log_file" || true
    echo "---------------------------"
  fi
  return 1
}

echo "[1/4] Installing dependencies..."
cd "$SERVER_DIR"
npm install
cd "$APP_DIR"
npm install

echo "[2/4] Building server..."
cd "$SERVER_DIR"
npm run build

echo "[3/4] Building app..."
cd "$APP_DIR"
npm run build

stop_if_running "server"
stop_if_running "app"

echo "[4/4] Starting services in background..."
cd "$SERVER_DIR"
nohup npm run start:prod > "$LOG_DIR/server.log" 2>&1 &
echo $! > "$PID_DIR/server.pid"

cd "$APP_DIR"
APP_PORT="$APP_PORT" \
SSL_CERT_PATH="$SSL_CERT_PATH" \
SSL_KEY_PATH="$SSL_KEY_PATH" \
FORVERA_FORCE_HTTP="$FORVERA_FORCE_HTTP" \
nohup node "$APP_DIR/serve-static.js" > "$LOG_DIR/app.log" 2>&1 &
echo $! > "$PID_DIR/app.pid"

SERVER_PROTO="http"
APP_PROTO="http"
CURL_EXTRA=""
if [[ "$FORVERA_FORCE_HTTP" != "1" && -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
  SERVER_PROTO="https"
  APP_PROTO="https"
  CURL_EXTRA="-k"
fi

wait_for_http "server" "$SERVER_PROTO://127.0.0.1:$SERVER_PORT/" "$LOG_DIR/server.log" 20 "$CURL_EXTRA"
wait_for_http "app" "$APP_PROTO://127.0.0.1:$APP_PORT/" "$LOG_DIR/app.log" 20 "$CURL_EXTRA"

echo
printf "Server started (pid=%s, port=%s)\n" "$(cat "$PID_DIR/server.pid")" "$SERVER_PORT"
printf "App started    (pid=%s, port=%s)\n" "$(cat "$PID_DIR/app.pid")" "$APP_PORT"
printf "Logs: %s and %s\n" "$LOG_DIR/server.log" "$LOG_DIR/app.log"
printf "PIDs: %s and %s\n" "$PID_DIR/server.pid" "$PID_DIR/app.pid"
