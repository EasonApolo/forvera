#!/usr/bin/env node
'use strict'

// 通过 SSH 下载线上最新备份。在项目根目录执行：node scripts/download-backup
// 远端目录读服务器 .env 的 BACKUP_DIR，没有则用项目同级的 backup。
// 本地目录是脚本所在仓库的上一级 backup。
// 脚本在 /Users/eason/code/forvera/scripts 时，下载到 /Users/eason/code/backup。

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const KEY_PATH = path.join(os.homedir(), '.ssh', 'tencent_cloud.pem')
const SSH_TARGET = 'root@43.154.64.94'
const REMOTE_DIR = '/root/forvera'
const LOCAL_DIR = path.resolve(projectRoot, '..', 'backup')

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

const sshArgs = ['-i', KEY_PATH, '-o', 'IdentitiesOnly=yes', '-o', 'Compression=no']

function run(command, args, options = {}) {
  const res = spawnSync(command, args, options)
  if (res.error) {
    console.error(res.error.message)
    process.exit(1)
  }
  return res
}

function latestBackup() {
  const script = `
import sys
from pathlib import Path

remote_dir = Path(${JSON.stringify(REMOTE_DIR)})
backup = None
env_file = remote_dir / '.env'
if env_file.is_file():
    for raw in env_file.read_text(errors='replace').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, val = line.split('=', 1)
        key = key.strip()
        if key.startswith('export '):
            key = key[len('export '):].strip()
        if key != 'BACKUP_DIR':
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        backup = val
backup_dir = Path(backup) if backup else remote_dir.parent / 'backup'
if not backup_dir.is_dir():
    sys.exit(0)
files = [p for p in backup_dir.iterdir() if p.is_file() and p.suffix == '.zip']
files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
if not files:
    sys.exit(0)
target = files[0]
sys.stdout.write('%s\\t%s\\n' % (target.stat().st_size, target))
`
  const res = run('ssh', [...sshArgs, SSH_TARGET, 'python3 -'], {
    input: script,
    encoding: 'utf8',
  })
  if (res.status !== 0) {
    if (res.stderr) process.stderr.write(res.stderr)
    process.exit(res.status === null ? 1 : res.status)
  }
  const line = res.stdout.trim()
  if (!line) return null
  const tab = line.indexOf('\t')
  if (tab <= 0) {
    console.error('remote lookup returned an unexpected backup')
    process.exit(1)
  }
  const size = Number(line.slice(0, tab))
  const remotePath = line.slice(tab + 1)
  if (!Number.isFinite(size) || size < 0 || !remotePath.endsWith('.zip')) {
    console.error('remote lookup returned an unexpected backup')
    process.exit(1)
  }
  return { size, remotePath, name: path.posix.basename(remotePath) }
}

if (!fs.existsSync(KEY_PATH)) {
  console.error(`SSH key not found: ${KEY_PATH}`)
  process.exit(1)
}

const backup = latestBackup()
if (!backup) {
  console.warn('nothing to download')
  process.exit(0)
}

const localPath = path.join(LOCAL_DIR, backup.name)
fs.mkdirSync(LOCAL_DIR, { recursive: true })
if (fs.existsSync(localPath) && fs.statSync(localPath).size === backup.size) {
  console.log(localPath)
  process.exit(0)
}

const rsh = ['ssh', ...sshArgs.map(shQuote)].join(' ')
const rsync = run('rsync', [
  '-a',
  '--partial',
  '--progress',
  '-e', rsh,
  `${SSH_TARGET}:${backup.remotePath}`,
  `${LOCAL_DIR}${path.sep}`,
], { stdio: 'inherit' })
if (rsync.status !== 0) {
  process.exit(rsync.status === null ? 1 : rsync.status)
}

const downloaded = fs.existsSync(localPath) ? fs.statSync(localPath).size : -1
if (downloaded !== backup.size) {
  console.error(`download incomplete: ${downloaded} of ${backup.size}`)
  process.exit(1)
}
console.log(localPath)
