#!/usr/bin/env node
'use strict'

// forvera 生产启动脚本（Node 版）：启动时先构建，再后台拉起 server 与 app。
// 模式：默认(构建+启动) / --stop(仅停止)。挂了就挂了，不做自动重启。

const { execSync, spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { stop } = require('./stop')

const ROOT_DIR = __dirname
const APP_DIR = path.join(ROOT_DIR, 'app')
const SERVER_DIR = path.join(ROOT_DIR, 'server')
const RUNTIME_DIR = path.join(ROOT_DIR, '.runtime')
const LOG_DIR = path.join(RUNTIME_DIR, 'logs')
const PID_DIR = path.join(RUNTIME_DIR, 'pids')

// ── 工具函数 ──
const asyncSleep = ms => new Promise(r => setTimeout(r, ms))

// 阻塞式 sleep（无外部依赖），用于停止流程里的短暂等待。
function sleepSync(seconds) {
  const sab = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(sab, 0, 0, Math.round(seconds * 1000))
}

function envOr(name, def) {
  const v = process.env[name]
  return v !== undefined && v !== '' ? v : def
}

function commandExists(name) {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0
}

// 读取 .env 并写入 process.env（与 bash `set -a; source .env` 语义一致，会覆盖同名变量）。
function loadEnv() {
  const envFile = path.join(ROOT_DIR, '.env')
  if (!fs.existsSync(envFile)) return
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
  console.log(`[env] loaded ${envFile}`)
}

// 以 shell 执行命令，默认继承 stdio；allowFail 时吞掉错误。
function run(cmd, { cwd = ROOT_DIR, allowFail = false } = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', cwd, env: process.env })
    return true
  } catch (err) {
    if (allowFail) return false
    throw err
  }
}

// 执行命令并返回 stdout 文本，出错时返回空串。
function capture(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], env: process.env }).toString()
  } catch {
    return ''
  }
}

function parsePids(text) {
  return text
    .split(/\s+/)
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s))
    .map(Number)
}

// ── 停止相关 ──
function waitPortFree(port) {
  for (let i = 0; i < 10; i++) {
    if (parsePids(capture(`lsof -ti tcp:${port}`)).length === 0) return true
    sleepSync(1)
  }
  console.log(`[pre] Warning: port ${port} still in use after waiting`)
  return false
}

// ── 健康检查 ──
function httpProbe(url, insecure, timeoutMs = 5000) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { rejectUnauthorized: !insecure, timeout: timeoutMs }, res => {
      res.resume()
      resolve(res.statusCode || 0)
    })
    req.on('error', () => resolve(0))
    req.on('timeout', () => {
      req.destroy()
      resolve(0)
    })
  })
}

async function waitForHttp(name, url, logFile, retries = 20, insecure = false) {
  for (let i = 0; i < retries; i++) {
    const code = await httpProbe(url, insecure)
    if (code) {
      console.log(`[${name}] health check passed: ${url}`)
      return true
    }
    await asyncSleep(1000)
  }
  console.log(`[${name}] health check failed: ${url}`)
  if (fs.existsSync(logFile)) {
    console.log(`----- ${name} log tail -----`)
    console.log(capture(`tail -n 80 ${JSON.stringify(logFile)}`))
    console.log('---------------------------')
  }
  return false
}

// ── Caddy ──
function installCaddyIfNeeded() {
  if (commandExists('caddy')) return
  console.log('[caddy] Installing Caddy...')
  run('apt-get update')
  run('apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl')
  run(
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
  )
  run(
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null"
  )
  run('apt-get update')
  run('apt-get install -y caddy')
}

function configureCaddy() {
  run(`cp ${JSON.stringify(path.join(ROOT_DIR, 'Caddyfile'))} /etc/caddy/Caddyfile`)
  run('caddy validate --config /etc/caddy/Caddyfile')
  run('systemctl enable caddy >/dev/null 2>&1', { allowFail: true })
  if (spawnSync('systemctl', ['is-active', '--quiet', 'caddy']).status === 0) {
    run('systemctl reload caddy')
  } else {
    run('systemctl start caddy')
  }
}

// ── 配置 ──
function buildConfig() {
  return {
    APP_PORT: Number(envOr('APP_PORT', '10000')),
    SERVER_PORT: Number(envOr('SERVER_PORT', '3000')),
    ENABLE_CADDY: envOr('ENABLE_CADDY', '1'),
    CADDY_DOMAIN: envOr('CADDY_DOMAIN', 'eason-s.life'),
    SSL_CERT_PATH: envOr('SSL_CERT_PATH', '/etc/letsencrypt/live/eason-s.life/fullchain.pem'),
    SSL_KEY_PATH: envOr('SSL_KEY_PATH', '/etc/letsencrypt/live/eason-s.life/privkey.pem'),
    FORVERA_FORCE_HTTP: envOr('FORVERA_FORCE_HTTP', '1'),
    NPM_REGISTRY: envOr('NPM_REGISTRY', 'https://registry.npmmirror.com'),
    SHARP_BINARY_HOST: envOr('SHARP_BINARY_HOST', 'https://npmmirror.com/mirrors/sharp'),
    SHARP_LIBVIPS_HOST: envOr('SHARP_LIBVIPS_HOST', 'https://npmmirror.com/mirrors/sharp-libvips'),
  }
}

// 是否走 https 健康检查：非强制 http 且证书存在时用 https。
function useHttps(cfg) {
  return (
    cfg.FORVERA_FORCE_HTTP !== '1' &&
    fs.existsSync(cfg.SSL_CERT_PATH) &&
    fs.existsSync(cfg.SSL_KEY_PATH)
  )
}

// ── 主流程 ──
async function main() {
  loadEnv()
  const cfg = buildConfig()

  // [0/5] 配置环境变量与 npm 镜像，并准备运行时目录
  console.log('[0/5] Configuring environment and npm mirrors...')
  run(`npm config set registry ${JSON.stringify(cfg.NPM_REGISTRY)}`)
  process.env.npm_config_registry = cfg.NPM_REGISTRY
  process.env.npm_config_sharp_binary_host = cfg.SHARP_BINARY_HOST
  process.env.npm_config_sharp_libvips_binary_host = cfg.SHARP_LIBVIPS_HOST
  process.env.npm_config_sharp_dist_base_url = cfg.SHARP_LIBVIPS_HOST
  process.env.SHARP_DIST_BASE_URL = cfg.SHARP_LIBVIPS_HOST

  fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.mkdirSync(PID_DIR, { recursive: true })
  fs.mkdirSync(path.join(ROOT_DIR, '..', 'assets'), { recursive: true })

  // [1/5] 停止已有服务并等待端口释放
  console.log('[1/5] Stopping existing services...')
  stop()
  waitPortFree(cfg.SERVER_PORT)
  waitPortFree(cfg.APP_PORT)

  // [2/5] 安装依赖（备份功能依赖 zip，缺失则直接退出）
  console.log('[2/5] Installing dependencies...')
  if (!commandExists('zip')) {
    console.log('[pre] Error: zip not found. Please install zip manually and re-run this script.')
    process.exit(1)
  }
  console.log('[deps] Installing server dependencies...')
  run('npm install', { cwd: SERVER_DIR })
  console.log('[deps] Installing app dependencies...')
  run('npm install', { cwd: APP_DIR })

  // [3/5] 构建前后端产物
  console.log('[3/5] Building server and app...')
  console.log('[build] Building server...')
  run('npm run build', { cwd: SERVER_DIR })
  console.log('[build] Building app...')
  run('npm run build', { cwd: APP_DIR })

  // [4/5] 后台启动 server 与 app（崩溃不自动重启）
  console.log('[4/5] Starting services in background...')
  process.env.FORVERA_ROOT_DIR = ROOT_DIR
  // 后端：直接后台运行
  const serverOut = fs.openSync(path.join(LOG_DIR, 'server.log'), 'a')
  const serverChild = spawn('npm', ['run', 'start:prod'], {
    cwd: SERVER_DIR,
    detached: true,
    stdio: ['ignore', serverOut, serverOut],
    env: process.env,
  })
  serverChild.unref()
  fs.writeFileSync(path.join(PID_DIR, 'server.pid'), String(serverChild.pid))

  // 前端静态服务
  const appOut = fs.openSync(path.join(LOG_DIR, 'app.log'), 'a')
  const appChild = spawn(process.execPath, [path.join(APP_DIR, 'serve-static.js')], {
    cwd: APP_DIR,
    detached: true,
    stdio: ['ignore', appOut, appOut],
    env: {
      ...process.env,
      APP_PORT: String(cfg.APP_PORT),
      SSL_CERT_PATH: cfg.SSL_CERT_PATH,
      SSL_KEY_PATH: cfg.SSL_KEY_PATH,
      FORVERA_FORCE_HTTP: cfg.FORVERA_FORCE_HTTP,
    },
  })
  appChild.unref()
  fs.writeFileSync(path.join(PID_DIR, 'app.pid'), String(appChild.pid))

  // 等待前后端健康检查通过
  const https_ = useHttps(cfg)
  const proto = https_ ? 'https' : 'http'
  const insecure = https_

  await waitForHttp(
    'server',
    `${proto}://127.0.0.1:${cfg.SERVER_PORT}/`,
    path.join(LOG_DIR, 'server.log'),
    20,
    insecure
  )
  await waitForHttp(
    'app',
    `${proto}://127.0.0.1:${cfg.APP_PORT}/`,
    path.join(LOG_DIR, 'app.log'),
    20,
    insecure
  )

  // [5/5] 配置 Caddy（仅在 root + systemctl 环境下安装并加载配置）
  console.log('[5/5] Configuring Caddy...')
  if (cfg.ENABLE_CADDY === '1') {
    if (process.getuid && process.getuid() !== 0) {
      console.log(
        '[caddy] Warning: ENABLE_CADDY=1 but current user is not root, skipping Caddy setup (80/443 will not be managed by this script)'
      )
    } else if (!commandExists('systemctl')) {
      console.log(
        '[caddy] Warning: systemctl not found, skipping Caddy setup (80/443 will not be managed by this script)'
      )
    } else {
      installCaddyIfNeeded()
      configureCaddy()
      console.log(`[caddy] Ready: https://${cfg.CADDY_DOMAIN}`)
    }
  }

  const serverPid = fs.readFileSync(path.join(PID_DIR, 'server.pid'), 'utf8').trim()
  const appPid = fs.readFileSync(path.join(PID_DIR, 'app.pid'), 'utf8').trim()
  console.log('')
  console.log(`Server started (pid=${serverPid}, port=${cfg.SERVER_PORT})`)
  console.log(`App started    (pid=${appPid}, port=${cfg.APP_PORT})`)
  console.log(`Logs: ${path.join(LOG_DIR, 'server.log')} and ${path.join(LOG_DIR, 'app.log')}`)
  console.log(`PIDs: ${path.join(PID_DIR, 'server.pid')} and ${path.join(PID_DIR, 'app.pid')}`)
}

// ── 入口分发 ──
const mode = process.argv[2]
if (mode === '--stop') {
  loadEnv()
  stop()
  process.exit(0)
} else {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
