import { existsSync } from 'fs'
import { dirname, join, parse } from 'path'

/**
 * 判断某个目录是否为 forvera 项目根目录。
 * 标记：包含 start.sh，或同时包含 app 和 server 两个子目录。
 */
function isProjectRoot(dir: string): boolean {
  if (existsSync(join(dir, 'start.sh'))) {
    return true
  }
  return existsSync(join(dir, 'app')) && existsSync(join(dir, 'server'))
}

/**
 * 从给定目录向上逐级查找项目根目录。
 */
function findRootFrom(startDir: string): string | null {
  let current = startDir
  const { root } = parse(current)
  while (true) {
    if (isProjectRoot(current)) {
      return current
    }
    if (current === root) {
      return null
    }
    current = dirname(current)
  }
}

/**
 * 稳定地解析 forvera 项目根目录，兼容以下启动方式：
 * - 在 server 目录内启动（本地开发）
 * - 在项目根目录用 start.sh 启动（服务器）
 * 解析顺序：显式环境变量 -> 从编译产物 __dirname 向上找 -> 从 cwd 向上找。
 */
function resolveProjectRoot(): string {
  const envRoot = process.env.FORVERA_ROOT_DIR
  if (envRoot && isProjectRoot(envRoot)) {
    return envRoot
  }

  const fromDirname = findRootFrom(__dirname)
  if (fromDirname) {
    return fromDirname
  }

  const fromCwd = findRootFrom(process.cwd())
  if (fromCwd) {
    return fromCwd
  }

  // 兜底：返回 cwd，避免抛异常
  return process.cwd()
}

export const projectRoot: string = resolveProjectRoot()

/**
 * 项目同级的 backup 目录（在根目录外层）。
 * 可用 BACKUP_DIR 覆盖默认目录。
 */
export const backupRoot: string = process.env.BACKUP_DIR || join(projectRoot, '..', 'backup')

/**
 * 项目同级的 assets 目录（在根目录外层）。
 * 可用 ASSETS_DIR 覆盖默认目录。
 */
export const assetsRoot: string = process.env.ASSETS_DIR || join(projectRoot, '..', 'assets')
