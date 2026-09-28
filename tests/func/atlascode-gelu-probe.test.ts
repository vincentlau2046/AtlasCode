/**
 * D 波 S-E2d 提交 3 全栈 gelu liveness probe（§8.67 D 波收口；零真模型）。
 *
 * 旧仓先例：src/plugins/ascend/e2e/gelu.ts L1 活体探针（全工具面逐一点名
 * 冒烟，`bun run src/cli.ts --e2e`）+ 旧仓全栈 e2e（LLM 真网关）。新仓
 * 无 CLI 全栈入口（D 波 cli 波前向接缝），本 probe = func 层全栈 liveness：
 * 组合根装配（getCoreDependencies）→ createAgentLoopDeps 构建器（注册表 +
 * 权限门 + hooks 真接线）→ queryAgentLoop 双轮工具会话（fixture replay
 * 脚本化 fake provider，零真模型）→ skill/LSP 两新域面。四件套 gate ⑥
 * 不变；本文件 = 全栈链「能装配 + 能驱动一条会话 + 各面活」的判别信号。
 *
 * 探针锚点（每条断言 = 一接缝消费面，防 H6 空洞等价）：
 *   P-1 工具注册表活体：35 本体全注入（tools 门面单一出口）→ createAgent
 *       LoopDeps 模型可见池（deny 过滤 + isEnabled 尾行）= 29 名精确集
 *       （内建 Agent 首位）；6 门控缺席面（LSP 断连 / swarms 关 /
 *       ToolSearch standard / TodoWrite 反向门 / TeamCreate·TeamDelete·
 *       SendMessage swarms 门）= 本体在场而门关的判别（非注册缺失）
 *   P-1c swarms 门双向活：ATLAS_EXPERIMENTAL_AGENT_TEAMS 翻转 → TeamCreate/
 *       TeamDelete/SendMessage 入池（⑮ 门控消费面，非恒缺席假绿）
 *   P-2 engine loop 活体：queryAgentLoop 双轮（轮 1 tool_use echo →
 *       轮 2 终文终止），fixture replay 2 步脚本化 provider（chat 恰 2
 *       调用）；真 pipeline（find→门→validate→hooks→call→mapResult）+
 *       真权限门（1c 工具面自决 allow 产点消费）+ 真 hooks 装配（无钩子
 *       配置 no-op 面）
 *   P-2b S-E3 修波锚（审视 A 路 major-1）：门 context getAppState 面
 *       活体——echo 工具面 checkPermissions 消费 gate 注入的 getAppState
 *       （活 TPC 窄视图，身份 = 构建器 ① 产物；缺线 = 1c catch 吞
 *       TypeError 回落 passthrough，本断言红）
 *   P-3 skill 域活体：registerBundledSkill 注册 → getBundledSkills 面
 *       （source 'bundled' / prompt 型 / getPromptForCommand 真执行）
 *       + Skill 工具在模型可见池（P-1 交叉面）
 *   P-4 LSP 域活体：manager 初态 not-started + isLspConnected false +
 *       LSPTool.isEnabled 门关（P-1 门控缺席面同点）；全链假 server 面
 *       归 tests/func/engine-tools-lsp-se2c-fs（本 probe 只锁门控/初态
 *       注册表接缝，不重复全链）
 *
 * 分层纪律：func 层真装配（组合根 8 域真链，fake 仅限 modelprovider——
 * setModelProviderForTesting 脚本化 fixture，非 mock openai transport）；
 * 零真模型 / 零真 LLM 调用（H6：fake 仅限 provider，loop/pipeline/
 * 注册表/权限门/hooks/skill/LSP 门控全真）。
 *
 * 运行口径注（单进程连跑防串味，teardown 对称面）：
 *   - provider fake 须先于 getCoreDependencies 首次装配（compose 缓存
 *     getModelProvider() 单例实例）→ beforeAll 序 ①fake ②compose ③构建器
 *   - env 5 键（ATLAS_ENABLE_TASKS/ATLAS_EXPERIMENTAL_AGENT_TEAMS/
 *     ATLAS_DISABLE_CRON/ATLAS_DISABLE_WORKTREE_MODE/ATLAS_ENABLE_TOOL_
 *     SEARCH）save/set/restore 三态：ATLAS_ENABLE_TASKS=1 定化 Task* 门
 *     （isTodoV2Enabled 非交互会话判据随 runner 环境漂移，显式 env 消歧）+
 *     ATLAS_ENABLE_TOOL_SEARCH=false 定化 ToolSearch standard 门关（缺省
 *     mode = 'tst' 开 + OPENAI_BASE_URL 守卫随开发机漂移——不设值则门态
 *     随机面，显式 'false' 消歧）
 *   - afterAll 对称复位 = b6-func-smoke 基线 10 窗 + skill 注册表清 +
 *     LSP manager 复位 + env 还原
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  AgentTool,
  AskUserQuestionTool,
  BashTool,
  ConfigTool,
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  EnterPlanModeTool,
  EnterWorktreeTool,
  ExitPlanModeV2Tool,
  ExitWorktreeTool,
  GrepTool,
  GlobTool,
  LSPTool,
  ListMcpResourcesTool,
  NotebookEditTool,
  ReadMcpResourceTool,
  ReadTool,
  SendMessageTool,
  SkillTool,
  SnipTool,
  TaskCreateTool,
  TaskGetTool,
  TaskListTool,
  TaskOutputTool,
  TaskStopTool,
  TaskUpdateTool,
  TeamCreateTool,
  TeamDeleteTool,
  ToolSearchTool,
  TodoWriteTool,
  WebFetchTool,
  WebSearchTool,
  WriteTool,
  EditTool,
  type Tool,
} from '../../src/engine/tools'
import {
  getTools,
  queryAgentLoop,
  resetSchedulerEnv,
  resetSessionContextPort,
  resetSessionEnv,
  resetTaskNotificationHandler,
  resetTeamFileLoader,
  resetTeamServices,
  setSessionMemoryPort,
  type Message,
} from '../../src/engine'
import {
  getCoreDependencies,
  createAgentLoopDeps,
  resetCoreDependencies,
  type AgentLoopDepsBundle,
} from '../../src/atlascode'
import {
  getModelProvider,
  resetModelProviderForTesting,
  setModelProviderForTesting,
  type ModelProvider,
} from '../../src/modelprovider'
import {
  clearBundledSkills,
  getBundledSkills,
  registerBundledSkill,
} from '../../src/engine/skill'
import {
  _resetLspManagerForTesting,
  getInitializationStatus,
  isLspConnected,
} from '../../src/lsp'
import {
  resetBackendModule,
  resetStartInProcessTeammate,
  resetTeammateToolRegistryDeps,
} from '../../src/swarm'

// ── env 定化（save/set/restore 三态）────────────────────────────────────
const TRACKED_ENV_KEYS = [
  'ATLAS_ENABLE_TASKS',
  'ATLAS_EXPERIMENTAL_AGENT_TEAMS',
  'ATLAS_DISABLE_CRON',
  'ATLAS_DISABLE_WORKTREE_MODE',
  'ATLAS_ENABLE_TOOL_SEARCH',
] as const
let savedEnv: Record<string, string | undefined> = {}

// ── fixture replay 脚本化 provider（零真模型）────────────────────────────
const providerCalls: string[] = []
function createScriptedProvider(): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被 gelu probe 消费')
  }
  const steps = [
    // 轮 1：tool_use（echo 探测工具）
    {
      uuid: 'gelu-as1',
      content: [
        { type: 'tool_use', id: 'tu-gelu-1', name: 'echo', input: { msg: 'gelu' } },
      ],
    },
    // 轮 2：终文终止（无 tool_use → terminal）
    { uuid: 'gelu-as2', content: [{ type: 'text', text: 'GELU-DONE' }] },
  ]
  let call = 0
  return {
    chat: async () => {
      const step = steps[call++]!
      providerCalls.push(step.uuid)
      return {
        type: 'assistant' as const,
        uuid: step.uuid,
        timestamp: '2026-09-28T00:00:00Z',
        message: {
          id: `m-${step.uuid}`,
          model: 'gelu-fake-model',
          role: 'assistant' as const,
          content: step.content,
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: notExercised as unknown as ModelProvider['chatStream'],
    healthCheck: notExercised as unknown as ModelProvider['healthCheck'],
    countTokens: notExercised as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: notExercised as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: notExercised as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

/** 探测工具（F-3 先例面 + checkPermissions 自决 allow——真权限门 1c
 * 工具面产点消费，default 模式无规则下经 3 终端 passthrough 判别后
 * allow 保真放行）。S-E3 修波锚（审视 A 路 major-1）：checkPermissions
 * 消费 gate 注入的 context.getAppState()（活 TPC 窄视图）——记录供
 * P-2b 身份断言（缺线 = 1c catch 吞 TypeError 回落 passthrough）。 */
let recordedCheckCtx: unknown
function makeEchoTool(): Tool {
  return {
    name: 'echo',
    isEnabled: () => true,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    description: async () => 'gelu probe echo tool',
    call: async (args: unknown) => ({
      data: `echo:${(args as { msg?: string })?.msg ?? ''}`,
    }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
    checkPermissions: async (_input: unknown, context: unknown) => {
      recordedCheckCtx = context
      return { behavior: 'allow' }
    },
  } as unknown as Tool
}

function userMsg(uuid: string, content: unknown): Message {
  return {
    uuid,
    type: 'user',
    role: 'user',
    timestamp: '2026-09-28T00:00:00Z',
    message: { content },
  }
}

// ── 35 本体全量注入面（tools 门面单一出口；内建 Agent 经注册表去重先入为主）
const ALL_BODIES: readonly Tool[] = [
  AgentTool,
  BashTool,
  ReadTool,
  WriteTool,
  EditTool,
  GlobTool,
  GrepTool,
  ConfigTool,
  NotebookEditTool,
  AskUserQuestionTool,
  EnterPlanModeTool,
  ExitPlanModeV2Tool,
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  SkillTool,
  TaskCreateTool,
  TaskGetTool,
  TaskListTool,
  TaskOutputTool,
  TaskStopTool,
  TaskUpdateTool,
  TodoWriteTool,
  SendMessageTool,
  SnipTool,
  TeamCreateTool,
  TeamDeleteTool,
  ToolSearchTool,
  WebFetchTool,
  WebSearchTool,
  EnterWorktreeTool,
  ExitWorktreeTool,
  ListMcpResourcesTool,
  ReadMcpResourceTool,
  LSPTool,
]

/** 缺省 env 定化下的模型可见池精确集（29 名 = 内建 Agent + 28 启用本体）。 */
const EXPECTED_VISIBLE = [
  'Agent',
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Config',
  'NotebookEdit',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'CronCreate',
  'CronDelete',
  'CronList',
  'Skill',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TaskUpdate',
  'Snip',
  'WebFetch',
  'WebSearch',
  'EnterWorktree',
  'ExitWorktree',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
].sort()

/** 门控缺席面 6 名（本体已注册，门关不进可见池——非注册缺失）。 */
const GATED_OFF = [
  'LSP', // isLspConnected() 断连态
  'TeamCreate', // isAgentSwarmsEnabled 关
  'TeamDelete',
  'SendMessage',
  'ToolSearch', // isToolSearchEnabledOptimistic standard 模式
  'TodoWrite', // isTodoV2Enabled 反向门（ATLAS_ENABLE_TASKS=1 定化）
]

let bundle: AgentLoopDepsBundle
const echoTool = makeEchoTool()

beforeAll(async () => {
  // env 三态：save → 定化 →（afterAll restore）
  savedEnv = {}
  for (const k of TRACKED_ENV_KEYS) savedEnv[k] = process.env[k]
  process.env.ATLAS_ENABLE_TASKS = '1'
  process.env.ATLAS_ENABLE_TOOL_SEARCH = 'false'
  for (const k of TRACKED_ENV_KEYS) {
    if (k === 'ATLAS_ENABLE_TASKS' || k === 'ATLAS_ENABLE_TOOL_SEARCH') continue
    delete process.env[k]
  }
  // ① provider fake 先于装配（compose 缓存 getModelProvider 单例）
  setModelProviderForTesting(createScriptedProvider())
  // ② 组合根装配（8 域真链，func 层真 I/O）
  getCoreDependencies()
  // ③ 构建器（注册表 + 权限门 + hooks 真接线）
  bundle = await createAgentLoopDeps({
    toolRegistryDeps: { baseTools: ALL_BODIES },
  })
})

afterAll(() => {
  clearBundledSkills()
  _resetLspManagerForTesting()
  resetModelProviderForTesting()
  resetCoreDependencies()
  // compose 注入窗对称复位（b6-func-smoke 基线 10 窗）
  resetSessionEnv()
  setSessionMemoryPort(null)
  resetSessionContextPort()
  resetTaskNotificationHandler()
  resetSchedulerEnv()
  resetBackendModule()
  resetStartInProcessTeammate()
  resetTeammateToolRegistryDeps()
  resetTeamServices()
  resetTeamFileLoader()
  // env 还原
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]!
  }
})

// ── P-1 工具注册表活体（35 本体全注入 + 门控判别）────────────────────────
describe('gelu P-1 工具注册表活体（35 本体经组合根构建器注入）', () => {
  test('P-1a 模型可见池 = 29 名精确集（deny 过滤 + isEnabled 尾行，内建 Agent 首位）', () => {
    const names = bundle.tools.map(t => t.name)
    // 内建 AgentTool 首位（注册表装配序：AgentTool 内建 → baseTools 去重先入为主）
    expect(names[0]).toBe('Agent')
    // 精确集（防「以为已全」：29 = 1 内建 + 28 启用本体，6 门控缺席见 P-1b）
    expect(names).toHaveLength(29)
    expect([...names].sort()).toEqual(EXPECTED_VISIBLE)
  })

  test('P-1b 门控缺席面 6 名（本体在场而门关 = 注册表门控消费面，非注册缺失）', () => {
    const names = bundle.tools.map(t => t.name)
    for (const gated of GATED_OFF) {
      expect(names).not.toContain(gated)
    }
    // 本体在场判别：缺席名全部经 ALL_BODIES 注册（注入面完整，门控是原因）
    const registeredNames = new Set(ALL_BODIES.map(t => t.name))
    for (const gated of GATED_OFF) {
      expect(registeredNames.has(gated)).toBe(true)
    }
  })

  test('P-1c swarms 门双向活（ATLAS_EXPERIMENTAL_AGENT_TEAMS 翻转 → 3 工具入池）', () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    try {
      const swarmed = getTools(bundle.toolPermissionContext, {
        baseTools: ALL_BODIES,
      }).map(t => t.name)
      expect(swarmed).toContain('TeamCreate')
      expect(swarmed).toContain('TeamDelete')
      expect(swarmed).toContain('SendMessage')
      // 池 = 29 + 3（swarms 门开，其余门不变）
      expect(swarmed).toHaveLength(32)
    } finally {
      delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
    }
    // 复原面：门关回缺省态（P-1a 精确集不漂移）
    const reverted = getTools(bundle.toolPermissionContext, {
      baseTools: ALL_BODIES,
    }).map(t => t.name)
    expect(reverted).toHaveLength(29)
  })

  test('P-1d hooks 装配消费面（组合根构建器 toolHooks/stopHooks 真接线，T-3 同面）', () => {
    expect(bundle.deps.hooks?.toolHooks?.preToolUse).toBeInstanceOf(Function)
    expect(bundle.deps.hooks?.toolHooks?.postToolUse).toBeInstanceOf(Function)
    expect(bundle.deps.hooks?.stopHooks).toBeInstanceOf(Function)
    // 权限门全决策体接线（I-1 面，T-2 同面）
    expect(typeof bundle.deps.checkPermission).toBe('function')
  })
})

// ── P-2 engine loop 活体（双轮工具会话，fixture replay 零真模型）──────────
describe('gelu P-2 engine loop 活体（queryAgentLoop 双轮 + 真 pipeline/门/hooks）', () => {
  test('P-2 轮 1 tool_use → 真执行 echo（真门 1c 自决 allow）+ 轮 2 终文终止', async () => {
    // provider 消费面 = getModelProvider 单例 seam（compose ⑤ 缓存实例 = fake）
    expect(bundle.deps.modelProvider).toBe(getModelProvider())
    const r = await queryAgentLoop(bundle.deps, {
      messages: [userMsg('u1', 'gelu probe')],
      tools: [echoTool],
    })
    // 双轮：轮 1 tool_use（echo 执行）+ 轮 2 终文（无 tool_use → terminated）
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(2)
    // fixture replay 纪律：provider.chat 恰 2 调用（零真模型，脚本 2 步耗尽）
    expect(providerCalls).toEqual(['gelu-as1', 'gelu-as2'])
    // 轮 2（lastRound）= 终文轮：无工具执行 + 终文本面
    expect(r.lastRound!.toolResults).toHaveLength(0)
    expect(r.lastRound!.assistantContent).toEqual([
      { type: 'text', text: 'GELU-DONE' },
    ])
    expect(r.lastRound!.stopReason).toBe('end_turn')
    // 轮 1 工具执行面：tool_result 消息落序列（真 pipeline call→mapResult 产物，
    // 非脚本直塞——内容 = echo call 真实执行输出）
    const toolResultBlocks = r.messages
      .filter(m => m.type === 'user')
      .flatMap(m =>
        Array.isArray(m.message.content)
          ? (m.message.content as Array<{ type?: string; content?: unknown }>).filter(
              b => b.type === 'tool_result',
            )
          : [],
      )
    expect(toolResultBlocks).toHaveLength(1)
    expect(toolResultBlocks[0]!.content).toBe('echo:gelu')
    // P-2b S-E3 修波锚（审视 A 路 major-1）：gate context getAppState 面
    // 活体（活 TPC 窄视图身份 = 构建器 ① 产物；缺线 = 1c catch 吞
    // TypeError 回落 passthrough → 本探针红）
    const checkCtx = recordedCheckCtx as {
      getAppState?: () => { toolPermissionContext?: unknown }
    }
    expect(typeof checkCtx?.getAppState).toBe('function')
    expect(checkCtx!.getAppState()!.toolPermissionContext).toBe(
      bundle.toolPermissionContext,
    )
  })
})

// ── P-3 skill 域活体（内置技能注册 + 提示词真执行）───────────────────────
describe('gelu P-3 skill 域活体（registerBundledSkill 注册面）', () => {
  test('P-3 注册 → getBundledSkills 面（bundled 源 + prompt 型 + 提示词真执行）', async () => {
    registerBundledSkill({
      name: 'gelu-probe-skill',
      description: 'D 波 gelu probe 内置技能',
      getPromptForCommand: async () => [{ type: 'text', text: 'GELU-SKILL' }],
    })
    const probe = getBundledSkills().find(c => c.name === 'gelu-probe-skill')
    expect(probe).toBeDefined()
    expect(probe!.type).toBe('prompt')
    expect(probe!.source).toBe('bundled')
    expect(probe!.loadedFrom).toBe('bundled')
    // 提示词真执行面（无 files → 无 base-directory 前缀，直出）
    const blocks = await probe!.getPromptForCommand('', {})
    expect(blocks).toEqual([{ type: 'text', text: 'GELU-SKILL' }])
    // 注册表拷贝面（getBundledSkills 返拷贝，注册表本体不随取用漂移）
    expect(getBundledSkills()).toHaveLength(1)
  })
})

// ── P-4 LSP 域活体（manager 初态 + 工具门控接缝）─────────────────────────
describe('gelu P-4 LSP 域活体（初态门控面；全链假 server 归 se2c-fs）', () => {
  test('P-4 manager 初态 not-started + isLspConnected false + LSPTool 门关', () => {
    expect(getInitializationStatus()).toEqual({ status: 'not-started' })
    expect(isLspConnected()).toBe(false)
    // 门控消费面：LSPTool.isEnabled = isLspConnected（P-1b 缺席面同点判别）
    expect(LSPTool.name).toBe('LSP')
    expect(LSPTool.isEnabled()).toBe(false)
  })
})
