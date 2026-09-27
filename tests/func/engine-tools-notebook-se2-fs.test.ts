/**
 * engine/tools/notebook S-E2（§8.61）call 成功面 func 层（真盘：mkdtemp tmp
 * .ipynb + 真 readFileState Map duck，零模型——plan/web func 先例）。
 *
 * unit 层不可 mock 的原因（unit 头注 P-N4 注同源）：writeTextContent 原子/
 * fallback 写链 = 裸 node fs（fileUtils L32 chmodSync/writeFileSync 直引，
 * FsOperations 不可覆写）→ call 成功面全落本文件：
 *  - F-N1 replace 面：cell source 更新 + code cell execution_count/outputs
 *    复位 + 写回（IPYNB_INDENT=1 缩进）+ data 9 字段面（original_file/
 *    updated_file/cell_id）+ readFileState.set 状态面（offset undefined +
 *    写后 mtime + content = updated_file）。
 *  - F-N2 nbformat 4.5 insert 面：新 cell id 生成（base36 ≤13 字符）+ splice
 *    位置（指定 cell 之后）。
 *  - F-N3 replace→insert 转换（cell-N index = 尾界 → edit_mode insert +
 *    cell_type 缺省 'code'）。
 *  - F-N4 delete 面（cell 移除 + data.cell_id 透传）。
 *  - F-N5 markdown insert 面（无 execution_count/outputs 键 + metadata {}）。
 *  - F-N6 cell_type 覆写面（code → markdown，复位支先于覆写支）。
 *  - F-N7 readFileState duck 成员缺省 → ?.set no-op 零崩溃面（成功写回）。
 *  - F-N8 validate ec10 真盘面（timestamp 0 + 真 mtime > 0 → 文案逐字）。
 *  - F-N9 缺 cell_id insert → 头部插入（cellIndex 0 缺省支）。
 */
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  NotebookEditTool,
  type NotebookEditOutput,
} from '../../src/engine/tools'
import type {
  FileState,
  FilesToolUseContext,
  ReadFileState,
} from '../../src/engine/tools/files'

let dir = ''
let nbPath = ''
let readState: Map<string, FileState>

function mkNbContent(cells: Array<Record<string, unknown>>): string {
  return JSON.stringify(
    {
      cells,
      metadata: { language_info: { name: 'python' } },
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    1,
  )
}

function twoCellNb(): string {
  return mkNbContent([
    { cell_type: 'code', id: 'a', source: 'old-a', metadata: {}, execution_count: 7, outputs: ['o'] },
    { cell_type: 'code', id: 'b', source: 'old-b', metadata: {}, execution_count: 3, outputs: [] },
  ])
}

function seedReadState(): Map<string, FileState> {
  const map = new Map<string, FileState>()
  map.set(nbPath, {
    content: readFileSync(nbPath, 'utf8'),
    timestamp: Math.floor(statSync(nbPath).mtimeMs),
    offset: undefined,
    limit: undefined,
  })
  return map
}

function ctx(readFileState?: ReadFileState): unknown {
  // call 仅解构 readFileState（duck 最小面）；validate 仅 readFileState
  return readFileState ? { readFileState } : {}
}

function readNb(): Record<string, unknown> {
  return JSON.parse(readFileSync(nbPath, 'utf8'))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-nb-se2-'))
  nbPath = join(dir, 'nb.ipynb')
  writeFileSync(nbPath, twoCellNb())
  readState = new Map()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ── F-N1 replace 面 ────────────────────────────────────────────────────

describe('F-N1 call replace 面（真盘写回）', () => {
  test('cell source 更新 + code cell 复位 + data 9 字段 + readFileState 状态面', async () => {
    const before = readFileSync(nbPath, 'utf8')
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'a',
        new_source: 'x = 1',
        cell_type: 'code',
        edit_mode: 'replace',
      },
      ctx(readState) as FilesToolUseContext,
    )
    const data = r.data as NotebookEditOutput
    expect(data.error).toBe('')
    expect(data.cell_id).toBe('a')
    expect(data.edit_mode).toBe('replace')
    expect(data.language).toBe('python')
    expect(data.new_source).toBe('x = 1')
    expect(data.notebook_path).toBe(nbPath)
    expect(data.original_file).toBe(before)
    expect(data.updated_file).toBe(readFileSync(nbPath, 'utf8'))

    const updated = readNb()
    const cells = updated.cells as Array<Record<string, unknown>>
    expect(cells[0].source).toBe('x = 1')
    expect(cells[0].execution_count).toBe(null)
    expect(cells[0].outputs).toEqual([])
    expect(cells[1].source).toBe('old-b')
    // IPYNB_INDENT=1 写回面（2 空格缩进非 compact）
    expect(readFileSync(nbPath, 'utf8')).toContain('\n  ')

    // readFileState.set 面：offset undefined（Read dedup 破缺面）+ 写后 mtime
    const st = readState.get(nbPath)!
    expect(st.offset).toBeUndefined()
    expect(st.limit).toBeUndefined()
    expect(st.timestamp).toBe(Math.floor(statSync(nbPath).mtimeMs))
    expect(st.content).toBe(data.updated_file)
  })
})

// ── F-N2 nbformat 4.5 insert 面 ────────────────────────────────────────

describe('F-N2 nbformat 4.5 insert 面（id 生成 + splice 位置）', () => {
  test('insert after cell a → 新 cell 位置 1 + base36 id ≤13 字符', async () => {
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'a',
        new_source: 'print(1)',
        cell_type: 'code',
        edit_mode: 'insert',
      },
      ctx(readState) as FilesToolUseContext,
    )
    const data = r.data as NotebookEditOutput
    expect(data.error).toBe('')
    expect(data.edit_mode).toBe('insert')
    expect(typeof data.cell_id).toBe('string')
    expect((data.cell_id as string).length).toBeGreaterThan(0)
    expect((data.cell_id as string).length).toBeLessThanOrEqual(13)

    const cells = readNb().cells as Array<Record<string, unknown>>
    expect(cells.length).toBe(3)
    expect(cells[1].source).toBe('print(1)')
    expect(cells[1].id).toBe(data.cell_id)
    expect(cells[1].execution_count).toBe(null)
    expect(cells[1].outputs).toEqual([])
    expect(cells[0].id).toBe('a')
    expect(cells[2].id).toBe('b')
  })
})

// ── F-N3 replace→insert 转换 ───────────────────────────────────────────

describe('F-N3 replace→insert 转换（尾界 cell-N index）', () => {
  test('cell-2 = cells.length → edit_mode 转 insert + cell_type 缺省 code', async () => {
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'cell-2',
        new_source: 'z = 9',
        edit_mode: 'replace',
      },
      ctx(readState) as FilesToolUseContext,
    )
    const data = r.data as NotebookEditOutput
    expect(data.edit_mode).toBe('insert')
    expect(data.cell_type).toBe('code')
    expect(typeof data.cell_id).toBe('string')

    const cells = readNb().cells as Array<Record<string, unknown>>
    expect(cells.length).toBe(3)
    expect(cells[2].source).toBe('z = 9')
    expect(cells[2].cell_type).toBe('code')
  })
})

// ── F-N4 delete 面 ─────────────────────────────────────────────────────

describe('F-N4 call delete 面', () => {
  test('cell a 移除 + data.cell_id 透传（nbformat 4.5 id 保留支）', async () => {
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'a',
        new_source: 'unused',
        edit_mode: 'delete',
      },
      ctx(readState) as FilesToolUseContext,
    )
    const data = r.data as NotebookEditOutput
    expect(data.error).toBe('')
    expect(data.edit_mode).toBe('delete')
    expect(data.cell_id).toBe('a')

    const cells = readNb().cells as Array<Record<string, unknown>>
    expect(cells.length).toBe(1)
    expect(cells[0].id).toBe('b')
  })
})

// ── F-N5 markdown insert 面 ────────────────────────────────────────────

describe('F-N5 markdown insert 面（无执行态键）', () => {
  test('markdown cell 无 execution_count/outputs 键 + metadata {}', async () => {
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'a',
        new_source: '# heading',
        cell_type: 'markdown',
        edit_mode: 'insert',
      },
      ctx(readState) as FilesToolUseContext,
    )
    const data = r.data as NotebookEditOutput
    expect(data.cell_type).toBe('markdown')

    const cells = readNb().cells as Array<Record<string, unknown>>
    const inserted = cells[1] as Record<string, unknown>
    expect(inserted.source).toBe('# heading')
    expect(inserted.cell_type).toBe('markdown')
    expect('execution_count' in inserted).toBe(false)
    expect('outputs' in inserted).toBe(false)
    expect(inserted.metadata).toEqual({})
  })
})

// ── F-N6 cell_type 覆写面 ──────────────────────────────────────────────

describe('F-N6 cell_type 覆写面（code → markdown）', () => {
  test('replace 时 cell_type 覆写 targetCell + 复位支先于覆写支', async () => {
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'a',
        new_source: 'now md',
        cell_type: 'markdown',
        edit_mode: 'replace',
      },
      ctx(readState) as FilesToolUseContext,
    )
    expect((r.data as NotebookEditOutput).error).toBe('')
    const cells = readNb().cells as Array<Record<string, unknown>>
    expect(cells[0].cell_type).toBe('markdown')
    expect(cells[0].source).toBe('now md')
    // 原 code cell 复位支（覆写前判定原类型）
    expect(cells[0].execution_count).toBe(null)
    expect(cells[0].outputs).toEqual([])
  })
})

// ── F-N7 readFileState 缺省零崩溃面 ────────────────────────────────────

describe('F-N7 readFileState duck 成员缺省（?.set no-op）', () => {
  test('无 readFileState 的 context duck → 写回成功零崩溃', async () => {
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        cell_id: 'a',
        new_source: 'no-state',
        edit_mode: 'replace',
      },
      ctx() as FilesToolUseContext,
    )
    expect((r.data as NotebookEditOutput).error).toBe('')
    const cells = readNb().cells as Array<Record<string, unknown>>
    expect(cells[0].source).toBe('no-state')
  })
})

// ── F-N8 validate ec10 真盘面 ──────────────────────────────────────────

describe('F-N8 validate ec10 真盘面（mtime 真值 > timestamp 0）', () => {
  test('readFileState timestamp 0 + 真 mtime → 文案逐字', async () => {
    const stale = new Map<string, FileState>()
    stale.set(nbPath, {
      content: 'stale',
      timestamp: 0,
      offset: undefined,
      limit: undefined,
    })
    const res = await NotebookEditTool.validateInput(
      {
        notebook_path: nbPath,
        new_source: 'x',
        cell_id: 'a',
        edit_mode: 'replace',
      },
      { readFileState: stale } as unknown as FilesToolUseContext,
    )
    expect(res).toEqual({
      result: false,
      message:
        'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
      errorCode: 10,
    })
  })
})

// ── F-N9 缺 cell_id insert → 头部插入 ──────────────────────────────────

describe('F-N9 缺 cell_id insert（cellIndex 0 缺省支）', () => {
  test('头部插入新 cell + id 生成', async () => {
    readState = seedReadState()
    const r = await NotebookEditTool.call(
      {
        notebook_path: nbPath,
        new_source: 'head()',
        cell_type: 'code',
        edit_mode: 'insert',
      },
      ctx(readState) as FilesToolUseContext,
    )
    const data = r.data as NotebookEditOutput
    expect(data.error).toBe('')
    expect(typeof data.cell_id).toBe('string')

    const cells = readNb().cells as Array<Record<string, unknown>>
    expect(cells.length).toBe(3)
    expect(cells[0].source).toBe('head()')
    expect(cells[0].id).toBe(data.cell_id)
    expect(cells[1].id).toBe('a')
  })
})
