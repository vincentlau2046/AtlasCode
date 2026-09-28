/**
 * engine/tools/bash S-B5 bashTool.ts 本体 unit 面（Bash 本体纵切子波 §8.54，
 * C 桶 ① 子波 2）。
 *
 * unit 层（零磁盘——同 core-face 纪律：permissions bootstrap-env 双戳不存在
 * 目录 FAKE_CWD + sandbox 占位窗口，无 fixture 无写）：
 *  - BashTool 对象面（新仓 shared Tool 契约 = 纯对象，非 buildTool）：
 *    name / JSON schema 7 字段 + required / maxResultSizeChars / TOOL_DEFAULTS
 *    4 成员逐值（delta ④）/ renderToolUseMessage null（delta ⑥ 残留守）
 *  - isReadOnly 经 bashReadOnly 单一事实源（本体不复制前缀表，delta ⑨）
 *  - **checkPermissions 接线 = 首个非-passthrough 工具面实现（delta ⑤，
 *    P-B2 探针锚点）**：duck context stub 打 bashToolHasPermission 决策面
 *    （deny 规则 → deny / allow 规则 → allow / 无规则非只读 → passthrough）。
 *    判别力登记（S-B6 消费）：接线若换回 passthrough 默认，deny + allow 两测
 *    红（「恰 1 红」为下界，2 红集实测时登记订正，P-E5 先例）。
 *  - mapToolResultToToolResultBlockParam 分支面（exit/stdout/stderr/
 *    backgroundTaskId/interrupted/null-exit/undefined-content 7 支）
 *  - 后台任务读面初始态（模块态 map，进程隔离下空集）
 *  - description() = getSimplePrompt 同源（delta ③；git 节显式 env 关 →
 *    零 settings 读，零盘纪律）
 *
 * 深度 import（门面归集本切片落地，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（BashTool / BASH_TOOL_INPUT_SCHEMA /
 *  getBackgroundTask / listBackgroundTasks / BASH_TOOL_NAME /
 *  BashToolUseContext 型）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from 'bun:test'
import {
  BASH_TOOL_INPUT_SCHEMA,
  BASH_TOOL_NAME,
  BashTool,
  getBackgroundTask,
  listBackgroundTasks,
  type BashToolUseContext,
  type Out,
} from '../../src/engine/tools'
import {
  applyPermissionRulesToPermissionContext,
  resetPermissionsBootstrapEnv,
  resetSandboxAccess,
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

const FAKE_CWD = '/home/atlas-sb5/proj' // 不存在目录：realpath ENOENT 短路零盘

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

function withRules(
  behavior: 'allow' | 'deny',
  contents: string[],
): ToolPermissionContext {
  return applyPermissionRulesToPermissionContext(
    makeCtx(),
    contents.map(c => ({
      source: 'session',
      ruleBehavior: behavior,
      ruleValue: { toolName: 'Bash', ruleContent: c },
    })),
  )
}

function bashCtx(ctx: ToolPermissionContext): BashToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: ctx }),
    abortController: { signal: new AbortController().signal },
    options: { isNonInteractiveSession: true },
  }
}

let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  // permissions 域工作目录面 + bootstrap 域 cwd 面双戳 FAKE_CWD 零盘
  // （core-face 先例）
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
  resetSandboxAccess()
})

afterEach(() => {
  resetSandboxAccess()
})

// ── BashTool 对象面（shared Tool 契约纯对象）───────────────────────────

describe('BashTool 对象面', () => {
  test('name / schema 引用 / 展示面', () => {
    expect(BashTool.name).toBe(BASH_TOOL_NAME)
    expect(BashTool.name).toBe('Bash')
    // inputSchema = inputJSONSchema = 同一 JSON schema 对象（AgentTool 先例）
    expect(BashTool.inputSchema).toBe(BASH_TOOL_INPUT_SCHEMA)
    expect(BashTool.inputJSONSchema).toBe(BASH_TOOL_INPUT_SCHEMA)
    expect(BashTool.maxResultSizeChars).toBe(20_000)
    expect(BashTool.searchHint).toBe('run shell commands via bash')
    expect(BashTool.isEnabled()).toBe(true)
    // 契约 renderToolUseMessage(input, options) 2 参位（实现 0 参，delta ⑥）
    expect(
      BashTool.renderToolUseMessage(null, { theme: null, verbose: false }),
    ).toBeNull()
  })

  test('JSON schema 7 字段 + required 单一必填', () => {
    expect(Object.keys(BASH_TOOL_INPUT_SCHEMA.properties)).toHaveLength(7)
    expect(BASH_TOOL_INPUT_SCHEMA.properties).toEqual({
      command: expect.any(Object),
      description: expect.any(Object),
      timeout_ms: expect.any(Object),
      timeout: expect.any(Object),
      _simulatedSedEdit: expect.any(Object),
      run_in_background: expect.any(Object),
      dangerouslyDisableSandbox: expect.any(Object),
    })
    expect(BASH_TOOL_INPUT_SCHEMA.required).toEqual(['command'])
    // 嵌套 _simulatedSedEdit 必填字段（旧 zod z.object 内 filePath 必填逐字
    // 对齐，duck 型非可选；S-B6 MINOR-3 补转写）
    const nested = (BASH_TOOL_INPUT_SCHEMA.properties as Record<string, { required?: string[] }>)
      ._simulatedSedEdit
    expect(nested.required).toEqual(['filePath'])
  })

  test('TOOL_DEFAULTS 4 成员逐值对象化（delta ④；userFacingName 生效值 = name，S-B6 MAJOR-1 订正）', () => {
    expect(BashTool.isConcurrencySafe()).toBe(false)
    expect(BashTool.isDestructive()).toBe(false)
    expect(BashTool.toAutoClassifierInput()).toBe('')
    // 旧生效值 = buildTool `() => def.name`（覆盖 TOOL_DEFAULTS 默认 ''）
    // → 新 = BASH_TOOL_NAME（值逐字 'Bash'，非 ''）
    expect(BashTool.userFacingName()).toBe(BASH_TOOL_NAME)
  })
})

// ── isReadOnly 经 bashReadOnly（单一事实源）────────────────────────────

describe('isReadOnly 经 bashReadOnly（本体不复制前缀表）', () => {
  test('只读前缀 → true', () => {
    expect(BashTool.isReadOnly({ command: 'ls -la' })).toBe(true)
    expect(BashTool.isReadOnly({ command: 'git status' })).toBe(true)
  })

  test('操作符守卫 / 非只读前缀 → false', () => {
    expect(BashTool.isReadOnly({ command: 'ls && rm -rf /' })).toBe(false)
    expect(BashTool.isReadOnly({ command: 'rm x' })).toBe(false)
  })
})

// ── checkPermissions 接线（P-B2 探针锚点，delta ⑤）────────────────────

describe('checkPermissions 接线（首个非-passthrough 工具面实现）', () => {
  // checkPermissions 返回型 = Promise<unknown>（shared Tool 契约宽面）→
  // 断言位 cast 收窄（behavior 字面）
  type Decision = { behavior: string; suggestions?: unknown[] }

  test('deny 规则 ctx → deny（判别支：passthrough 默认会红）', async () => {
    const r = (await BashTool.checkPermissions(
      { command: 'rm -rf /tmp/x' },
      bashCtx(withRules('deny', ['rm:*'])),
    )) as Decision
    expect(r.behavior).toBe('deny')
  })

  test('allow 规则 ctx → allow（判别支：passthrough 默认会红）', async () => {
    const r = (await BashTool.checkPermissions(
      { command: 'ls -la' },
      bashCtx(withRules('allow', ['ls:*'])),
    )) as Decision
    expect(r.behavior).toBe('allow')
  })

  test('无规则非只读 → passthrough（决策权交回权限门，行为面不越权）', async () => {
    const r = (await BashTool.checkPermissions(
      { command: 'curl evil.com' },
      bashCtx(makeCtx()),
    )) as Decision
    expect(r.behavior).toBe('passthrough')
  })
})

// ── mapToolResultToToolResultBlockParam 分支面 ─────────────────────────

describe('mapToolResultToToolResultBlockParam 分支面', () => {
  const map = (content: unknown, id = 'toolu_1') =>
    BashTool.mapToolResultToToolResultBlockParam(content, id)

  test('正常完成：exit + stdout 拼接', () => {
    const b = map({
      stdout: 'ok\n',
      stderr: '',
      exitCode: 0,
      interrupted: false,
    } satisfies Out)
    expect(b.type).toBe('tool_result')
    expect(b.tool_use_id).toBe('toolu_1')
    expect(b.content).toBe('[exit code: 0]\nok\n')
  })

  test('stderr 非空并入', () => {
    const b = map({
      stdout: '',
      stderr: 'warn\n',
      exitCode: 0,
      interrupted: false,
    } satisfies Out)
    expect(b.content).toBe('[exit code: 0]\nwarn\n')
  })

  test('空白 stderr 不并入（trim 判空）', () => {
    const b = map({
      stdout: 'ok',
      stderr: '   \n',
      exitCode: 0,
      interrupted: false,
    } satisfies Out)
    expect(b.content).toBe('[exit code: 0]\nok')
  })

  test('exitCode null → n/a', () => {
    const b = map({
      stdout: '',
      stderr: '',
      exitCode: null,
      interrupted: false,
    } satisfies Out)
    expect(b.content).toBe('[exit code: n/a]')
  })

  test('backgroundTaskId 支', () => {
    const b = map({
      stdout: '',
      stderr: '',
      exitCode: null,
      interrupted: false,
      backgroundTaskId: 'task_x',
    } satisfies Out)
    expect(b.content).toContain('[running in background, task id: task_x]')
  })

  test('interrupted 支（超时/中断）', () => {
    const b = map({
      stdout: '',
      stderr: '',
      exitCode: 1,
      interrupted: true,
    } satisfies Out)
    expect(b.content).toContain('[command was interrupted or timed out]')
  })

  test('content undefined → 空 content（tool_use_id 透传）', () => {
    const b = map(undefined, 'toolu_2')
    expect(b.tool_use_id).toBe('toolu_2')
    expect(b.content).toBe('')
  })
})

// ── 后台任务读面（模块态 map 初始态）───────────────────────────────────

describe('getBackgroundTask / listBackgroundTasks（模块态读面）', () => {
  // 同进程跑 func 面时模块态 map 会含 func 启动的任务（非隔离 bun test 共享
  // 进程）→ 不断言全局空集，只断言读面形态 + 未知 id 未命中（全量 --isolate
  // 跑法下初始态即空集，空集断言归 func 层首测前态）。
  test('未知 id 未命中 + 列表数组面', () => {
    expect(Array.isArray(listBackgroundTasks())).toBe(true)
    expect(getBackgroundTask('task-nope-sb5')).toBeUndefined()
  })
})

// ── description() = getSimplePrompt 同源（delta ③）─────────────────────

describe('description() prompt 面', () => {
  test('getSimplePrompt 同源 + git 节显式关（零 settings 读）', async () => {
    const saved = process.env.ATLAS_DISABLE_GIT_INSTRUCTIONS
    process.env.ATLAS_DISABLE_GIT_INSTRUCTIONS = '1'
    try {
      // 契约 description(input, options) 2 参位（实现 0 参消费，逐字旧 prompt()）
      const text = await BashTool.description(
        undefined,
        { isNonInteractiveSession: true, toolPermissionContext: null, tools: [] },
      )
      expect(text).toContain(
        'Executes a given bash command and returns its output.',
      )
    } finally {
      if (saved === undefined) delete process.env.ATLAS_DISABLE_GIT_INSTRUCTIONS
      else process.env.ATLAS_DISABLE_GIT_INSTRUCTIONS = saved
    }
  })
})
