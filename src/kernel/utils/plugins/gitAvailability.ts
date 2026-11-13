/**
 * Utility for checking git availability.
 *
 * Git is required for installing GitHub-based marketplaces. This module
 * provides a memoized check to determine if git is available on the system.
 */

import { existsSync } from 'fs'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { which } from '../which.js'

// ── 2026-10-08 多 OS 优化 · Windows git 探测 ─────────────────────────────────
// Windows 上 git 常「已安装但不在当前 shell 的 PATH」（Git 安装器未勾
// "Add to PATH"、per-user 安装不在系统 PATH、或终端在 PATH 刷新前打开）。
// 此时 which('git') 返回 null，官方 / Ascend / Atlas 三条 marketplace
// 自动安装链全按 git_unavailable 跳过 → 新装 /plugin 全空。PATH 未命中时
// 追加探测常见安装位置（Unix 零行为变化：平台门 win32 only）。

/** Windows 常见 git 安装位置候选（env 变量可被篡改，逐个 try 兜底）。 */
export function windowsGitCandidates(): string[] {
  const candidates: string[] = []
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  ]
  for (const root of roots) {
    candidates.push(join(root, 'Git', 'cmd', 'git.exe')) // MSI 默认
    candidates.push(join(root, 'Git', 'bin', 'git.exe')) // Git Bash 伴生
  }
  if (process.env['LOCALAPPDATA']) {
    candidates.push(
      join(process.env['LOCALAPPDATA'], 'Programs', 'Git', 'cmd', 'git.exe'),
    ) // per-user 安装器
  }
  if (process.env['USERPROFILE']) {
    candidates.push(
      join(process.env['USERPROFILE'], 'scoop', 'shims', 'git.exe'),
    ) // scoop
  }
  candidates.push('C:\\ProgramData\\chocolatey\\bin\\git.exe') // chocolatey
  candidates.push('C:\\msys64\\usr\\bin\\git.exe') // MSYS2
  return candidates
}

/**
 * Windows-only：PATH 查找未命中时探测常见安装位置的 git 二进制。
 * 非 win32 恒返回 null（零回归边界）；win32 返回首个存在的候选，或 null。
 * 安装位置在 session 内不变 → memoize（与 checkGitAvailable 同生命周期，
 * 经 clearGitAvailabilityCache 场景可一并重置）。
 */
export const resolveWindowsGitBinary = memoize((): string | null => {
  if (process.platform !== 'win32') return null
  for (const candidate of windowsGitCandidates()) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // 畸形 env 路径（非法字符）不应击穿可用性探测。
    }
  }
  return null
})

/**
 * Check if a command is available in PATH.
 *
 * Uses which to find the actual executable without executing it.
 * This is a security best practice to avoid executing arbitrary code
 * in untrusted directories.
 *
 * @param command - The command to check for
 * @returns True if the command exists and is executable
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    return !!(await which(command))
  } catch {
    return false
  }
}

/**
 * Check if git is available on the system.
 *
 * This is memoized so repeated calls within a session return the cached result.
 * Git availability is unlikely to change during a single CLI session.
 *
 * Only checks PATH — does not exec git. On macOS this means the /usr/bin/git
 * xcrun shim passes even without Xcode CLT installed; callers that hit
 * `xcrun: error:` at exec time should call markGitUnavailable() so the rest
 * of the session behaves as though git is absent.
 *
 * 2026-10-08 多 OS 优化：Windows PATH 未命中时追加安装位置探测
 * （resolveWindowsGitBinary），非 win32 恒 null 零回归。
 *
 * @returns True if git is installed and executable
 */
export const checkGitAvailable = memoize(async (): Promise<boolean> => {
  if (await isCommandAvailable('git')) return true
  return resolveWindowsGitBinary() !== null
})

/**
 * Force the memoized git-availability check to return false for the rest of
 * the session.
 *
 * Call this when a git invocation fails in a way that indicates the binary
 * exists on PATH but cannot actually run — the macOS xcrun shim being the
 * main case (`xcrun: error: invalid active developer path`). Subsequent
 * checkGitAvailable() calls then short-circuit to false, so downstream code
 * that guards on git availability skips cleanly instead of failing repeatedly
 * with the same exec error.
 *
 * lodash memoize uses a no-arg cache key of undefined.
 */
export function markGitUnavailable(): void {
  checkGitAvailable.cache?.set?.(undefined, Promise.resolve(false))
}

/**
 * Clear the git availability cache.
 * Used for testing purposes. Also clears the Windows install-location probe
 * memo (2026-10-08 多 OS 优化) so a re-run re-probes.
 */
export function clearGitAvailabilityCache(): void {
  checkGitAvailable.cache?.clear?.()
  resolveWindowsGitBinary.cache?.clear?.()
}
