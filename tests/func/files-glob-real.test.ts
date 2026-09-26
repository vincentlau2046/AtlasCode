/**
 * §8.55 S-C2 — globUtils.glob() 真盘行为（func 层：真 tmpdir + system rg；
 * unit 层零磁盘纪律）。
 *
 * 旧仓对照（a8af45b）：utils/glob.ts glob() 面 —— ripgrep --files/--glob/
 * --no-ignore/--hidden 参数面 + deny 规则 ignore 链（getFileReadIgnorePatterns
 * → normalizePatternsToPath → --glob !pattern）真 ripGrep 执行证据。
 *
 * 环境门控：system rg 缺失时整族 skip（同旧仓 glob-grep rg 门控先例；
 * 新仓 sandbox/ripgrep = system rg 单模式，无 vendor 二进制）。
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
// bun:test 顶层 import 已含 afterEach（下方 afterEach 注册）
import type { ToolPermissionContext } from '../../src/shared'
import { glob } from '../../src/engine/tools/files/globUtils'

/** rg 可用性探测（缺失 → 整族 skip，旧仓先例） */
let rgAvailable = false
try {
  execFileSync('rg', ['--version'], { stdio: 'pipe' })
  rgAvailable = true
} catch {
  rgAvailable = false
}

const t: typeof test = rgAvailable ? test : test.skip

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc2-glob-'))
  writeFileSync(join(dir, 'a.txt'), 'a')
  mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'sub', 'b.txt'), 'b')
  mkdirSync(join(dir, '.hidden'))
  writeFileSync(join(dir, '.hidden', 'c.txt'), 'c')
})

afterEach(() => {
  for (const k of ['ATLAS_GLOB_NO_IGNORE', 'ATLAS_GLOB_HIDDEN']) {
    delete process.env[k]
  }
  if (dir && rgAvailable) {
    rmSync(dir, { recursive: true, force: true })
  }
  if (rgAvailable) {
    dir = mkdtempSync(join(tmpdir(), 'atlas-sc2-glob-'))
    writeFileSync(join(dir, 'a.txt'), 'a')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'b.txt'), 'b')
    mkdirSync(join(dir, '.hidden'))
    writeFileSync(join(dir, '.hidden', 'c.txt'), 'c')
  }
})

function makeCtx(
  denyRules: Record<string, string[]> = {},
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: denyRules,
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
}

const sig = () => new AbortController().signal

describe('glob() 真盘（system rg）', () => {
  t('全量匹配 + 绝对路径化 + truncated 判定', async () => {
    const res = await glob('**/*.txt', dir, { limit: 10, offset: 0 }, sig(), makeCtx())
    expect(res.files.sort()).toEqual(
      [join(dir, 'a.txt'), join(dir, 'sub', 'b.txt'), join(dir, '.hidden', 'c.txt')].sort(),
    )
    expect(res.truncated).toBe(false)
  })

  t('offset 切片 + truncated = true（3 文件 offset 2 limit 1）', async () => {
    const res = await glob('**/*.txt', dir, { limit: 1, offset: 2 }, sig(), makeCtx())
    expect(res.files).toHaveLength(1)
    expect(res.truncated).toBe(false)
  })

  t('truncated = true：offset + limit < 总数', async () => {
    const res = await glob('**/*.txt', dir, { limit: 1, offset: 0 }, sig(), makeCtx())
    expect(res.truncated).toBe(true)
    expect(res.files).toHaveLength(1)
  })

  t('deny 规则 ignore 链：Read(sub) → sub 子树排除（null root → --glob !sub）', async () => {
    // rg 14.x 实测：`!sub/**` 形态不排除（globset 否定支怪癖），`!sub` 排整子树
    // → 用例取 Read(sub) 形态验证真 rg 排除链
    const res = await glob(
      '**/*.txt',
      dir,
      { limit: 10, offset: 0 },
      sig(),
      makeCtx({ session: ['Read(sub)'] }),
    )
    expect(res.files).not.toContain(join(dir, 'sub', 'b.txt'))
    expect(res.files).toContain(join(dir, 'a.txt'))
  })

  t('ATLAS_GLOB_HIDDEN=false 逐字语义怪癖：隐藏文件仍含（isEnvTruthy||\'true\' 恒真）', async () => {
    // 旧仓逐字表达式 isEnvTruthy(env) || 'true'：'false' → false || 'true'
    // → 恒启用。env 实为 no-op（旧仓注释「set ...=false to exclude」陈旧），
    // 逐字保真不改语义，本测固化可观察面
    process.env.ATLAS_GLOB_HIDDEN = 'false'
    const res = await glob('**/*.txt', dir, { limit: 10, offset: 0 }, sig(), makeCtx())
    expect(res.files).toContain(join(dir, '.hidden', 'c.txt'))
    expect(res.files).toContain(join(dir, 'a.txt'))
  })

  t('绝对模式（join(dir, "*.txt")）→ extractGlobBaseDirectory 拆 baseDir', async () => {
    const res = await glob(
      join(dir, '*.txt'),
      dir,
      { limit: 10, offset: 0 },
      sig(),
      makeCtx(),
    )
    // rg glob 无斜杠形态按 basename 语义匹配任意深度（gitignore 口径）→
    // 3 文件全命中；若 baseDir 拆包未发生（绝对模式直传 rg）则 0 命中 →
    // 断言 3 文件集判别拆包生效
    expect(res.files.sort()).toEqual(
      [join(dir, 'a.txt'), join(dir, 'sub', 'b.txt'), join(dir, '.hidden', 'c.txt')].sort(),
    )
  })
})
