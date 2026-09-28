/**
 * engine/tools/lsp S-E2c（§8.67 D 波 LSP 域 + LSPTool 本体子波）unit 层：
 * 零盘零模型零进程（fake LSP server 全链 = func 层
 * engine-tools-lsp-se2c-fs.test.ts，R6 零模型先例）。
 *
 * 覆盖面（判别输出式，house 先例）：
 *   1. LSPTool 对象面（name/isLsp/shouldDefer/isReadOnly/isConcurrencySafe/
 *      searchHint/maxResultSizeChars/userFacingName/toAutoClassifierInput/
 *      inputSchema 同一性）
 *   2. LSP_TOOL_INPUT_SCHEMA JSON 面（required 4 + 9 操作 enum）+ zod 判别
 *      联合 safeParse（strictObject 多余键红）
 *   3. isEnabled 自门控 = manager 4 态面（not-started 断连 = false / 内存源
 *      1 server 初始化 success = true / 0 server success = 断连 false /
 *      bare-mode 短路 not-started 保留 / shutdown 复位）
 *   4. call no-manager 支（not-started → startup-issue 证据输出，零进程）
 *   5. validateInput 判别红集 {码 3 schema fail（坏操作 / 非整 line）/
 *      码 1 ENOENT / 码 2 非文件（/ 目录）}；UNC 早退支（绝对路径
 *      startsWith '\\\\'/'//'）= Windows 平台支（POSIX 下新 shared
 *      expandPath 经 path.resolve 归一 '//a/b' → '/a/b'，双斜杠前缀
 *      不保留 → 守卫不可达，旧仓守卫语义逐字转写保留），unit 层不登记
 *      断言（H6 防空洞）；码 4 = stat EACCES 族 root 执行不可判 →
 *      不登记断言（H6 防空洞）
 *   6. checkPermissions 读侧 2 探针（工作目录内 default 无规则 → allow
 *      mode default + updatedInput 透传 / 工作目录外 → ask workingDir 证据）；
 *      规则面（matchingRuleForInput ① 桩恒 null）不可观察 = 前向接缝登记，
 *      不断言（H6：不测桩行为）
 *   7. 9 formatters 判别输出（纯函数 cwd 参数化：null/空/单/多 3 形 +
 *      LocationLink targetUri 面 + call-hierarchy 三件套 + SymbolInformation
 *      委托面）
 *   8. getSymbolAtPosition ENOENT graceful（不存在文件 → null，catch 面）
 *   9. renderToolUseMessage 字符串面（位置 4 操作 symbol 缺失 → position
 *      证据输出 / 非位置操作 file 面 / 无 operation → null）+
 *      mapToolResultToToolResultBlockParam
 *   10. LSP_DESCRIPTION 值锚点（旧 prompt.ts 逐字首行 + 9 操作清单 +
 *      配置提示尾句）+ isValidLSPOperation 9 名 true / 未知 false
 *
 * 隔离纪律（notebook S-C4 + skill S-E2b 先例）：
 *   - ATLAS_CONFIG_DIR=/mock-home 防御戳（不存在目录，零真盘）；
 *   - permissions bootstrap 双戳 FAKE_CWD（不存在目录，realpath ENOENT
 *     短路 = 零盘）+ bootstrap cwd 两态戳（LSPTool.getPath expandPath 基准）；
 *   - ATLAS_SIMPLE save/delete（bare-mode 判支，argv --bare 支同函数不触碰）；
 *   - manager 单例 = 模块态：beforeEach await shutdownLspServerManager
 *     （清 instance + state + generation 全清；_resetLspManagerForTesting
 *     仅清 state 保留 instance = reinitialize 早退契约面，initialize 幂等
 *     检会因陈旧 instance 短路）+ clearLspServerSource（内存源 1 server
 *     永不 start = 零进程无泄漏）；
 *   - 「failed」第 4 态 = 配置 fail-soft 语义（源 catch → 空 / server 校验
 *     逐 server catch → 不失败整 init）不可达 → 不登记断言（H6 防空洞，
 *     复审勿当遗漏重提）；
 *   - UNC '\\\\'（Windows 反斜杠）支 POSIX 执行不可判（expandPath POSIX
 *     isAbsolute false → FAKE_CWD 下解析 → ENOENT 码 1），'//' 同型支覆盖
 *     双前缀守卫语义；
 *   - 「No LSP server available for file type」/ 10MB 守卫 / git-ignore
 *     过滤 / 9 操作全链 = func 层面（fake server 真进程 + 真盘），此处不登记
 *     防 unit 层假绿。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import * as path from 'node:path'

import {
  LSP_DESCRIPTION,
  LSP_TOOL_INPUT_SCHEMA,
  LSPTool,
  formatDocumentSymbolResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatWorkspaceSymbolResult,
  getSymbolAtPosition,
  isValidLSPOperation,
  lspToolInputSchema,
} from '../../src/engine/tools'
import {
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  type DocumentSymbol,
  type Hover,
  type Location,
  type LocationLink,
  type SymbolInformation,
  clearLspServerSource,
  getInitializationStatus,
  getLspServerManager,
  initializeLspServerManager,
  isLspConnected,
  setLspServerSource,
  shutdownLspServerManager,
  waitForInitialization,
} from '../../src/lsp'
import {
  resetPermissionsBootstrapEnv,
  setPermissionsBootstrapEnv,
} from '../../src/permissions'
import {
  getCwdState,
  getOriginalCwd,
  setCwdState,
  setOriginalCwd,
} from '../../src/bootstrap'
import type { ToolPermissionContext } from '../../src/shared'

const FAKE_CWD = '/home/atlas-lsp/proj'

/** checkPermissions 上下文（窄 TPC 切片，skill S-E2b permCtx 先例同形）。 */
function permCtx(): unknown {
  const tpc: ToolPermissionContext = {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: { localSettings: [] },
    alwaysDenyRules: { localSettings: [] },
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
  return { getAppState: () => ({ toolPermissionContext: tpc }) }
}

/** wire 型 fixture 构造（1-based 展示位 → 0-based range）。 */
function loc(p: string, line = 1, char = 1): Location {
  return {
    uri: `file://${p}`,
    range: { start: { line: line - 1, character: char - 1 }, end: { line: line - 1, character: char } },
  }
}

function range(startLine: number, startChar: number) {
  return {
    start: { line: startLine, character: startChar },
    end: { line: startLine, character: startChar + 1 },
  }
}

let savedConfigDir: string | undefined
let savedSimple: string | undefined
let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = '/mock-home'
  savedSimple = process.env.ATLAS_SIMPLE
  delete process.env.ATLAS_SIMPLE
  savedOriginalCwd = getOriginalCwd()
  savedCwdState = getCwdState()
  // permissions 工作目录面 = FAKE_CWD（不存在目录 = 零盘）
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  // LSPTool.getPath / call expandPath 基准 = bootstrap cwd 态
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})

afterAll(async () => {
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  if (savedSimple === undefined) delete process.env.ATLAS_SIMPLE
  else process.env.ATLAS_SIMPLE = savedSimple
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
  resetPermissionsBootstrapEnv()
  await shutdownLspServerManager()
  clearLspServerSource()
})

beforeEach(async () => {
  // manager 单例 + 配置注入窗全清（每测试独立 4 态起点；shutdown 清
  // instance + state + generation，_resetLspManagerForTesting 只清 state
  // 会留陈旧 instance 致 initialize 幂等检短路）
  await shutdownLspServerManager()
  clearLspServerSource()
  if (savedSimple === undefined) delete process.env.ATLAS_SIMPLE
  else process.env.ATLAS_SIMPLE = savedSimple
})

describe('LSPTool 对象面', () => {
  test('name/isLsp/defer/只读/并发/提示面（旧 UI.tsx + 契约面逐字）', () => {
    expect(LSPTool.name).toBe('LSP')
    expect(LSPTool.isLsp).toBe(true)
    expect(LSPTool.shouldDefer).toBe(true)
    expect(LSPTool.isReadOnly()).toBe(true)
    expect(LSPTool.isConcurrencySafe()).toBe(true)
    expect(LSPTool.searchHint).toBe(
      'code intelligence (definitions, references, symbols, hover)',
    )
    expect(LSPTool.maxResultSizeChars).toBe(100_000)
    expect(LSPTool.userFacingName()).toBe('LSP')
    expect(LSPTool.toAutoClassifierInput({ operation: 'hover' })).toBe('hover')
    // delta ①：inputSchema = inputJSONSchema 同一 JSON 对象
    expect(LSPTool.inputSchema).toBe(LSP_TOOL_INPUT_SCHEMA)
    expect(LSPTool.inputJSONSchema).toBe(LSP_TOOL_INPUT_SCHEMA)
  })

  test('LSP_TOOL_INPUT_SCHEMA JSON 面（required 4 + 9 操作 enum + 参数描述逐字）', () => {
    expect(LSP_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(LSP_TOOL_INPUT_SCHEMA.required).toEqual([
      'operation',
      'filePath',
      'line',
      'character',
    ])
    expect((LSP_TOOL_INPUT_SCHEMA.properties.operation as { enum: string[] }).enum).toEqual([
      'goToDefinition',
      'findReferences',
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
    ])
    expect(LSP_TOOL_INPUT_SCHEMA.properties.line).toEqual({
      type: 'number',
      description: 'The line number (1-based, as shown in editors)',
    })
    expect(LSP_TOOL_INPUT_SCHEMA.properties.character).toEqual({
      type: 'number',
      description: 'The character offset (1-based, as shown in editors)',
    })
  })

  test('zod 判别联合 safeParse（合法 true / 坏操作 false / strictObject 多余键 false）', () => {
    const s = lspToolInputSchema()
    expect(
      s.safeParse({ operation: 'hover', filePath: 'f.ts', line: 1, character: 1 }).success,
    ).toBe(true)
    expect(
      s.safeParse({ operation: 'bogus', filePath: 'f.ts', line: 1, character: 1 }).success,
    ).toBe(false)
    expect(
      s.safeParse({
        operation: 'hover',
        filePath: 'f.ts',
        line: 1,
        character: 1,
        extra: 1,
      }).success,
    ).toBe(false)
  })

  test('isValidLSPOperation 9 名 true / 未知 false', () => {
    for (const op of [
      'goToDefinition',
      'findReferences',
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
    ]) {
      expect(isValidLSPOperation(op)).toBe(true)
    }
    expect(isValidLSPOperation('bogus')).toBe(false)
  })

  test('LSP_DESCRIPTION 值锚点（旧 prompt.ts 逐字：首行 + 9 操作 + 尾句）', async () => {
    expect(await LSPTool.description()).toBe(LSP_DESCRIPTION)
    expect(LSP_DESCRIPTION.startsWith('Interact with Language Server Protocol (LSP) servers to get code intelligence features.')).toBe(
      true,
    )
    expect(LSP_DESCRIPTION).toContain(
      '- incomingCalls: Find all functions/methods that call the function at a position',
    )
    expect(LSP_DESCRIPTION.endsWith(
      'Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.',
    )).toBe(true)
  })

  test('mapToolResultToToolResultBlockParam（tool_use_id 回显 + result 文本面）', () => {
    expect(
      LSPTool.mapToolResultToToolResultBlockParam(
        { operation: 'hover', result: 'doc', filePath: 'f.ts' },
        'tu1',
      ),
    ).toEqual({ tool_use_id: 'tu1', type: 'tool_result', content: 'doc' })
  })
})

describe('isEnabled 自门控 = manager 4 态面（门裁 ⑬ 承载，零进程）', () => {
  test('not-started = 断连态（isEnabled false + call no-manager 支证据输出）', async () => {
    expect(getInitializationStatus()).toEqual({ status: 'not-started' })
    expect(getLspServerManager()).toBeUndefined()
    expect(isLspConnected()).toBe(false)
    expect(LSPTool.isEnabled()).toBe(false)

    const res = await LSPTool.call({
      operation: 'hover',
      filePath: 'f.txt',
      line: 1,
      character: 1,
    })
    expect(res.data.operation).toBe('hover')
    expect(res.data.filePath).toBe('f.txt')
    expect(res.data.result).toBe(
      'LSP server manager not initialized. This may indicate a startup issue.',
    )
  })

  test('内存源 1 server → pending → success（isLspConnected true + isEnabled true）', async () => {
    setLspServerSource(async () => ({
      fake: {
        command: process.execPath,
        args: ['-e', ''],
        extensionToLanguage: { '.txt': 'plaintext' },
      },
    }))
    initializeLspServerManager()
    // 同步面：manager 实例已建 + state=pending（initialize 首个 await 未过）
    expect(getInitializationStatus()).toEqual({ status: 'pending' })
    expect(getLspServerManager()).toBeDefined()
    await waitForInitialization()
    expect(getInitializationStatus()).toEqual({ status: 'success' })
    expect(isLspConnected()).toBe(true)
    expect(LSPTool.isEnabled()).toBe(true)
  })

  test('未注册源 = 0 server → success + 断连（isEnabled false 活面非假绿）', async () => {
    initializeLspServerManager()
    await waitForInitialization()
    expect(getInitializationStatus()).toEqual({ status: 'success' })
    expect(isLspConnected()).toBe(false)
    expect(LSPTool.isEnabled()).toBe(false)
  })

  test('bare-mode 短路（ATLAS_SIMPLE=1 → not-started 保留，不建实例）', () => {
    process.env.ATLAS_SIMPLE = '1'
    initializeLspServerManager()
    expect(getInitializationStatus()).toEqual({ status: 'not-started' })
    expect(getLspServerManager()).toBeUndefined()
  })

  test('shutdown 复位（success → not-started + 实例清除 + 断连）', async () => {
    setLspServerSource(async () => ({
      fake: {
        command: process.execPath,
        args: ['-e', ''],
        extensionToLanguage: { '.txt': 'plaintext' },
      },
    }))
    initializeLspServerManager()
    await waitForInitialization()
    await shutdownLspServerManager()
    expect(getInitializationStatus()).toEqual({ status: 'not-started' })
    expect(getLspServerManager()).toBeUndefined()
    expect(isLspConnected()).toBe(false)
  })
})

describe('validateInput 判别红集', () => {
  test('码 3 = schema fail（坏操作名 / 非整数 line）', async () => {
    const r1 = await LSPTool.validateInput({
      operation: 'bogus',
      filePath: 'f.ts',
      line: 1,
      character: 1,
    })
    expect(r1.result).toBe(false)
    expect(r1.errorCode).toBe(3)
    expect(r1.message).toMatch(/^Invalid input:/)

    const r2 = await LSPTool.validateInput({
      operation: 'hover',
      filePath: 'f.ts',
      line: 1.5,
      character: 1,
    })
    expect(r2.result).toBe(false)
    expect(r2.errorCode).toBe(3)
  })

  test('码 1 = ENOENT（FAKE_CWD 下不存在文件，零盘）', async () => {
    const r = await LSPTool.validateInput({
      operation: 'hover',
      filePath: 'nope.txt',
      line: 1,
      character: 1,
    })
    expect(r).toEqual({
      result: false,
      message: 'File does not exist: nope.txt',
      errorCode: 1,
    })
  })

  test('码 2 = 非文件（/ 目录 → isFile false）', async () => {
    const r = await LSPTool.validateInput({
      operation: 'hover',
      filePath: '/',
      line: 1,
      character: 1,
    })
    expect(r).toEqual({
      result: false,
      message: 'Path is not a file: /',
      errorCode: 2,
    })
  })

  test('success = 现存真文件（repo package.json 绝对路径，stat 只读零写盘）', async () => {
    const r = await LSPTool.validateInput({
      operation: 'hover',
      filePath: path.join(process.cwd(), 'package.json'),
      line: 1,
      character: 1,
    })
    expect(r).toEqual({ result: true })
  })
})

describe('checkPermissions 读侧 2 探针（P-C4 探针族读侧实例）', () => {
  test('工作目录内 default 无规则 → allow（mode default + updatedInput 透传）', async () => {
    const input = {
      operation: 'goToDefinition',
      filePath: 'src/main.ts',
      line: 1,
      character: 1,
    }
    const d = (await LSPTool.checkPermissions(input, permCtx())) as {
      behavior: string
      decisionReason?: { type: string; mode?: string }
      updatedInput?: unknown
    }
    expect(d.behavior).toBe('allow')
    expect(d.decisionReason).toEqual({ type: 'mode', mode: 'default' })
    expect(d.updatedInput).toBe(input)
  })

  test('工作目录外 → ask（workingDir 证据面）', async () => {
    const d = (await LSPTool.checkPermissions(
      { operation: 'hover', filePath: '/etc/hosts', line: 1, character: 1 },
      permCtx(),
    )) as {
      behavior: string
      decisionReason?: { type: string; reason?: string }
    }
    expect(d.behavior).toBe('ask')
    expect(d.decisionReason).toEqual({
      type: 'workingDir',
      reason: 'Path is outside allowed working directories',
    })
  })
})

describe('9 formatters 判别输出（纯函数 cwd 参数化）', () => {
  test('formatGoToDefinitionResult 4 形（null / 单 Location / 多 / LocationLink）', () => {
    expect(formatGoToDefinitionResult(null)).toBe(
      'No definition found. This may occur if the cursor is not on a symbol, or if the definition is in an external library not indexed by the LSP server.',
    )
    expect(formatGoToDefinitionResult(loc('/repo/a.ts', 2, 3), '/repo')).toBe(
      'Defined in a.ts:2:3',
    )
    expect(
      formatGoToDefinitionResult(
        [loc('/repo/a.ts', 2, 3), loc('/repo/b.ts', 5, 6)],
        '/repo',
      ),
    ).toBe('Found 2 definitions:\n  a.ts:2:3\n  b.ts:5:6')
    const link: LocationLink = {
      targetUri: 'file:///repo/c.ts',
      targetRange: { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
    }
    // targetSelectionRange 缺省 → targetRange 兜底（delta ② wire 型可缺省面）
    expect(formatGoToDefinitionResult(link, '/repo')).toBe('Defined in c.ts:1:5')
  })

  test('formatFindReferencesResult 3 形（空 / 单 / 跨文件分组 Line 行）', () => {
    expect(formatFindReferencesResult([])).toBe(
      'No references found. This may occur if the symbol has no usages, or if the LSP server has not fully indexed the workspace.',
    )
    expect(formatFindReferencesResult([loc('/repo/a.ts', 2, 3)], '/repo')).toBe(
      'Found 1 reference:\n  a.ts:2:3',
    )
    expect(
      formatFindReferencesResult(
        [loc('/repo/a.ts', 2, 3), loc('/repo/a.ts', 9, 4), loc('/repo/b.ts', 1, 1)],
        '/repo',
      ),
    ).toBe(
      'Found 3 references across 2 files:\n\na.ts:\n  Line 2:3\n  Line 9:4\n\nb.ts:\n  Line 1:1',
    )
  })

  test('formatHoverResult 3 形（null / 无 range 纯文本 / 有 range 前缀）', () => {
    expect(formatHoverResult(null)).toBe(
      'No hover information available. This may occur if the cursor is not on a symbol, or if the LSP server has not fully indexed the file.',
    )
    const plain: Hover = {
      contents: { kind: 'plaintext', value: 'doc' },
    }
    expect(formatHoverResult(plain)).toBe('doc')
    const ranged: Hover = {
      contents: { kind: 'markdown', value: 'doc' },
      range: { start: { line: 4, character: 2 }, end: { line: 4, character: 9 } },
    }
    expect(formatHoverResult(ranged)).toBe('Hover info at 5:3:\n\ndoc')
  })

  test('formatDocumentSymbolResult 2 形（层级 DocumentSymbol 缩进 / SymbolInformation 委托）', () => {
    expect(formatDocumentSymbolResult([])).toBe(
      'No symbols found in document. This may occur if the file is empty, not supported by the LSP server, or if the server has not fully indexed the file.',
    )
    const ds: DocumentSymbol = {
      name: 'main',
      kind: 12,
      detail: 'function',
      range: range(0, 0),
      selectionRange: range(0, 9),
      children: [
        { name: 'x', kind: 13, range: range(1, 2), selectionRange: range(1, 3) },
      ],
    }
    expect(formatDocumentSymbolResult([ds])).toBe(
      'Document symbols:\nmain (Function) function - Line 1\n  x (Variable) - Line 2',
    )
    // SymbolInformation[]（'location' 面）→ workspace formatter 委托
    const si: SymbolInformation = {
      name: 'foo',
      kind: 12,
      location: loc('/repo/a.ts', 3, 1),
      containerName: 'utils',
    }
    expect(formatDocumentSymbolResult([si] as unknown as DocumentSymbol[], '/repo')).toBe(
      'Found 1 symbol in workspace:\n\na.ts:\n  foo (Function) - Line 3 in utils',
    )
  })

  test('formatWorkspaceSymbolResult 2 形（空 / 单符号容器名面）', () => {
    expect(formatWorkspaceSymbolResult([])).toBe(
      'No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.',
    )
    const si: SymbolInformation = {
      name: 'bar',
      kind: 14,
      location: loc('/repo/b.ts', 7, 2),
    }
    expect(formatWorkspaceSymbolResult([si], '/repo')).toBe(
      'Found 1 symbol in workspace:\n\nb.ts:\n  bar (Constant) - Line 7',
    )
  })

  test('formatPrepareCallHierarchyResult 2 形（空 / 单 item detail 面）', () => {
    expect(formatPrepareCallHierarchyResult([])).toBe(
      'No call hierarchy item found at this position',
    )
    const item: CallHierarchyItem = {
      name: 'main',
      kind: 12,
      uri: 'file:///repo/a.ts',
      range: range(0, 0),
      selectionRange: range(0, 9),
      detail: 'entry point',
    }
    expect(formatPrepareCallHierarchyResult([item], '/repo')).toBe(
      'Call hierarchy item: main (Function) - a.ts:1 [entry point]',
    )
  })

  test('formatIncomingCallsResult 2 形（空 / fromRanges 调用位面）', () => {
    expect(formatIncomingCallsResult([])).toBe(
      'No incoming calls found (nothing calls this function)',
    )
    const inc: CallHierarchyIncomingCall = {
      from: {
        name: 'run',
        kind: 12,
        uri: 'file:///repo/b.ts',
        range: range(1, 0),
        selectionRange: range(1, 4),
      },
      fromRanges: [{ start: { line: 5, character: 4 }, end: { line: 5, character: 9 } }],
    }
    expect(formatIncomingCallsResult([inc], '/repo')).toBe(
      'Found 1 incoming call:\n\nb.ts:\n  run (Function) - Line 2 [calls at: 6:5]',
    )
  })

  test('formatOutgoingCallsResult 2 形（空 / to 面 + called from 位）', () => {
    expect(formatOutgoingCallsResult([])).toBe(
      'No outgoing calls found (this function calls nothing)',
    )
    const out: CallHierarchyOutgoingCall = {
      to: {
        name: 'util',
        kind: 6,
        uri: 'file:///repo/c.ts',
        range: range(8, 0),
        selectionRange: range(8, 5),
      },
      fromRanges: [{ start: { line: 3, character: 7 }, end: { line: 3, character: 12 } }],
    }
    expect(formatOutgoingCallsResult([out], '/repo')).toBe(
      'Found 1 outgoing call:\n\nc.ts:\n  util (Method) - Line 9 [called from: 4:8]',
    )
  })
})

describe('符号提取 + 渲染字符串面', () => {
  test('getSymbolAtPosition ENOENT graceful（不存在文件 → null，catch 观测面）', () => {
    expect(getSymbolAtPosition('missing.ts', 0, 0)).toBeNull()
  })

  test('renderToolUseMessage 位置 4 操作（symbol 缺失 → position 证据输出，1-based 逐字）', () => {
    expect(
      LSPTool.renderToolUseMessage(
        { operation: 'goToDefinition', filePath: 'src/main.ts', line: 5, character: 7 },
        { verbose: true },
      ),
    ).toBe('operation: "goToDefinition", file: "src/main.ts", position: 5:7')
  })

  test('renderToolUseMessage 非位置操作（documentSymbol → file 面，无 position 段）', () => {
    expect(
      LSPTool.renderToolUseMessage(
        { operation: 'documentSymbol', filePath: 'src/main.ts', line: 1, character: 1 },
        { verbose: true },
      ),
    ).toBe('operation: "documentSymbol", file: "src/main.ts"')
  })

  test('renderToolUseMessage 无 operation → null（旧 UI.tsx 模板逐字）', () => {
    expect(
      LSPTool.renderToolUseMessage(
        { filePath: 'f.ts', line: 1, character: 1 },
        { verbose: true },
      ),
    ).toBeNull()
  })
})
