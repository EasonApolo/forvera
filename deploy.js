#!/usr/bin/env node
'use strict'

// 部署脚本（Node 版）：通过 SSH 登录远端，更新代码后执行 start.js。
// 默认连接：ssh -i ~/.ssh/tencent_cloud.pem root@43.154.64.94

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')

const KEY_PATH = process.env.KEY_PATH || `${os.homedir()}/.ssh/tencent_cloud.pem`
const SSH_USER = process.env.SSH_USER || 'root'
const SSH_HOST = process.env.SSH_HOST || '43.154.64.94'
const SSH_TARGET = `${SSH_USER}@${SSH_HOST}`
const REMOTE_DIR = process.env.REMOTE_DIR || '/root/forvera'
const REMOTE_BRANCH = process.env.REMOTE_BRANCH || 'master'

// 用单引号包裹并转义，安全地拼进远端命令。
function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function ssh(remoteCommand, input) {
  const args = ['-i', KEY_PATH, '-o', 'IdentitiesOnly=yes', SSH_TARGET, remoteCommand]
  const res = spawnSync('ssh', args, {
    stdio: [input !== undefined ? 'pipe' : 'inherit', 'inherit', 'inherit'],
    input,
  })
  if (res.status !== 0) {
    process.exit(res.status === null ? 1 : res.status)
  }
}

if (!fs.existsSync(KEY_PATH)) {
  console.error(`Error: SSH key not found: ${KEY_PATH}`)
  process.exit(1)
}

console.log(`[1/2] Updating remote code on ${SSH_TARGET}:${REMOTE_DIR} ...`)

const updateScript = `set -euo pipefail

cd "$REMOTE_DIR"

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "$REMOTE_BRANCH")"
if [[ "$current_branch" == "HEAD" || -z "$current_branch" ]]; then
  current_branch="$REMOTE_BRANCH"
fi

git fetch origin
git reset --hard "origin/$current_branch"
git clean -fd

echo "updated to $(git rev-parse --short HEAD) on branch $current_branch"
`

ssh(
  `REMOTE_DIR=${shQuote(REMOTE_DIR)} REMOTE_BRANCH=${shQuote(REMOTE_BRANCH)} bash -s`,
  updateScript
)

console.log('[2/2] Starting remote service ...')
ssh(`bash -ic 'cd ${REMOTE_DIR} && node ./start.js'`)

console.log('Deployment complete')
