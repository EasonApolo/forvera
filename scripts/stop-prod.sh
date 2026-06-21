#!/usr/bin/env bash
set -euo pipefail

# 这个脚本用于停止 forvera 的生产进程。
# 1. 读取运行目录和 PID 文件目录。
# 2. 优先按 PID 文件停止 server 和 app。
# 3. 如果 PID 文件不可用，则按端口和进程特征兜底查找并停止。
# 4. 清理 fallback 端口上的残留进程。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_DIR="$RUNTIME_DIR/pids"
CONTROL_DIR="$RUNTIME_DIR/control"
SERVER_STOP_FILE="$CONTROL_DIR/server.stop"
APP_STOP_FILE="$CONTROL_DIR/app.stop"

APP_PORT="${APP_PORT:-10000}"
SERVER_PORT="${SERVER_PORT:-3000}"

APP_FALLBACK_PORTS="${APP_FALLBACK_PORTS:-4173 5173}"

stop_by_pid_file() {
  local name="$1"
  local pid_file="$PID_DIR/${name}.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "[$name] pid file not found: $pid_file"
    return 1
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "${pid}" ]]; then
    echo "[$name] pid file is empty"
    rm -f "$pid_file"
    return 1
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    echo "[$name] process not running (pid=$pid)"
    rm -f "$pid_file"
    return 1
  fi

  echo "[$name] stopping pid=$pid"
  kill "$pid" || true
  sleep 1

  if kill -0 "$pid" 2>/dev/null; then
    echo "[$name] force killing pid=$pid"
    kill -9 "$pid" || true
  fi

  rm -f "$pid_file"
  echo "[$name] stopped"
  return 0
}

stop_by_port() {
  local name="$1"
  local port="$2"

  local pids
  pids="$(lsof -ti tcp:"$port" || true)"
  if [[ -z "$pids" ]]; then
    echo "[$name] no process on port $port"
    return 1
  fi

  echo "[$name] stopping by port $port, pids: $pids"
  kill $pids || true
  sleep 1

  local remain
  remain="$(lsof -ti tcp:"$port" || true)"
  if [[ -n "$remain" ]]; then
    echo "[$name] force killing remaining pids: $remain"
    kill -9 $remain || true
  fi

  echo "[$name] stopped by port $port"
  return 0
}

stop_by_pattern() {
  local name="$1"
  local pattern="$2"

  local pids
  pids="$(pgrep -f "$pattern" || true)"
  if [[ -z "$pids" ]]; then
    echo "[$name] no process matched pattern"
    return 1
  fi

  echo "[$name] stopping by pattern, pids: $pids"
  kill $pids || true
  sleep 1

  local remain
  remain="$(pgrep -f "$pattern" || true)"
  if [[ -n "$remain" ]]; then
    echo "[$name] force killing remaining pids: $remain"
    kill -9 $remain || true
  fi

  echo "[$name] stopped by pattern"
  return 0
}

mkdir -p "$PID_DIR"
mkdir -p "$CONTROL_DIR"

touch "$SERVER_STOP_FILE" "$APP_STOP_FILE"

echo "Stopping forvera services..."

stop_by_pid_file "server" \
  || stop_by_port "server" "$SERVER_PORT" \
  || stop_by_pattern "server" "$ROOT_DIR/server/.*/dist/main" \
  || stop_by_pattern "server" "$ROOT_DIR/server/.*/nest start" \
  || true

stop_by_pid_file "app" \
  || stop_by_port "app" "$APP_PORT" \
  || stop_by_pattern "app" "$ROOT_DIR/app/.*/serve-static\.js" \
  || stop_by_pattern "app" "$ROOT_DIR/app/.*/vite preview" \
  || stop_by_pattern "app" "$ROOT_DIR/app/.*/npm run serve" \
  || true

for port in $APP_FALLBACK_PORTS; do
  stop_by_port "app" "$port" || true
done

echo "Done."
