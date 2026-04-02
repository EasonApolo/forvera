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

mkdir -p "$LOG_DIR" "$PID_DIR"
mkdir -p "$ROOT_DIR/../assets"

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

echo "[1/4] Installing dependencies..."
cd "$SERVER_DIR"
npm ci
cd "$APP_DIR"
npm ci

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
nohup npm run serve -- --host 0.0.0.0 --port "$APP_PORT" > "$LOG_DIR/app.log" 2>&1 &
echo $! > "$PID_DIR/app.pid"

echo
printf "Server started (pid=%s, port=%s)\n" "$(cat "$PID_DIR/server.pid")" "$SERVER_PORT"
printf "App started    (pid=%s, port=%s)\n" "$(cat "$PID_DIR/app.pid")" "$APP_PORT"
printf "Logs: %s and %s\n" "$LOG_DIR/server.log" "$LOG_DIR/app.log"
printf "PIDs: %s and %s\n" "$PID_DIR/server.pid" "$PID_DIR/app.pid"
