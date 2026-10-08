/**
 * 2026-10-08 多 OS 优化 · Windows git 探测判别单测（A 面：gitAvailability）。
 *
 * 判据（gate ② 源级在场 + 行为）：
 *   - resolveWindowsGitBinary：非 win32 恒 null（Unix 零回归边界）；
 *   - windowsGitCandidates：env 驱动（ProgramFiles / ProgramFiles(x86) /
 *     LOCALAPPDATA / USERPROFILE）+ 固定候选（chocolatey / MSYS2）；
 *   - memoize 同引用 + clearGitAvailabilityCache 一并清探测缓存。
 * 分层纪律：纯函数断言（无网络 / 无真实终端 / 不 exec）；本机非 win32 →
 * 平台门分支只走 null 路径，win32 分支留语义断言不锁值。
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import {
  clearGitAvailabilityCache,
  resolveWindowsGitBinary,
  windowsGitCandidates,
} from '../../src/tui/utils/plugins/gitAvailability.js'

/** env 恢复助手（原值 undefined 时删除键，还原 install 前状态）。 */
function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

describe('resolveWindowsGitBinary：Windows 安装位置探测（平台门）', () => {
  test('非 win32 恒 null（Unix 零回归边界）', () => {
    if (process.platform !== 'win32') {
      expect(resolveWindowsGitBinary()).toBeNull()
    } else {
      // 真 Windows 宿主：命中返路径 / 未命中 null，但绝不抛
      const r = resolveWindowsGitBinary()
      expect(r === null || typeof r === 'string').toBe(true)
    }
  })

  test('memoize：重复调用同引用', () => {
    const a = resolveWindowsGitBinary()
    const b = resolveWindowsGitBinary()
    expect(a === b).toBe(true)
  })

  test('clearGitAvailabilityCache 一并清探测缓存', () => {
    resolveWindowsGitBinary()
    expect(resolveWindowsGitBinary.cache?.has?.(undefined)).toBe(true)
    clearGitAvailabilityCache()
    expect(resolveWindowsGitBinary.cache?.has?.(undefined)).toBe(false)
  })
})

describe('windowsGitCandidates：候选列表（env 驱动 + 常见安装位置）', () => {
  test('固定候选：chocolatey + MSYS2（不依赖 env）', () => {
    const c = windowsGitCandidates()
    expect(c).toContain('C:\\ProgramData\\chocolatey\\bin\\git.exe')
    expect(c).toContain('C:\\msys64\\usr\\bin\\git.exe')
  })

  test('MSI 双根 ×(cmd+bin) 由 ProgramFiles 双 env 派生', () => {
    const prevPf = process.env['ProgramFiles']
    const prevPf86 = process.env['ProgramFiles(x86)']
    process.env['ProgramFiles'] = 'X:\\PF'
    process.env['ProgramFiles(x86)'] = 'X:\\PF86'
    try {
      const c = windowsGitCandidates()
      expect(c).toContain(join('X:\\PF', 'Git', 'cmd', 'git.exe'))
      expect(c).toContain(join('X:\\PF', 'Git', 'bin', 'git.exe'))
      expect(c).toContain(join('X:\\PF86', 'Git', 'cmd', 'git.exe'))
      expect(c).toContain(join('X:\\PF86', 'Git', 'bin', 'git.exe'))
    } finally {
      restoreEnv('ProgramFiles', prevPf)
      restoreEnv('ProgramFiles(x86)', prevPf86)
    }
  })

  test('per-user / scoop 由 LOCALAPPDATA / USERPROFILE 派生（env 缺省不产候选）', () => {
    const prevLad = process.env['LOCALAPPDATA']
    const prevUp = process.env['USERPROFILE']
    delete process.env['LOCALAPPDATA']
    delete process.env['USERPROFILE']
    const bare = windowsGitCandidates()
    expect(bare).toHaveLength(6) // 2 根 ×2 + chocolatey + msys64
    process.env['LOCALAPPDATA'] = 'X:\\LAD'
    process.env['USERPROFILE'] = 'X:\\UP'
    try {
      const c = windowsGitCandidates()
      expect(c).toContain(join('X:\\LAD', 'Programs', 'Git', 'cmd', 'git.exe'))
      expect(c).toContain(join('X:\\UP', 'scoop', 'shims', 'git.exe'))
      expect(c).toHaveLength(8)
    } finally {
      restoreEnv('LOCALAPPDATA', prevLad)
      restoreEnv('USERPROFILE', prevUp)
    }
  })
})
