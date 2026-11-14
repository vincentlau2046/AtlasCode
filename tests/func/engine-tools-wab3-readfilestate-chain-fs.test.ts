/**
 * 0.1.109 W-AB3 ②支链修 func 层判别格（f4 §8 批复 @8ab690ca + §8b 改形批复
 * @feced92a；定谳报告 user-e2e/reports/r-20261114-wab3-rootcause.md）。
 *
 * 根因面（候选②定谳）：headless makeCtx 窄视图缺 readFileState 槽 →
 * engine 四文件工具可选链静默降级——Read `?.set` no-op 落键蒸发 +
 * Edit `?.get` 恒空 = 恒「未读」支（errorCode 6 死循环，T01 wire 直证）。
 * 修形 = print.ts run 级 cli 域 bounded duck cache 注入（门体零触碰；
 * §8b：cli→tui 被 boundaries 拦截 → createHeadlessFileStateCache）。
 *
 * 真盘原因（unit 零盘纪律同 notebook-se2-fs 先例）：read-first 门可达
 * 需既有磁盘文件（validateInput 内 readFileSyncWithMetadata 先行），
 * Read dedup 需真 mtime。
 *
 * 判别腿（工单 §3 判据格映射）：
 *  - 格 2(a) 已 Read 零阻：ReadTool.call（ctx 带 cache）→ EditTool.
 *    validateInput 同 cache → 非 errorCode 6（read-first 门过，正确
 *    old_string 下 result true）。
 *  - 格 3(b) 未读首犯拒链字节级不变：空 cache → errorCode 6 + 文案逐字
 *    （'File has not been read yet. Read it first before writing to it.'）。
 *  - 波及面 dedup 回归格（lock-face §2，K5-5 对表）：Read 二次同 range
 *    未变 → file_unchanged；ATLAS_DISABLE_READ_DEDUP=1 → 全量；allow_large
 *    禁 dedup（K5-5）→ 全量。
 *  - 波及面 Write stale 门复活：既有文件 Write 无读态 → FILE_UNEXPECTEDLY_
 *    MODIFIED_ERROR；Read 落键后 → 成功。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  EditTool,
  ReadTool,
  WriteTool,
  FILE_UNEXPECTEDLY_MODIFIED_ERROR,
} from '../../src/engine/tools'
import type { ReadFileState } from '../../src/engine/tools/files'
import {
  createHeadlessFileStateCache,
} from '../../src/cli/headlessFileStateCache.js'

let dir = ''
let filePath = ''
const FILE_BODY = '// Small fixture module for W-AB3 chain test.\nexport function a(s: string): string {\n  return s.trim();\n}\n'

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-wab3-chain-'))
  filePath = join(dir, 'utils.ts')
  writeFileSync(filePath, FILE_BODY)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.ATLAS_DISABLE_READ_DEDUP
})

/** headless makeCtx 注入后的等价 ctx（getAppState duck 最小面）。 */
function ctxWith(cache: ReadFileState): unknown {
  return {
    abortController: new AbortController(),
    getAppState: () => ({
      toolPermissionContext: {
        additionalWorkingDirectories: new Map(),
      },
    }),
    readFileState: cache,
  }
}

describe('W-AB3 ②支链修（readFileState headless 装配复活）', () => {
  test('格 2(a) 已 Read 零阻：Read 落键 → Edit validateInput 过 read-first 门', async () => {
    const cache = createHeadlessFileStateCache()
    const ctx = ctxWith(cache)
    const readOut = (await ReadTool.call({ file_path: filePath }, ctx)) as {
      data: { type: string }
    }
    expect(readOut.data.type).toBe('text')
    // Read 落键生效（修形前 = ?.set no-op 蒸发）
    expect(cache.get(filePath)).toBeDefined()
    const verdict = (await EditTool.validateInput(
      {
        file_path: filePath,
        old_string: 'export function a(',
        new_string: 'export function b(',
      },
      ctx,
    )) as { result: boolean; errorCode?: number }
    expect(verdict.result).toBe(true)
    expect(verdict.errorCode).toBeUndefined()
  })

  test('格 3(b) 未读首犯拒链不变：空 cache → errorCode 6 + 文案逐字', async () => {
    const cache = createHeadlessFileStateCache()
    const verdict = (await EditTool.validateInput(
      {
        file_path: filePath,
        old_string: 'export function a(',
        new_string: 'export function b(',
      },
      ctxWith(cache),
    )) as { result: boolean; errorCode?: number; message?: string }
    expect(verdict.result).toBe(false)
    expect(verdict.errorCode).toBe(6)
    expect(verdict.message).toBe(
      'File has not been read yet. Read it first before writing to it.',
    )
  })

  test('波及面 dedup 回归：二次同 range 未变 → file_unchanged（链修激活）', async () => {
    const cache = createHeadlessFileStateCache()
    const ctx = ctxWith(cache)
    await ReadTool.call({ file_path: filePath }, ctx)
    const second = (await ReadTool.call({ file_path: filePath }, ctx)) as {
      data: { type: string }
    }
    expect(second.data.type).toBe('file_unchanged')
  })

  test('波及面 dedup killswitch：ATLAS_DISABLE_READ_DEDUP=1 → 全量内容', async () => {
    process.env.ATLAS_DISABLE_READ_DEDUP = '1'
    const cache = createHeadlessFileStateCache()
    const ctx = ctxWith(cache)
    await ReadTool.call({ file_path: filePath }, ctx)
    const second = (await ReadTool.call({ file_path: filePath }, ctx)) as {
      data: { type: string }
    }
    expect(second.data.type).toBe('text')
  })

  test('波及面 K5-5 对表：allow_large 禁 dedup → 全量内容', async () => {
    const cache = createHeadlessFileStateCache()
    const ctx = ctxWith(cache)
    await ReadTool.call({ file_path: filePath }, ctx)
    const second = (await ReadTool.call(
      { file_path: filePath, allow_large: true },
      ctx,
    )) as { data: { type: string } }
    expect(second.data.type).toBe('text')
  })

  test('波及面 Write stale 门复活：无读态写既有文件 → 拒；Read 落键后 → 过', async () => {
    const cache = createHeadlessFileStateCache()
    // 无读态：修形前该面在 headless 不可达（?.get 恒 undefined 也拒）——
    // 本腿断言门体语义本身（有 cache 实例时行为与 TUI 对齐）。
    const noReadCtx = ctxWith(cache)
    let threw = ''
    try {
      await WriteTool.call(
        { file_path: filePath, content: 'export const x = 1\n' },
        noReadCtx,
      )
    } catch (e) {
      threw = (e as Error).message
    }
    expect(threw).toBe(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
    // Read 落键后：Write 成功（stale 门零误伤）
    await ReadTool.call({ file_path: filePath }, ctxWith(cache))
    const out = (await WriteTool.call(
      { file_path: filePath, content: 'export const x = 2\n' },
      ctxWith(cache),
    )) as unknown
    expect(out).toBeDefined()
    expect(readFileSync(filePath, 'utf8')).toBe('export const x = 2\n')
  })
})
