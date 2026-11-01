/**
 * 0.1.84 V3-5 K5-3/K5-4 — Write/Edit/NotebookEdit mutation 守卫 unit 面
 * （stub fs 零盘，S-C6 同纪律：permissions bootstrap-env 双戳 + bootstrap
 * cwd 双戳 FAKE_CWD + setFsImplementation 字面 stub）。
 *
 * 工单 §C（docs/2026-11-01-p0-wave-0184-ticket.md）守卫断言：
 *  - validate 入口 fail-closed：目标文件无法无损解码（Win-1252/Shift-JIS/
 *    GBK 非法 UTF8、UTF16BE、非法字节晚于 4096B 采样窗）→ 可操作的
 *    「不支持/无法无损解码，未修改」错误（result:false，非裸 throw）。
 *  - validate 与 call 同一判别：call 用最终读入的完整原字节做判别，不得用
 *    validate 的旧采样授权新内容。
 *  - 解码异常不得被 catch 成「文件不存在」再覆盖（不存在与非法编码分开）。
 *  - Notebook BOM JSON 拒绝策略 validate/call 一致（B helper 剥 BOM 面不能
 *    意外让一侧通过）——UTF8 BOM / LE BOM 双面。
 *
 * RED 基线（4c118aa = Task B 后）：Edit validate 走 readFileBytes + 2 字节
 * 采样 + 宽容 toString（非法编码静默放行成 U+FFFD 乱码）→ result:true 或
 * 错误门（errorCode 8）而非解码拒绝；Write validate 不读内容 → result:true
 * 放行；Notebook validate 裸 throw UndecodableTextError。call 面（严格解码
 * throw / error-result）Task B 已绿 = 不变量锁。
 *
 * stub 双成员口径：readFileBytes（旧 Edit validate 读链）与
 * readFileBytesSync（K5-3 readFileSyncWithMetadata 读链）同字节——RED 的
 * 差异只能来自读链/判别本身，非 fixture 差异。
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  WriteTool,
  EditTool,
  NotebookEditTool,
  type FilesToolUseContext,
  type FileState,
} from '../../src/engine/tools'
import {
  resetPermissionsBootstrapEnv,
  setPermissionsBootstrapEnv,
} from '../../src/permissions'
import {
  getCwdState,
  getOriginalCwd,
  setOriginalCwd,
  setCwdState,
} from '../../src/bootstrap'
import {
  NodeFsOperations,
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'
import type { ToolPermissionContext } from '../../src/shared'

// ── 公共夹具（S-C6 同形）──────────────────────────────────────────────

const FAKE_CWD = '/home/atlas-w0184/proj' // 不存在目录：realpath ENOENT 短路零盘

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

function makeCtx(readFileState?: Map<string, FileState>): FilesToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: makePermsCtx() }),
    abortController: new AbortController(),
    ...(readFileState ? { readFileState } : {}),
  } as unknown as FilesToolUseContext
}

/** readFileState 条目：timestamp 恒晚于 stub mtime（1000）→ 不触发 stale 门。 */
function freshEntry(): FileState {
  return {
    content: '<previously read>',
    timestamp: 2000,
    offset: undefined,
    limit: undefined,
  }
}

/** stub stat 形状：mtimeMs 1000（floor 后与 freshEntry.timestamp=2000 比较）。 */
function fakeStat(size: number) {
  return {
    mtimeMs: 1000,
    size,
    isDirectory: () => false,
    isFile: () => true,
  }
}

/**
 * 最小 stub（sc1-fs 先例）：lstatSync ENOENT（非符号链接短路）+ 双读成员
 * 同字节 + stat/statSync/mkdir。readFileBytes = 旧 Edit validate 读链；
 * readFileBytesSync = K5-3 严格解码读链——两成员返回同一 fixture 字节。
 */
function stubFs(bytes: Buffer): FsOperations {
  return {
    ...NodeFsOperations,
    lstatSync: () => {
      throw Object.assign(new Error('enoent'), { code: 'ENOENT' })
    },
    stat: (() => Promise.resolve(fakeStat(bytes.length))) as FsOperations['stat'],
    statSync: (() => fakeStat(bytes.length)) as FsOperations['statSync'],
    readFileBytes: (() => Promise.resolve(bytes)) as FsOperations['readFileBytes'],
    readFileBytesSync: () => bytes,
    mkdir: (() => Promise.resolve(undefined)) as FsOperations['mkdir'],
  }
}

let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  savedOriginalCwd = getOriginalCwd()
  savedCwdState = getCwdState()
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})

afterAll(() => {
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
  resetPermissionsBootstrapEnv()
  setOriginalFsImplementation()
})

beforeEach(() => {
  setOriginalFsImplementation()
})

afterEach(() => {
  setOriginalFsImplementation()
})

// ── 非法编码 fixture 族（工单 §C：三传统编码 + BE + 采样窗后）──────────

const WIN1252 = Buffer.from([0x6e, 0x61, 0xef, 0x76, 0x65]) // "naïve" é=0xEF 裸字节
const SHIFTJIS = Buffer.from([
  0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd,
]) // "こんにちは"（0x82 孤立续字节）
const GBK = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]) // "中文"（0xD0 非 0xD6 的合法续字节）
const UTF16BE = Buffer.from([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]) // "AB"
const LATE_4096 = Buffer.concat([
  Buffer.alloc(4096, 0x61),
  Buffer.from([0xff]),
]) // 前 4096B 合法 + 尾部 0xFF

const INVALID_FIXTURES: Array<{ name: string; bytes: Buffer; pattern: RegExp }> =
  [
    { name: 'Win-1252 非法 UTF8', bytes: WIN1252, pattern: /Invalid UTF-8/ },
    { name: 'Shift-JIS 非法 UTF8', bytes: SHIFTJIS, pattern: /Invalid UTF-8/ },
    { name: 'GBK 非法 UTF8', bytes: GBK, pattern: /Invalid UTF-8/ },
    { name: 'UTF-16BE BOM', bytes: UTF16BE, pattern: /UTF-16BE/ },
    {
      name: '非法字节晚于 4096B 采样窗',
      bytes: LATE_4096,
      pattern: /Invalid UTF-8/,
    },
  ]

// ── Edit validate：验证入口 fail-closed（RED 面）───────────────────────

describe('EditTool.validateInput：非法编码在验证入口明确拒绝', () => {
  for (const fx of INVALID_FIXTURES) {
    test(`${fx.name} → result:false + 可操作错误 + 未修改`, async () => {
      setFsImplementation(stubFs(fx.bytes))
      const p = `${FAKE_CWD}/edit-${fx.name.replace(/\W+/g, '-')}.txt`
      const state = new Map<string, FileState>()
      state.set(p, freshEntry())
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
    })
  }
})

// ── Edit call：同一判别拒绝（Task B 后不变量锁）────────────────────────

describe('EditTool.call：非法编码拒绝且不吞成「不存在」', () => {
  for (const fx of INVALID_FIXTURES) {
    test(`${fx.name} → rejects 解码错误（非 ENOENT 支）`, async () => {
      setFsImplementation(stubFs(fx.bytes))
      const p = `${FAKE_CWD}/edit-call-${fx.name.replace(/\W+/g, '-')}.txt`
      await expect(
        EditTool.call(
          { file_path: p, old_string: 'a', new_string: 'b' },
          makeCtx(new Map([[p, freshEntry()]])),
        ),
      ).rejects.toThrow(fx.pattern)
    })
  }
})

// ── Write validate：验证入口 fail-closed（RED 面）──────────────────────

describe('WriteTool.validateInput：非法编码在验证入口明确拒绝', () => {
  for (const fx of INVALID_FIXTURES) {
    test(`${fx.name} → result:false + 可操作错误 + 未修改`, async () => {
      setFsImplementation(stubFs(fx.bytes))
      const p = `${FAKE_CWD}/write-${fx.name.replace(/\W+/g, '-')}.txt`
      const state = new Map<string, FileState>()
      state.set(p, freshEntry())
      const v = await WriteTool.validateInput(
        { file_path: p, content: 'new content' },
        makeCtx(state),
      )
      expect(v.result).toBe(false)
      if (!v.result) {
        expect(v.message).toMatch(fx.pattern)
        expect(v.message).toMatch(/not modified/)
        expect(v.errorCode).toBe(5)
      }
    })
  }
})

// ── Write call：同一判别拒绝（Task B 后不变量锁）──────────────────────

describe('WriteTool.call：非法编码拒绝且不吞成「新文件覆盖」', () => {
  for (const fx of INVALID_FIXTURES) {
    test(`${fx.name} → rejects 解码错误（非 ENOENT→新文件支）`, async () => {
      setFsImplementation(stubFs(fx.bytes))
      const p = `${FAKE_CWD}/write-call-${fx.name.replace(/\W+/g, '-')}.txt`
      await expect(
        WriteTool.call(
          { file_path: p, content: 'new content' },
          makeCtx(new Map([[p, freshEntry()]])),
        ),
      ).rejects.toThrow(fx.pattern)
    })
  }
})

// ── Notebook：validate 拒绝 + BOM JSON 双面一致（RED + 不变量）──────────

describe('NotebookEditTool.validateInput：非法编码 → result:false（不裸 throw）', () => {
  for (const fx of INVALID_FIXTURES) {
    test(`${fx.name} → result:false + 解码层错误（非 JSON 语法层）`, async () => {
      setFsImplementation(stubFs(fx.bytes))
      const p = `${FAKE_CWD}/nb-${fx.name.replace(/\W+/g, '-')}.ipynb`
      const state = new Map<string, FileState>()
      state.set(p, freshEntry())
      const v = await NotebookEditTool.validateInput(
        {
          notebook_path: p,
          cell_id: 'c1',
          new_source: 'x',
          edit_mode: 'replace',
        },
        makeCtx(state),
      )
      expect(v.result).toBe(false)
      if (!v.result) {
        expect(v.message).toMatch(fx.pattern)
        expect(v.message).toMatch(/not modified/)
        // 解码守卫先于 JSON 解析（fixture 非 JSON 也不能只靠语法错误过审）
        expect(v.message).not.toMatch(/not valid JSON/)
        expect(v.errorCode).toBe(11)
      }
    })
  }
})

describe('NotebookEditTool.call：非法编码 → error 结果（与 validate 同判别）', () => {
  for (const fx of INVALID_FIXTURES) {
    test(`${fx.name} → data.error 含解码错误`, async () => {
      setFsImplementation(stubFs(fx.bytes))
      const p = `${FAKE_CWD}/nb-call-${fx.name.replace(/\W+/g, '-')}.ipynb`
      const r = await NotebookEditTool.call(
        {
          notebook_path: p,
          cell_id: 'c1',
          new_source: 'x',
          edit_mode: 'replace',
        },
        makeCtx(new Map()),
      )
      expect((r.data as { error: string }).error).toMatch(fx.pattern)
    })
  }
})

describe('NotebookEditTool：BOM JSON 拒绝策略 validate/call 一致', () => {
  const NB_JSON =
    '{"cells":[{"id":"c1","cell_type":"code","source":["x"],"metadata":{},' +
    '"outputs":[],"execution_count":1}],"metadata":{},"nbformat":4,' +
    '"nbformat_minor":5}'

  test('UTF8 BOM + 合法 JSON → validate errorCode 6（BOM 字符在 content 头部保语义）', async () => {
    setFsImplementation(
      stubFs(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(NB_JSON)])),
    )
    const p = `${FAKE_CWD}/nb-utf8bom.ipynb`
    const state = new Map<string, FileState>()
    state.set(p, freshEntry())
    const v = await NotebookEditTool.validateInput(
      {
        notebook_path: p,
        cell_id: 'c1',
        new_source: 'x',
        edit_mode: 'replace',
      },
      makeCtx(state),
    )
    expect(v.result).toBe(false)
    if (!v.result) {
      expect(v.message).toMatch(/not valid JSON/)
      expect(v.errorCode).toBe(6)
    }
  })

  test('UTF8 BOM + 合法 JSON → call error 结果（与 validate 同拒）', async () => {
    setFsImplementation(
      stubFs(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(NB_JSON)])),
    )
    const p = `${FAKE_CWD}/nb-utf8bom-call.ipynb`
    const r = await NotebookEditTool.call(
      {
        notebook_path: p,
        cell_id: 'c1',
        new_source: 'x',
        edit_mode: 'replace',
      },
      makeCtx(new Map()),
    )
    expect((r.data as { error: string }).error).toMatch(/not valid JSON/)
  })

  test('LE BOM + 合法 JSON → validate/call 双面拒绝（B 剥 BOM 面不单侧放行）', async () => {
    setFsImplementation(
      stubFs(
        Buffer.concat([
          Buffer.from([0xff, 0xfe]),
          Buffer.from(NB_JSON, 'utf16le'),
        ]),
      ),
    )
    const p = `${FAKE_CWD}/nb-lebom.ipynb`
    const state = new Map<string, FileState>()
    state.set(p, freshEntry())
    const v = await NotebookEditTool.validateInput(
      {
        notebook_path: p,
        cell_id: 'c1',
        new_source: 'x',
        edit_mode: 'replace',
      },
      makeCtx(state),
    )
    expect(v.result).toBe(false)
    if (!v.result) {
      expect(v.message).toMatch(/not valid JSON/)
      expect(v.errorCode).toBe(6)
    }
    const r = await NotebookEditTool.call(
      {
        notebook_path: p,
        cell_id: 'c1',
        new_source: 'x',
        edit_mode: 'replace',
      },
      makeCtx(new Map()),
    )
    expect((r.data as { error: string }).error).toMatch(/not valid JSON/)
  })
})
