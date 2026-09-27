/**
 * engine/tools/notebook S-E2（§8.61 notebook 族子波）：NotebookEditTool 本体
 * unit 面（零盘——FsOperations mock 注入 + readFileState 真 Map duck 注入）。
 *
 *  - P-N1 对象面：name（toolNames 单一事实源同值 'NotebookEdit'）/ JSON schema
 *    常量字段转写（required 2 字段 + additionalProperties false +
 *    cell_type/edit_mode enum）/ TOOL_DEFAULTS 成员逐值（maxResultSizeChars
 *    100_000 / shouldDefer / strict / isConcurrencySafe false / isReadOnly
 *    false / isDestructive false / isEnabled / userFacingName 'Edit
 *    Notebook' / searchHint）/ getPath 逐字（原样 notebook_path）。
 *  - P-N2 toAutoClassifierInput 无条件双态（旧 TRANSCRIPT_CLASSIFIER 门裁
 *    delta ⑤：显式 edit_mode 'insert' / 缺省 default 'replace'）。
 *  - P-N3 validateInput 9 码面（mock fs + readFileState Map 注入）：UNC skip
 *    （// 头 → result true）/ ec2 扩展名 / ec4 mode 三值集 / ec5
 *    insert-requires-cell_type / ec9 未读 / ec10 stale（mtime > timestamp）/
 *    ec1 ENOENT / ec6 invalid JSON / ec7 index 越界 + 缺 cell_id 支 /
 *    ec8 cell_id 未找到。
 *  - P-N4 call 错误面（零盘）：invalid JSON error 面 / ENOENT error.message
 *    面 / 非 Error 抛 'Unknown error occurred while editing notebook' 面。
 *    注：call 成功面（replace/insert/delete 写回）不在 unit——writeTextContent
 *    原子/fallback 写链 = 裸 node fs（fileUtils L32 chmodSync/writeFileSync
 *    直引，FsOperations 不可 mock）→ func 层真盘面（
 *    engine-tools-notebook-se2-fs，plan/web func 先例）。
 *  - P-N5 mapToolResult 4 支逐字（Updated/Inserted/Deleted cell 模板 +
 *    Unknown edit mode + error is_error）。
 *  - P-N6 renderToolUseMessage 3 面（3 条件 null 守卫 /
 *    `${displayPath}@${cell_id}` 字符串面，delta ⑥ 非 verbose 面逐字）。
 *  - P-N7 prompt 面：description() = NOTEBOOK_EDIT_PROMPT 同一性 +
 *    NOTEBOOK_EDIT_DESCRIPTION 值锚点 + PROMPT legacy cell_number 措辞锚
 *    （delta ① prompt 逐字登记）。
 *  - P-N8 checkPermissions 三探针（P-C4 探针族写侧实例，sc6 先例：
 *    acceptEdits 工作目录内 → allow + decisionReason mode acceptEdits +
 *    updatedInput 透传 / acceptEdits 工作目录外 → ask / default 工作目录内 →
 *    ask（写面恒 ask 除非 acceptEdits；matchingRuleForInput = 桩 ① 规则面
 *    不可观察，登记））。
 *
 * 深度 import（门面归集）：../../src/engine/tools（本体 + schema + prompt 面
 * + 2 短描述别名 + toolNames 单一事实源）+ files 子门面 duck 型 + shared
 * FsOperations mock 注入 + permissions/bootstrap 双戳 FAKE_CWD 零盘。
 */
import {
  afterAll,
  beforeAll,
  afterEach,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  NOTEBOOK_EDIT_DESCRIPTION,
  NOTEBOOK_EDIT_PROMPT,
  NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA,
  NotebookEditTool,
  NOTEBOOK_EDIT_TOOL_NAME,
  type NotebookEditOutput,
} from '../../src/engine/tools'
import type {
  FileState,
  FilesToolUseContext,
  ReadFileState,
} from '../../src/engine/tools/files'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
  type ToolPermissionContext,
} from '../../src/shared'
import {
  resetPermissionsBootstrapEnv,
  setPermissionsBootstrapEnv,
} from '../../src/permissions'
import { setOriginalCwd, setCwdState } from '../../src/bootstrap'

// ── 公共夹具 ───────────────────────────────────────────────────────────

const FAKE_CWD = '/home/atlas-notebook/proj' // 不存在目录：realpath ENOENT 短路零盘
const NB = '/mock/nb.ipynb'
const MTIME = 1000

type Decision = {
  behavior: string
  updatedInput?: unknown
  decisionReason?: { type: string; mode?: string }
}

function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

/**
 * notebook 路径 fs mock（readFileSyncWithMetadata 链 = safeResolvePath
 * （lstatSync + realpathSync）+ readSync（BOM 探测）+ readFileSync +
 * statSync（mtime）；write 链 = readlinkSync/statSync（mock）+ 裸 node fs
 * 写（unit 成功面不可达，见头注 P-N4 注）。
 */
function makeNotebookFs(files: Record<string, string> = {}) {
  const fileMap = new Map(Object.entries(files))
  const ops: FsOperations = {
    cwd: () => '/mock-cwd',
    existsSync: p => fileMap.has(p),
    stat: async () => ({} as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => '',
    readFileSync: p => {
      const c = fileMap.get(p)
      if (c === undefined) throw enoent(p)
      return c
    },
    statSync: p => {
      // 探针面：缺失文件 = mtimeMs 0（真 fs 缺失面抛 ENOENT 会令 ec10 短路
      // 抢先于 ec1 支，探针面使 ec1 分支可达；真盘面行为 = func 层）
      if (fileMap.has(p)) return { mtimeMs: MTIME, mode: 0o644 } as never
      return { mtimeMs: 0, mode: 0o644 } as never
    },
    realpathSync: p => p,
    open: async () => ({} as never),
    unlinkSync: () => {},
    readdirSync: p => {
      throw enoent(p)
    },
    writeFileSync: (p, data) => {
      fileMap.set(p, data)
    },
    mkdirSync: () => {},
    lstatSync: p => {
      if (fileMap.has(p)) {
        return {
          isFIFO: () => false,
          isSocket: () => false,
          isCharacterDevice: () => false,
          isBlockDevice: () => false,
        } as never
      }
      throw enoent(p)
    },
    readFileBytes: async () => {
      throw enoent('mock')
    },
    readSync: p => {
      const c = fileMap.get(p)
      if (c === undefined) throw enoent(p)
      const buf = Buffer.from(c, 'utf8')
      return { buffer: buf.subarray(0, 4096), bytesRead: buf.length }
    },
    isDirEmptySync: () => false,
    readlinkSync: p => {
      const err = new Error(`EINVAL: not a symlink, readlink '${p}'`)
      err.code = 'EINVAL'
      throw err
    },
    renameSync: (from, to) => {
      const c = fileMap.get(from)
      if (c === undefined) throw enoent(from)
      fileMap.set(to, c)
      fileMap.delete(from)
    },
  }
  return { ops, files: fileMap }
}

/** readFileState duck（真 Map 即满足 ReadFileState get/set 面，delta ⑭ 先例）。 */
function makeReadFileState(
  entries: Record<string, [string, number]> = {},
): ReadFileState {
  const map = new Map<string, FileState>()
  for (const [p, [content, timestamp]] of Object.entries(entries)) {
    map.set(p, { content, timestamp, offset: undefined, limit: undefined })
  }
  return map
}

function makePermCtx(
  mode: ToolPermissionContext['mode'] = 'default',
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
}

function makeNotebookCtx(
  readFileState?: ReadFileState,
  mode: ToolPermissionContext['mode'] = 'default',
): FilesToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: makePermCtx(mode) }),
    abortController: new AbortController(),
    ...(readFileState ? { readFileState } : {}),
  }
}

beforeAll(() => {
  // permissions 域工作目录面 + bootstrap 域 cwd 面双戳 FAKE_CWD 零盘（sc6 先例）
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})
afterAll(() => {
  setOriginalFsImplementation()
  resetPermissionsBootstrapEnv()
})
afterEach(() => {
  setOriginalFsImplementation()
})

// ── P-N1 对象面 ─────────────────────────────────────────────────────────

describe('P-N1 对象面（shared Tool 契约纯对象）', () => {
  test('NotebookEditTool 对象面逐值', () => {
    expect(NotebookEditTool.name).toBe(NOTEBOOK_EDIT_TOOL_NAME)
    expect(NOTEBOOK_EDIT_TOOL_NAME).toBe('NotebookEdit')
    expect(NotebookEditTool.searchHint).toBe(
      'edit Jupyter notebook cells (.ipynb)',
    )
    expect(NotebookEditTool.maxResultSizeChars).toBe(100_000)
    expect(NotebookEditTool.shouldDefer).toBe(true)
    expect(NotebookEditTool.strict).toBe(true)
    expect(NotebookEditTool.isEnabled()).toBe(true)
    expect(NotebookEditTool.isConcurrencySafe(undefined)).toBe(false)
    expect(NotebookEditTool.isReadOnly(undefined)).toBe(false)
    expect(NotebookEditTool.isDestructive?.(undefined)).toBe(false)
    expect(NotebookEditTool.userFacingName(undefined)).toBe('Edit Notebook')
    expect(
      NotebookEditTool.getPath({ notebook_path: '/x/nb.ipynb' }),
    ).toBe('/x/nb.ipynb')
  })

  test('JSON schema 常量字段转写面（5 字段 2 必填 + 双 enum）', () => {
    expect(NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA.required).toEqual([
      'notebook_path',
      'new_source',
    ])
    expect(NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false)
    const props = NOTEBOOK_EDIT_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type?: string; enum?: string[] }
    >
    expect(props.cell_type?.enum).toEqual(['code', 'markdown'])
    expect(props.edit_mode?.enum).toEqual(['replace', 'insert', 'delete'])
    expect(props.notebook_path?.description).toContain(
      'must be absolute, not relative',
    )
  })
})

// ── P-N2 toAutoClassifierInput 无条件双态（delta ⑤ 门裁）───────────────

describe('P-N2 toAutoClassifierInput 无条件双态', () => {
  test('显式 edit_mode / 缺省 default replace', () => {
    expect(
      NotebookEditTool.toAutoClassifierInput({
        notebook_path: '/x/nb.ipynb',
        new_source: 's',
        edit_mode: 'insert',
      }),
    ).toBe('/x/nb.ipynb insert: s')
    expect(
      NotebookEditTool.toAutoClassifierInput({
        notebook_path: '/x/nb.ipynb',
        new_source: 's',
      }),
    ).toBe('/x/nb.ipynb replace: s')
  })
})

// ── P-N3 validateInput 9 码面 ──────────────────────────────────────────

describe('P-N3 validateInput 9 码面（mock fs + readFileState 注入）', () => {
  const VALID_NB = JSON.stringify({
    cells: [
      { cell_type: 'code', id: 'a', source: 'x', metadata: {} },
      { cell_type: 'markdown', id: 'b', source: 'm', metadata: {} },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  })

  test('UNC 路径（// 头）跳过文件系统面 → result true（NTLM 泄漏防御支）', async () => {
    const m = makeNotebookFs()
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      {
        notebook_path: '//server/share/x.ipynb',
        new_source: 's',
        cell_id: 'a',
      },
      makeNotebookCtx(),
    )
    expect(res).toEqual({ result: true })
  })

  test('ec2 非 .ipynb 扩展名 → 文案逐字（FileEdit 提示）', async () => {
    const m = makeNotebookFs()
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: '/mock/doc.txt', new_source: 's' },
      makeNotebookCtx(),
    )
    expect(res).toEqual({
      result: false,
      message:
        'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the FileEdit tool.',
      errorCode: 2,
    })
  })

  test('ec4 edit_mode 三值集外 → 文案逐字', async () => {
    const m = makeNotebookFs()
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      {
        notebook_path: NB,
        new_source: 's',
        edit_mode: 'banana',
      },
      makeNotebookCtx(),
    )
    expect(res).toEqual({
      result: false,
      message: 'Edit mode must be replace, insert, or delete.',
      errorCode: 4,
    })
  })

  test('ec5 insert 缺 cell_type → 文案逐字', async () => {
    const m = makeNotebookFs()
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      {
        notebook_path: NB,
        new_source: 's',
        edit_mode: 'insert',
      },
      makeNotebookCtx(),
    )
    expect(res).toEqual({
      result: false,
      message: 'Cell type is required when using edit_mode=insert.',
      errorCode: 5,
    })
  })

  test('ec9 未读（readFileState 无条目）→ Read-before-Edit 文案逐字', async () => {
    const m = makeNotebookFs({ [NB]: VALID_NB })
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'a' },
      makeNotebookCtx(), // 无 readFileState → 可选链缺省恒「未读」支
    )
    expect(res).toEqual({
      result: false,
      message: 'File has not been read yet. Read it first before writing to it.',
      errorCode: 9,
    })
  })

  test('ec10 stale（mtime > readTimestamp）→ 文案逐字', async () => {
    const m = makeNotebookFs({ [NB]: VALID_NB })
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'a' },
      makeNotebookCtx(makeReadFileState({ [NB]: ['', 0] })),
    )
    expect(res).toEqual({
      result: false,
      message:
        'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
      errorCode: 10,
    })
  })

  test('ec1 ENOENT（文件缺失）→ 文案逐字', async () => {
    const m = makeNotebookFs({})
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'a' },
      makeNotebookCtx(makeReadFileState({ [NB]: ['', MTIME] })),
    )
    expect(res).toEqual({
      result: false,
      message: 'Notebook file does not exist.',
      errorCode: 1,
    })
  })

  test('ec6 非法 JSON → 文案逐字', async () => {
    const m = makeNotebookFs({ [NB]: 'not json' })
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'a' },
      makeNotebookCtx(makeReadFileState({ [NB]: ['not json', MTIME] })),
    )
    expect(res).toEqual({
      result: false,
      message: 'Notebook is not valid JSON.',
      errorCode: 6,
    })
  })

  test('ec7 双支：cell-N index 越界 / 缺 cell_id 非 insert', async () => {
    const m = makeNotebookFs({ [NB]: VALID_NB })
    setFsImplementation(m.ops)
    const r1 = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'cell-99' },
      makeNotebookCtx(makeReadFileState({ [NB]: [VALID_NB, MTIME] })),
    )
    expect(r1).toEqual({
      result: false,
      message: 'Cell with index 99 does not exist in notebook.',
      errorCode: 7,
    })
    const r2 = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's' },
      makeNotebookCtx(makeReadFileState({ [NB]: [VALID_NB, MTIME] })),
    )
    expect(r2).toEqual({
      result: false,
      message: 'Cell ID must be specified when not inserting a new cell.',
      errorCode: 7,
    })
  })

  test('ec8 cell_id 未找到（非 cell-N 形）→ 文案逐字', async () => {
    const m = makeNotebookFs({ [NB]: VALID_NB })
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'nope' },
      makeNotebookCtx(makeReadFileState({ [NB]: [VALID_NB, MTIME] })),
    )
    expect(res).toEqual({
      result: false,
      message: 'Cell with ID "nope" not found in notebook.',
      errorCode: 8,
    })
  })

  test('合法面：cell_id 命中 → result true', async () => {
    const m = makeNotebookFs({ [NB]: VALID_NB })
    setFsImplementation(m.ops)
    const res = await NotebookEditTool.validateInput(
      { notebook_path: NB, new_source: 's', cell_id: 'a' },
      makeNotebookCtx(makeReadFileState({ [NB]: [VALID_NB, MTIME] })),
    )
    expect(res).toEqual({ result: true })
  })
})

// ── P-N4 call 错误面（零盘；成功面 → func 层真盘）─────────────────────

describe('P-N4 call 错误面（零盘）', () => {
  test('invalid JSON → error 面逐字（cell_id/notebook_path 透传 + 空 original/updated）', async () => {
    const m = makeNotebookFs({ [NB]: 'oops' })
    setFsImplementation(m.ops)
    const r = await NotebookEditTool.call(
      {
        notebook_path: NB,
        new_source: 'x',
        cell_id: 'a',
        cell_type: 'code',
        edit_mode: 'replace',
      },
      makeNotebookCtx(makeReadFileState({ [NB]: ['oops', MTIME] })),
    )
    expect(r.data).toEqual({
      new_source: 'x',
      cell_type: 'code',
      language: 'python',
      edit_mode: 'replace',
      error: 'Notebook is not valid JSON.',
      cell_id: 'a',
      notebook_path: NB,
      original_file: '',
      updated_file: '',
    })
  })

  test('ENOENT → error.message 面（catch Error 支）', async () => {
    const m = makeNotebookFs({})
    setFsImplementation(m.ops)
    const r = await NotebookEditTool.call(
      { notebook_path: NB, new_source: 'x' },
      makeNotebookCtx(makeReadFileState({ [NB]: ['', 0] })),
    )
    const data = r.data as NotebookEditOutput
    expect(data.error).toContain('ENOENT')
    expect(data.notebook_path).toBe(NB)
    expect(data.language).toBe('python')
  })

  test('非 Error 抛出 → Unknown error 面（catch 双支另一支）', async () => {
    const m = makeNotebookFs({})
    setFsImplementation({
      ...m.ops,
      readSync: () => {
        throw 'boom'
      },
    })
    const r = await NotebookEditTool.call(
      { notebook_path: NB, new_source: 'x' },
      makeNotebookCtx(makeReadFileState({ [NB]: ['', 0] })),
    )
    expect((r.data as NotebookEditOutput).error).toBe(
      'Unknown error occurred while editing notebook',
    )
  })
})

// ── P-N5 mapToolResult 4 支逐字 ────────────────────────────────────────

describe('P-N5 mapToolResult 4 支', () => {
  const base = {
    new_source: 's',
    cell_id: 'a',
    cell_type: 'code' as const,
    language: 'python',
    notebook_path: NB,
    original_file: '',
    updated_file: '',
  }

  test('error 支：content = error + is_error', () => {
    expect(
      NotebookEditTool.mapToolResultToToolResultBlockParam(
        { ...base, edit_mode: 'replace', error: 'boom' },
        't1',
      ),
    ).toEqual({
      tool_use_id: 't1',
      type: 'tool_result',
      content: 'boom',
      is_error: true,
    })
  })

  test('replace/insert/delete/unknown 四模板逐字', () => {
    expect(
      NotebookEditTool.mapToolResultToToolResultBlockParam(
        { ...base, edit_mode: 'replace' },
        't2',
      ),
    ).toEqual({
      tool_use_id: 't2',
      type: 'tool_result',
      content: 'Updated cell a with s',
    })
    expect(
      NotebookEditTool.mapToolResultToToolResultBlockParam(
        { ...base, edit_mode: 'insert' },
        't3',
      ),
    ).toEqual({
      tool_use_id: 't3',
      type: 'tool_result',
      content: 'Inserted cell a with s',
    })
    expect(
      NotebookEditTool.mapToolResultToToolResultBlockParam(
        { ...base, edit_mode: 'delete' },
        't4',
      ),
    ).toEqual({
      tool_use_id: 't4',
      type: 'tool_result',
      content: 'Deleted cell a',
    })
    expect(
      NotebookEditTool.mapToolResultToToolResultBlockParam(
        { ...base, edit_mode: 'weird' },
        't5',
      ),
    ).toEqual({
      tool_use_id: 't5',
      type: 'tool_result',
      content: 'Unknown edit mode',
    })
  })
})

// ── P-N6 renderToolUseMessage 字符串面（delta ⑥ 非 verbose 面逐字）───

describe('P-N6 renderToolUseMessage 3 面', () => {
  test('3 条件 null 守卫（notebook_path/new_source/cell_type 缺任一）', () => {
    expect(
      NotebookEditTool.renderToolUseMessage({}, { verbose: false }),
    ).toBe(null)
    expect(
      NotebookEditTool.renderToolUseMessage(
        { notebook_path: NB, cell_type: 'code' },
        { verbose: false },
      ),
    ).toBe(null)
    expect(
      NotebookEditTool.renderToolUseMessage(
        { notebook_path: NB, new_source: 's' },
        { verbose: false },
      ),
    ).toBe(null)
  })

  test('`${displayPath}@${cell_id}` 字符串面（工作目录内相对面）', () => {
    expect(
      NotebookEditTool.renderToolUseMessage(
        {
          notebook_path: `${FAKE_CWD}/sub/nb.ipynb`,
          cell_id: 'a',
          new_source: 's',
          cell_type: 'code',
        },
        { verbose: false },
      ),
    ).toBe('sub/nb.ipynb@a')
  })
})

// ── P-N7 prompt 面 ─────────────────────────────────────────────────────

describe('P-N7 prompt 面', () => {
  test('description() = NOTEBOOK_EDIT_PROMPT 同一性', async () => {
    expect(await NotebookEditTool.description(undefined, {})).toBe(
      NOTEBOOK_EDIT_PROMPT,
    )
  })

  test('NOTEBOOK_EDIT_DESCRIPTION 值锚点（门面别名重出面）', () => {
    expect(NOTEBOOK_EDIT_DESCRIPTION).toBe(
      'Replace the contents of a specific cell in a Jupyter notebook.',
    )
  })

  test('PROMPT legacy cell_number 措辞逐字（delta ① prompt 登记锚）', () => {
    expect(NOTEBOOK_EDIT_PROMPT).toContain('The cell_number is 0-indexed.')
  })
})

// ── P-N8 checkPermissions 三探针（P-C4 写侧探针族，sc6 先例）──────────

describe('P-N8 checkPermissions 三探针（写面接线 = checkWritePermissionForTool）', () => {
  test('acceptEdits 工作目录内（无规则）→ allow + decisionReason mode + updatedInput 透传', async () => {
    const input = { notebook_path: `${FAKE_CWD}/sub/nb.ipynb`, new_source: 'x' }
    const dec = (await NotebookEditTool.checkPermissions(
      input,
      makeNotebookCtx(undefined, 'acceptEdits'),
    )) as Decision
    expect(dec.behavior).toBe('allow')
    expect(dec.decisionReason).toEqual({ type: 'mode', mode: 'acceptEdits' })
    expect(dec.updatedInput).toBe(input)
  })

  test('acceptEdits 工作目录外 → ask', async () => {
    const dec = (await NotebookEditTool.checkPermissions(
      { notebook_path: '/etc/nb.ipynb', new_source: 'x' },
      makeNotebookCtx(undefined, 'acceptEdits'),
    )) as Decision
    expect(dec.behavior).toBe('ask')
  })

  test('default 工作目录内 → ask（写面恒 ask 除非 acceptEdits，读/写面判别）', async () => {
    const dec = (await NotebookEditTool.checkPermissions(
      { notebook_path: `${FAKE_CWD}/sub/nb.ipynb`, new_source: 'x' },
      makeNotebookCtx(undefined, 'default'),
    )) as Decision
    expect(dec.behavior).toBe('ask')
  })
})
