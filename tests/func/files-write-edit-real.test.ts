/**
 * §8.55 S-C6 — WriteTool.call()/validateInput + EditTool.call()/
 * validateInput 真盘行为（func 层：真 tmpdir；unit 层零磁盘纪律）。
 *
 * 旧仓对照（a8af45b）：
 *  - Write call 2 支（create：structuredPatch [] + originalFile null /
 *    update：getPatchForDisplay patch 面 + countLinesChanged 消费）+
 *    stale 守卫（delta ⑨ readFileState 缺省 → 既有文件恒 stale 支 →
 *    throw FILE_UNEXPECTEDLY_MODIFIED_ERROR；注入后 = 旧行为逐字）+
 *    mkdir 父目录面。
 *  - Write validateInput 磁盘支：errorCode 2（未读）/ 3（stale，mtime
 *    floor 面）/ 4（memory 目录 frontmatter 校验，isUnderMemoryDir 字符串
 *    面 /memory/ + .md）/ 全读 fresh → result true。
 *  - Edit call 支面：既有文件替换（findActualString + preserveQuoteStyle
 *    + getPatchForEdit + writeTextContent + readFileState 回写）/ replace
 *    All 字符串布尔容忍支（delta ① semanticToBoolean 'true'）/ 空
 *    old_string 创建支（readFileForEdit ENOENT → fileExists false 面）/
 *    stale 守卫（同 delta ⑨）。
 *  - Edit validateInput 磁盘支：errorCode 5（.ipynb → NotebookEdit 引导
 *    消息）/ 6（未读）/ 7（stale 含全读内容回退面）/ 8（not-found）/
 *    9（multi-match + replace_all 翻转面）。
 *
 * 登记：errorCode 10（>1GiB 过大支）不可真盘构造（1 GiB fixture 代价
 * 不成比例）→ 不测（源体逐字保留，防当遗漏重提）。
 * readFileState duck = Map（S-C5 delta ⑭ 先例；LRU 驱逐不随迁）。
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import type { ToolPermissionContext } from '../../src/shared'
import {
  EditTool,
  WriteTool,
  FILE_UNEXPECTEDLY_MODIFIED_ERROR,
  type EditOutput,
  type FileState,
  type WriteOutput,
} from '../../src/engine/tools'

let dir: string
let aPath: string
let nbPath: string
let memPath: string

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

/** readFileState duck（delta ⑭：Map 即满足 get/set duck）。 */
type WeCtx = {
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  abortController: AbortController
  readFileState?: Map<string, FileState>
}

function makeCtx(readFileState?: Map<string, FileState>): WeCtx {
  return {
    getAppState: () => ({ toolPermissionContext: makePermsCtx() }),
    abortController: new AbortController(),
    ...(readFileState ? { readFileState } : {}),
  }
}

/** 以当前盘态播种全读态（offset/limit undefined = 全读）。 */
function seedReadState(p: string): Map<string, FileState> {
  const m = new Map<string, FileState>()
  m.set(p, {
    content: readFileSync(p, 'utf8'),
    timestamp: Math.floor(statSync(p).mtimeMs),
    offset: undefined,
    limit: undefined,
  })
  return m
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc6-we-'))
  aPath = join(dir, 'a.txt')
  writeFileSync(aPath, 'alpha\nbeta\ngamma\n')
  nbPath = join(dir, 'nb.ipynb')
  writeFileSync(nbPath, 'x')
  mkdirSync(join(dir, 'memory'))
  memPath = join(dir, 'memory', 'note.md')
  writeFileSync(memPath, 'no frontmatter')
})

afterEach(() => {
  // 每测复位 a.txt 盘态（跨测稳定基线）
  writeFileSync(aPath, 'alpha\nbeta\ngamma\n')
})

// ── WriteTool.call 支面─────────────────────────────────────────────────

describe('WriteTool.call 支面', () => {
  test('create 支：新文件 → type create + structuredPatch [] + originalFile null + 盘落', async () => {
    const p = join(dir, 'new.txt')
    const res = await WriteTool.call(
      { file_path: p, content: 'hello\n' },
      makeCtx(),
    )
    const data = res.data as WriteOutput
    expect(data.type).toBe('create')
    expect(data.structuredPatch).toEqual([])
    expect(data.originalFile).toBeNull()
    expect(data.filePath).toBe(p)
    expect(readFileSync(p, 'utf8')).toBe('hello\n')
  })

  test('create 支嵌套目录：mkdir 父目录面', async () => {
    const p = join(dir, 'deep', 'nested', 'f.txt')
    const res = await WriteTool.call(
      { file_path: p, content: 'x' },
      makeCtx(),
    )
    expect((res.data as WriteOutput).type).toBe('create')
    expect(readFileSync(p, 'utf8')).toBe('x')
  })

  test('update 支：注入全读态 → type update + patch 面 + 盘覆盖', async () => {
    const state = seedReadState(aPath)
    const res = await WriteTool.call(
      { file_path: aPath, content: 'alpha\nBETA\ngamma\n' },
      makeCtx(state),
    )
    const data = res.data as WriteOutput
    expect(data.type).toBe('update')
    expect(data.originalFile).toBe('alpha\nbeta\ngamma\n')
    expect(data.structuredPatch.length).toBeGreaterThan(0)
    expect(readFileSync(aPath, 'utf8')).toBe('alpha\nBETA\ngamma\n')
  })

  test('stale 守卫：readFileState 缺省（delta ⑨）→ 既有文件恒 stale 支 throw', async () => {
    await expect(
      WriteTool.call({ file_path: aPath, content: 'x' }, makeCtx()),
    ).rejects.toThrow(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
  })

  test('stale 守卫：旧 timestamp 入参（读后被外部改）→ throw', async () => {
    const state = seedReadState(aPath)
    // 回拨 60s：规避文件系统 mtime 粒度（同 tick 写 → mtime 不前进 →
    // lastWriteTime > timestamp 判假）；外部写 mtime = now > now-60s 恒真
    for (const st of state.values()) st.timestamp -= 60_000
    writeFileSync(aPath, 'externally changed\n')
    await expect(
      WriteTool.call(
        { file_path: aPath, content: 'y' },
        makeCtx(state),
      ),
    ).rejects.toThrow(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
  })
})

// ── WriteTool.validateInput 磁盘支──────────────────────────────────────

describe('WriteTool.validateInput 磁盘支', () => {
  test('errorCode 2：既有文件未读（readFileState 缺省）', async () => {
    const v = (await WriteTool.validateInput?.(
      { file_path: aPath, content: 'x' },
      makeCtx(),
    )) as { result: boolean; errorCode?: number; message?: string }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(2)
    expect(v.message).toContain('has not been read yet')
  })

  test('errorCode 3：stale（读后被外部改）', async () => {
    const state = seedReadState(aPath)
    // 回拨 60s（同上 mtime 粒度规避）
    for (const st of state.values()) st.timestamp -= 60_000
    writeFileSync(aPath, 'externally changed\n')
    const v = (await WriteTool.validateInput?.(
      { file_path: aPath, content: 'x' },
      makeCtx(state),
    )) as { result: boolean; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(3)
  })

  test('errorCode 4：memory 目录坏 frontmatter', async () => {
    const state = seedReadState(memPath)
    const v = (await WriteTool.validateInput?.(
      { file_path: memPath, content: 'still no frontmatter' },
      makeCtx(state),
    )) as { result: boolean; errorCode?: number; message?: string }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(4)
    expect(v.message).toContain('frontmatter')
  })

  test('memory 目录合法 frontmatter → result true', async () => {
    const state = seedReadState(memPath)
    const v = await WriteTool.validateInput?.(
      {
        file_path: memPath,
        content:
          '---\nname: note\ndescription: one line\ntype: user\n---\nbody',
      },
      makeCtx(state),
    )
    expect(v).toEqual({ result: true })
  })

  test('fresh 全读态 → result true', async () => {
    const state = seedReadState(aPath)
    expect(
      await WriteTool.validateInput?.(
        { file_path: aPath, content: 'x' },
        makeCtx(state),
      ),
    ).toEqual({ result: true })
  })
})

// ── EditTool.call 支面──────────────────────────────────────────────────

describe('EditTool.call 支面', () => {
  test('既有文件替换：patch 面 + 盘落 + readFileState 回写', async () => {
    const state = seedReadState(aPath)
    const res = await EditTool.call(
      { file_path: aPath, old_string: 'beta', new_string: 'BETA' },
      makeCtx(state),
    )
    const data = res.data as EditOutput
    expect(data.oldString).toBe('beta')
    expect(data.originalFile).toBe('alpha\nbeta\ngamma\n')
    expect(data.structuredPatch.length).toBeGreaterThan(0)
    expect(data.replaceAll).toBe(false)
    expect(data.userModified).toBe(false)
    expect(readFileSync(aPath, 'utf8')).toBe('alpha\nBETA\ngamma\n')
    // readFileState 回写面（后续 stale 判别依赖）
    expect(state.get(aPath)?.content).toBe('alpha\nBETA\ngamma\n')
  })

  test('replaceAll 字符串布尔容忍支（delta ① semanticToBoolean "true"）', async () => {
    const p = join(dir, 'multi.txt')
    writeFileSync(p, 'x y x\n')
    const state = seedReadState(p)
    const res = await EditTool.call(
      {
        file_path: p,
        old_string: 'x',
        new_string: 'X',
        replace_all: 'true',
      },
      makeCtx(state),
    )
    expect((res.data as EditOutput).replaceAll).toBe(true)
    expect(readFileSync(p, 'utf8')).toBe('X y X\n')
  })

  test('空 old_string 创建支（readFileForEdit ENOENT → fileExists false）', async () => {
    const p = join(dir, 'brand-new.txt')
    const res = await EditTool.call(
      { file_path: p, old_string: '', new_string: 'fresh content\n' },
      makeCtx(),
    )
    const data = res.data as EditOutput
    expect(data.oldString).toBe('')
    expect(data.originalFile).toBe('')
    expect(readFileSync(p, 'utf8')).toBe('fresh content\n')
  })

  test('stale 守卫：readFileState 缺省 → 既有文件 throw（delta ⑨）', async () => {
    await expect(
      EditTool.call(
        { file_path: aPath, old_string: 'beta', new_string: 'b' },
        makeCtx(),
      ),
    ).rejects.toThrow(FILE_UNEXPECTEDLY_MODIFIED_ERROR)
  })
})

// ── EditTool.validateInput 磁盘支───────────────────────────────────────

describe('EditTool.validateInput 磁盘支', () => {
  test('errorCode 5：.ipynb → NotebookEdit 引导消息', async () => {
    const state = seedReadState(nbPath)
    const v = (await EditTool.validateInput?.(
      { file_path: nbPath, old_string: 'x', new_string: 'y' },
      makeCtx(state),
    )) as { result: boolean; errorCode?: number; message?: string }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(5)
    expect(v.message).toContain('NotebookEdit')
  })

  test('errorCode 6：既有文件未读（readFileState 缺省）', async () => {
    const v = (await EditTool.validateInput?.(
      { file_path: aPath, old_string: 'beta', new_string: 'b' },
      makeCtx(),
    )) as { result: boolean; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(6)
  })

  test('errorCode 7：stale（旧读态 + 盘已改，全读内容回退不命中）', async () => {
    const state = seedReadState(aPath)
    // 回拨 60s（同上 mtime 粒度规避）：内容回退面 = 全读态但盘内容已变
    for (const st of state.values()) st.timestamp -= 60_000
    writeFileSync(aPath, 'changed by other\n')
    const v = (await EditTool.validateInput?.(
      { file_path: aPath, old_string: 'beta', new_string: 'b' },
      makeCtx(state),
    )) as { result: boolean; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(7)
  })

  test('errorCode 8：old_string 不在文件内', async () => {
    const state = seedReadState(aPath)
    const v = (await EditTool.validateInput?.(
      { file_path: aPath, old_string: 'absent-zzz', new_string: 'b' },
      makeCtx(state),
    )) as { result: boolean; errorCode?: number; message?: string }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(8)
    expect(v.message).toContain('not found in file')
  })

  test('errorCode 9：multi-match + replace_all=false；replace_all=true 翻转 → true', async () => {
    const p = join(dir, 'multi.txt')
    writeFileSync(p, 'x y x\n')
    const state = seedReadState(p)
    const v9 = (await EditTool.validateInput?.(
      { file_path: p, old_string: 'x', new_string: 'X' },
      makeCtx(state),
    )) as { result: boolean; errorCode?: number; message?: string }
    expect(v9.result).toBe(false)
    expect(v9.errorCode).toBe(9)
    expect(v9.message).toContain('Found 2 matches')
    const vOk = await EditTool.validateInput?.(
      { file_path: p, old_string: 'x', new_string: 'X', replace_all: true },
      makeCtx(state),
    )
    expect(vOk).toEqual({ result: true })
  })
})

// ── 收尾────────────────────────────────────────────────────────────────

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
