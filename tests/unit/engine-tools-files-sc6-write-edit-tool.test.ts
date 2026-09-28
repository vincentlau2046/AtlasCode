/**
 * engine/tools/files S-C6 WriteTool + EditTool 本体 unit 面（§8.55，高频族
 * 纵切子波 3）。
 *
 * unit 层（零磁盘——S-C5 同纪律：permissions bootstrap-env 双戳 + bootstrap
 * cwd 双戳 不存在目录 FAKE_CWD，无 fixture 无写）：
 *  - WriteTool / EditTool 对象面（新仓 shared Tool 契约 = 纯对象，非
 *    buildTool；S-B5/S-C4/S-C5 先例）：name / JSON schema 字段面（Write
 *    2 字段双必填 / Edit 4 字段 3 必填 + replace_all 可选）/ maxResult
 *    SizeChars 100_000 / strict / searchHint / TOOL_DEFAULTS 成员逐值
 *    （delta ④）/ toAutoClassifierInput 逐字（`${file_path}: ${content}` /
 *    `${file_path}: ${new_string}`）/ userFacingName 支（Write 恒 'Write'
 *    delta ⑩ / Edit old_string===''→'Create' 其余 'Update' delta ⑫）/
 *    getPath 逐字（原样 file_path，非 expand）/ description() 同源
 *    （delta ③ 旧 prompt 体）/ renderToolUseMessage 3 支（delta ⑪/⑬
 *    displayPath 最小形）。
 *  - **checkPermissions 一线接线 = P-C4 探针族写侧实例 3 红集**：acceptEdits
 *    工作目录内 allow（decisionReason mode acceptEdits + updatedInput 透传）
 *    / acceptEdits 工作目录外 ask / default 工作目录内 ask（decisionReason
 *    undefined——写面与读面关键判别：读 default 工作目录内 allow，写恒
 *    ask 除非 acceptEdits；matchingRuleForInput = 桩 ① 规则求值波前向
 *    接缝，规则面不可观察，登记）。
 *  - WriteTool.validateInput 面（纯路径面零 I/O）：ENOENT → result true /
 *    双站点兼容 delta ⑥（{ signal } 最小面 = 引擎 dispatch 站点，无
 *    getAppState → 跳 deny 检查零 delta）。UNC 跳支（\\\\ 头 / // 头）=
 *    Windows NTLM 凭据泄漏防御面，POSIX 测试平台不可达（expandPath 折叠
 *    双斜杠）→ 不在此断言（源体逐字保留，头注登记防当遗漏重提，S-C5
 *    先例同源）。errorCode 2/3/4（已读态/stale/memory frontmatter）= 需
 *    既有磁盘文件 → func 层（engine-tools-files-sc6 func 文件）。
 *  - EditTool.validateInput 面（纯路径面零 I/O）：errorCode 1（old==new）/
 *    文件不存在 + old_string==='' → result true（新文件创建支）/ 文件不
 *    存在 + old_string 非空 → errorCode 4（findSimilarFile/suggestPath
 *    UnderCwd 双 ENOENT 安全零盘 + FILE_NOT_FOUND_CWD_NOTE + getCwd()
 *    面）/ 双站点兼容 delta ⑥。errorCode 5（.ipynb）/6（未读）/7
 *    （stale）/8（not-found）/9（multi-match）/10（过大）= 需既有磁盘
 *    文件 → func 层。
 *  - mapToolResultToToolResultBlockParam 纯函数面：Write 2 支（create /
 *    update，旧 L416/422 逐字）+ Edit 4 支（replaceAll×userModified 笛卡
 *    尔，modifiedNote 尾缀 '. ' + '.' 拼接 quirk 旧 L553-568 逐字）。
 *  - fileEditUtils 纯函数面（零 I/O）：normalizeQuotes 4 弯引号→直 /
 *    stripTrailingWhitespace 逐行尾白（LF/CRLF 保尾）/ findActualString
 *    （精确支 / 弯引号归一回映支 / 缺失 null 支）/ preserveQuoteStyle
 *    （无归一直通 / 双弯引号 new_string 弯引号化 / 撇号缩合支）/
 *    applyEditToFile（replace / replaceAll / new_string 空 + 尾换行剥离支）/
 *    normalizeFileEditInput（文件缺失 ENOENT → 原样透传零盘支）/
 *    areFileEditsEquivalent（字面等快路 / 结果等价支 / 双抛错同错支）。
 *  - **P-C3 探针锚点（Edit structuredPatch 面）**：getPatchForEdit 单编辑
 *    structuredPatch 形状（diff v9 字段面 oldStart/oldLines/newStart/
 *    newLines/前缀行 lines，实测探针落值）+ replaceAll 多发生支 +
 *    getPatchForEdits 3 抛错支（not-found / 前编辑 new_string 子串 /
 *    无净变化）。
 *
 * 深度 import（门面归集本切片落地，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（WriteTool / EditTool / 两 SCHEMA / 两 Output
 *  型 / WriteToolInput 型 / fileEditUtils 19 名 + 4 弯引号常量 +
 *  getEditToolDescription / getWriteToolDescription /
 *  FILE_UNEXPECTEDLY_MODIFIED_ERROR）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  WriteTool,
  EditTool,
  WRITE_TOOL_INPUT_SCHEMA,
  EDIT_TOOL_INPUT_SCHEMA,
  type WriteOutput,
  type EditOutput,
  FILE_WRITE_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_UNEXPECTEDLY_MODIFIED_ERROR,
  getWriteToolDescription,
  getEditToolDescription,
  normalizeQuotes,
  stripTrailingWhitespace,
  findActualString,
  preserveQuoteStyle,
  applyEditToFile,
  getPatchForEdit,
  getPatchForEdits,
  normalizeFileEditInput,
  areFileEditsEquivalent,
  LEFT_SINGLE_CURLY_QUOTE,
  RIGHT_SINGLE_CURLY_QUOTE,
  LEFT_DOUBLE_CURLY_QUOTE,
  RIGHT_DOUBLE_CURLY_QUOTE,
  type FilesToolUseContext,
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
import type { ToolPermissionContext } from '../../src/shared'

// ── 公共夹具（S-C4/S-C5 同形）──────────────────────────────────────────

const FAKE_CWD = '/home/atlas-sc6/proj' // 不存在目录：realpath ENOENT 短路零盘

function makeCtx(
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

function makeFilesCtx(
  ctx: ToolPermissionContext,
): FilesToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: ctx }),
    abortController: new AbortController(),
  }
}

let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  // permissions 域工作目录面 + bootstrap 域 cwd 面双戳 FAKE_CWD 零盘
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  // bootstrap cwd 面存还对称复位（单进程连跑不跨文件泄漏）
  savedOriginalCwd = getOriginalCwd()
  savedCwdState = getCwdState()
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})

afterAll(() => {
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
  resetPermissionsBootstrapEnv()
})

type Decision = {
  behavior: string
  updatedInput?: unknown
  decisionReason?: { type: string; mode?: string }
}

// ── WriteTool 对象面（shared Tool 契约纯对象）──────────────────────────

describe('WriteTool 对象面', () => {
  test('name / schema 引用 / 展示面 / TOOL_DEFAULTS 逐值', () => {
    expect(WriteTool.name).toBe(FILE_WRITE_TOOL_NAME)
    expect(WriteTool.name).toBe('Write')
    expect(WriteTool.inputSchema).toBe(WRITE_TOOL_INPUT_SCHEMA)
    expect(WriteTool.inputJSONSchema).toBe(WRITE_TOOL_INPUT_SCHEMA)
    expect(WriteTool.maxResultSizeChars).toBe(100_000)
    expect(WriteTool.strict).toBe(true)
    expect(WriteTool.searchHint).toBe('create or overwrite files')
    expect(WriteTool.isEnabled()).toBe(true)
    expect(WriteTool.isConcurrencySafe(null)).toBe(false)
    expect(WriteTool.isReadOnly(null)).toBe(false)
    expect(WriteTool.isDestructive?.(null)).toBe(false)
    // delta ⑩：最小 'Write'（旧 plans 支 TUI 波残留守）
    expect(WriteTool.userFacingName(null)).toBe('Write')
  })

  test('JSON schema 2 字段双必填（旧 zod strictObject 逐字段转写）', () => {
    expect(WRITE_TOOL_INPUT_SCHEMA.type).toBe('object')
    const props = WRITE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type?: string }
    >
    expect(Object.keys(props)).toEqual(['file_path', 'content'])
    expect(WRITE_TOOL_INPUT_SCHEMA.required).toEqual(['file_path', 'content'])
  })

  test('toAutoClassifierInput 逐字（`${file_path}: ${content}`）', () => {
    expect(
      WriteTool.toAutoClassifierInput({
        file_path: '/a/b.txt',
        content: 'x',
      }),
    ).toBe('/a/b.txt: x')
  })

  test('getPath 逐字：原样 file_path（非 expand，旧 L 原样）', () => {
    expect(WriteTool.getPath({ file_path: 'rel/x' })).toBe('rel/x')
    expect(WriteTool.getPath({ file_path: '/abs/x' })).toBe('/abs/x')
  })

  test('description() = 旧 prompt 体（delta ③）', async () => {
    const d = await WriteTool.description(null, {
      isNonInteractiveSession: true,
      toolPermissionContext: null,
      tools: [],
    })
    expect(d).toBe(getWriteToolDescription())
    expect(d).toContain('This tool will overwrite the existing file')
    // 旧源 — 转义逐字（em-dash 行）
    expect(d).toContain('it only sends the diff')
    expect(d).toContain('NEVER create documentation files')
  })

  test('renderToolUseMessage 支面（delta ⑪ displayPath 最小形）', () => {
    expect(WriteTool.renderToolUseMessage({}, { verbose: true })).toBeNull()
    // verbose → 全路径原样
    expect(
      WriteTool.renderToolUseMessage(
        { file_path: '/a/b/c.txt', content: '' },
        { verbose: true },
      ),
    ).toBe('/a/b/c.txt')
    // 非 verbose + cwd 内路径 → 相对化 displayPath
    expect(
      WriteTool.renderToolUseMessage(
        { file_path: `${FAKE_CWD}/sub/c.txt`, content: '' },
        { verbose: false },
      ),
    ).toBe('sub/c.txt')
    // 非 verbose + cwd 外路径（非 home）→ 绝对路径原样回退支
    expect(
      WriteTool.renderToolUseMessage(
        { file_path: '/a/b/c.txt', content: '' },
        { verbose: false },
      ),
    ).toBe('/a/b/c.txt')
  })

  test('extractSearchText 恒 ""（delta ⑪ 头注逐字：phantom 索引）', () => {
    expect(WriteTool.extractSearchText?.({})).toBe('')
  })
})

// ── EditTool 对象面（shared Tool 契约纯对象）──────────────────────────

describe('EditTool 对象面', () => {
  test('name / schema 引用 / 展示面 / TOOL_DEFAULTS 逐值', () => {
    expect(EditTool.name).toBe(FILE_EDIT_TOOL_NAME)
    expect(EditTool.name).toBe('Edit')
    expect(EditTool.inputSchema).toBe(EDIT_TOOL_INPUT_SCHEMA)
    expect(EditTool.inputJSONSchema).toBe(EDIT_TOOL_INPUT_SCHEMA)
    expect(EditTool.maxResultSizeChars).toBe(100_000)
    expect(EditTool.strict).toBe(true)
    expect(EditTool.searchHint).toBe('modify file contents in place')
    expect(EditTool.isEnabled()).toBe(true)
    expect(EditTool.isConcurrencySafe(null)).toBe(false)
    expect(EditTool.isReadOnly(null)).toBe(false)
    expect(EditTool.isDestructive?.(null)).toBe(false)
    // delta ⑫：old_string==='' → 'Create' / 其余 'Update'
    expect(EditTool.userFacingName({ old_string: '' })).toBe('Create')
    expect(EditTool.userFacingName({ old_string: 'a', new_string: 'b' })).toBe(
      'Update',
    )
  })

  test('JSON schema 4 字段 3 必填 + replace_all 可选', () => {
    expect(EDIT_TOOL_INPUT_SCHEMA.type).toBe('object')
    const props = EDIT_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type?: string }
    >
    expect(Object.keys(props)).toEqual([
      'file_path',
      'old_string',
      'new_string',
      'replace_all',
    ])
    expect(EDIT_TOOL_INPUT_SCHEMA.required).toEqual([
      'file_path',
      'old_string',
      'new_string',
    ])
  })

  test('toAutoClassifierInput 逐字（`${file_path}: ${new_string}`）', () => {
    expect(
      EditTool.toAutoClassifierInput({
        file_path: '/a/b.txt',
        old_string: 'a',
        new_string: 'b',
      }),
    ).toBe('/a/b.txt: b')
  })

  test('getPath 逐字：原样 file_path（非 expand）', () => {
    expect(EditTool.getPath({ file_path: 'rel/x' })).toBe('rel/x')
    expect(EditTool.getPath({ file_path: '/abs/x' })).toBe('/abs/x')
  })

  test('description() = 旧 prompt 体（delta ③）', async () => {
    const d = await EditTool.description(null, {
      isNonInteractiveSession: true,
      toolPermissionContext: null,
      tools: [],
    })
    expect(d).toBe(getEditToolDescription())
    expect(d).toContain('Performs exact string replacements in files.')
    expect(d).toContain('old_string')
    expect(d).toContain('replace_all')
  })

  test('renderToolUseMessage 支面（delta ⑬ displayPath 最小形）', () => {
    expect(EditTool.renderToolUseMessage({}, { verbose: true })).toBeNull()
    // verbose → 全路径原样
    expect(
      EditTool.renderToolUseMessage(
        { file_path: '/a/b/c.txt', old_string: 'a', new_string: 'b' },
        { verbose: true },
      ),
    ).toBe('/a/b/c.txt')
    // 非 verbose + cwd 内路径 → 相对化 displayPath
    expect(
      EditTool.renderToolUseMessage(
        { file_path: `${FAKE_CWD}/sub/c.txt`, old_string: 'a', new_string: 'b' },
        { verbose: false },
      ),
    ).toBe('sub/c.txt')
    // 非 verbose + cwd 外路径（非 home）→ 绝对路径原样回退支
    expect(
      EditTool.renderToolUseMessage(
        { file_path: '/a/b/c.txt', old_string: 'a', new_string: 'b' },
        { verbose: false },
      ),
    ).toBe('/a/b/c.txt')
  })
})

// ── checkPermissions 一线接线（P-C4 写侧探针 3 红集）────────────────────

describe('checkPermissions 一线接线（P-C4 写侧 3 红集 {acceptEdits 内 allow, acceptEdits 外 ask, default 内 ask}）', () => {
  test('Write acceptEdits 工作目录内（无规则）→ allow + mode acceptEdits + updatedInput 透传', async () => {
    const input = { file_path: `${FAKE_CWD}/sub/f.txt`, content: 'x' }
    const dec = (await WriteTool.checkPermissions(
      input,
      makeFilesCtx(makeCtx('acceptEdits')),
    )) as Decision
    expect(dec.behavior).toBe('allow')
    expect(dec.decisionReason).toEqual({ type: 'mode', mode: 'acceptEdits' })
    expect(dec.updatedInput).toBe(input)
  })

  test('Write acceptEdits 工作目录外（无规则）→ ask', async () => {
    const dec = (await WriteTool.checkPermissions(
      { file_path: '/etc/hostname', content: 'x' },
      makeFilesCtx(makeCtx('acceptEdits')),
    )) as Decision
    expect(dec.behavior).toBe('ask')
  })

  test('Edit default 工作目录内（无规则）→ ask decisionReason undefined（写面恒 ask 判别）', async () => {
    const dec = (await EditTool.checkPermissions(
      {
        file_path: `${FAKE_CWD}/sub/f.txt`,
        old_string: 'a',
        new_string: 'b',
      },
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('ask')
    expect(dec.decisionReason).toBeUndefined()
  })

  test('Edit acceptEdits 工作目录内 → allow（Edit 写侧同面）', async () => {
    const dec = (await EditTool.checkPermissions(
      {
        file_path: `${FAKE_CWD}/sub/f.txt`,
        old_string: 'a',
        new_string: 'b',
      },
      makeFilesCtx(makeCtx('acceptEdits')),
    )) as Decision
    expect(dec.behavior).toBe('allow')
    expect(dec.decisionReason).toEqual({ type: 'mode', mode: 'acceptEdits' })
  })
})

// ── WriteTool.validateInput 面（纯路径面零 I/O）────────────────────────

describe('WriteTool.validateInput 面', () => {
  test('ENOENT（不存在文件）→ result true（create 支）', async () => {
    expect(
      await WriteTool.validateInput?.({
        file_path: 'sub/new.txt',
        content: 'x',
      }),
    ).toEqual({ result: true })
  })

  test('双站点兼容（delta ⑥）：{ signal } 最小面（引擎 dispatch 站点）→ 跳 deny 检查零 delta', async () => {
    const signal = new AbortController().signal
    expect(
      await WriteTool.validateInput?.(
        { file_path: 'sub/new.txt', content: 'x' },
        { signal },
      ),
    ).toEqual({ result: true })
  })
})

// ── EditTool.validateInput 面（纯路径面零 I/O）────────────────────────

describe('EditTool.validateInput 面', () => {
  test('old_string === new_string → errorCode 1', async () => {
    const v = (await EditTool.validateInput?.({
      file_path: 'a.txt',
      old_string: 'x',
      new_string: 'x',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(1)
    expect(v.message).toContain('exactly the same')
  })

  test('文件不存在 + old_string==="" → result true（新文件创建支）', async () => {
    expect(
      await EditTool.validateInput?.({
        file_path: 'new-file.txt',
        old_string: '',
        new_string: 'hello',
      }),
    ).toEqual({ result: true })
  })

  test('文件不存在 + old_string 非空 → errorCode 4（CWD 注记面，双 ENOENT 安全零盘）', async () => {
    const v = (await EditTool.validateInput?.({
      file_path: 'no-such-file.txt',
      old_string: 'abc',
      new_string: 'def',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(4)
    expect(v.message).toBe(
      `File does not exist. Note: your current working directory is ${FAKE_CWD}.`,
    )
  })

  test('双站点兼容（delta ⑥）：{ signal } 最小面 → 跳 deny 检查零 delta（errorCode 1 面不变）', async () => {
    const v = (await EditTool.validateInput?.(
      { file_path: 'a.txt', old_string: 'x', new_string: 'x' },
      { signal: new AbortController().signal },
    )) as { result: boolean; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(1)
  })
})

// ── mapToolResult 纯函数面（旧 L 逐字）────────────────────────────────

function writeData(p: Partial<WriteOutput> & { type: 'create' | 'update' }): WriteOutput {
  return {
    filePath: '/x/f.txt',
    content: 'c',
    structuredPatch: [],
    originalFile: null,
    ...p,
  }
}

function editData(p: Partial<EditOutput>): EditOutput {
  return {
    filePath: '/x/f.txt',
    oldString: 'a',
    newString: 'b',
    originalFile: 'a',
    structuredPatch: [],
    userModified: false,
    replaceAll: false,
    ...p,
  }
}

describe('mapToolResult 纯函数面', () => {
  test('Write create 支（旧 L416 逐字）', () => {
    const block = WriteTool.mapToolResultToToolResultBlockParam(
      writeData({ type: 'create' }),
      'tu-w1',
    )
    expect(block).toEqual({
      tool_use_id: 'tu-w1',
      type: 'tool_result',
      content: 'File created successfully at: /x/f.txt',
    })
  })

  test('Write update 支（旧 L422 逐字）', () => {
    const block = WriteTool.mapToolResultToToolResultBlockParam(
      writeData({ type: 'update', originalFile: 'old' }),
      'tu-w2',
    )
    expect(block).toEqual({
      tool_use_id: 'tu-w2',
      type: 'tool_result',
      content: 'The file /x/f.txt has been updated successfully.',
    })
  })

  test('Edit replaceAll=false userModified=false 支（旧 L568 逐字）', () => {
    const block = EditTool.mapToolResultToToolResultBlockParam(
      editData({}),
      'tu-e1',
    )
    expect(block).toEqual({
      tool_use_id: 'tu-e1',
      type: 'tool_result',
      content: 'The file /x/f.txt has been updated successfully.',
    })
  })

  test('Edit replaceAll=true 支（旧 L561 逐字）', () => {
    const block = EditTool.mapToolResultToToolResultBlockParam(
      editData({ replaceAll: true }),
      'tu-e2',
    )
    expect(block).toEqual({
      tool_use_id: 'tu-e2',
      type: 'tool_result',
      content:
        'The file /x/f.txt has been updated. All occurrences were successfully replaced.',
    })
  })

  test('Edit userModified=true 支（modifiedNote 尾缀 quirk 旧 L553-568 逐字）', () => {
    const block = EditTool.mapToolResultToToolResultBlockParam(
      editData({ userModified: true }),
      'tu-e3',
    )
    // modifiedNote = '.  The user ... them. ' 尾空格 + 模板尾 '.' 拼接 quirk
    expect(block).toEqual({
      tool_use_id: 'tu-e3',
      type: 'tool_result',
      content:
        'The file /x/f.txt has been updated successfully.  The user modified your proposed changes before accepting them. .',
    })
  })
})

// ── fileEditUtils 纯函数面（零 I/O）────────────────────────────────────

describe('fileEditUtils 纯函数面', () => {
  test('normalizeQuotes：4 弯引号常量 → 直引号', () => {
    expect(
      normalizeQuotes(
        `${LEFT_SINGLE_CURLY_QUOTE}a${RIGHT_SINGLE_CURLY_QUOTE} ${LEFT_DOUBLE_CURLY_QUOTE}b${RIGHT_DOUBLE_CURLY_QUOTE}`,
      ),
    ).toBe("'a' \"b\"")
    expect(normalizeQuotes("plain 'a\"b")).toBe("plain 'a\"b")
  })

  test('stripTrailingWhitespace：逐行尾白（LF/CRLF 行尾保尾）', () => {
    expect(stripTrailingWhitespace('a  \nb\t\nc ')).toBe('a\nb\nc')
    expect(stripTrailingWhitespace('a  \r\nb\t')).toBe('a\r\nb')
  })

  test('findActualString：精确支 / 弯引号归一回映支 / 缺失 null 支', () => {
    const file = `say "hello" to world`
    // 精确命中原样返回
    expect(findActualString(file, 'hello')).toBe('hello')
    // 模型给直引号、文件用弯引号 → 归一后定位并回映文件实际子串
    const curlyFile = `say “hello” to world`
    expect(findActualString(curlyFile, 'say "hello"')).toBe('say “hello”')
    expect(findActualString(file, 'absent-xyz')).toBeNull()
  })

  test('preserveQuoteStyle：无归一直通 / 弯引号文件 new_string 弯引号化', () => {
    // old === actual（无归一发生）→ new 原样
    expect(preserveQuoteStyle('a', 'a', 'x "y"')).toBe('x "y"')
    // 旧串经弯引号归一命中 → new 中 " 按开闭启发式转弯引号
    expect(
      preserveQuoteStyle('say "hi"', `say “hi”`, 'say "bye"'),
    ).toBe(`say “bye”`)
    // 撇号缩合支（don't → don’）
    expect(preserveQuoteStyle("it's", `it’s`, "don't")).toBe(`don’t`)
  })

  test('applyEditToFile：replace / replaceAll / 空 new_string 尾换行剥离支', () => {
    expect(applyEditToFile('aXb', 'X', 'Y')).toBe('aYb')
    expect(applyEditToFile('x x x', 'x', 'z', true)).toBe('z z z')
    // new_string 空 + old 后跟换行 → 连同换行删
    expect(applyEditToFile('keep\nrm\nafter', 'rm', '')).toBe('keep\nafter')
    // 非 replaceAll 仅首处
    expect(applyEditToFile('x-x', 'x', 'y')).toBe('y-x')
  })

  test('normalizeFileEditInput：文件缺失（ENOENT）→ 原样透传零盘', () => {
    const input = {
      file_path: `${FAKE_CWD}/missing.txt`,
      edits: [{ old_string: 'a', new_string: 'b  ', replace_all: false }],
    }
    const out = normalizeFileEditInput(input)
    // ENOENT catch 支 → 原输入（含尾空格 new_string 未剥离）
    expect(out).toEqual(input)
  })

  test('areFileEditsEquivalent：字面等快路 / 结果等价支', () => {
    const e1 = [{ old_string: 'a', new_string: 'b', replace_all: false }]
    expect(
      areFileEditsEquivalent(
        e1,
        [{ old_string: 'a', new_string: 'b', replace_all: false }],
        'a',
      ),
    ).toBe(true)
    // 字面不同但应用结果同（单段 vs 两段拆分）→ 结果比较支（非快路）
    expect(
      areFileEditsEquivalent(
        [{ old_string: 'ab', new_string: 'cd', replace_all: false }],
        [
          { old_string: 'a', new_string: 'c', replace_all: false },
          { old_string: 'b', new_string: 'd', replace_all: false },
        ],
        'xab',
      ),
    ).toBe(true)
    // 不同结果 → false
    expect(
      areFileEditsEquivalent(
        [{ old_string: 'ab', new_string: 'cd', replace_all: false }],
        [{ old_string: 'ab', new_string: 'zz', replace_all: false }],
        'xab',
      ),
    ).toBe(false)
  })
})

// ── P-C3 探针锚点（Edit structuredPatch 面）────────────────────────────

describe('P-C3 structuredPatch 面（getPatchForEdit/getPatchForEdits）', () => {
  test('单编辑替换：hunk 形状（diff v9 字段面）+ updatedFile 正确', () => {
    const { patch, updatedFile } = getPatchForEdit({
      filePath: 'a.txt',
      fileContents: 'l1\nl2\nl3\n',
      oldString: 'l2',
      newString: 'L2a\nL2b',
    })
    expect(updatedFile).toBe('l1\nL2a\nL2b\nl3\n')
    expect(patch.length).toBe(1)
    // diff v9 StructuredPatchHunk 字段面（oldStart/oldLines/newStart/newLines/
    // lines 前缀行）：1 行删 + 2 行增（CONTEXT_LINES=3 上下文面）
    const hunk = patch[0]!
    expect(hunk.oldStart).toBe(1)
    expect(hunk.oldLines).toBe(3)
    expect(hunk.newStart).toBe(1)
    expect(hunk.newLines).toBe(4)
    expect(hunk.lines).toEqual([' l1', '-l2', '+L2a', '+L2b', ' l3'])
  })

  test('replaceAll 多发生支：单编辑全替换', () => {
    const { patch, updatedFile } = getPatchForEdit({
      filePath: 'a.txt',
      fileContents: 'x\ny\nx\n',
      oldString: 'x',
      newString: 'X',
      replaceAll: true,
    })
    expect(updatedFile).toBe('X\ny\nX\n')
    expect(patch.length).toBeGreaterThan(0)
  })

  test('getPatchForEdits 抛错支 1：not-found', () => {
    expect(() =>
      getPatchForEdits({
        filePath: 'a.txt',
        fileContents: 'a\n',
        edits: [{ old_string: 'zzz', new_string: 'b', replace_all: false }],
      }),
    ).toThrow('String not found in file. Failed to apply edit.')
  })

  test('getPatchForEdits 抛错支 2：前编辑 new_string 子串冲突', () => {
    expect(() =>
      getPatchForEdits({
        filePath: 'a.txt',
        fileContents: 'a\n',
        edits: [
          { old_string: 'a', new_string: 'bb', replace_all: false },
          { old_string: 'b', new_string: 'c', replace_all: false },
        ],
      }),
    ).toThrow(
      'Cannot edit file: old_string is a substring of a new_string from a previous edit.',
    )
  })

  test('getPatchForEdits 抛错支 3：无净变化（编辑互相抵消，避开前检子串冲突）', () => {
    // 注意：[a→b, b→a] 型直接抵消会先命中前编辑 new_string 子串冲突支，
    // 无净变化支可达形 = 第二段 old_string 含前段上下文（'r q' ⊄ 'r'）
    expect(() =>
      getPatchForEdits({
        filePath: 'a.txt',
        fileContents: 'p q',
        edits: [
          { old_string: 'p', new_string: 'r', replace_all: false },
          { old_string: 'r q', new_string: 'p q', replace_all: false },
        ],
      }),
    ).toThrow('Original and edited file match exactly. Failed to apply edit.')
  })
})

// ── 常量面──────────────────────────────────────────────────────────────

describe('常量面', () => {
  test('FILE_UNEXPECTEDLY_MODIFIED_ERROR 逐字', () => {
    expect(FILE_UNEXPECTEDLY_MODIFIED_ERROR).toBe(
      'File has been unexpectedly modified. Read it again before attempting to write it.',
    )
  })

  test('4 弯引号常量为 U+2018/U+2019/U+201C/U+201D', () => {
    expect(LEFT_SINGLE_CURLY_QUOTE.codePointAt(0)).toBe(0x2018)
    expect(RIGHT_SINGLE_CURLY_QUOTE.codePointAt(0)).toBe(0x2019)
    expect(LEFT_DOUBLE_CURLY_QUOTE.codePointAt(0)).toBe(0x201c)
    expect(RIGHT_DOUBLE_CURLY_QUOTE.codePointAt(0)).toBe(0x201d)
  })
})
