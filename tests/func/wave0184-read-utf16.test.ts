/**
 * 0.1.84 V3-5 K5-3 — UTF-16LE Read 正确解码（func 层真盘）。
 *
 * 上游 303：readFileInRange 快/流两路径都按 UTF-8 解码——UTF-16LE 文件
 * （Windows notepad/PowerShell Out-File 常见产物）整篇读成乱码；字节记账
 * 把解码后字符串的 UTF-8 字节当源字节（BOM 文件 totalBytes 漏 3B；LE 文件
 * 源/输出 2:1 混淆）。
 *
 * 判别面（双体 = src/memory/readFileInRange.ts + src/tui/utils/
 * readFileInRange.ts 逐字 twin）：
 *  - 快路径：LE BOM 识别 → decodeTextLosslessly 解码 → 按解码后 LF 划行、
 *    剥初始 BOM；totalBytes=源字节、readBytes=输出 UTF-8 字节；
 *  - 流路径（>10MB 真盘 + fastPathMaxBytes/streamChunkBytes 双 seam 补边界）：
 *    跨 chunk BOM/code unit/代理项不丢不重；byte 上限按源字节累计；
 *  - offset/limit、abort、truncateOnByteLimit/maxBytes 分支；
 *  - UTF-8 BOM/无 BOM 既有容错回归（不顺带改普通 UTF-8 面语义）；
 *  - engine ReadTool.call 端到端：文本支产出正确解码内容（用户可见症状）。
 *
 * RED 基线（05ec0bc+Task A）：LE fixture 全部读成 U+FFFD 乱码、
 * totalBytes 按错误口径；UTF-8 BOM totalBytes=3（漏 BOM 源字节）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  FileTooLargeError,
  readFileInRange,
} from '../../src/memory/readFileInRange'
import {
  readFileInRange as tuiReadFileInRange,
} from '../../src/tui/utils/readFileInRange'
import { ReadTool } from '../../src/engine/tools'

// ── 夹具 ─────────────────────────────────────────────────────────────────

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wave0184-utf16-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** UTF-16LE BOM + text 的源字节。 */
function leBytes(text: string): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(text, 'utf16le'),
  ])
}

function writeFixture(name: string, bytes: Buffer): string {
  const p = join(dir, name)
  writeFileSync(p, bytes)
  return p
}

const LE_TEXT = '第一行\r\nlíne 😀 two\nlast no newline'

// ── 快路径（engine + TUI 双体）───────────────────────────────────────────

describe('readFileInRange 快路径：LE BOM 正确解码', () => {
  let p: string
  beforeAll(() => {
    p = writeFixture('le-main.txt', leBytes(LE_TEXT))
  })

  test('engine：解码内容/划行/剥 BOM/源字节口径', async () => {
    const r = await readFileInRange(p)
    const expected = '第一行\nlíne 😀 two\nlast no newline'
    expect(r.content).toBe(expected)
    expect(r.lineCount).toBe(3)
    expect(r.totalLines).toBe(3)
    // 源字节 = LE 编码字节数（含 BOM），非 UTF-8 输出字节数
    expect(r.totalBytes).toBe(leBytes(LE_TEXT).length)
    expect(r.readBytes).toBe(Buffer.byteLength(expected, 'utf8'))
  })

  test('engine：offset/limit 按解码后行选择', async () => {
    const r = await readFileInRange(p, 1, 1)
    expect(r.content).toBe('líne 😀 two')
    expect(r.lineCount).toBe(1)
    expect(r.totalLines).toBe(3)
  })

  test('TUI twin：同 fixture 深等值（逐字同构）', async () => {
    const engine = await readFileInRange(p)
    const tui = await tuiReadFileInRange(p)
    expect(tui).toEqual(engine)
  })

  test('仅 BOM 文件（FF FE）→ 空内容单空行', async () => {
    const empty = writeFixture('le-empty.txt', Buffer.from([0xff, 0xfe]))
    const r = await readFileInRange(empty)
    expect(r.content).toBe('')
    expect(r.totalBytes).toBe(2)
    expect(r.readBytes).toBe(0)
  })
})

describe('readFileInRange 快路径：既有 UTF-8 面回归', () => {
  test('UTF-8 BOM：content 剥 BOM、totalBytes 含 BOM 源字节', async () => {
    const p = writeFixture(
      'utf8-bom.txt',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\nb')]),
    )
    const r = await readFileInRange(p)
    expect(r.content).toBe('a\nb')
    expect(r.totalBytes).toBe(6) // 3B BOM + 3B 文本 = 源字节
  })

  test('普通 UTF-8 无 BOM：语义不变', async () => {
    const p = writeFixture('utf8-plain.txt', Buffer.from('hello\nwörld', 'utf8'))
    const r = await readFileInRange(p)
    expect(r.content).toBe('hello\nwörld')
    expect(r.totalBytes).toBe(12) // hello(5) + \n(1) + w(1) + ö(2) + rld(3)
  })
})

describe('readFileInRange 快路径：maxBytes 分支（LE）', () => {
  test('无 truncate：源字节超限 → FileTooLargeError', async () => {
    const p = writeFixture('le-ascii.txt', leBytes('x'.repeat(100)))
    // 源字节 202 > 150（若误按 UTF-8 输出 100 计则不会抛——口径判别锚）
    await expect(readFileInRange(p, 0, undefined, 150)).rejects.toBeInstanceOf(
      FileTooLargeError,
    )
  })

  test('truncate：输出 UTF-8 字节封顶 + truncatedByBytes + 源字节口径', async () => {
    const p = writeFixture('le-trunc.txt', leBytes('aaa\nbbb\nccc\n'))
    const r = await readFileInRange(p, 0, undefined, 8, undefined, {
      truncateOnByteLimit: true,
    })
    expect(r.content).toBe('aaa\nbbb') // 7B ≤ 8B，ccc 行溢出截断
    expect(r.readBytes).toBe(7)
    expect(r.truncatedByBytes).toBe(true)
    expect(r.totalBytes).toBe(26) // 2B BOM + 12 字符 × 2B
  })
})

// ── 流路径（seam 强制 + >10MB 真盘）─────────────────────────────────────

describe('readFileInRange 流路径：LE 跨 chunk 不丢不重', () => {
  // fastPathMaxBytes/streamChunkBytes = 测试 seam（工单 §B「可用小 chunk
  // seam 补边界」）：3B chunk 使 BOM/码元/代理项全跨 chunk。
  const SEAM = { fastPathMaxBytes: 8, streamChunkBytes: 3 }

  test('微 chunk：BOM/代理项跨 chunk 解码正确 + 源字节口径', async () => {
    const text = '第一行😀\nsecond 世\n'
    const p = writeFixture('le-stream-small.txt', leBytes(text))
    const r = await readFileInRange(p, 0, undefined, undefined, undefined, SEAM)
    expect(r.content).toBe('第一行😀\nsecond 世\n')
    expect(r.lineCount).toBe(3) // 两行 + 尾 LF 空行（既有划行语义）
    expect(r.totalLines).toBe(3)
    expect(r.totalBytes).toBe(leBytes(text).length)
    expect(r.readBytes).toBe(Buffer.byteLength('第一行😀\nsecond 世\n', 'utf8'))
  })

  test('流路径 byte 上限按源字节累计（非 UTF-8 输出）', async () => {
    const p = writeFixture('le-stream-cap.txt', leBytes('x'.repeat(100)))
    await expect(
      readFileInRange(p, 0, undefined, 150, undefined, SEAM),
    ).rejects.toBeInstanceOf(FileTooLargeError)
  })

  test('流路径 abort → 拒绝', async () => {
    const p = writeFixture('le-stream-abort.txt', leBytes('y'.repeat(100)))
    const ac = new AbortController()
    const promise = readFileInRange(
      p,
      0,
      undefined,
      undefined,
      ac.signal,
      SEAM,
    )
    queueMicrotask(() => ac.abort())
    await expect(promise).rejects.toThrow()
  })

  test('>10MB 真盘：默认选项走流路径，头部行正确解码', async () => {
    const header = '第一行😀 header\r\n'
    const headerBytes = Buffer.from(header, 'utf16le')
    const line = Buffer.from('filler line 线程 padding padding padding\n', 'utf16le')
    const target = 11 * 1024 * 1024
    const n = Math.ceil((target - 2 - headerBytes.length) / line.length)
    const buf = Buffer.alloc(2 + headerBytes.length + n * line.length)
    buf[0] = 0xff
    buf[1] = 0xfe
    headerBytes.copy(buf, 2)
    for (let i = 0; i < n; i++) {
      line.copy(buf, 2 + headerBytes.length + i * line.length)
    }
    const p = writeFixture('le-big.txt', buf)

    const r = await readFileInRange(p, 0, 1)
    expect(r.content).toBe('第一行😀 header')
    expect(r.lineCount).toBe(1)
    expect(r.totalBytes).toBe(buf.length)
    expect(r.readBytes).toBe(Buffer.byteLength('第一行😀 header', 'utf8'))
    // 行数核算：头行 + n 填充行 + 尾 LF 空行
    expect(r.totalLines).toBe(n + 2)
  }, 30_000)
})

// ── 端到端：engine ReadTool.call 文本支 ──────────────────────────────────

describe('ReadTool.call 端到端：LE 文件不再乱码（用户可见症状）', () => {
  test('call → text 输出正确解码内容', async () => {
    const p = writeFixture('le-e2e.txt', leBytes('héllo 世界\nsecond line\n'))
    const ctx = {
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
    } as never
    const result = (await ReadTool.call({ file_path: p }, ctx)) as {
      data: {
        type: 'text'
        file: { content: string; numLines: number; totalLines: number }
      }
    }
    expect(result.data.type).toBe('text')
    expect(result.data.file.content).toContain('héllo 世界')
    expect(result.data.file.content).toContain('second line')
    expect(result.data.file.numLines).toBe(3) // 两行 + 尾 LF 空行
  })
})
