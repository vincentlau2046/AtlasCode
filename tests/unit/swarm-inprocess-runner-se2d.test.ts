/**
 * swarm 域 S-E2d 接缝回填（delta ⑭ agent 注册表 + TPC/gate 消费端）unit 层：
 * 零模型 / 零真盘 / 零网络（决策体 = permissions 域 in-memory 规则判定；
 * leader 队列未注册态下 allow/deny/auto-deny 三支均在 mailbox 回退支之前
 * 返回，零 I/O）。
 *
 * 测面 = S-E2d 回填三件消费端（旧仓逐字语义验真）：
 *   1. buildTeammateSystemPrompt（旧 L915-955）：replace 支逐字 / default
 *      支 ADDENDUM + 自定义 def 提示词追加（旧 L937-947 `\n# Custom Agent
 *      Instructions\n${customPrompt}`，同步/异步 getSystemPrompt 双面）/
 *      append 支次序 / 空自定义支不进 parts。
 *   2. resolveTeammateAgentFace（旧 L966-984 + runAgent L510-517）：
 *      def.tools ∪ team-essential 7 件 Set-union 保底（旧 L966-980 逐字）/
 *      无 def → undefined ≡ 通配全量池 / model 传播（旧 L984 条件 spread）/
 *      disallowedTools 禁用集剔除 / 无效 spec 静默落 invalidTools。
 *   3. createTeammateTpcBuilder（旧 runAgent L475-488 session 规则 +
 *      L450-459 shouldAvoidPrompts）：allowedTools → alwaysAllowRules.session
 *      （不可变合并，规则 map 只读面）/ avoidPermissionPrompts →
 *      shouldAvoidPermissionPrompts flag / live appState 重读支。
 *   4. createInProcessPermissionGate 消费端三态：session allow 规则 →
 *      allow 透传（2b 整工具 allow 支，经真 hasPermissionsToUseTool）/
 *      shouldAvoidPermissionPrompts → ask 支 auto-deny（gate 为 flag 唯一
 *      消费点，leader 队列 / mailbox 两支均不进，即时 resolve 验真）/
 *      session deny 规则 → deny 透传（1a 支，reason 逐字）。
 *
 * 残留守（H6 防空洞，本切片不登记断言，复审勿当遗漏重提）：
 *   - gate ask 支 leader 队列面（ToolUseConfirm entry 全形 / recheckPermission
 *     allow 支 / onAbort 清理链）= leaderPermissionBridge 注册侧测试 + TUI
 *     波 UI queue 接线面；
 *   - gate mailbox 回退支（500ms 轮询 + permissionSync 双面）= func 层
 *     swarm-permission-sync-fs 覆盖（真盘）；
 *   - runInProcessTeammate 主循环全链（idle 轮询 / 压缩 / 终态）= gelu
 *     全栈 probe（S-E2d 提交 3，零模型 fixture replay）。
 */
import { describe, expect, test } from 'bun:test'

import {
  SEND_MESSAGE_TOOL_NAME,
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
} from '../../src/engine'
import type {
  Tool,
  Tools,
  ToolPermissionContext,
} from '../../src/shared'
import type { TeammateIdentity } from '../../src/task'
import {
  buildTeammateSystemPrompt,
  createInProcessPermissionGate,
  createTeammateTpcBuilder,
  resolveTeammateAgentFace,
  TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
  type InProcessRunnerConfig,
  type TeammateToolState,
} from '../../src/swarm'

const TEAM_ESSENTIALS_7 = [
  SEND_MESSAGE_TOOL_NAME,
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
]

/** 最小假工具（gate 消费面 = name/userFacingName/description；决策体 = name + checkPermissions 鸭子支）。 */
function fakeTool(name: string): Tool {
  return {
    name,
    description: async () => `fake ${name} desc`,
    userFacingName: () => name,
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    prompt: async () => '',
    call: async () => ({ data: {} }),
  } as unknown as Tool
}

/** 基础池：2 普通工具 + 2 team-essential 工具（其余 5 件不在池 → 无效 spec 剔除支）。 */
const BASE_POOL: Tools = [
  fakeTool('Read'),
  fakeTool('Write'),
  fakeTool(SEND_MESSAGE_TOOL_NAME),
  fakeTool(TASK_LIST_TOOL_NAME),
]

const IDENTITY: TeammateIdentity = {
  agentId: 'agent-1',
  agentName: 'worker-1',
  teamName: 'team-1',
  planModeRequired: false,
  parentSessionId: 'parent-1',
}

// ── S1 buildTeammateSystemPrompt（旧 L915-955 逐字面）─────────────────

describe('S-E2d S1 buildTeammateSystemPrompt', () => {
  test('default + 无 def → ADDENDUM 单件', async () => {
    expect(await buildTeammateSystemPrompt({})).toBe(
      TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
    )
  })

  test('default + 异步 def → ADDENDUM + 自定义指令支（旧 L937-947 逐字）', async () => {
    const def: InProcessRunnerConfig['agentDefinition'] = {
      getSystemPrompt: async () => 'CUSTOM INSTRUCTIONS',
    }
    expect(await buildTeammateSystemPrompt({ agentDefinition: def })).toBe(
      [TEAMMATE_SYSTEM_PROMPT_ADDENDUM, '\n# Custom Agent Instructions\nCUSTOM INSTRUCTIONS'].join('\n'),
    )
  })

  test('同步 getSystemPrompt（string 直返）→ 同形（await 双面兼容）', async () => {
    const def: InProcessRunnerConfig['agentDefinition'] = {
      getSystemPrompt: () => 'SYNC CUSTOM',
    }
    expect(await buildTeammateSystemPrompt({ agentDefinition: def })).toBe(
      [
        TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
        '\n# Custom Agent Instructions\nSYNC CUSTOM',
      ].join('\n'),
    )
  })

  test('自定义支空串（falsy）→ 不进 parts（旧 if (customPrompt) 逐字）', async () => {
    const def: InProcessRunnerConfig['agentDefinition'] = {
      getSystemPrompt: async () => '',
    }
    expect(await buildTeammateSystemPrompt({ agentDefinition: def })).toBe(
      TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
    )
  })

  test('append 支次序：ADDENDUM + 自定义 + systemPrompt', async () => {
    const def: InProcessRunnerConfig['agentDefinition'] = {
      getSystemPrompt: async () => 'CUSTOM',
    }
    expect(
      await buildTeammateSystemPrompt({
        systemPrompt: 'EXTRA',
        systemPromptMode: 'append',
        agentDefinition: def,
      }),
    ).toBe(
      [
        TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
        '\n# Custom Agent Instructions\nCUSTOM',
        'EXTRA',
      ].join('\n'),
    )
  })

  test('replace 支 = systemPrompt 逐字（无 ADDENDUM / 无自定义追加，旧逐字）', async () => {
    const def: InProcessRunnerConfig['agentDefinition'] = {
      getSystemPrompt: async () => 'CUSTOM',
    }
    expect(
      await buildTeammateSystemPrompt({
        systemPrompt: 'REPLACED',
        systemPromptMode: 'replace',
        agentDefinition: def,
      }),
    ).toBe('REPLACED')
  })
})

// ── S2 resolveTeammateAgentFace（旧 L966-984 + runAgent L510-517）─────

describe('S-E2d S2 resolveTeammateAgentFace', () => {
  test('无 def → def.tools undefined（≡ 旧 [\'*\'] 通配）+ 全量池 + 无 model', () => {
    const { def, tools } = resolveTeammateAgentFace({
      identity: IDENTITY,
      teammateSystemPrompt: 'SP',
      basePool: BASE_POOL,
    })
    expect(def.tools).toBeUndefined()
    expect(def.model).toBeUndefined()
    expect(def.agentType).toBe(IDENTITY.agentName)
    expect(def.whenToUse).toBe('In-process teammate: worker-1')
    expect(def.source).toBe('user')
    expect(def.getSystemPrompt({})).toBe('SP')
    // 通配支 = 全量池（假工具名不在 agent 禁用集 → 4 件全留）
    expect(tools.map(t => t.name).sort()).toEqual(
      ['Read', TASK_LIST_TOOL_NAME, 'Write', SEND_MESSAGE_TOOL_NAME].sort(),
    )
  })

  test('def.tools Set-union 保底：∪ team-essential 7 件 + 无效 spec 剔除', () => {
    const { def, tools } = resolveTeammateAgentFace({
      identity: IDENTITY,
      teammateSystemPrompt: 'SP',
      agentDefinition: {
        tools: ['Read', 'Write'],
        getSystemPrompt: () => 'C',
      },
      basePool: BASE_POOL,
    })
    // Set-union 逐字：def.tools 含 2 显式 + 7 保底（9 件，Set 去重）
    expect(def.tools?.length).toBe(9)
    for (const name of TEAM_ESSENTIALS_7) {
      expect(def.tools).toContain(name)
    }
    expect(def.tools).toContain('Read')
    expect(def.tools).toContain('Write')
    // 池解析：仅池内成员保留（5 件不在池的保底名静默落 invalidTools，旧机制逐字）
    expect(
      tools
        .map(t => t.name)
        .sort(),
    ).toEqual(
      ['Read', 'Write', TASK_LIST_TOOL_NAME, SEND_MESSAGE_TOOL_NAME].sort(),
    )
  })

  test('def.tools 为 team-essential 子集 → Set 去重（7 件非 8 件）', () => {
    // SendMessage 本就在 7 件保底集内 → [SendMessage] ∪ 7 件 = 7 件（Set 去重支验真）。
    const { def } = resolveTeammateAgentFace({
      identity: IDENTITY,
      teammateSystemPrompt: 'SP',
      agentDefinition: {
        tools: [SEND_MESSAGE_TOOL_NAME, TASK_LIST_TOOL_NAME],
        getSystemPrompt: () => 'C',
      },
      basePool: BASE_POOL,
    })
    expect(def.tools?.length).toBe(7)
  })

  test('model 传播（旧 L984 条件 spread）+ disallowedTools 禁用集剔除', () => {
    const { def, tools } = resolveTeammateAgentFace({
      identity: IDENTITY,
      teammateSystemPrompt: 'SP',
      agentDefinition: {
        tools: ['Read', 'Write'],
        disallowedTools: ['Write'],
        model: 'small',
        getSystemPrompt: () => 'C',
      },
      basePool: BASE_POOL,
    })
    expect(def.model).toBe('small')
    expect(def.disallowedTools).toEqual(['Write'])
    // 禁用集剔除：Write 出池（Read + 池内 2 件 team-essential 保留）
    expect(tools.map(t => t.name).sort()).toEqual(
      ['Read', TASK_LIST_TOOL_NAME, SEND_MESSAGE_TOOL_NAME].sort(),
    )
  })
})

// ── S3 createTeammateTpcBuilder（旧 runAgent L475-488 + L450-459）─────

function fakeAppState(mode: ToolPermissionContext['mode']): TeammateToolState {
  return { toolPermissionContext: { mode }, tasks: {} }
}

describe('S-E2d S3 createTeammateTpcBuilder', () => {
  test('裸 builder（无 opts）= 回填前行为：规则空 map / 无 flag / mode 透传', () => {
    const tpc = createTeammateTpcBuilder(() => fakeAppState('acceptEdits'))()
    expect(tpc.mode).toBe('acceptEdits')
    expect(tpc.alwaysAllowRules).toEqual({})
    expect(tpc.alwaysDenyRules).toEqual({})
    expect(tpc.alwaysAskRules).toEqual({})
    expect(tpc.shouldAvoidPermissionPrompts).toBeUndefined()
    expect(tpc.isBypassPermissionsModeAvailable).toBe(false)
  })

  test('allowedTools → alwaysAllowRules.session（不可变合并 + 调用间稳定）', () => {
    const getAppState = () => fakeAppState('default')
    const build = createTeammateTpcBuilder(getAppState, {
      allowedTools: ['Read', 'Write'],
    })
    const tpc1 = build()
    const tpc2 = build()
    expect(tpc1.alwaysAllowRules.session).toEqual(['Read', 'Write'])
    // 每次调用 = 新 TPC 实例（live appState 重读 + 不可变合并，无共享可变面）
    expect(tpc2.alwaysAllowRules.session).toEqual(['Read', 'Write'])
    expect(tpc2).not.toBe(tpc1)
    // 无 session 键泄漏到缺省 builder 产物
    expect(createTeammateTpcBuilder(getAppState)().alwaysAllowRules).not.toHaveProperty(
      'session',
    )
  })

  test('avoidPermissionPrompts → shouldAvoidPermissionPrompts flag', () => {
    const tpc = createTeammateTpcBuilder(() => fakeAppState('default'), {
      avoidPermissionPrompts: true,
    })()
    expect(tpc.shouldAvoidPermissionPrompts).toBe(true)
  })

  test('live appState 重读：mode 变化经 builder 每次调用传导', () => {
    let state = fakeAppState('default')
    const build = createTeammateTpcBuilder(() => state)
    expect(build().mode).toBe('default')
    state = fakeAppState('bypassPermissions')
    expect(build().mode).toBe('bypassPermissions')
  })
})

// ── S4 gate 消费端三态（真 hasPermissionsToUseTool 决策体）────────────

describe('S-E2d S4 createInProcessPermissionGate 消费端', () => {
  const identity = IDENTITY
  const tools: Tools = [fakeTool('FakeTool')]

  test('session allow 规则 → allow 透传（2b 支，updatedInput 回落 input）', async () => {
    const buildTpc = createTeammateTpcBuilder(() => fakeAppState('default'), {
      allowedTools: ['FakeTool'],
    })
    const gate = createInProcessPermissionGate(
      identity,
      new AbortController(),
      tools,
      () => fakeAppState('default'),
      buildTpc,
    )
    const res = await gate(fakeTool('FakeTool'), { arg: 1 })
    expect(res).toMatchObject({ allowed: true, updatedInput: { arg: 1 } })
  })

  test('shouldAvoidPermissionPrompts → ask 支 auto-deny（唯一消费点，即时 resolve）', async () => {
    const buildTpc = createTeammateTpcBuilder(() => fakeAppState('default'), {
      avoidPermissionPrompts: true,
    })
    const gate = createInProcessPermissionGate(
      identity,
      new AbortController(),
      tools,
      () => fakeAppState('default'),
      buildTpc,
    )
    const startedAt = Date.now()
    const res = await gate(fakeTool('FakeTool'), {})
    // 即时返回（mailbox 回退支 500ms 轮询不进；leader 队列未注册亦不进）
    expect(Date.now() - startedAt).toBeLessThan(250)
    expect(res.allowed).toBe(false)
    expect('ask' in res && res.ask).toBe(true)
    expect(res.reason).toMatch(/Permission for this tool use was denied/)
  })

  test('session deny 规则 → deny 透传（1a 支，reason 逐字）', async () => {
    const tpc: ToolPermissionContext = {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: { session: ['FakeTool'] },
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
    }
    const gate = createInProcessPermissionGate(
      identity,
      new AbortController(),
      tools,
      () => fakeAppState('default'),
      () => tpc,
    )
    const res = await gate(fakeTool('FakeTool'), { arg: 1 })
    expect(res.allowed).toBe(false)
    expect(res).not.toHaveProperty('ask')
    expect(res.reason).toBe('Permission to use FakeTool has been denied.')
  })

  test('abort 优先序（abort > auto-deny > 队列 / mailbox，零 I/O 支）', async () => {
    // 已 abort 的 controller：gate 首个 abort 检查即返回（auto-deny flag 设
    // 与否同形）——验支序 + 缺省 4 参构造面（回填前签名兼容），零 I/O。
    const ac = new AbortController()
    ac.abort()
    const buildTpc = createTeammateTpcBuilder(() => fakeAppState('default'), {
      avoidPermissionPrompts: true,
    })
    const gate = createInProcessPermissionGate(
      identity,
      ac,
      tools,
      () => fakeAppState('default'),
      buildTpc,
    )
    const res = await gate(fakeTool('FakeTool'), {})
    expect(res.allowed).toBe(false)
    expect(res).toHaveProperty('ask', true)
    expect(res.reason).toMatch(/Permission for this tool use was denied/)
  })

  test('无 gateOptions（回填前缺省面）：4 参构造兼容 + 无 flag 不 auto-deny', async () => {
    // 缺省 buildTpc = 本地最小 TPC（规则空 map、无 flag）；abort 态下 gate
    // 首个 abort 检查返回（若误设 auto-deny 支同形——判别信号 = 无 flag 的
    // 非 abort 路径落 mailbox（func 层覆盖），本测仅验缺省构造 + abort 支
    // 零 I/O 返回）。
    const ac = new AbortController()
    ac.abort()
    const gate = createInProcessPermissionGate(
      identity,
      ac,
      tools,
      () => fakeAppState('default'),
    )
    const res = await gate(fakeTool('FakeTool'), {})
    expect(res.allowed).toBe(false)
    expect(res).toHaveProperty('ask', true)
  })
})
