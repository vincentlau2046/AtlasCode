/**
 * permissions 域 func 真盘测试（C-Deep 切片 3 T7 · H6 真盘面）
 *
 * §8.16 T7 口径：func 真盘验 getProjectTempDir / getAtlasTempDir realpath 链 +
 * 轻量 getPathsForPermissionCheck 单级 realpath（经 checkRead 对真存在文件触发）。
 * 分层纪律：func 层真 fs（mkdtemp / realpath / 建目录 / 读文件），与 unit 零磁盘
 * 层互补（unit 用假 tool.getPath 不触 fs，本层触真 fs 验 realpath 链不崩 + 决议对）。
 *
 * getAtlasTempDir 模块级 memoize：ATLAS_TMPDIR 须先于首调设置（--isolate 每文件
 * 新进程，memo 初始未定形），本文件顶层设 env 后首调拾取。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  rmSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
  getAtlasTempDir,
  getAtlasTempDirName,
  getProjectTempDir,
  checkReadPermissionForTool,
  type PermissionTool,
} from '../../src/permissions'
import type { ToolPermissionContext } from '../../src/shared'

// ── 真盘 fixture（顶层建，先于 getAtlasTempDir 首调设 ATLAS_TMPDIR）────────
const realTmp = mkdtempSync(join(tmpdir(), 'atlas-perm-func-'))
process.env.ATLAS_TMPDIR = realTmp
const projDir = join(realTmp, 'proj')
mkdirSync(projDir, { recursive: true })
const realFile = join(projDir, 'a.txt')
writeFileSync(realFile, 'hello')

function makeContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}
const readTool: PermissionTool = {
  name: 'Read',
  getPath: input => input.file_path as string,
}

beforeAll(() => {
  setPermissionsBootstrapEnv({ getOriginalCwd: () => projDir, getCwd: () => projDir })
})
afterAll(() => {
  resetPermissionsBootstrapEnv()
  delete process.env.ATLAS_TMPDIR
  rmSync(realTmp, { recursive: true, force: true })
})

describe('getAtlasTempDir realpath 链', () => {
  test('= realpath(ATLAS_TMPDIR)/<atlasTempDirName>/（带尾分隔符，解析符号链接）', () => {
    const d = getAtlasTempDir()
    expect(d.endsWith('/')).toBe(true)
    expect(d).toContain(getAtlasTempDirName())
    // realpath 链：base 段 = realpathSync(真 ATLAS_TMPDIR)（macOS /tmp→/private/tmp 亦命中）
    const baseResolved = realpathSync(realTmp)
    expect(d.startsWith(baseResolved + '/')).toBe(true)
  })
})

describe('getProjectTempDir 真目录可建', () => {
  test('= <atlasTempDir>/<sanitized-cwd>/（realpath 可解析）', () => {
    const ptd = getProjectTempDir()
    expect(ptd.startsWith(getAtlasTempDir())).toBe(true)
    mkdirSync(ptd, { recursive: true })
    expect(realpathSync(ptd)).toBeDefined()
  })
})

describe('getPathsForPermissionCheck 单级 realpath（经 checkRead 真文件触发）', () => {
  test('工作目录内真存在文件 → allow（realpath 链不崩、决议正确）', () => {
    const decision = checkReadPermissionForTool(
      readTool,
      { file_path: realFile },
      makeContext(),
    )
    expect(decision.behavior).toBe('allow')
  })
})
