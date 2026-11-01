/**
 * 0.1.84 V3-5 K5-3/K5-4 — Write/Edit/NotebookEdit 写边界编码行为（func 真盘）。
 *
 * 工单 §C（docs/2026-11-01-p0-wave-0184-ticket.md）行为断言：
 *  - writeTextContent bom?:boolean 末尾可选参数：BOM 有且仅有一次，不让模型
 *    是否回传 U+FEFF 决定原编码标记；bom 缺省/false = 既有调用者零改动。
 *  - 真工具 Write 保留 UTF8/LE BOM（全量替换不丢原编码标记）；
 *  - 真工具 Edit 保留支持的 encoding/BOM/原行尾（连续编辑往返稳定）；
 *  - 新文件仍 UTF8 无自动 BOM；合法 Unicode 不丢；模型明确行尾保留
 *    （反全量 Write 自动 CRLF 复辟锁）；
 *  - 三工具 validate/call 对非法编码同一判别：validate 明确拒绝（文件
 *    sha256/大小/mtime 与 readFileState 不被更新）+ 直接 call 仍拒绝；
 *  - validate 与写之间不新增 await（TOCTOU 面：validate 过后文件被换非法
 *    编码 → call 拒；换合法内容 + mtime bump → stale 拒；并发删除 → call
 *    按新文件路径处理；既有 stale 门不被探针遮蔽）；
 *  - Notebook 既有 BOM JSON 拒绝策略不破（UTF8/LE 双面）+ 损坏 é fixture
 *    （宽容解码仍是合法 JSON、严格解码拒——303 二次损坏面）。
 *
 * RED 基线（4c118aa = Task B 后）：
 *  - RED：writeTextContent bom=true 族（基线 4 参签名，第 5 参被忽略 → 无
 *    BOM）；Write BOM 保留族（BOM 丢失 + readFileState 存模型原文与下次
 *    meta.content 含 BOM 头失配）；三工具 validate 拒绝族（Edit/Write 放行
 *    成 mojibake 比对或错误门、Notebook 裸 throw）。
 *  - 不变量（基线绿、修后仍绿）：bom 缺省/false 族；Edit BOM 往返（content
 *    内 ﻿ 头意外保全——修后改由 bom 标志显式保全）；call 拒绝族（Task
 *    B 已严格）；TOCTOU 族；Notebook BOM JSON 双面。
 */
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  EditTool,
  FILE_UNEXPECTEDLY_MODIFIED_ERROR,
  NotebookEditTool,
  WriteTool,
  type FileState,
  type FilesToolUseContext,
} from '../../src/engine/tools'
import type { ToolPermissionContext } from '../../src/shared'
import { writeTextContent } from '../../src/engine/tools/files/fileUtils'
import { writeTextContent as tuiWriteTextContent } from '../../src/tui/utils/file'

// ── 夹具 ─────────────────────────────────────────────────────────────────

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wave0184-mutation-'))
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

function makePermsCtx(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
}

function makeCtx(
  readFileState?: Map<string, FileState>,
): FilesToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: makePermsCtx() }),
    abortController: new AbortController(),
    ...(readFileState ? { readFileState } : {}),
  } as unknown as FilesToolUseContext
}

/** readFileState 条目：timestamp 在未来 → 不触发 stale 门（内容面测试用）。 */
function freshState(
  p: string,
  content: string,
): Map<string, FileState> {
  return new Map([
    [
      p,
      {
        content,
        timestamp: Date.now() + 10_000,
        offset: undefined,
        limit: undefined,
      },
    ],
  ])
}

/** readFileState 条目：timestamp = 当前文件 mtime（stale/TOCTOU 面测试用）。 */
function exactState(
  p: string,
  content: string,
): Map<string, FileState> {
  return new Map([
    [
      p,
      {
        content,
        timestamp: Math.floor(statSync(p).mtimeMs),
        offset: undefined,
        limit: undefined,
      },
    ],
  ])
}

/** 文件完整性快照：拒绝路径断言 sha256 级（字节）+ 大小 + mtime 全不变。 */
function snap(p: string) {
  const s = statSync(p)
  return { bytes: readFileSync(p), size: s.size, mtimeMs: s.mtimeMs }
}

function nbInput(p: string) {
  return {
    notebook_path: p,
    cell_id: 'c1',
    new_source: 'x',
    edit_mode: 'replace' as const,
  }
}

const NB_JSON =
  '{"cells":[{"id":"c1","cell_type":"code","source":["x"],"metadata":{},' +
  '"outputs":[],"execution_count":1}],"metadata":{},"nbformat":4,' +
  '"nbformat_minor":5}'

/** 损坏 é fixture：é=C3 A9 中 A9→0xFF。宽容 UTF-8 解码成 U+FFFD 后仍是
 * 合法 JSON（旧路径静默放行编辑 = 303 二次损坏面）；严格解码在字节层拒。 */
const CORRUPT_E_NB = Buffer.concat([
  Buffer.from('{"cells":[],"metadata":{"note":"na', 'utf8'),
  Buffer.from([0xc3, 0xff]),
  Buffer.from('ve"},"nbformat":4,"nbformat_minor":5}', 'utf8'),
])

// ── 非法编码 fixture 族（工单 §C）───────────────────────────────────────

const WIN1252 = Buffer.from([0x6e, 0x61, 0xef, 0x76, 0x65]) // "naïve" é=0xEF 裸字节
const SHIFTJIS = Buffer.from([
  0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd,
]) // "こんにちは"（0x82 孤立续字节）
const GBK = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]) // "中文"（0xD0 非 0xD6 合法续字节）
const UTF16BE = Buffer.from([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]) // "AB"
const LATE_4096 = Buffer.concat([
  Buffer.alloc(4096, 0x61),
  Buffer.from([0xff]),
]) // 前 4096B 合法 + 尾部 0xFF（采样窗外）

const INVALID_FIXTURES: Array<{
  name: string
  bytes: Buffer
  pattern: RegExp
}> = [
  { name: 'win1252', bytes: WIN1252, pattern: /Invalid UTF-8/ },
  { name: 'shiftjis', bytes: SHIFTJIS, pattern: /Invalid UTF-8/ },
  { name: 'gbk', bytes: GBK, pattern: /Invalid UTF-8/ },
  { name: 'utf16be', bytes: UTF16BE, pattern: /UTF-16BE/ },
  { name: 'late4096', bytes: LATE_4096, pattern: /Invalid UTF-8/ },
]

// ── writeTextContent BOM 矩阵（K5-4 Interfaces）─────────────────────────

describe('writeTextContent：bom 标志 = BOM 有且仅有一次', () => {
  test('bom=true 无 BOM 内容 → 头部恰好一个 EF BB BF', () => {
    const p = join(dir, 'wc-plain.txt')
    writeTextContent(p, 'hello', 'utf8', 'LF', true)
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('hello')
  })

  test('bom=true 模型回传单个 U+FEFF → 恰好一个（不双 BOM）', () => {
    const p = join(dir, 'wc-one.txt')
    writeTextContent(p, '﻿hello', 'utf8', 'LF', true)
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('hello')
    expect(b.length).toBe(3 + 5)
  })

  test('bom=true 双 U+FEFF 头 → 归一恰好一个', () => {
    const p = join(dir, 'wc-two.txt')
    writeTextContent(p, '﻿﻿hello', 'utf8', 'LF', true)
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('hello')
  })

  test('bom=true + utf16le + CJK → FF FE + LE 字节', () => {
    const p = join(dir, 'wc-le.txt')
    writeTextContent(p, '中文😀', 'utf16le', 'LF', true)
    const b = readFileSync(p)
    expect(b.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
    expect(b.subarray(2).toString('utf16le')).toBe('中文😀')
  })

  test('bom=true + CRLF → BOM 与行尾双保留', () => {
    const p = join(dir, 'wc-crlf.txt')
    writeTextContent(p, 'a\nb', 'utf8', 'CRLF', true)
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('a\r\nb')
  })

  test('bom=false → 不加不剥（content 中 U+FEFF 原样保留）', () => {
    const p = join(dir, 'wc-false.txt')
    writeTextContent(p, 'mid﻿char', 'utf8', 'LF', false)
    expect(readFileSync(p).toString('utf8')).toBe('mid﻿char')
  })

  test('bom 缺省（4 参旧调用面）→ 与 false 逐字节等价', () => {
    const p1 = join(dir, 'wc-omit1.txt')
    const p2 = join(dir, 'wc-omit2.txt')
    writeTextContent(p1, 'same', 'utf8', 'LF')
    writeTextContent(p2, 'same', 'utf8', 'LF', false)
    expect(readFileSync(p1).equals(readFileSync(p2))).toBe(true)
  })

  test('TUI twin：utf8 + CRLF + bom 与 engine 逐字节等值', () => {
    const p1 = join(dir, 'wc-tui-e.txt')
    const p2 = join(dir, 'wc-tui-t.txt')
    writeTextContent(p1, 'twin\r\nbody', 'utf8', 'CRLF', true)
    tuiWriteTextContent(p2, 'twin\r\nbody', 'utf8', 'CRLF', true)
    expect(readFileSync(p1).equals(readFileSync(p2))).toBe(true)
  })

  test('TUI twin：utf16le + bom 与 engine 逐字节等值', () => {
    const p1 = join(dir, 'wc-tui2-e.txt')
    const p2 = join(dir, 'wc-tui2-t.txt')
    writeTextContent(p1, '中文\r\n行', 'utf16le', 'CRLF', true)
    tuiWriteTextContent(p2, '中文\r\n行', 'utf16le', 'CRLF', true)
    expect(readFileSync(p1).equals(readFileSync(p2))).toBe(true)
  })
})

// ── Write 真工具：BOM 保留（RED 面）+ 既有行为不变量 ────────────────────

describe('WriteTool：全量替换保留原编码 BOM 标记', () => {
  test('UTF8-BOM 文件 → 替换后 BOM 仍在 + state 存含 BOM 头内容', async () => {
    const p = join(dir, 'w-utf8bom.txt')
    writeFileSync(
      p,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello')]),
    )
    const state = freshState(p, '﻿hello')
    const r = await WriteTool.call(
      { file_path: p, content: 'new content' },
      makeCtx(state),
    )
    expect(r.data.type).toBe('update')
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('new content')
    // state 与下次 readFileSyncWithMetadata 语义一致（content 含 ﻿ 头）
    expect(state.get(p)?.content).toBe('﻿new content')
  })

  test('LE-BOM 文件 → 替换后 FF FE 仍在 + LE 编码保留', async () => {
    const p = join(dir, 'w-lebom.txt')
    writeFileSync(p, leBytes('hello'))
    const state = freshState(p, '﻿hello')
    const r = await WriteTool.call(
      { file_path: p, content: 'new content' },
      makeCtx(state),
    )
    expect(r.data.type).toBe('update')
    const b = readFileSync(p)
    expect(b.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
    expect(b.subarray(2).toString('utf16le')).toBe('new content')
    expect(state.get(p)?.content).toBe('﻿new content')
  })

  test('连续两次 Write：BOM 稳定 + 二写不假阳性 stale', async () => {
    const p = join(dir, 'w-utf8bom-twice.txt')
    writeFileSync(
      p,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello')]),
    )
    const state = freshState(p, '﻿hello')
    const ctx = makeCtx(state)
    await WriteTool.call({ file_path: p, content: 'first' }, ctx)
    const r2 = await WriteTool.call({ file_path: p, content: 'second' }, ctx)
    expect(r2.data.type).toBe('update')
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('second')
    expect(state.get(p)?.content).toBe('﻿second')
  })

  test('新文件 → UTF8 无自动 BOM（不变量）', async () => {
    const p = join(dir, 'w-new.txt')
    const r = await WriteTool.call(
      { file_path: p, content: 'fresh' },
      makeCtx(new Map()),
    )
    expect(r.data.type).toBe('create')
    expect(readFileSync(p).toString('utf8')).toBe('fresh')
  })

  test('模型明确行尾保留（反全量 Write 自动 CRLF 复辟锁，不变量）', async () => {
    const p = join(dir, 'w-crlf.txt')
    writeFileSync(p, 'a\nb')
    const state = freshState(p, 'a\nb')
    await WriteTool.call({ file_path: p, content: 'x\r\ny' }, makeCtx(state))
    expect(readFileSync(p).toString('utf8')).toBe('x\r\ny')
  })

  test('合法 Unicode 不丢（不变量）', async () => {
    const p = join(dir, 'w-unicode.txt')
    writeFileSync(p, 'old')
    const state = freshState(p, 'old')
    const content = 'héllo 😀 中文'
    await WriteTool.call({ file_path: p, content }, makeCtx(state))
    expect(readFileSync(p).toString('utf8')).toBe(content)
  })

  test('模型回传 U+FEFF 头 + bom=true → 恰好一个 BOM（不变量）', async () => {
    const p = join(dir, 'w-modelbom.txt')
    writeFileSync(
      p,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hello')]),
    )
    const state = freshState(p, '﻿hello')
    await WriteTool.call(
      { file_path: p, content: '﻿new' },
      makeCtx(state),
    )
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('new')
    expect(state.get(p)?.content).toBe('﻿new')
  })
})

// ── Edit 真工具：encoding/BOM/行尾往返（不变量锁——基线靠 content 内
//    ﻿ 头意外保全，修后由 bom 标志显式保全）────────────────────────

describe('EditTool：encoding/BOM/原行尾全保留', () => {
  test('LE-BOM + CRLF 文件 → FF FE/LE/CRLF 全保留', async () => {
    const p = join(dir, 'e-le-crlf.txt')
    writeFileSync(p, leBytes('alpha\r\nbeta'))
    // Read 语义：content 含 ﻿ 头 + CRLF 已归一
    const state = freshState(p, '﻿alpha\nbeta')
    const r = await EditTool.call(
      { file_path: p, old_string: 'alpha', new_string: 'gamma' },
      makeCtx(state),
    )
    expect(r.data.newString).toBe('gamma')
    const b = readFileSync(p)
    expect(b.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]))
    expect(b.subarray(2).toString('utf16le')).toBe('gamma\r\nbeta')
    expect(state.get(p)?.content).toBe('﻿gamma\nbeta')
  })

  test('UTF8-BOM 文件 → 往返 BOM 仍在', async () => {
    const p = join(dir, 'e-utf8bom.txt')
    writeFileSync(
      p,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('hello world'),
      ]),
    )
    const state = freshState(p, '﻿hello world')
    await EditTool.call(
      { file_path: p, old_string: 'world', new_string: 'there' },
      makeCtx(state),
    )
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('hello there')
  })

  test('old_string 空串创建新文件 → UTF8 无自动 BOM（不变量）', async () => {
    const p = join(dir, 'e-new.txt')
    await EditTool.call(
      { file_path: p, old_string: '', new_string: 'brand new' },
      makeCtx(),
    )
    expect(readFileSync(p).toString('utf8')).toBe('brand new')
  })

  test('连续两次 Edit → BOM 恰好一个 + 往返稳定', async () => {
    const p = join(dir, 'e-twice.txt')
    writeFileSync(
      p,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('one two'),
      ]),
    )
    const state = freshState(p, '﻿one two')
    const ctx = makeCtx(state)
    await EditTool.call(
      { file_path: p, old_string: 'one', new_string: '1' },
      ctx,
    )
    await EditTool.call(
      { file_path: p, old_string: 'two', new_string: '2' },
      ctx,
    )
    const b = readFileSync(p)
    expect(b.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(b.subarray(3).toString('utf8')).toBe('1 2')
    expect(state.get(p)?.content).toBe('﻿1 2')
  })
})

// ── 三工具非法编码拒绝矩阵（validate RED + call 不变量 + 文件不动）─────

for (const fx of INVALID_FIXTURES) {
  describe(`非法编码拒绝矩阵：${fx.name}`, () => {
    test('Edit：validate 拒（errorCode 11）+ call 拒 + 文件与 state 不动', async () => {
      const p = join(dir, `rej-edit-${fx.name}.txt`)
      writeFileSync(p, fx.bytes)
      const state = freshState(p, '<previously read>')
      const before = snap(p)
      const v = await EditTool.validateInput(
        { file_path: p, old_string: 'a', new_string: 'b' },
        makeCtx(state),
      )
      expect(v.result).toBe(false)
      if (!v.result) {
        expect(v.message).toMatch(fx.pattern)
        expect(v.message).toMatch(/not modified/)
        expect(v.errorCode).toBe(11)
      }
      await expect(
        EditTool.call(
          { file_path: p, old_string: 'a', new_string: 'b' },
          makeCtx(new Map()),
        ),
      ).rejects.toThrow(fx.pattern)
      expect(snap(p)).toEqual(before)
      expect(state.get(p)?.content).toBe('<previously read>')
    })

    test('Write：validate 拒（errorCode 5）+ call 拒 + 文件与 state 不动', async () => {
      const p = join(dir, `rej-write-${fx.name}.txt`)
      writeFileSync(p, fx.bytes)
      const state = freshState(p, '<previously read>')
      const before = snap(p)
      const v = await WriteTool.validateInput(
        { file_path: p, content: 'new' },
        makeCtx(state),
      )
      expect(v.result).toBe(false)
      if (!v.result) {
        expect(v.message).toMatch(fx.pattern)
        expect(v.message).toMatch(/not modified/)
        expect(v.errorCode).toBe(5)
      }
      await expect(
        WriteTool.call(
          { file_path: p, content: 'new' },
          makeCtx(new Map()),
        ),
      ).rejects.toThrow(fx.pattern)
      expect(snap(p)).toEqual(before)
      expect(state.get(p)?.content).toBe('<previously read>')
    })

    test('Notebook：validate 拒（errorCode 11，解码层非 JSON 层）+ call error + 文件不动', async () => {
      const p = join(dir, `rej-nb-${fx.name}.ipynb`)
      writeFileSync(p, fx.bytes)
      const state = freshState(p, '<previously read>')
      const before = snap(p)
      const v = await NotebookEditTool.validateInput(
        nbInput(p),
        makeCtx(state),
      )
      expect(v.result).toBe(false)
      if (!v.result) {
        expect(v.message).toMatch(fx.pattern)
        expect(v.message).toMatch(/not modified/)
        expect(v.message).not.toMatch(/not valid JSON/)
        expect(v.errorCode).toBe(11)
      }
      const r = await NotebookEditTool.call(nbInput(p), makeCtx(new Map()))
      expect((r.data as { error: string }).error).toMatch(fx.pattern)
      expect(snap(p)).toEqual(before)
    })
  })
}

// ── Write TOCTOU：validate 与写之间文件被换（不变量锁）──────────────────

describe('WriteTool TOCTOU：call 用最终读入字节做同一判别', () => {
  test('validate 过后换非法编码 → call 仍拒（不用旧采样授权新内容）', async () => {
    const p = join(dir, 'toctou-invalid.txt')
    writeFileSync(p, 'hello valid')
    const state = freshState(p, 'hello valid')
    const v = await WriteTool.validateInput(
      { file_path: p, content: 'x' },
      makeCtx(state),
    )
    expect(v.result).toBe(true)
    writeFileSync(p, WIN1252)
    const swapped = snap(p)
    await expect(
      WriteTool.call({ file_path: p, content: 'x' }, makeCtx(state)),
    ).rejects.toThrow(/Invalid UTF-8/)
    expect(snap(p)).toEqual(swapped)
  })

  test('validate 过后合法改内容 + mtime bump → call 抛 stale', async () => {
    const p = join(dir, 'toctou-stale.txt')
    writeFileSync(p, 'original')
    const state = exactState(p, 'original')
    const v = await WriteTool.validateInput(
      { file_path: p, content: 'x' },
      makeCtx(state),
    )
    expect(v.result).toBe(true)
    writeFileSync(p, 'changed legally')
    const bump = new Date(Date.now() + 5000)
    utimesSync(p, bump, bump)
    await expect(
      WriteTool.call({ file_path: p, content: 'x' }, makeCtx(state)),
    ).rejects.toThrow(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
  })

  test('validate 过后文件被删 → call 按新文件路径创建（探针 ENOENT 容忍）', async () => {
    const p = join(dir, 'toctou-deleted.txt')
    writeFileSync(p, 'hello')
    const state = freshState(p, 'hello')
    const v = await WriteTool.validateInput(
      { file_path: p, content: 'recreated' },
      makeCtx(state),
    )
    expect(v.result).toBe(true)
    unlinkSync(p)
    const r = await WriteTool.call(
      { file_path: p, content: 'recreated' },
      makeCtx(state),
    )
    expect(r.data.type).toBe('create')
    expect(readFileSync(p).toString('utf8')).toBe('recreated')
  })

  test('既有 stale 拒绝不被探针遮蔽（errorCode 3 仍先行）', async () => {
    const p = join(dir, 'w-stale-gate.txt')
    writeFileSync(p, 'original')
    const state = exactState(p, 'original')
    const bump = new Date(Date.now() + 5000)
    utimesSync(p, bump, bump)
    const v = await WriteTool.validateInput(
      { file_path: p, content: 'x' },
      makeCtx(state),
    )
    expect(v.result).toBe(false)
    if (!v.result) {
      expect(v.errorCode).toBe(3)
    }
  })
})

// ── Notebook 专项：BOM JSON 双面拒绝（不变量）+ 损坏 é fixture（RED）───

describe('NotebookEditTool：BOM JSON 拒绝策略 validate/call 一致', () => {
  test('UTF8-BOM + 合法 JSON → validate errorCode 6', async () => {
    const p = join(dir, 'nb-utf8bom.ipynb')
    writeFileSync(
      p,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(NB_JSON)]),
    )
    const v = await NotebookEditTool.validateInput(
      nbInput(p),
      makeCtx(freshState(p, '<previously read>')),
    )
    expect(v.result).toBe(false)
    if (!v.result) {
      expect(v.message).toMatch(/not valid JSON/)
      expect(v.errorCode).toBe(6)
    }
  })

  test('LE-BOM + 合法 JSON → validate errorCode 6（B 剥 BOM 面不单侧放行）', async () => {
    const p = join(dir, 'nb-lebom.ipynb')
    writeFileSync(p, leBytes(NB_JSON))
    const v = await NotebookEditTool.validateInput(
      nbInput(p),
      makeCtx(freshState(p, '<previously read>')),
    )
    expect(v.result).toBe(false)
    if (!v.result) {
      expect(v.message).toMatch(/not valid JSON/)
      expect(v.errorCode).toBe(6)
    }
  })

  test('BOM JSON：call error 与 validate 同拒（UTF8/LE 双面）+ 文件不动', async () => {
    const p8 = join(dir, 'nb-utf8bom-call.ipynb')
    writeFileSync(
      p8,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(NB_JSON)]),
    )
    const before8 = snap(p8)
    const r8 = await NotebookEditTool.call(nbInput(p8), makeCtx(new Map()))
    expect((r8.data as { error: string }).error).toContain(
      'Notebook is not valid JSON.',
    )
    expect(snap(p8)).toEqual(before8)

    const pl = join(dir, 'nb-lebom-call.ipynb')
    writeFileSync(pl, leBytes(NB_JSON))
    const beforeL = snap(pl)
    const rl = await NotebookEditTool.call(nbInput(pl), makeCtx(new Map()))
    expect((rl.data as { error: string }).error).toContain(
      'Notebook is not valid JSON.',
    )
    expect(snap(pl)).toEqual(beforeL)
  })

  test('损坏 é fixture：宽容解码是合法 JSON、严格解码拒（解码层非 JSON 层）', async () => {
    // fixture 自检：宽容 UTF-8 解码下是合法 JSON——旧路径会静默放行编辑
    // （303 二次损坏面），严格解码必须在字节层拒绝
    expect(() => JSON.parse(CORRUPT_E_NB.toString('utf8'))).not.toThrow()

    const p = join(dir, 'nb-corrupt-e.ipynb')
    writeFileSync(p, CORRUPT_E_NB)
    const state = freshState(p, '<previously read>')
    const before = snap(p)
    const v = await NotebookEditTool.validateInput(nbInput(p), makeCtx(state))
    expect(v.result).toBe(false)
    if (!v.result) {
      expect(v.message).toMatch(/Invalid UTF-8/)
      expect(v.message).not.toMatch(/not valid JSON/)
      expect(v.errorCode).toBe(11)
    }
    const r = await NotebookEditTool.call(nbInput(p), makeCtx(new Map()))
    expect((r.data as { error: string }).error).toMatch(/Invalid UTF-8/)
    expect((r.data as { error: string }).error).not.toMatch(
      /not valid JSON/,
    )
    expect(snap(p)).toEqual(before)
  })
})
