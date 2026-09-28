/**
 * engine/tools/files S-C4 globTool/grepTool 本体 unit 面（§8.55，
 * 高频族纵切子波 3）。
 *
 * unit 层（零磁盘——同 core-face 纪律：permissions bootstrap-env 双戳
 * 不存在目录 FAKE_CWD + bootstrap cwd 双戳，无 fixture 无写）：
 *  - GlobTool / GrepTool 对象面（新仓 shared Tool 契约 = 纯对象，非
 *    buildTool；S-B5 BashTool 先例）：name / JSON schema 字段面 /
 *    maxResultSizeChars / TOOL_DEFAULTS 成员逐值（delta ④）/
 *    userFacingName 'Search'（两工具同值）/ renderToolUseMessage 文本
 *    分支（delta ⑥）/ description 同源（delta ③）/ toAutoClassifierInput
 *    逐字 / getPath 逐字（Glob expandPath 2 参 / Grep 原样）。
 *  - **checkPermissions 一线接线 = P-C4 探针 2 红集 {工作目录内 allow
 *    （decisionReason mode default），工作目录外无规则 ask}**（P-B2 先
 *    例族 duck context 打 checkReadPermissionForTool 决策面）。判别力
 *    登记（S-C7 消费）：接线若换回 passthrough 默认，两测全红（「2 红
 *    集」下界实测登记；计划原 deny 规则 2 红集 {deny,allow} 因
 *    matchingRuleForInput = 桩 ①（规则求值归 engine 前向接缝，§8.14）
 *    不可观察 → 订正为工作目录边界 2 红集，P-E5 先例；deny/allow 规则
 *    观察 = 规则求值波前向接缝）。
 *  - validateInput 面（ENOENT errorCode 1 / 缺省 result true；非目录
 *    errorCode 2 支 = func 真盘面）。UNC 跳支（\\\\ 头 / // 头）= Windows
 *    NTLM 凭据泄漏防御面，POSIX 测试平台不可达（实测 expandPath('//srv/x',
 *    cwd) → '/srv/x' 折叠双斜杠 → 不触 startsWith('//') 守卫）→ 不在此 unit
 *    断言（源体逐字保留，头注登记防当遗漏重提）。
 *  - GrepTool mapToolResult 3 mode 分支 + formatLimitInfo 拼接（纯函数
 *    面，applyHeadLimit 语义经 func P-C1/P-C1b 覆盖，delta ⑫）。
 *
 * 深度 import（门面归集本切片落地，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（GlobTool / GrepTool / GLOB_TOOL_INPUT_SCHEMA /
 *  GREP_TOOL_INPUT_SCHEMA / GLOB_DESCRIPTION / getGrepDescription /
 *  GLOB_TOOL_NAME / GREP_TOOL_NAME / FilesToolUseContext 型）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  GLOB_TOOL_INPUT_SCHEMA,
  GREP_TOOL_INPUT_SCHEMA,
  GlobTool,
  GrepTool,
  GLOB_DESCRIPTION,
  getGrepDescription,
  GLOB_TOOL_NAME,
  GREP_TOOL_NAME,
  type FilesToolUseContext,
  type GlobOutput,
  type GrepOutput,
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

// ── 公共夹具（core-face 同形）───────────────────────────────────────────

const FAKE_CWD = '/home/atlas-sc4/proj' // 不存在目录：realpath ENOENT 短路零盘

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
  globLimits?: { maxResults?: number },
): FilesToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: ctx }),
    abortController: new AbortController(),
    ...(globLimits ? { globLimits } : {}),
  }
}

let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  // permissions 域工作目录面 + bootstrap 域 cwd 面双戳 FAKE_CWD 零盘
  // （P-B2 core-face 先例）
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

// ── GlobTool 对象面（shared Tool 契约纯对象）──────────────────────────

describe('GlobTool 对象面', () => {
  test('name / schema 引用 / 展示面 / TOOL_DEFAULTS 逐值', () => {
    expect(GlobTool.name).toBe(GLOB_TOOL_NAME)
    expect(GlobTool.name).toBe('Glob')
    // inputSchema = inputJSONSchema = 同一 JSON schema 对象（S-B5 先例）
    expect(GlobTool.inputSchema).toBe(GLOB_TOOL_INPUT_SCHEMA)
    expect(GlobTool.inputJSONSchema).toBe(GLOB_TOOL_INPUT_SCHEMA)
    expect(GlobTool.maxResultSizeChars).toBe(100_000)
    expect(GlobTool.searchHint).toBe('find files by name pattern or wildcard')
    expect(GlobTool.isEnabled()).toBe(true)
    // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
    expect(GlobTool.isConcurrencySafe(null)).toBe(true)
    expect(GlobTool.isReadOnly(null)).toBe(true)
    expect(GlobTool.isDestructive?.(null)).toBe(false)
    // delta ④：旧生效值 = UI.tsx 'Search'（复用 Grep 的）
    expect(GlobTool.userFacingName(null)).toBe('Search')
  })

  test('JSON schema 2 字段 + required 单一必填', () => {
    expect(GLOB_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(Object.keys(GLOB_TOOL_INPUT_SCHEMA.properties)).toEqual(
      expect.arrayContaining(['pattern', 'path']),
    )
    expect(GLOB_TOOL_INPUT_SCHEMA.required).toEqual(['pattern'])
  })

  test('toAutoClassifierInput = input.pattern（逐字）', () => {
    expect(GlobTool.toAutoClassifierInput({ pattern: '**/*.ts' })).toBe(
      '**/*.ts',
    )
  })

  test('getPath 逐字：缺省 → getCwd()（FAKE_CWD）/ 相对 → expandPath 2 参', () => {
    expect(GlobTool.getPath({})).toBe(FAKE_CWD)
    expect(GlobTool.getPath({ path: 'sub' })).toBe(`${FAKE_CWD}/sub`)
    expect(GlobTool.getPath({ path: '/abs/x' })).toBe('/abs/x')
  })

  test('description() = GLOB_DESCRIPTION 同源（delta ③）', async () => {
    expect(await GlobTool.description(null, {
      isNonInteractiveSession: true,
      toolPermissionContext: null,
      tools: [],
    })).toBe(GLOB_DESCRIPTION)
    expect(GLOB_DESCRIPTION).toContain('Fast file pattern matching tool')
  })

  test('renderToolUseMessage 文本 3 分支（delta ⑥ 逐字）', () => {
    expect(GlobTool.renderToolUseMessage({ path: 'x' }, { verbose: false })).toBeNull()
    expect(
      GlobTool.renderToolUseMessage({ pattern: '**/*.ts' }, { verbose: false }),
    ).toBe('pattern: "**/*.ts"')
    expect(
      GlobTool.renderToolUseMessage(
        { pattern: '**/*.ts', path: '/a/b' },
        { verbose: true },
      ),
    ).toBe('pattern: "**/*.ts", path: "/a/b"')
  })

  test('extractSearchText = filenames join', () => {
    const out: GlobOutput = {
      filenames: ['a.ts', 'b.ts'],
      durationMs: 1,
      numFiles: 2,
      truncated: false,
    }
    expect(GlobTool.extractSearchText?.(out)).toBe('a.ts\nb.ts')
  })

  test('mapToolResult：空集 → No files found / 截断支提示尾', () => {
    const empty: GlobOutput = {
      filenames: [],
      durationMs: 1,
      numFiles: 0,
      truncated: false,
    }
    expect(
      GlobTool.mapToolResultToToolResultBlockParam(empty, 'tu-1'),
    ).toEqual({
      tool_use_id: 'tu-1',
      type: 'tool_result',
      content: 'No files found',
    })
    const truncated: GlobOutput = {
      filenames: ['a.ts', 'b.ts'],
      durationMs: 1,
      numFiles: 2,
      truncated: true,
    }
    expect(
      GlobTool.mapToolResultToToolResultBlockParam(truncated, 'tu-2'),
    ).toEqual({
      tool_use_id: 'tu-2',
      type: 'tool_result',
      content:
        'a.ts\nb.ts\n(Results are truncated. Consider using a more specific path or pattern.)',
    })
    const plain: GlobOutput = {
      filenames: ['a.ts'],
      durationMs: 1,
      numFiles: 1,
      truncated: false,
    }
    expect(
      GlobTool.mapToolResultToToolResultBlockParam(plain, 'tu-3'),
    ).toEqual({
      tool_use_id: 'tu-3',
      type: 'tool_result',
      content: 'a.ts',
    })
  })
})

// ── GrepTool 对象面────────────────────────────────────────────────────

describe('GrepTool 对象面', () => {
  test('name / schema 引用 / strict / 展示面 / TOOL_DEFAULTS 逐值', () => {
    expect(GrepTool.name).toBe(GREP_TOOL_NAME)
    expect(GrepTool.name).toBe('Grep')
    expect(GrepTool.inputSchema).toBe(GREP_TOOL_INPUT_SCHEMA)
    expect(GrepTool.inputJSONSchema).toBe(GREP_TOOL_INPUT_SCHEMA)
    expect(GrepTool.maxResultSizeChars).toBe(20_000)
    expect(GrepTool.strict).toBe(true)
    expect(GrepTool.searchHint).toBe('search file contents with regex (ripgrep)')
    expect(GrepTool.isEnabled()).toBe(true)
    expect(GrepTool.isConcurrencySafe(null)).toBe(true)
    expect(GrepTool.isReadOnly(null)).toBe(true)
    expect(GrepTool.isDestructive?.(null)).toBe(false)
    expect(GrepTool.userFacingName(null)).toBe('Search')
  })

  test('JSON schema 14 字段 + required 单一必填 + output_mode enum', () => {
    expect(GREP_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(Object.keys(GREP_TOOL_INPUT_SCHEMA.properties)).toHaveLength(14)
    expect(GREP_TOOL_INPUT_SCHEMA.required).toEqual(['pattern'])
    const props = GREP_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type?: string; enum?: string[] }
    >
    expect(props.output_mode?.enum).toEqual([
      'content',
      'files_with_matches',
      'count',
    ])
    // 语义容忍字段类型位 = number/boolean（模型面逐字，delta ②）
    expect(props['-B']?.type).toBe('number')
    expect(props['-n']?.type).toBe('boolean')
    expect(props.head_limit?.type).toBe('number')
    expect(props.multiline?.type).toBe('boolean')
  })

  test('toAutoClassifierInput 逐字：path 有无两支', () => {
    expect(
      GrepTool.toAutoClassifierInput({ pattern: 'foo', path: '/a' }),
    ).toBe('foo in /a')
    expect(GrepTool.toAutoClassifierInput({ pattern: 'foo' })).toBe('foo')
  })

  test('getPath 逐字：falsy → getCwd() / 有值原样（非 expand）', () => {
    expect(GrepTool.getPath({})).toBe(FAKE_CWD)
    expect(GrepTool.getPath({ path: '' })).toBe(FAKE_CWD)
    expect(GrepTool.getPath({ path: 'rel/x' })).toBe('rel/x')
  })

  test('description() = getGrepDescription() 同源（delta ③）', async () => {
    expect(await GrepTool.description(null, {
      isNonInteractiveSession: true,
      toolPermissionContext: null,
      tools: [],
    })).toBe(getGrepDescription())
    expect(getGrepDescription()).toContain('built on ripgrep')
  })

  test('renderToolUseMessage parts 模板 3 支（delta ⑥ 逐字）', () => {
    expect(GrepTool.renderToolUseMessage({ path: 'x' }, { verbose: false })).toBeNull()
    expect(
      GrepTool.renderToolUseMessage({ pattern: 'err' }, { verbose: false }),
    ).toBe('pattern: "err"')
    expect(
      GrepTool.renderToolUseMessage(
        { pattern: 'err', path: '/log' },
        { verbose: true },
      ),
    ).toBe('pattern: "err", path: "/log"')
  })

  test('extractSearchText：content mode → content / 余 → filenames join', () => {
    const contentOut: GrepOutput = {
      mode: 'content',
      numFiles: 0,
      filenames: [],
      content: 'l1\nl2',
    }
    expect(GrepTool.extractSearchText?.(contentOut)).toBe('l1\nl2')
    const filesOut: GrepOutput = {
      mode: 'files_with_matches',
      numFiles: 2,
      filenames: ['a.ts', 'b.ts'],
    }
    expect(GrepTool.extractSearchText?.(filesOut)).toBe('a.ts\nb.ts')
  })

  test('mapToolResult content mode：limitInfo 尾支 + 无 limitInfo 原样', () => {
    const withLimit: GrepOutput = {
      mode: 'content',
      numFiles: 0,
      filenames: [],
      content: 'a:1:x',
      appliedLimit: 30,
      appliedOffset: 5,
    }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(withLimit, 'tu-c1'),
    ).toEqual({
      tool_use_id: 'tu-c1',
      type: 'tool_result',
      content: 'a:1:x\n\n[Showing results with pagination = limit: 30, offset: 5]',
    })
    const plain: GrepOutput = {
      mode: 'content',
      numFiles: 0,
      filenames: [],
      content: 'a:1:x',
    }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(plain, 'tu-c2'),
    ).toEqual({
      tool_use_id: 'tu-c2',
      type: 'tool_result',
      content: 'a:1:x',
    })
    // content 缺省 → No matches found
    const empty: GrepOutput = { mode: 'content', numFiles: 0, filenames: [] }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(empty, 'tu-c3'),
    ).toEqual({
      tool_use_id: 'tu-c3',
      type: 'tool_result',
      content: 'No matches found',
    })
  })

  test('mapToolResult count mode：summary 单复数 + pagination 尾', () => {
    const one: GrepOutput = {
      mode: 'count',
      numFiles: 1,
      filenames: [],
      content: 'a:1',
      numMatches: 1,
    }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(one, 'tu-k1'),
    ).toEqual({
      tool_use_id: 'tu-k1',
      type: 'tool_result',
      content: 'a:1\n\nFound 1 total occurrence across 1 file.',
    })
    const many: GrepOutput = {
      mode: 'count',
      numFiles: 2,
      filenames: [],
      content: 'a:1\nb:2',
      numMatches: 3,
      appliedLimit: 10,
    }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(many, 'tu-k2'),
    ).toEqual({
      tool_use_id: 'tu-k2',
      type: 'tool_result',
      content: 'a:1\nb:2\n\nFound 3 total occurrences across 2 files. with pagination = limit: 10',
    })
  })

  test('mapToolResult files_with_matches mode：Found N files + 空集支', () => {
    const two: GrepOutput = {
      mode: 'files_with_matches',
      numFiles: 2,
      filenames: ['a.ts', 'b.ts'],
    }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(two, 'tu-f1'),
    ).toEqual({
      tool_use_id: 'tu-f1',
      type: 'tool_result',
      content: 'Found 2 files\na.ts\nb.ts',
    })
    const none: GrepOutput = {
      mode: 'files_with_matches',
      numFiles: 0,
      filenames: [],
    }
    expect(
      GrepTool.mapToolResultToToolResultBlockParam(none, 'tu-f2'),
    ).toEqual({
      tool_use_id: 'tu-f2',
      type: 'tool_result',
      content: 'No files found',
    })
  })
})

// ── checkPermissions 接线（P-C4 探针 2 红集）───────────────────────────

describe('checkPermissions 一线接线（P-C4 2 红集 {工作目录内 allow, 工作目录外 ask}）', () => {
  test('Glob 工作目录内路径（无规则）→ allow + decisionReason mode default + updatedInput 透传', async () => {
    const input = { pattern: '**/*.ts', path: `${FAKE_CWD}/sub` }
    const dec = (await GlobTool.checkPermissions(
      input,
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('allow')
    expect(dec.decisionReason).toEqual({ type: 'mode', mode: 'default' })
    expect(dec.updatedInput).toBe(input)
  })

  test('Glob 工作目录外路径（无规则）→ ask', async () => {
    const dec = (await GlobTool.checkPermissions(
      { pattern: '**/*.ts', path: '/etc/hostname' },
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('ask')
  })

  test('Grep 工作目录内路径（无规则）→ allow + decisionReason mode default', async () => {
    const input = { pattern: 'foo', path: `${FAKE_CWD}/log.txt` }
    const dec = (await GrepTool.checkPermissions(
      input,
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('allow')
    expect(dec.decisionReason).toEqual({ type: 'mode', mode: 'default' })
    expect(dec.updatedInput).toBe(input)
  })

  test('Grep 工作目录外路径（无规则）→ ask', async () => {
    const dec = (await GrepTool.checkPermissions(
      { pattern: 'foo', path: '/etc/hostname' },
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('ask')
  })

  test('Grep 缺 path → getPath 回退 getCwd()（工作目录内）→ allow', async () => {
    const dec = (await GrepTool.checkPermissions(
      { pattern: 'foo' },
      makeFilesCtx(makeCtx()),
    )) as Decision
    expect(dec.behavior).toBe('allow')
  })
})

// ── validateInput 面（零磁盘：ENOENT / 缺省；UNC 跳支 POSIX 不可达不测）─

describe('validateInput 面', () => {
  test('Glob 缺省 path → result true', async () => {
    expect(await GlobTool.validateInput?.({ pattern: '**/*' })).toEqual({
      result: true,
    })
  })

  test('Glob 不存在目录 → errorCode 1 + FILE_NOT_FOUND_CWD_NOTE + FAKE_CWD', async () => {
    const v = (await GlobTool.validateInput?.({
      pattern: '**/*',
      path: 'missing-dir',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(1)
    expect(v.message).toContain('Directory does not exist: missing-dir')
    expect(v.message).toContain(FAKE_CWD)
  })

  test('Grep 不存在路径 → errorCode 1 + 缺省 → result true', async () => {
    const v = (await GrepTool.validateInput?.({
      pattern: 'x',
      path: 'nope',
    })) as { result: boolean; message?: string; errorCode?: number }
    expect(v.result).toBe(false)
    expect(v.errorCode).toBe(1)
    expect(v.message).toContain('Path does not exist: nope')
    expect(await GrepTool.validateInput?.({ pattern: 'x' })).toEqual({
      result: true,
    })
  })
})

// ── 双门面回归面（tools 门面 S-C4 re-export 块）────────────────────────

describe('tools 门面 S-C4 re-export 面（双门面回归面）', () => {
  test('S-C4 符号经 tools 门面可达（import 即回归断言）', () => {
    expect(typeof GlobTool.call).toBe('function')
    expect(typeof GrepTool.call).toBe('function')
    expect(GLOB_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(GREP_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(getGrepDescription()).toContain('ripgrep')
  })
})
