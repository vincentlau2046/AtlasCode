/**
 * 组合根 S-E2（§8.52 A4-A10）装配判别测试（E-wave-end）。
 *
 * 被测能力 = 组合根 8 注入点 + loop-deps 构建器真接线（非 tautology，断言的
 * 是接缝被消费）：
 *   T-1 getTools 组合根消费：deny 过滤 + isEnabled 尾行 + 注册表 deps 注入
 *       （47 本体经 deps 增量注入前向面）
 *   T-2 权限门 I-1 全决策体经构建器接线（deny 规则 → allowed:false）
 *   T-3 hooks 装配① 生产路径（createLoopHooks toolHooks/stopHooks 消费面）
 *   T-4 modelProvider 单例恒等（组合根消费面 = 域 lazy 单例同一实例）
 *   T-5 A5 setSessionEnv 注真值（session 域会话源跟随 bootstrap，双 id 隐患消除）
 *   T-6 A6 Port 5 壳实现注入（函数形；I/O 语义归 func 真盘层）
 *   T-7 A7 Port 1 壳实现 + view 语义（set 字段写回 / 未动字段引用保持 / 无深拷贝）
 *   T-8 A8 sandboxAccess 接线判别（wired 前域缺省空配置 / wired 后 placeholder
 *       runtime 抛 unavailable——前后态可判别）
 *   T-9 A9 通知 ← messaging 真队列（agentId 缺席 = delta 面）+ scheduler
 *       退出清理 → tasks cleanupRegistry + session registerCleanup → 执行面
 *   T-10 coordinator 提示词深度门 + getTools 回归（A10 撤回后 import 源
 *       复原零行为：深度门 fan-out 子句 / getTools baseTools 路径不变）
 *
 * unit 零磁盘（mock FsOperations + ATLAS_CONFIG_DIR=/mock-home，同
 * permission-setup / engine-config-endpoint-adapter 口径）；Port 5 I/O 语义
 * （save→load 往返 + ENOENT→null）→ tests/func/loop-deps-compose-fs.test.ts。
 *
 * 运行口径注（同 §8.30 T-6）：compose 装配注入全量模块态窗口（session env /
 * messaging 队列 / scheduler env / tasks cleanup registry / sandboxAccess /
 * Port 5 + Port 1 注入窗口——各窗口无 reset 导出，ad-hoc 连跑时 createCoreDependencies
 * 重注新壳幂等覆盖、tasks registry 残留 handler 仅波及后续 runCoreCleanup 消费面）；
 * 标准 `bun test --isolate` 每文件独立进程，无跨文件泄漏；单进程 ad-hoc 连跑
 * 时本文件窗口可波及后续文件（本文件排前或逐文件 isolate）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getCommandQueueLength,
  getCommandQueueSnapshot,
  getCoordinatorWorkerSystemPrompt,
  getSchedulerEnv,
  getSessionContextPort,
  getSessionEnv,
  getSessionMemoryPort,
  getTools,
  MAX_WORKER_SPAWN_DEPTH,
  resetCommandQueue,
  resetSettingsCache,
  resetTaskNotificationHandler,
  enqueueTaskNotification,
  type Tool,
} from '../../src/engine'
import { getSandboxAccess, resetSandboxAccess } from '../../src/permissions'
import {
  createAgentLoopDeps,
  createCoreDependencies,
  resetCoreDependencies,
  runCoreCleanup,
} from '../../src/atlascode'
import { getModelProvider } from '../../src/modelprovider'
import { resetLegacyToolNameAliases } from '../../src/permissions'
import {
  getSessionId as bootstrapGetSessionId,
  getOriginalCwd as bootstrapGetOriginalCwd,
  runWithCwdOverride,
} from '../../src/bootstrap'
import {
  setFsImplementation,
  setOriginalFsImplementation,
  type FsOperations,
} from '../../src/shared'

// ── mock FsOperations：文件 map，I/O-free（同 engine-config-endpoint-adapter 口径）
function enoent(path: string): NodeJS.ErrnoException {
  const err = new Error(`ENOENT: no such file or directory, open '${path}'`)
  err.code = 'ENOENT'
  return err
}

function makeMockFs(
  files: Record<string, string> = {},
): { ops: FsOperations; files: Map<string, string> } {
  const fileMap = new Map(Object.entries(files))
  const ops: FsOperations = {
    cwd: () => '/mock-cwd',
    existsSync: () => false,
    stat: async () => ({} as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => '',
    readFileSync: p => {
      const content = fileMap.get(p)
      if (content === undefined) throw enoent(p)
      return content
    },
    statSync: () => ({} as never),
    realpathSync: p => p,
    open: async () => ({} as never),
    unlinkSync: () => {},
    readdirSync: p => {
      // 本测无 managed drop-in 面（drop-in 目录恒 ENOENT，loadManagedFileSettings 静默）
      throw enoent(p)
    },
    writeFileSync: (p, data) => {
      fileMap.set(p, data)
    },
    mkdirSync: () => {},
  }
  return { ops, files: fileMap }
}

/** 最小 fake Tool（注册表 deps 注入面消费：name + isEnabled + 门 name 匹配）。 */
function mkTool(name: string, enabled: boolean = true): Tool {
  return {
    name,
    inputSchema: { type: 'object' },
    maxResultSizeChars: 10000,
    isEnabled: () => enabled,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    userFacingName: () => name,
    toAutoClassifierInput: () => null,
    mapToolResultToToolResultBlockParam: () => null,
    renderToolUseMessage: () => null,
    call: async () => ({ data: null }),
    description: async () => name,
    checkPermissions: async () => null,
  } as unknown as Tool
}

const TRACKED_ENV_KEYS = ['OPENAI_AUTH_TOKEN', 'OPENAI_API_KEY']

let savedEnv: Record<string, string | undefined> = {}
let savedConfigDir: string | undefined
let savedPwd: string | undefined

beforeEach(() => {
  savedEnv = {}
  for (const k of TRACKED_ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = '/mock-home'
  savedPwd = process.env.PWD
  delete process.env.PWD
  setFsImplementation(makeMockFs().ops)
  resetSettingsCache()
})

afterEach(() => {
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  setOriginalFsImplementation()
  resetSettingsCache()
  resetLegacyToolNameAliases()
  resetCoreDependencies()
  resetCommandQueue()
  resetTaskNotificationHandler()
  resetSandboxAccess()
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  if (savedPwd === undefined) delete process.env.PWD
  else process.env.PWD = savedPwd
})

// ── A4 loop-deps 构建器（T-1..T-4）────────────────────────────────────

describe('createAgentLoopDeps（S-E2 A4，§8.52）', () => {
  test('T-1 注册表消费：disallowedToolsCli deny 过滤 + deps 注入 + AgentTool 内建', async () => {
    const bundle = await createAgentLoopDeps({
      disallowedToolsCli: ['Bash'],
      toolRegistryDeps: {
        baseTools: [mkTool('Read'), mkTool('Bash'), mkTool('Disabled', false)],
      },
    })
    const names = bundle.tools.map(t => t.name)
    // deny 规则剔 'Bash'（模型可见池调用前剥离，与运行时门 1a 同匹配器）
    expect(names).not.toContain('Bash')
    // isEnabled 尾行剔禁用工具
    expect(names).not.toContain('Disabled')
    // deps 注入保留 + 内建 Agent 工具首位（AGENT_TOOL_NAME='Agent'，
    // 旧仓逐字；'AgentTool' 仅为类名非注册名）
    expect(names).toContain('Read')
    expect(names[0]).toBe('Agent')
  })

  test('T-2 权限门 I-1 全决策体经构建器接线（deny → allowed:false）', async () => {
    const bundle = await createAgentLoopDeps({
      disallowedToolsCli: ['Bash'],
      toolRegistryDeps: { baseTools: [mkTool('Bash')] },
    })
    expect(typeof bundle.deps.checkPermission).toBe('function')
    const verdict = await bundle.deps.checkPermission!(mkTool('Bash'), {})
    expect(verdict.allowed).toBe(false)
  })

  test('T-3 hooks 装配①：toolHooks 双钩子 + stopHooks 消费面（函数形）', async () => {
    const bundle = await createAgentLoopDeps({})
    expect(bundle.deps.hooks?.toolHooks?.preToolUse).toBeInstanceOf(Function)
    expect(bundle.deps.hooks?.toolHooks?.postToolUse).toBeInstanceOf(Function)
    expect(bundle.deps.hooks?.stopHooks).toBeInstanceOf(Function)
  })

  test('T-4 modelProvider 单例恒等 + role 车道缺省', async () => {
    const bundle = await createAgentLoopDeps({})
    expect(bundle.deps.modelProvider).toBe(getModelProvider())
    expect(bundle.deps.role).toBe('premium')
    // 显式 role 覆写透传
    const fast = await createAgentLoopDeps({ role: 'fast' })
    expect(fast.deps.role).toBe('fast')
  })
})

// ── A5 setSessionEnv 注真值（T-5）──────────────────────────────────────

describe('setSessionEnv 组合根注真值（S-E2 A5）', () => {
  test('T-5 session 域会话源 = bootstrap 真值（双 session id 隐患消除）', () => {
    createCoreDependencies()
    const env = getSessionEnv()
    expect(env.getSessionId()).toBe(bootstrapGetSessionId())
    expect(env.getOriginalCwd()).toBe(bootstrapGetOriginalCwd())
    // switchSession 注 bootstrap 真切换（session 域跟随 bootstrap 会话源）
    const other = 'switch-target-session'
    env.switchSession(other)
    expect(bootstrapGetSessionId()).toBe(other)
    expect(env.getSessionId()).toBe(other)
  })
})

// ── A6/A7 Port 壳实现注入（T-6/T-7）───────────────────────────────────

describe('Port 5/Port 1 壳实现 + 注入（S-E2 A6/A7）', () => {
  test('T-6 Port 5 注入：非 null + load/save 函数形（I/O 语义归 func 真盘层）', () => {
    createCoreDependencies()
    const port = getSessionMemoryPort()
    expect(port).not.toBeNull()
    expect(typeof port!.load).toBe('function')
    expect(typeof port!.save).toBe('function')
  })

  test('T-7 Port 1 注入 + view 语义（set 字段写回 / 未动字段引用保持 / 无深拷贝）', () => {
    createCoreDependencies()
    const port = getSessionContextPort()
    expect(port).not.toBeNull()
    const before = port!.get()
    // 缺省快照 = 最小全新 ToolPermissionContext + 空 mcp/tasks + effort 缺省档
    expect(before.toolPermissionContext.mode).toBe('default')
    expect(before.mcp).toEqual({ tools: [], clients: [] })
    expect(before.effortValue).toBe('medium')
    expect(before.advisorModel).toBeUndefined()
    expect(before.tasks).toEqual({})
    // set(f) 字段写回 + 未动字段引用保持（浅语义，无深拷贝）
    const mcpRef = before.mcp
    const tasksRef = before.tasks
    port!.set(prev => ({ ...prev, effortValue: 'high' }))
    const after = port!.get()
    expect(after.effortValue).toBe('high')
    expect(after.mcp).toBe(mcpRef)
    expect(after.tasks).toBe(tasksRef)
    // view 语义：get 返回当前快照引用（就地写回可观察，无拷贝）
    after.effortValue = 'max'
    expect(port!.get()).toBe(after)
    expect(port!.get().effortValue).toBe('max')
  })
})

// ── A8 sandboxAccess 接线判别（T-8）───────────────────────────────────

describe('setSandboxAccess 组合根接线（S-E2 A8）', () => {
  test('T-8 wired 前域缺省空配置 vs wired 后 placeholder runtime 抛 unavailable', () => {
    // wired 前（域缺省 placeholder）：getFsWriteConfig 返空配置不抛
    resetSandboxAccess()
    const pre = getSandboxAccess()
    expect(pre.isSandboxingEnabled()).toBe(false)
    expect(pre.getFsWriteConfig()).toEqual({ allowOnly: [], denyWithinAllow: [] })
    // wired 后（组合根 ⑧ 注 manager 闭包面）：placeholder runtime
    // getFsWriteConfig 抛 unavailable（旧仓 disabled-stub 语义；消费点被
    // isSandboxingEnabled 恒 false 短路不可达——本断言 = 接线判别信号）
    createCoreDependencies()
    const post = getSandboxAccess()
    expect(post.isSandboxingEnabled()).toBe(false)
    expect(() => post.getFsWriteConfig()).toThrow()
  })
})

// ── A9 通知/cleanup/scheduler 三注入点（T-9）─────────────────────────

describe('通知/cleanup/scheduler 注入（S-E2 A9）', () => {
  test('T-9a 通知 → messaging 真队列（value/mode/priority 透传 + agentId 缺席 delta 面）', () => {
    createCoreDependencies()
    enqueueTaskNotification({
      value: '<task-notification>done</task-notification>',
      mode: 'task-notification',
      priority: 'next',
    })
    expect(getCommandQueueLength()).toBe(1)
    const [cmd] = getCommandQueueSnapshot()
    expect(cmd.value).toBe('<task-notification>done</task-notification>')
    expect(cmd.mode).toBe('task-notification')
    expect(cmd.priority).toBe('next')
    // delta 登记（S-E2 审视订正）：类型面两侧均保留 agentId（TaskNotification
    // agentId?: string / QueuedCommand.agentId queueTypes.ts:133 旧仓逐字，主线程
    // = undefined）——本 handler 未接定向投递（入队对象无 agentId 键），
    // 定向投递路由 = shell/swarm 波前向接缝（字段已在，届时仅需 handler 接线）
    expect('agentId' in cmd).toBe(false)
  })

  test('T-9b scheduler registerExitCleanup 真入 tasks cleanupRegistry（注册/注销可观察）', async () => {
    createCoreDependencies()
    let ran = 0
    const unregister = getSchedulerEnv().registerExitCleanup(() => {
      ran++
      return Promise.resolve()
    })
    await runCoreCleanup()
    expect(ran).toBe(1)
    unregister()
    await runCoreCleanup()
    expect(ran).toBe(1) // 已注销 → 不再执行
  })

  test('T-9c session registerCleanup 成员 → tasks 执行面（runCoreCleanup 可观察）', async () => {
    createCoreDependencies()
    let cleanupRan = 0
    getSessionEnv().registerCleanup(() => {
      cleanupRan++
      return Promise.resolve()
    })
    await runCoreCleanup()
    expect(cleanupRan).toBe(1)
  })
})

// ── A10 撤回零行为回归（T-10）────────────────────────────────────────
// A10（tools 深 import 归一到域门面）实施中实测 tools↔coordinator 求值环
// 致 workerAgent 顶层 const 消费 TDZ 崩（§8.52 实施记录 delta 登记），已
// 整项撤回（4 文件 import 源复原 HEAD 形，C 桶边清理前向接缝）。本回归
// 保留断言本体（深度门语义 + getTools baseTools 路径），防撤回引入行为差。

describe('S-E3 A11/A12 组合根 transcript 接线（§8.52）', () => {
  test('T-11 deps.transcript 接线：record/recordContentReplacement 函数形 + 可调用（unit 持久化守卫 = 零盘不抛）', async () => {
    const { deps } = await createAgentLoopDeps({ agentId: 'ag1' })
    expect(deps.transcript?.record).toBeTypeOf('function')
    expect(deps.transcript?.recordContentReplacement).toBeTypeOf('function')
    // unit 环境 TEST_ENABLE_SESSION_PERSISTENCE 未设 → shouldSkipPersistence
    // 守卫跳写面（零盘不抛；真盘 I/O 语义归 tests/func/loop-transcript-fs）
    await deps.transcript!.record([{ role: 'user', content: 'x' }])
    await deps.transcript!.recordContentReplacement!([
      { kind: 'tool-result', toolUseId: 'tu-1', replacement: '<trunc>' },
    ])
  })

  test('T-12 A12 getCwd 注真值 = bootstrap 活态面（ALS 覆盖层生效，判别域缺省 process.cwd() 活读）', () => {
    createCoreDependencies()
    // 域缺省（process.cwd() 活读）不感知 ALS 覆盖层 → 若接线缺失此断言红
    const inside = runWithCwdOverride('/als-override', () => getSessionEnv().getCwd())
    expect(inside).toBe('/als-override')
  })
})

describe('coordinator 提示词深度门 + getTools 回归（S-E2 A10 撤回）', () => {
  test('T-10 getCoordinatorWorkerSystemPrompt 深度门语义 + getTools baseTools 不变', () => {
    const p1 = getCoordinatorWorkerSystemPrompt(1)
    expect(p1.startsWith('You are a worker agent executing a task assigned by the coordinator.')).toBe(
      true,
    )
    // 深度 1 < MAX_WORKER_SPAWN_DEPTH → fan-out 子句在场
    expect(p1).toContain('fan out')
    expect(p1).toContain('code-review')
    // 深度封顶（= MAX）→ 无 fan-out 子句（深度门语义不变）
    const capped = getCoordinatorWorkerSystemPrompt(MAX_WORKER_SPAWN_DEPTH)
    expect(capped).not.toContain('fan out')
    expect(capped).toContain('code-review')
    // getTools baseTools 注入路径回归（注册表 deps 消费面同 T-1 断言器）
    const tools = getTools(
      {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      },
      { baseTools: [mkTool('Read')] },
    )
    expect(tools.map(t => t.name)).toContain('Read')
  })
})
