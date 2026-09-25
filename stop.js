#!/usr/bin/env node
'use strict'

// forvera 停止脚本：只按端口找到 pid 再 kill。

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT_DIR = __dirname

function sleepSync(seconds) {
  const sab = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(sab, 0, 0, Math.round(seconds * 1000))
}

function envOr(name, def) {
  const v = process.env[name]
  return v !== undefined && v !== '' ? v : def
}

// 读取 .env 并写入 process.env（与 bash `set -a; source .env` 语义一致）。
function loadEnv() {
  const envFile = path.join(ROOT_DIR, '.env')
  if (!fs.existsSync(envFile)) return
  for (const raw of fs.readFileSync(envFile, 'utf8').split('\n')) {
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
}

function capture(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
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

function killPids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal)
    } catch {
      /* 进程可能已退出 */
    }
  }
}

// 通过端口找到 pid 并 kill（先 TERM 再 KILL）。
function stopByPort(port) {
  const pids = parsePids(capture(`lsof -ti tcp:${port}`))
  if (pids.length === 0) {
    console.log(`[port ${port}] no process`)
    return
  }
  console.log(`[port ${port}] killing pids: ${pids.join(' ')}`)
  killPids(pids, 'SIGTERM')
  sleepSync(1)
  const remain = parsePids(capture(`lsof -ti tcp:${port}`))
  if (remain.length) {
    console.log(`[port ${port}] force killing: ${remain.join(' ')}`)
    killPids(remain, 'SIGKILL')
  }
}

function ports() {
  const list = [Number(envOr('SERVER_PORT', '3000')), Number(envOr('APP_PORT', '10000'))]
  for (const p of envOr('APP_FALLBACK_PORTS', '4173 5173').split(/\s+/).filter(Boolean)) {
    list.push(Number(p))
  }
  return list
}

function stop() {
  console.log('Stopping forvera services...')
  for (const port of ports()) stopByPort(port)
  console.log('Done.')
}

module.exports = { stop }

if (require.main === module) {
  loadEnv()
  stop()
}
