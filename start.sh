#!/usr/bin/env bash
set -euo pipefail

# 这个脚本用于在本地或服务器上启动 forvera 的生产服务（始终免编译）。
# 1. 计算项目根目录和运行目录。
# 2. 检查 Node.js 版本、配置 npm 镜像并准备运行目录。
# 3. 停止旧进程，直接使用仓库中已提交的 dist（前端免依赖，后端仅装运行时依赖）。
# 4. 后台启动 server 和 app，并等待健康检查通过。
# 如需重新构建产物，请在本地运行 ./deploy.sh（内含构建步骤）。

# 计算项目根目录及各子目录、运行时目录（日志、PID、控制文件）的绝对路径。
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/app"
SERVER_DIR="$ROOT_DIR/server"
RUNTIME_DIR="$ROOT_DIR/.runtime"
LOG_DIR="$RUNTIME_DIR/logs"
PID_DIR="$RUNTIME_DIR/pids"
CONTROL_DIR="$RUNTIME_DIR/control"
SERVER_STOP_FILE="$CONTROL_DIR/server.stop"
WATCHDOG_STOP_FILE="$CONTROL_DIR/watchdog.stop"

# 守护进程配置：每隔 WATCHDOG_INTERVAL 秒检测一次前后端存活，挂了就重新执行 start。
# 设置 ENABLE_WATCHDOG=0 可关闭守护进程。
ENABLE_WATCHDOG="${ENABLE_WATCHDOG:-1}"
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-300}"

# 服务端口与 SSL 证书路径，均可通过环境变量覆盖默认值。
APP_PORT="${APP_PORT:-10000}"
SERVER_PORT="${SERVER_PORT:-3000}"
ENABLE_CADDY="${ENABLE_CADDY:-1}"
SSL_CERT_PATH="${SSL_CERT_PATH:-/etc/letsencrypt/live/eason-s.life/fullchain.pem}"
SSL_KEY_PATH="${SSL_KEY_PATH:-/etc/letsencrypt/live/eason-s.life/privkey.pem}"
# 生产用 Caddy 统一终结 HTTPS，后端(3000)与前端(10000)默认跑纯 HTTP。
# 如需让 Node 服务自身启用 HTTPS，可显式设置 FORVERA_FORCE_HTTP=0。
FORVERA_FORCE_HTTP="${FORVERA_FORCE_HTTP:-1}"

# npm/sharp mirrors (can be overridden by environment variables)
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
SHARP_BINARY_HOST="${SHARP_BINARY_HOST:-https://npmmirror.com/mirrors/sharp}"
SHARP_LIBVIPS_HOST="${SHARP_LIBVIPS_HOST:-https://npmmirror.com/mirrors/sharp-libvips}"
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

stop_existing_services() {
  mkdir -p "$PID_DIR" "$CONTROL_DIR"
  touch "$SERVER_STOP_FILE" "$CONTROL_DIR/app.stop" "$WATCHDOG_STOP_FILE"

  echo "Stopping forvera services..."

  # 先停守护进程，避免它在停止过程中把服务又拉起来。
  stop_by_pid_file "watchdog" \
    || stop_by_pattern "watchdog" "$ROOT_DIR/start\.sh --watchdog" \
    || true

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
}

# `--stop` 会触发仅停止模式，不会继续启动服务。
if [[ "${1:-}" == "--stop" ]]; then
  stop_existing_services
  exit 0
fi

# `--watchdog` 为守护进程模式：由主流程在后台拉起，定期检测前后端存活，
# 一旦发现某个服务挂了（主要是后端），就重新执行一遍 start 把服务拉回来。
if [[ "${1:-}" == "--watchdog" ]]; then
  mkdir -p "$LOG_DIR" "$PID_DIR" "$CONTROL_DIR"
  echo $$ > "$PID_DIR/watchdog.pid"

  # 与主流程一致，决定健康检查走 http 还是 https。
  WD_PROTO="http"
  WD_CURL_EXTRA=""
  if [[ "$FORVERA_FORCE_HTTP" != "1" && -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
    WD_PROTO="https"
    WD_CURL_EXTRA="-k"
  fi

  wd_log() {
    echo "[watchdog] $(date '+%F %T') $*"
  }

  # 连续多次探测失败才判定服务挂了，避免瞬时抖动导致误重启。
  wd_service_down() {
    local url="$1"
    for ((i=1; i<=3; i++)); do
      local code
      code="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' $WD_CURL_EXTRA "$url" 2>/dev/null || true)"
      if [[ -n "$code" && "$code" != "000" ]]; then
        return 1  # 存活
      fi
      sleep 2
    done
    return 0  # 挂了
  }

  wd_log "started, interval=${WATCHDOG_INTERVAL}s, proto=$WD_PROTO"
  while true; do
    sleep "$WATCHDOG_INTERVAL"

    if [[ -f "$WATCHDOG_STOP_FILE" ]]; then
      wd_log "stop flag detected, watchdog exits"
      break
    fi

    down=""
    if wd_service_down "$WD_PROTO://127.0.0.1:$SERVER_PORT/"; then
      down="backend"
    fi
    if wd_service_down "$WD_PROTO://127.0.0.1:$APP_PORT/"; then
      down="${down:+$down+}frontend"
    fi

    if [[ -n "$down" ]]; then
      wd_log "detected down: $down, re-running start.sh"
      # 以独立会话拉起完整的 start，避免它反过来把本守护进程杀掉时被牵连；
      # 新的 start 会重新启动服务并拉起一个新的守护进程，所以本进程随后退出。
      if command -v setsid >/dev/null 2>&1; then
        setsid nohup bash "$ROOT_DIR/start.sh" >> "$LOG_DIR/watchdog-restart.log" 2>&1 &
      else
        nohup bash "$ROOT_DIR/start.sh" >> "$LOG_DIR/watchdog-restart.log" 2>&1 &
      fi
      wd_log "restart triggered, current watchdog exits"
      break
    fi
  done

  rm -f "$PID_DIR/watchdog.pid"
  exit 0
fi

# 读取当前 Node.js 主/次版本号，用于下面的版本校验。
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
NODE_MINOR="$(node -p "process.versions.node.split('.')[1]")"

# 要求 Node.js >= 18.17，版本过低直接退出。
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

# 创建运行时所需目录：日志、PID、控制文件，以及项目同级的 assets 目录。
mkdir -p "$LOG_DIR" "$PID_DIR"
mkdir -p "$CONTROL_DIR"
mkdir -p "$ROOT_DIR/../assets"

# 清除停止标志文件，避免残留的 stop flag 影响本次启动。
clear_stop_flags() {
  rm -f "$SERVER_STOP_FILE" "$CONTROL_DIR/app.stop" "$WATCHDOG_STOP_FILE"
}

clear_stop_flags

# 启动前先停掉正在运行的旧服务。
echo "[pre] Stopping existing services before start..."
stop_existing_services

# 上一次执行 `start --stop` 或启动失败后可能会残留停止标志，启动前清掉。
clear_stop_flags

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

# 强制清理仍占用端口的残留进程，并等待端口释放。
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

run_with_restart() {
  local name="$1"
  local workdir="$2"
  local log_file="$3"
  local stop_file="$4"
  shift 4

  (
    set -uo pipefail

    child_pid=""
    cleanup() {
      if [[ -n "${child_pid}" ]] && kill -0 "$child_pid" 2>/dev/null; then
        kill "$child_pid" 2>/dev/null || true
        wait "$child_pid" 2>/dev/null || true
      fi
    }

    trap cleanup INT TERM EXIT

    while true; do
      if [[ -f "$stop_file" ]]; then
        echo "[$name] stop flag detected, supervisor exits" >> "$log_file"
        break
      fi

      echo "[$name] starting at $(date '+%F %T')" >> "$log_file"
      (
        cd "$workdir"
        "$@"
      ) >> "$log_file" 2>&1 &
      child_pid=$!

      if wait "$child_pid"; then
        exit_code=0
      else
        exit_code=$?
      fi
      child_pid=""

      if [[ -f "$stop_file" ]]; then
        echo "[$name] stop flag detected after exit, supervisor exits" >> "$log_file"
        break
      fi

      echo "[$name] exited with code $exit_code, restarting in 3s" >> "$log_file"
      sleep 3
    done
  ) &

  echo $! > "$PID_DIR/${name}.pid"
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  local retries="${4:-20}"
  local curl_args="${5:-}"

  for ((i=1; i<=retries; i++)); do
    local code
    code="$(curl -sS -o /dev/null -w '%{http_code}' $curl_args "$url" || true)"
    if [[ -n "$code" && "$code" != "000" ]]; then
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

install_caddy_if_needed() {
  if ! command -v caddy >/dev/null 2>&1; then
    echo "[caddy] Installing Caddy..."
    apt-get update
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update
    apt-get install -y caddy
  fi
}

configure_caddy() {
  cp "$ROOT_DIR/Caddyfile" /etc/caddy/Caddyfile

  caddy validate --config /etc/caddy/Caddyfile
  systemctl enable caddy >/dev/null 2>&1 || true
  if systemctl is-active --quiet caddy; then
    systemctl reload caddy
  else
    systemctl start caddy
  fi
}

# [1/4] 检查 zip 是否可用（备份功能依赖），缺失时仅提示用户自行安装并退出。
echo "[1/4] Installing dependencies..."
if ! command -v zip >/dev/null 2>&1; then
  echo "[pre] Error: zip not found. Please install zip manually and re-run this script."
  exit 1
fi

# 始终免编译：直接使用已同步到服务器的 dist。
# 前端 serve-static.js 不需要依赖，后端仍需安装运行时依赖。
echo "[1-3/4] Using committed dist (build is done by ./deploy.sh)..."

if [[ ! -d "$SERVER_DIR/dist" ]]; then
  echo "[pre] Error: $SERVER_DIR/dist not found. Please run ./deploy.sh first."
  exit 1
fi
if [[ ! -d "$APP_DIR/dist" ]]; then
  echo "[pre] Error: $APP_DIR/dist not found. Please run ./deploy.sh first."
  exit 1
fi

# 后端运行时仍需要生产依赖（不含 devDependencies）。
echo "[deps] Installing server runtime dependencies..."
cd "$SERVER_DIR"
npm install --omit=dev

# 根据 PID 文件停掉可能仍在运行的旧进程。
stop_if_running "server"
stop_if_running "app"

# [4/4] 后台启动服务。后端通过带自动重启的 supervisor 运行，并注入项目根目录环境变量。
echo "[4/4] Starting services in background..."
cd "$SERVER_DIR"
export FORVERA_ROOT_DIR="$ROOT_DIR"
run_with_restart "server" "$SERVER_DIR" "$LOG_DIR/server.log" "$SERVER_STOP_FILE" npm run start:prod

# 启动前端静态服务，传入端口与 SSL 相关环境变量。
cd "$APP_DIR"
APP_PORT="$APP_PORT" \
SSL_CERT_PATH="$SSL_CERT_PATH" \
SSL_KEY_PATH="$SSL_KEY_PATH" \
FORVERA_FORCE_HTTP="$FORVERA_FORCE_HTTP" \
nohup node "$APP_DIR/serve-static.js" > "$LOG_DIR/app.log" 2>&1 &
echo $! > "$PID_DIR/app.pid"

# 根据是否强制 HTTP 及证书是否存在，决定健康检查使用 http 还是 https。
SERVER_PROTO="http"
APP_PROTO="http"
CURL_EXTRA=""
if [[ "$FORVERA_FORCE_HTTP" != "1" && -f "$SSL_CERT_PATH" && -f "$SSL_KEY_PATH" ]]; then
  SERVER_PROTO="https"
  APP_PROTO="https"
  CURL_EXTRA="-k"
fi

# 等待后端与前端的健康检查通过，超时则打印日志尾部便于排查。
wait_for_http "server" "$SERVER_PROTO://127.0.0.1:$SERVER_PORT/" "$LOG_DIR/server.log" 20 "$CURL_EXTRA"
wait_for_http "app" "$APP_PROTO://127.0.0.1:$APP_PORT/" "$LOG_DIR/app.log" 20 "$CURL_EXTRA"

if [[ "$ENABLE_CADDY" == "1" ]]; then
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "[caddy] Warning: ENABLE_CADDY=1 but current user is not root, skipping Caddy setup"
  elif ! command -v systemctl >/dev/null 2>&1; then
    echo "[caddy] Warning: systemctl not found, skipping Caddy setup"
  else
    install_caddy_if_needed
    configure_caddy
    echo "[caddy] Ready: https://$CADDY_DOMAIN"
  fi
fi

echo
printf "Server started (pid=%s, port=%s)\n" "$(cat "$PID_DIR/server.pid")" "$SERVER_PORT"
printf "App started    (pid=%s, port=%s)\n" "$(cat "$PID_DIR/app.pid")" "$APP_PORT"
printf "Logs: %s and %s\n" "$LOG_DIR/server.log" "$LOG_DIR/app.log"
printf "PIDs: %s and %s\n" "$PID_DIR/server.pid" "$PID_DIR/app.pid"

# 启动守护进程：每隔 WATCHDOG_INTERVAL 秒检测一次前后端，挂了就重新执行 start。
if [[ "$ENABLE_WATCHDOG" == "1" ]]; then
  rm -f "$WATCHDOG_STOP_FILE"
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup bash "$ROOT_DIR/start.sh" --watchdog >> "$LOG_DIR/watchdog.log" 2>&1 &
  else
    nohup bash "$ROOT_DIR/start.sh" --watchdog >> "$LOG_DIR/watchdog.log" 2>&1 &
  fi
  disown 2>/dev/null || true
  printf "Watchdog started (every %ss, log=%s)\n" "$WATCHDOG_INTERVAL" "$LOG_DIR/watchdog.log"
fi
