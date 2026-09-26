/**
 * §8.55 S-C4 — GlobTool/GrepTool 本体真盘行为（func 层：真 tmpdir + system
 * rg；unit 层零磁盘纪律）。
 *
 * 旧仓对照（a8af45b）：src/tools/{GlobTool,GrepTool} call 面 —— GlobTool
 * = glob + toRelativePath + globLimits?.maxResults ?? 100；GrepTool =
 * ripGrep 3 mode（content 逐行 relativize + applyHeadLimit / files_with_
 * matches allSettled stat + sort / count lastIndexOf 解析）真 ripGrep 执行
 * 证据。
 *
 * 探针（S-C7 消费）：
 *  - **P-C1 探针锚点**（GrepTool call 入口 semantic 运行时转换，delta ②）：
 *    head_limit "30" 字符串输入 → data.appliedLimit toBe(30)（number，
 *    strict ===）。突变（删 call 入口 semanticToNumber 转换）→ head_limit
 *    保持字符串 "30" → appliedLimit "30"（string）→ 恰 1 红。
 *
 * 环境门控：system rg 缺失时整族 skip（同 S-C2 files-glob-real rg 门控
 * 先例；新仓 sandbox/ripgrep = system rg 单模式，无 vendor 二进制）。
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import type { ToolPermissionContext, ToolResult } from '../../src/shared'
import { GlobTool, GrepTool, type GrepOutput } from '../../src/engine/tools'
import type { FilesToolUseContext } from '../../src/engine/tools'

/** rg 可用性探测（缺失 → 整族 skip，旧仓 / S-C2 先例） */
let rgAvailable = false
try {
  execFileSync('rg', ['--version'], { stdio: 'pipe' })
  rgAvailable = true
} catch {
  rgAvailable = false
}

const t: typeof test = rgAvailable ? test : test.skip

let dir: string

/** 40 行含 "foo"（> head_limit 30）+ 两个单行 "foo" 文件。 */
function writeFixture() {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc4-grep-glob-'))
  const dataLines: string[] = []
  for (let i = 1; i <= 40; i++) dataLines.push(`line ${i} foo`)
  writeFileSync(join(dir, 'data.txt'), dataLines.join('\n') + '\n')
  writeFileSync(join(dir, 'a.txt'), 'foo\n')
  writeFileSync(join(dir, 'b.log'), 'foo\n')
}

beforeAll(() => {
  if (rgAvailable) writeFixture()
})

afterEach(() => {
  if (!rgAvailable) return
  rmSync(dir, { recursive: true, force: true })
  writeFixture()
})

function makeFilesCtx(
  denyRules: Record<string, string[]> = {},
  globLimits?: { maxResults?: number },
): FilesToolUseContext {
  const toolPermissionContext = {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: denyRules,
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
  const ctx: FilesToolUseContext = {
    getAppState: () => ({ toolPermissionContext }),
    abortController: new AbortController(),
  }
  if (globLimits) ctx.globLimits = globLimits
  return ctx
}

/** fixture 在 tmpdir（repo cwd 之外）→ toRelativePath 回退绝对路径。 */
describe('GlobTool.call 真盘（system rg）', () => {
  t('全量 **/*.txt → 2 文件 + truncated false + 绝对路径回退', async () => {
    const res: ToolResult<unknown> = await GlobTool.call(
      { pattern: '**/*.txt', path: dir },
      makeFilesCtx(),
    )
    const data = res.data as {
      filenames: string[]
      numFiles: number
      truncated: boolean
    }
    expect(data.filenames.sort()).toEqual(
      [join(dir, 'a.txt'), join(dir, 'data.txt')].sort(),
    )
    expect(data.numFiles).toBe(2)
    expect(data.truncated).toBe(false)
  })

  t('globLimits.maxResults 上限：maxResults 1 → truncated true', async () => {
    const res: ToolResult<unknown> = await GlobTool.call(
      { pattern: '**/*.txt', path: dir },
      makeFilesCtx({}, { maxResults: 1 }),
    )
    const data = res.data as { filenames: string[]; truncated: boolean }
    expect(data.filenames).toHaveLength(1)
    expect(data.truncated).toBe(true)
  })
})

describe('GrepTool.call 真盘（system rg）', () => {
  t('P-C1 探针：content mode + head_limit "30"（string）→ appliedLimit toBe(30)（number）', async () => {
    // P-C1 锚点：字符串 "30" 经 call 入口 semanticToNumber → number 30。
    // 突变（删转换）→ appliedLimit 保持 string "30" → toBe(30) 恰 1 红。
    const res: ToolResult<GrepOutput> = await GrepTool.call(
      {
        pattern: 'foo',
        path: dir,
        output_mode: 'content',
        head_limit: '30',
      },
      makeFilesCtx(),
    )
    expect(res.data?.appliedLimit).toBe(30)
    expect(res.data?.numLines).toBe(30)
    expect(res.data?.mode).toBe('content')
  })

  t('files_with_matches（默认）→ 3 文件 + appliedLimit undefined（<250 不截断）', async () => {
    const res: ToolResult<GrepOutput> = await GrepTool.call(
      { pattern: 'foo', path: dir },
      makeFilesCtx(),
    )
    expect(res.data?.mode).toBe('files_with_matches')
    expect(res.data?.filenames.sort()).toEqual(
      [join(dir, 'a.txt'), join(dir, 'b.log'), join(dir, 'data.txt')].sort(),
    )
    expect(res.data?.numFiles).toBe(3)
    expect(res.data?.appliedLimit).toBeUndefined()
  })

  t('count mode → numMatches 42 + numFiles 3', async () => {
    // data.txt 40 行 + a.txt 1 行 + b.log 1 行 = 42（rg -c 数匹配行）
    const res: ToolResult<GrepOutput> = await GrepTool.call(
      { pattern: 'foo', path: dir, output_mode: 'count' },
      makeFilesCtx(),
    )
    expect(res.data?.mode).toBe('count')
    expect(res.data?.numMatches).toBe(42)
    expect(res.data?.numFiles).toBe(3)
  })
})
