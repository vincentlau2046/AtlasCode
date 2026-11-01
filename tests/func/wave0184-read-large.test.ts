/**
 * 0.1.84 V3-5 K5-5 — allow_large 贯通普通文本 Read（func 层真盘矩阵）。
 *
 * 工单 §D 判别面：
 *  - 双门槛分离：同一文本普通请求明确超限——byte 门槛（>256KB，
 *    readFileInRange FileTooLargeError，读前抛）与 token 门槛（≤256KB 但
 *    >25000 估算 tokens，validateContentTokens MaxFileReadTokenExceededError，
 *    读后抛）分开锁，不能只放一半；
 *  - allow_large:true 一次返回完整内容含末尾 marker（新参数贯通到
 *    readFileInRange 与 token 检查，不只是 schema 展示）；
 *  - 字符串 'true' 不冒充（engine === true 判定 / TUI call 直调同判）；
 *  - offset/limit 显式提供仍按请求选择范围；
 *  - dedup 保守：allow_large:true 不消费普通模式 cache stub（该模式禁
 *    dedup），成功照常登记 readFileState（read-before-edit 前置不断）；
 *    失败不登记；isPartialView 条目失败路径不被覆盖；true→false 默认
 *    仍限；先 Write（offset=undefined 条目）后 true 全量；文件变化重读；
 *  - 非放宽面：设备/二进制/notebook byte 帽/图片路由一律不受 allow_large
 *    影响；abort 不绕过。
 *
 * fixture 尺寸依据（roughTokenCountEstimation = content.length/4，.txt
 * bytesPerToken=4）：BIG ≈ 300KB → ~75K tokens（双超）；TOKEN_ONLY ≈
 * 197KB → ~49K tokens（只超 token 门，byte 门不触发）。
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ReadTool } from '../../src/engine/tools'
import { FileReadTool } from '../../src/tui/tools/FileReadTool/FileReadTool'

// ── 夹具 ─────────────────────────────────────────────────────────────────

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wave0184-read-large-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const BIG_LINES = 5200
const FINAL_MARKER = 'FINAL-MARKER-zzz-end-of-file'

/** ~300KB：>256KB（byte 门）且 ~75K 估算 tokens（>25000 token 门）。 */
function bigContent(): string {
  const lines: string[] = []
  for (let i = 0; i < BIG_LINES - 1; i++) {
    lines.push(`line ${String(i).padStart(5, '0')} ${'x'.repeat(45)}`)
  }
  lines.push(FINAL_MARKER)
  return lines.join('\n')
}

/** ~197KB：<256KB（byte 门不触发）但 ~49K tokens（token 门触发）。 */
function tokenOnlyContent(): string {
  const lines: string[] = []
  for (let i = 0; i < 3400; i++) {
    lines.push(`t ${String(i).padStart(5, '0')} ${'y'.repeat(48)}`)
  }
  lines.push('TOKEN-ONLY-END-www')
  return lines.join('\n')
}

let bigPath: string
let tokenOnlyPath: string

function makeNotebook(sourceLen: number): string {
  const p = join(dir, `nb-${sourceLen}.ipynb`)
  const nb = {
    cells: [
      {
        cell_type: 'code',
        source: 'n'.repeat(sourceLen),
        outputs: [],
        execution_count: null,
        metadata: {},
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  }
  writeFileSync(p, JSON.stringify(nb))
  return p
}

type StateMap = Map<string, Record<string, unknown>>

function makeCtx(state?: StateMap): never {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      },
    }),
    abortController: new AbortController(),
    ...(state ? { readFileState: state } : {}),
  } as never
}

function makeTuiCtx(state?: StateMap): never {
  return {
    readFileState: state ?? new Map(),
    abortController: new AbortController(),
    dynamicSkillDirTriggers: new Set<string>(),
    nestedMemoryAttachmentTriggers: new Set<string>(),
  } as never
}

type TextOut = {
  data: {
    type: 'text'
    file: {
      filePath: string
      content: string
      numLines: number
      startLine: number
      totalLines: number
    }
  }
}

// ── engine：双门槛分离（普通请求明确超限）───────────────────────────────

describe('K5-5 engine 双门槛：普通请求超限（byte 门 / token 门分开锁）', () => {
  beforeAll(() => {
    bigPath = join(dir, 'big.txt')
    writeFileSync(bigPath, bigContent())
    tokenOnlyPath = join(dir, 'token-only.txt')
    writeFileSync(tokenOnlyPath, tokenOnlyContent())
  })

  test('byte 门：>256KB 文件普通全文读 → 读前 FileTooLargeError', async () => {
    expect(Buffer.byteLength(bigContent())).toBeGreaterThan(262144)
    await expect(
      ReadTool.call({ file_path: bigPath }, makeCtx()),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('token 门：≤256KB 但 >25000 估算 tokens → 读后超 tokens 错误', async () => {
    expect(Buffer.byteLength(tokenOnlyContent())).toBeLessThanOrEqual(262144)
    await expect(
      ReadTool.call({ file_path: tokenOnlyPath }, makeCtx()),
    ).rejects.toThrow(/exceeds maximum allowed tokens/)
  })
})

// ── engine：allow_large:true 全量 + 不冒充 ──────────────────────────────

describe('K5-5 engine allow_large:true：一次返回完整内容', () => {
  test('双超文件全量返回：numLines===totalLines、末尾 marker 在场', async () => {
    const result = (await ReadTool.call(
      { file_path: bigPath, allow_large: true },
      makeCtx(),
    )) as TextOut
    expect(result.data.type).toBe('text')
    expect(result.data.file.totalLines).toBe(BIG_LINES)
    expect(result.data.file.numLines).toBe(BIG_LINES)
    expect(result.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
    expect(result.data.file.content).toContain('line 00000')
  })

  test('token-only 文件全量返回（token 检查被解除）', async () => {
    const result = (await ReadTool.call(
      { file_path: tokenOnlyPath, allow_large: true },
      makeCtx(),
    )) as TextOut
    expect(result.data.type).toBe('text')
    expect(result.data.file.content.endsWith('TOKEN-ONLY-END-www')).toBe(true)
    expect(result.data.file.numLines).toBe(result.data.file.totalLines)
  })

  test('字符串 "true" 不冒充（照旧 byte 门拒绝）', async () => {
    await expect(
      ReadTool.call(
        { file_path: bigPath, allow_large: 'true' as unknown as boolean },
        makeCtx(),
      ),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('allow_large: false 显式 → 照旧拒绝（默认不变）', async () => {
    await expect(
      ReadTool.call({ file_path: bigPath, allow_large: false }, makeCtx()),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('offset/limit 显式提供仍按请求选择范围', async () => {
    const result = (await ReadTool.call(
      { file_path: bigPath, allow_large: true, offset: 100, limit: 5 },
      makeCtx(),
    )) as TextOut
    expect(result.data.file.startLine).toBe(100)
    expect(result.data.file.numLines).toBe(5)
    expect(result.data.file.content).toContain('line 00099')
    expect(result.data.file.content).not.toContain(FINAL_MARKER)
  })
})

// ── engine：安全复审硬化（flag 只治全量读；range 读保留 token 背压）────

describe('K5-5 安全复审硬化：allow_large 不放宽 range 读', () => {
  // 无界组合封死：range 读 byte 帽本来 undefined，若 flag 再跳过 token 门
  // → cap=undefined + 无 token 检查 = 无界读。硬化后 range 读无论 flag
  // 与否都走 token 门，行为与不带 flag 完全一致。
  test('flag + limit:1 读超限单行文件 → token 门照旧拒绝', async () => {
    const p = join(dir, 'single-line-huge.txt')
    writeFileSync(p, 'x'.repeat(300_000) + '\n')
    await expect(
      ReadTool.call({ file_path: p, allow_large: true, limit: 1 }, makeCtx()),
    ).rejects.toThrow(/exceeds maximum allowed tokens/)
  })

  test('flag + 大 limit 全量范围读双超文件 → token 门照旧拒绝', async () => {
    await expect(
      ReadTool.call(
        { file_path: bigPath, allow_large: true, limit: BIG_LINES },
        makeCtx(),
      ),
    ).rejects.toThrow(/exceeds maximum allowed tokens/)
  })
})

// ── engine：dedup/状态矩阵（readFileState duck）─────────────────────────

describe('K5-5 engine dedup/状态矩阵', () => {
  test('普通读失败不登记（抛错后 readFileState 无条目）', async () => {
    const state: StateMap = new Map()
    await expect(
      ReadTool.call({ file_path: bigPath }, makeCtx(state)),
    ).rejects.toThrow(/exceeds maximum allowed size/)
    expect(state.get(bigPath)).toBeUndefined()
  })

  test('partial → true：全量返回（不用 partial 的 stub），state 更新为完整读', async () => {
    const state: StateMap = new Map()
    // 普通 partial 读成功（选中范围小，两门槛都不触发）
    const partial = (await ReadTool.call(
      { file_path: tokenOnlyPath, offset: 1, limit: 10 },
      makeCtx(state),
    )) as TextOut
    expect(partial.data.file.numLines).toBe(10)
    expect(state.get(tokenOnlyPath)?.offset).toBe(1)
    expect(state.get(tokenOnlyPath)?.limit).toBe(10)
    // allow_large:true 全量：非 stub、完整末尾
    const full = (await ReadTool.call(
      { file_path: tokenOnlyPath, allow_large: true },
      makeCtx(state),
    )) as TextOut
    expect(full.data.type).toBe('text')
    expect(full.data.file.content.endsWith('TOKEN-ONLY-END-www')).toBe(true)
    expect(full.data.file.numLines).toBe(full.data.file.totalLines)
    // 成功照常登记为完整读（read-before-edit 前置不断）
    expect(state.get(tokenOnlyPath)?.offset).toBe(1)
    expect(state.get(tokenOnlyPath)?.limit).toBeUndefined()
  })

  test('true→false：allow_large 读后普通读不返回全量（stub 指针），mtime 变后恢复默认限', async () => {
    const state: StateMap = new Map()
    await ReadTool.call(
      { file_path: bigPath, allow_large: true },
      makeCtx(state),
    )
    // 同 mtime 普通读：dedup 命中 → file_unchanged 指针（非全量内容）
    const again = (await ReadTool.call(
      { file_path: bigPath },
      makeCtx(state),
    )) as { data: { type: string; file: { filePath: string } } }
    expect(again.data.type).toBe('file_unchanged')
    // 文件变化（mtime+内容）后普通读：默认限制恢复（明确超限，非全量）
    const now = new Date()
    utimesSync(bigPath, new Date(now.getTime() + 5000), new Date(now.getTime() + 5000))
    await expect(
      ReadTool.call({ file_path: bigPath }, makeCtx(state)),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('true ×2：同文件重复 allow_large 读仍全量（该模式禁 dedup）', async () => {
    const state: StateMap = new Map()
    const first = (await ReadTool.call(
      { file_path: bigPath, allow_large: true },
      makeCtx(state),
    )) as TextOut
    expect(first.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
    const second = (await ReadTool.call(
      { file_path: bigPath, allow_large: true },
      makeCtx(state),
    )) as TextOut
    expect(second.data.type).toBe('text')
    expect(second.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
    expect(second.data.file.numLines).toBe(second.data.file.totalLines)
  })

  test('先 Write（offset=undefined 条目）后 true：全量返回，不误指旧内容', async () => {
    const state: StateMap = new Map()
    // Write/Edit 形条目：offset=undefined（dedup 本就不命中该形）
    state.set(bigPath, {
      content: 'post-write content',
      timestamp: Math.floor(Date.now() / 1000) + 10000,
      offset: undefined,
      limit: undefined,
    })
    const result = (await ReadTool.call(
      { file_path: bigPath, allow_large: true },
      makeCtx(state),
    )) as TextOut
    expect(result.data.type).toBe('text')
    expect(result.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
  })

  test('文件变化后 true 重读：返回新内容全量', async () => {
    const p = join(dir, 'changed.txt')
    writeFileSync(p, 'old start\n' + 'o'.repeat(280_000) + '\nold end')
    const first = (await ReadTool.call(
      { file_path: p, allow_large: true },
      makeCtx(),
    )) as TextOut
    expect(first.data.file.content).toContain('old end')
    writeFileSync(p, 'new start\n' + 'n'.repeat(280_000) + '\nnew end')
    const second = (await ReadTool.call(
      { file_path: p, allow_large: true },
      makeCtx(),
    )) as TextOut
    expect(second.data.file.content).toContain('new start')
    expect(second.data.file.content).toContain('new end')
    expect(second.data.file.content).not.toContain('old end')
  })

  test('失败不覆盖 isPartialView 条目（ENOENT 后原样保留）', async () => {
    const state: StateMap = new Map()
    const missing = join(dir, 'does-not-exist.txt')
    state.set(missing, {
      content: 'partial view content',
      timestamp: 1,
      offset: undefined,
      limit: undefined,
      isPartialView: true,
    })
    await expect(
      ReadTool.call({ file_path: missing, allow_large: true }, makeCtx(state)),
    ).rejects.toThrow(/does not exist/)
    const entry = state.get(missing) as Record<string, unknown>
    expect(entry.isPartialView).toBe(true)
    expect(entry.content).toBe('partial view content')
  })
})

// ── engine：非放宽面 + abort ─────────────────────────────────────────────

describe('K5-5 engine 非放宽面：保护一律不受 allow_large 影响', () => {
  test('设备文件：validateInput 照拒（errorCode 9）', async () => {
    const r = await ReadTool.validateInput(
      { file_path: '/dev/zero', allow_large: true },
      makeCtx(),
    )
    expect(r.result).toBe(false)
    expect((r as { errorCode?: number }).errorCode).toBe(9)
  })

  test('二进制后缀：call 照拒', async () => {
    const p = join(dir, 'blob.zip')
    writeFileSync(p, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))
    await expect(
      ReadTool.call({ file_path: p, allow_large: true }, makeCtx()),
    ).rejects.toThrow(/binary/)
  })

  test('notebook byte 帽：>256KB ipynb 照拒（notebook 支不放宽）', async () => {
    const p = makeNotebook(280_000)
    await expect(
      ReadTool.call({ file_path: p, allow_large: true }, makeCtx()),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('图片路由：allow_large 不改道（空 png 走 image 支报空图）', async () => {
    const p = join(dir, 'empty.png')
    writeFileSync(p, '')
    await expect(
      ReadTool.call({ file_path: p, allow_large: true }, makeCtx()),
    ).rejects.toThrow(/Image file is empty/)
  })

  test('abort 不绕过（pre-aborted signal → 读前拒绝）', async () => {
    const ctx = makeCtx() as unknown as { abortController: AbortController }
    ctx.abortController.abort()
    await expect(
      ReadTool.call({ file_path: bigPath, allow_large: true }, ctx as never),
    ).rejects.toThrow()
  })
})

// ── TUI 双体：行为面同构 ────────────────────────────────────────────────

describe('K5-5 TUI 双体：allow_large 行为', () => {
  test('普通读 >256KB → byte 门拒绝', async () => {
    await expect(
      FileReadTool.call({ file_path: bigPath } as never, makeTuiCtx()),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('allow_large:true → 全量返回（末尾 marker + 行数全等）', async () => {
    const result = (await FileReadTool.call(
      { file_path: bigPath, allow_large: true } as never,
      makeTuiCtx(),
    )) as TextOut
    expect(result.data.type).toBe('text')
    expect(result.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
    expect(result.data.file.numLines).toBe(result.data.file.totalLines)
  })

  test('字符串 "true" 直调 call 不冒充', async () => {
    await expect(
      FileReadTool.call(
        { file_path: bigPath, allow_large: 'true' } as never,
        makeTuiCtx(),
      ),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  test('true ×2 仍全量（TUI dedup 同禁该模式）', async () => {
    const state: StateMap = new Map()
    for (let i = 0; i < 2; i++) {
      const result = (await FileReadTool.call(
        { file_path: bigPath, allow_large: true } as never,
        makeTuiCtx(state),
      )) as TextOut
      expect(result.data.type).toBe('text')
      expect(result.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
    }
  })

  test('普通读抛后 true → 全量（状态不被失败污染）', async () => {
    const state: StateMap = new Map()
    await expect(
      FileReadTool.call({ file_path: bigPath } as never, makeTuiCtx(state)),
    ).rejects.toThrow(/exceeds maximum allowed size/)
    expect(state.get(bigPath)).toBeUndefined()
    const result = (await FileReadTool.call(
      { file_path: bigPath, allow_large: true } as never,
      makeTuiCtx(state),
    )) as TextOut
    expect(result.data.file.content.endsWith(FINAL_MARKER)).toBe(true)
  })

  test('offset/limit 显式仍选范围', async () => {
    const result = (await FileReadTool.call(
      { file_path: bigPath, allow_large: true, offset: 7, limit: 3 } as never,
      makeTuiCtx(),
    )) as TextOut
    expect(result.data.file.startLine).toBe(7)
    expect(result.data.file.numLines).toBe(3)
  })
})
