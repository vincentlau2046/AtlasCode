/**
 * wave0193 W-D-A：临时小组（Form A）——spawn 触发点（扩参形）+ idle/wake
 * 补全 + 角色模板注册 + 终止条件组（工单 docs/2026-11-08-p0-wave-0193-ticket.md；
 * f4 锁面批复 2026-11-08 五定谳全认可 + 待批 2 项批准）。
 *
 * 分段（每切片 RED→GREEN→小提交，工单 §1 串行）：
 *   段 A：engine 单源 swarm 字段过滤（f4 批复五(c)）——filterSwarmFieldsFromSchema
 *         落 shared 单源，modelprovider/params.ts（print+TUI 双车道 wire 投影）
 *         与 tui/utils/api.ts 同消费；门 OFF 缺省不可见（判据④载体）。
 *         判别 RED 锚 = 合成 'Agent' 名工具（schema 含 name/team_name/mode）
 *         经 buildOpenAIParams 投影：修前无过滤面 → 字段穿透（RED）；
 *         修后门 OFF 剥除（GREEN）。
 *
 * 锁面定谳锚（f4 批复原文摘要，防漂移）：
 *   - RF2：idle/wake 循环已在盘（inProcessRunner.ts:948/:1246/:1477），
 *     补全非重建；设计稿 §8① premise 过时归档勘误（W-D-B 工单化时改）。
 *   - ④：Form A 门掉 writeTeamFileAsync/registerTeamForSessionCleanup；
 *     handleBroadcast 成员发现切 teamContext 双源（组态优先，team file 回落
 *     fail-soft——缺席返空成员集不崩）。
 *   - 五(a)：基座定谳 = AgentTool 扩 name/team_name/mode 三字段（上游 2.1.319
 *     契约，SWARM_FIELDS_BY_TOOL 对偶实锤）；ExitPlanModeV2 launchSwarm/
 *     teammateCount Form A 不入（归 W-D-B）。
 *   - 六（判据口径修订）：「Form A 零写盘」= 零新增持久面（team file 写入/
 *     成员注册表/durable 队列零新增）；既有域盘面（tasks ensureTasksDir /
 *     mailbox lockfile）沿 0.1.36 既有行为不变更、不新增。
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'

import { buildOpenAIParams } from '../../src/modelprovider'

const GATE_ENV = 'ATLAS_EXPERIMENTAL_AGENT_TEAMS'

/** 合成 'Agent' 名工具（schema 携带 Form A 扩参三字段 + 常规字段）。 */
function fakeAgentTool(): Parameters<
  typeof buildOpenAIParams
>[0]['tools'][number] {
  return {
    name: 'Agent',
    description: async () => 'fake agent desc',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        prompt: { type: 'string' },
        name: { type: 'string', description: 'Teammate name' },
        team_name: { type: 'string', description: 'Team name' },
        mode: { type: 'string', description: 'Teammate mode' },
      },
      required: ['description', 'prompt'],
    },
  } as unknown as Parameters<typeof buildOpenAIParams>[0]['tools'][number]
}

/** 非 swarm 表工具（Bash 名，字段恒不被剥）。 */
function fakeBashTool(): Parameters<
  typeof buildOpenAIParams
>[0]['tools'][number] {
  return {
    name: 'Bash',
    description: async () => 'fake bash desc',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string' } },
    },
  } as unknown as Parameters<typeof buildOpenAIParams>[0]['tools'][number]
}

async function projectTools(tools: unknown[]): Promise<Record<string, any>> {
  const params = await buildOpenAIParams({
    messages: [{ role: 'user', content: 'hi' }] as Parameters<
      typeof buildOpenAIParams
    >[0]['messages'],
    systemPrompt: [],
    tools: tools as Parameters<typeof buildOpenAIParams>[0]['tools'],
    options: {
      model: 'test-model',
      getToolPermissionContext: async () => ({
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        isBypassPermissionsModeAvailable: false,
      }),
    },
  })
  const out: Record<string, any> = {}
  for (const t of (params.tools ?? []) as Array<{
    function: { name: string; parameters: any }
  }>) {
    out[t.function.name] = t.function.parameters
  }
  return out
}

describe('wave0193 段 A：engine 单源 swarm 字段过滤（f4 批复五(c)，判据④载体）', () => {
  const savedEnv = process.env[GATE_ENV]

  test('门 OFF：Agent wire schema 剥 name/team_name/mode，常规字段保留', async () => {
    delete process.env[GATE_ENV]
    const projected = await projectTools([fakeAgentTool(), fakeBashTool()])
    const agentProps = projected['Agent']?.properties ?? {}
    expect(agentProps.name).toBeUndefined()
    expect(agentProps.team_name).toBeUndefined()
    expect(agentProps.mode).toBeUndefined()
    // 常规字段不受过滤面影响
    expect(agentProps.description).toBeDefined()
    expect(agentProps.prompt).toBeDefined()
    // 非 swarm 表工具字段恒保留
    expect(projected['Bash']?.properties?.command).toBeDefined()
  })

  test('门 ON：Agent wire schema 三字段全保留（扩参可见）', async () => {
    process.env[GATE_ENV] = '1'
    try {
      const projected = await projectTools([fakeAgentTool()])
      const agentProps = projected['Agent']?.properties ?? {}
      expect(agentProps.name).toBeDefined()
      expect(agentProps.team_name).toBeDefined()
      expect(agentProps.mode).toBeDefined()
    } finally {
      if (savedEnv === undefined) delete process.env[GATE_ENV]
      else process.env[GATE_ENV] = savedEnv
    }
  })

  test('ExitPlanMode 名工具同在剥除表（launchSwarm/teammateCount，Form A 不入但过滤面就位）', async () => {
    delete process.env[GATE_ENV]
    const exitTool = {
      name: 'ExitPlanMode',
      description: async () => 'fake exit desc',
      inputSchema: {
        type: 'object',
        properties: {
          allowedPrompts: { type: 'array' },
          launchSwarm: { type: 'boolean' },
          teammateCount: { type: 'number' },
        },
      },
    } as unknown as Parameters<typeof buildOpenAIParams>[0]['tools'][number]
    const projected = await projectTools([exitTool])
    const props = projected['ExitPlanMode']?.properties ?? {}
    expect(props.launchSwarm).toBeUndefined()
    expect(props.teammateCount).toBeUndefined()
    expect(props.allowedPrompts).toBeDefined()
  })
})

// ── 段 C：spawn 触发点（A3；f4 批复五(a) 基座定谳闭环：AgentTool 扩
//    name/team_name/mode 三字段 + teammateSpawnPort seam + 成员注册面）──
import { AgentTool } from '../../src/engine'
import {
  resetTeammateSpawnTrigger,
  setTeammateSpawnTrigger,
  type TeammateSpawnTriggerConfig,
} from '../../src/engine'

// ── 段 D：角色模板注册表消费面（A4；工单 T-7，shared 加性）──────────
import {
  getAgentRoleTemplate,
  registerAgentRoleTemplate,
  renderTeammatePrompt,
  resetAgentRoleTemplates,
} from '../../src/shared'

// ── 段 E：handleBroadcast 成员发现 teamContext 双源 + fail-soft
//    （A5；f4 批复④：组态优先 / team file 回落 / 缺席返空成员集不崩）──
import { SendMessageTool, resetTeamFileLoader, setTeamFileLoader } from '../../src/engine'
import { peekTeamContext } from '../../src/engine/tools/team/teamServices'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── 段 B：TeamCreate Form A 零持久改形 + members 名册（f4 批复④）────────
import { TeamCreateTool, TeamDeleteTool } from '../../src/engine'
import {
  resetTeamServices,
  setTeamServices,
  type TeamServices,
} from '../../src/engine/tools/team/teamServices'
import { resetDefaultTeamContextStore } from '../../src/engine/tools/team/teamServices'

/** 全内存 TeamServices fake（零真盘；spy 记录文件面调用）。 */
function makeMemoryServices() {
  const calls: string[] = []
  let ctx: Record<string, unknown> | undefined
  const services: TeamServices = {
    readTeamFile: () => null,
    writeTeamFileAsync: async () => {
      calls.push('writeTeamFileAsync')
    },
    getTeamFilePath: (name: string) => `/fake/atlas/teams/${name}/config.json`,
    registerTeamForSessionCleanup: () => {
      calls.push('registerTeamForSessionCleanup')
    },
    unregisterTeamForSessionCleanup: () => {
      calls.push('unregisterTeamForSessionCleanup')
    },
    cleanupTeamDirectories: async () => {
      calls.push('cleanupTeamDirectories')
    },
    assignTeammateColor: () => '#fake',
    clearTeammateColors: () => {
      calls.push('clearTeammateColors')
    },
    sanitizeName: (n: string) => n,
    getTeamContext: () => ctx as never,
    setTeamContext: c => {
      ctx = c as Record<string, unknown>
    },
  }
  return { services, calls }
}

describe('wave0193 段 B：TeamCreate Form A 零持久 + members 名册（f4 批复④）', () => {
  const savedEnv = process.env[GATE_ENV]

  function setupGate() {
    process.env[GATE_ENV] = '1'
    resetDefaultTeamContextStore()
  }

  function teardownGate() {
    resetTeamServices()
    resetDefaultTeamContextStore()
    if (savedEnv === undefined) delete process.env[GATE_ENV]
    else process.env[GATE_ENV] = savedEnv
  }

  test('B1 门 ON 创建组：零 team file 写入（writeTeamFileAsync/registerForCleanup 不调用）', async () => {
    setupGate()
    try {
      const { services, calls } = makeMemoryServices()
      setTeamServices(services)
      const result = await TeamCreateTool.call(
        { team_name: 'form-a-team' },
        {},
      )
      expect(calls).not.toContain('writeTeamFileAsync')
      expect(calls).not.toContain('registerTeamForSessionCleanup')
      expect(result.data.team_name).toBe('form-a-team')
      expect(result.data.team_file_path).toContain('form-a-team')
      expect(result.data.lead_agent_id).toBe('team-lead@form-a-team')
    } finally {
      teardownGate()
    }
  })

  test('B2 members 名册（role/goal/backstory 三元组）入 teamContext.roster', async () => {
    setupGate()
    try {
      const { services } = makeMemoryServices()
      setTeamServices(services)
      await TeamCreateTool.call(
        {
          team_name: 'roster-team',
          members: [
            {
              name: 'tiling-dev',
              role: 'op-developer',
              goal: '实现 gelu 算子',
              backstory: 'Ascend C 老手',
            },
          ],
        },
        {},
      )
      const ctx = services.getTeamContext() as unknown as {
        teamName: string
        roster?: Array<{ name: string; role?: string }>
      }
      expect(ctx.teamName).toBe('roster-team')
      expect(ctx.roster).toHaveLength(1)
      expect(ctx.roster?.[0]).toEqual({
        name: 'tiling-dev',
        role: 'op-developer',
        goal: '实现 gelu 算子',
        backstory: 'Ascend C 老手',
      })
    } finally {
      teardownGate()
    }
  })

  test('B3 members 名成员缺 name → validateInput 拒（errorCode 9）', async () => {
    setupGate()
    try {
      const { services } = makeMemoryServices()
      setTeamServices(services)
      const v = await TeamCreateTool.validateInput(
        { team_name: 't', members: [{ role: 'x' }] },
        {},
      )
      expect(v.result).toBe(false)
    } finally {
      teardownGate()
    }
  })

  test('B4 TeamDelete 文件缺席 fail-soft（Form A 常态）：建组→组散全链', async () => {
    setupGate()
    try {
      const { services, calls } = makeMemoryServices()
      setTeamServices(services)
      // Form A 建组（零文件写入）→ 组散：teamContext 在场 → cleanup 走
      // fail-soft 路径（team file 缺席 → readTeamFile null → 守卫跳过）
      await TeamCreateTool.call({ team_name: 'del-team' }, {})
      const result = await TeamDeleteTool.call({}, {})
      expect(result.data.success).toBe(true)
      expect(calls).toContain('cleanupTeamDirectories')
      expect(calls).not.toContain('writeTeamFileAsync')
      expect(services.getTeamContext()).toBeUndefined()
    } finally {
      teardownGate()
    }
  })
})

describe('wave0193 段 C：spawn 触发点（A3，f4 批复五(a) 基座定谳闭环）', () => {
  const savedEnv = process.env[GATE_ENV]

  function setupGate() {
    process.env[GATE_ENV] = '1'
    resetDefaultTeamContextStore()
  }

  function teardownGate() {
    resetTeammateSpawnTrigger()
    resetTeamServices()
    resetDefaultTeamContextStore()
    if (savedEnv === undefined) delete process.env[GATE_ENV]
    else process.env[GATE_ENV] = savedEnv
  }

  test('C1 门 ON spawn 链：Agent(name, team_name) → trigger 调用 + roster 渲染 + 成员注册面', async () => {
    setupGate()
    try {
      const { services } = makeMemoryServices()
      setTeamServices(services)
      const triggerCalls: TeammateSpawnTriggerConfig[] = []
      setTeammateSpawnTrigger(async cfg => {
        triggerCalls.push(cfg)
        return { success: true, agentId: 'tiling-dev@roster-team', taskId: 'task-1' }
      })
      await TeamCreateTool.call(
        {
          team_name: 'roster-team',
          members: [
            {
              name: 'tiling-dev',
              role: 'op-developer',
              goal: '实现 gelu 算子',
              backstory: 'Ascend C 老手',
            },
          ],
        },
        {},
      )
      const result = await AgentTool.call(
        {
          description: 'spawn teammate',
          prompt: '干这件事',
          name: 'tiling-dev',
          team_name: 'roster-team',
        },
        {},
      )
      // trigger 被调 + duck 配置逐字段
      expect(triggerCalls).toHaveLength(1)
      expect(triggerCalls[0].name).toBe('tiling-dev')
      expect(triggerCalls[0].teamName).toBe('roster-team')
      // roster 渲染：goal/backstory 入 prompt + 任务 prompt 原文保留
      expect(triggerCalls[0].prompt).toContain('实现 gelu 算子')
      expect(triggerCalls[0].prompt).toContain('Ascend C 老手')
      expect(triggerCalls[0].prompt).toContain('干这件事')
      // headless 形态定谳：成员 spawn 恒 allowPermissionPrompts=false
      expect(triggerCalls[0].allowPermissionPrompts).toBe(false)
      // 输出面
      const data = result.data as Record<string, unknown>
      expect(data.status).toBe('teammate_spawned')
      expect(data.agentId).toBe('tiling-dev@roster-team')
      // 成员注册面：teamContext.teammates 增成员（spawn 成员注册面补入组态）
      const ctx = services.getTeamContext() as unknown as {
        teammates: Record<string, { name: string; agentType?: string }>
      }
      expect(ctx.teammates['tiling-dev@roster-team']).toBeDefined()
      expect(ctx.teammates['tiling-dev@roster-team'].name).toBe('tiling-dev')
      expect(ctx.teammates['tiling-dev@roster-team'].agentType).toBe('op-developer')
    } finally {
      teardownGate()
    }
  })

  test('C2 门 OFF：Agent 传 name/team_name → validateInput 拒（fail-closed）', async () => {
    delete process.env[GATE_ENV]
    try {
      const v = await AgentTool.validateInput?.(
        { description: 'd', prompt: 'p', name: 'x', team_name: 't' },
        {},
      )
      // 无 validateInput 成员 = 面缺失（RED 期望：实现后存在且拒）
      expect(v).toBeDefined()
      expect(v!.result).toBe(false)
    } finally {
      if (savedEnv === undefined) delete process.env[GATE_ENV]
      else process.env[GATE_ENV] = savedEnv
    }
  })

  test('C3 trigger 未接线 → call fail-fast（编程错误早暴露，PRT-2 先例同型）', async () => {
    setupGate()
    try {
      const { services } = makeMemoryServices()
      setTeamServices(services)
      await TeamCreateTool.call(
        { team_name: 'ff-team', members: [{ name: 'm1' }] },
        {},
      )
      let threw = false
      try {
        await AgentTool.call(
          { description: 'd', prompt: 'p', name: 'm1', team_name: 'ff-team' },
          {},
        )
      } catch (e) {
        threw = true
        expect(String(e)).toContain('TeammateSpawnTrigger not wired')
      }
      expect(threw).toBe(true)
    } finally {
      teardownGate()
    }
  })

  test('C4 无活跃组（teamContext 缺席）→ call 拒（spawn 前置 TeamCreate）', async () => {
    setupGate()
    try {
      setTeamServices(makeMemoryServices().services)
      setTeammateSpawnTrigger(async () => ({
        success: true,
        agentId: 'x@t',
      }))
      let threw = false
      try {
        await AgentTool.call(
          { description: 'd', prompt: 'p', name: 'm1', team_name: 'ghost-team' },
          {},
        )
      } catch (e) {
        threw = true
        expect(String(e)).toContain('TeamCreate')
      }
      expect(threw).toBe(true)
    } finally {
      teardownGate()
    }
  })
})

describe('wave0193 段 D：角色模板注册表消费面（A4，工单 T-7 shared 加性）', () => {
  test('D1 named 模板注册 → render 注入 systemPromptFragment + 三元组共存', () => {
    resetAgentRoleTemplates()
    try {
      registerAgentRoleTemplate({
        role: 'op-developer',
        systemPromptFragment: 'You follow the CANN four-piece workflow.',
      })
      expect(getAgentRoleTemplate('op-developer')?.systemPromptFragment).toContain(
        'four-piece',
      )
      const rendered = renderTeammatePrompt({
        name: 'tiling-dev',
        role: 'op-developer',
        goal: '实现 gelu 算子',
        backstory: 'Ascend C 老手',
        prompt: '干这件事',
      })
      expect(rendered).toContain('four-piece')
      expect(rendered).toContain('Role: op-developer')
      expect(rendered).toContain('Goal: 实现 gelu 算子')
      expect(rendered).toContain('Backstory: Ascend C 老手')
      expect(rendered).toContain('干这件事')
    } finally {
      resetAgentRoleTemplates()
    }
  })

  test('D2 未注册 role → render 退化面（身份行 + 三元组 + 任务原文，零模板注入）', () => {
    resetAgentRoleTemplates()
    const rendered = renderTeammatePrompt({
      name: 'solo',
      prompt: '任务原文',
    })
    expect(rendered).toContain('"solo"')
    expect(rendered).toContain('任务原文')
    expect(rendered).not.toContain('Role:')
  })
})

describe('wave0193 段 E：handleBroadcast 成员发现双源 + fail-soft（A5，f4 批复④）', () => {
  const savedEnv = process.env[GATE_ENV]
  let tmpRoot: string | undefined

  function setupGate() {
    process.env[GATE_ENV] = '1'
    resetDefaultTeamContextStore()
    tmpRoot = mkdtempSync(join(tmpdir(), 'wave0193-e-'))
    process.env.ATLAS_CONFIG_DIR = tmpRoot
  }

  function teardownGate() {
    resetTeamFileLoader()
    resetTeamServices()
    resetDefaultTeamContextStore()
    delete process.env[GATE_ENV]
    if (savedEnv !== undefined) process.env[GATE_ENV] = savedEnv
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true })
      tmpRoot = undefined
    }
  }

  function sendCtx(teamName?: string): unknown {
    return {
      getAppState: () => ({
        teamContext: teamName
          ? { teamName, leadAgentId: `team-lead@${teamName}` }
          : undefined,
        toolPermissionContext: { mode: 'default' },
      }),
    }
  }

  test('E1 组态优先：Form A 建组（零 team file）→ broadcast recipients = roster ∪ teammates − sender', async () => {
    setupGate()
    try {
      const { services } = makeMemoryServices()
      setTeamServices(services)
      await TeamCreateTool.call(
        {
          team_name: 'bc-team',
          members: [
            { name: 'tiling-dev', role: 'op-developer' },
            { name: 'debug-dev' },
          ],
        },
        {},
      )
      // RED 锚（工单 T-8 链）：组态在场 + team file 缺席 → 旧 throw
      // does-not-exist；修后 = 组态成员发现（roster ∪ teammates − lead）
      const r = await SendMessageTool.call(
        { to: '*', message: '开工', summary: 'kickoff' },
        sendCtx(),
      )
      const data = r.data as { success: boolean; recipients: string[] }
      expect(data.success).toBe(true)
      expect([...data.recipients].sort()).toEqual(['debug-dev', 'tiling-dev'])
    } finally {
      teardownGate()
    }
  })

  test('E2 fail-soft：组态空 + 回落叶 team file 缺席 → 返空成员集不崩（旧 throw 面裁除）', async () => {
    setupGate()
    try {
      setTeamServices(makeMemoryServices().services)
      const r = await SendMessageTool.call(
        { to: '*', message: 'hi', summary: 's' },
        sendCtx('t1'),
      )
      const data = r.data as { success: boolean; recipients: string[] }
      expect(data.success).toBe(true)
      expect(data.recipients).toEqual([])
    } finally {
      teardownGate()
    }
  })

  test('E3 回落仍生效：组态空 + team file 在场（W-D-B durable 兼容）→ file 成员', async () => {
    setupGate()
    try {
      setTeamServices(makeMemoryServices().services)
      setTeamFileLoader(async () => ({
        members: [
          { name: 'team-lead', agentId: 'team-lead@t1', joinedAt: 0, tmuxPaneId: '', cwd: '', subscriptions: [] },
          { name: 'legacy-w1', agentId: 'legacy-w1@t1', joinedAt: 0, tmuxPaneId: '', cwd: '', subscriptions: [] },
        ],
      }) as never)
      const r = await SendMessageTool.call(
        { to: '*', message: 'hi', summary: 's' },
        sendCtx('t1'),
      )
      const data = r.data as { success: boolean; recipients: string[] }
      expect(data.success).toBe(true)
      expect(data.recipients).toEqual(['legacy-w1'])
    } finally {
      teardownGate()
    }
  })

  test('E4 peekTeamContext 软读：未注入 = undefined 不抛（发现面与 requireTeamServices fail-fast 分面）', () => {
    resetTeamServices()
    expect(peekTeamContext()).toBeUndefined()
  })
})

// ── 段 F：终止条件组 + stall 计数（A6；工单审计 F2/F5；判别格 ≥4 预注册：
//    max-turns / 文本确认 / 外部 kill / OR-AND 组合各一格 + stall 计数格；
//    G-1 RepeatToolCallTracker 同族：纯模块 + 配置 fail-loud）──────────────
import {
  advanceTerminationLoopState,
  createInitialTerminationLoopState,
  evaluateTerminationSpec,
  extractFinalAssistantText,
  validateTerminationSpec,
  type TerminationSpec,
} from '../../src/swarm'

describe('wave0193 段 F：终止条件组判别格（A6，工单审计 F2 ≥4 格预注册）', () => {
  test('F1 max-turns 格：turns < max 不终止 / turns >= max 终止（reason 逐字段）', () => {
    const spec: TerminationSpec = {
      op: 'or',
      conditions: [{ kind: 'max-turns', maxTurns: 3 }],
    }
    const below = evaluateTerminationSpec(spec, {
      ...createInitialTerminationLoopState(),
      turns: 2,
      aborted: false,
    })
    expect(below.terminate).toBe(false)
    const at = evaluateTerminationSpec(spec, {
      ...createInitialTerminationLoopState(),
      turns: 3,
      aborted: false,
    })
    expect(at.terminate).toBe(true)
    expect(at.reason).toEqual({ type: 'max-turns', turns: 3 })
  })

  test('F2 文本确认格：终轮文本含确认短语（大小写不敏感）→ 终止 / 不含 → 不终止', () => {
    const spec: TerminationSpec = {
      op: 'or',
      conditions: [{ kind: 'text-confirm', phrases: ['TASK COMPLETE'] }],
    }
    const hit = evaluateTerminationSpec(spec, {
      ...createInitialTerminationLoopState(),
      lastFinalText: 'All done — task complete, handing back.',
      aborted: false,
    })
    expect(hit.terminate).toBe(true)
    expect(hit.reason).toEqual({
      type: 'text-confirm',
      matched: 'TASK COMPLETE',
    })
    const miss = evaluateTerminationSpec(spec, {
      ...createInitialTerminationLoopState(),
      lastFinalText: 'still working',
      aborted: false,
    })
    expect(miss.terminate).toBe(false)
  })

  test('F3 外部 kill 格：lifecycle abort → 终止（graceful，不发 kill——F3 态机语义）', () => {
    const spec: TerminationSpec = {
      op: 'or',
      conditions: [{ kind: 'external-kill' }],
    }
    const killed = evaluateTerminationSpec(spec, {
      ...createInitialTerminationLoopState(),
      aborted: true,
    })
    expect(killed.terminate).toBe(true)
    expect(killed.reason).toEqual({ type: 'external-kill' })
    const alive = evaluateTerminationSpec(spec, {
      ...createInitialTerminationLoopState(),
      aborted: false,
    })
    expect(alive.terminate).toBe(false)
  })

  test('F4 OR-AND 组合格：or 任一命中即终止 / and 全命中才终止 / and 缺一不终止', () => {
    const maxTurnsMet = { turns: 5, aborted: false }
    const textMet = { lastFinalText: 'TASK COMPLETE', aborted: false }
    const orSpec: TerminationSpec = {
      op: 'or',
      conditions: [
        { kind: 'max-turns', maxTurns: 3 },
        { kind: 'text-confirm', phrases: ['TASK COMPLETE'] },
      ],
    }
    const orHit = evaluateTerminationSpec(orSpec, {
      ...createInitialTerminationLoopState(),
      ...textMet,
    })
    expect(orHit.terminate).toBe(true)
    expect(orHit.reason?.type).toBe('or')
    expect((orHit.reason as { satisfied: unknown[] }).satisfied).toHaveLength(1)

    const andSpec: TerminationSpec = {
      op: 'and',
      conditions: [
        { kind: 'max-turns', maxTurns: 3 },
        { kind: 'text-confirm', phrases: ['TASK COMPLETE'] },
      ],
    }
    const andHit = evaluateTerminationSpec(andSpec, {
      ...createInitialTerminationLoopState(),
      ...maxTurnsMet,
      ...textMet,
    })
    expect(andHit.terminate).toBe(true)
    expect(andHit.reason?.type).toBe('and')
    expect((andHit.reason as { satisfied: unknown[] }).satisfied).toHaveLength(2)
    const andMiss = evaluateTerminationSpec(andSpec, {
      ...createInitialTerminationLoopState(),
      ...maxTurnsMet,
      aborted: false,
    })
    expect(andMiss.terminate).toBe(false)
  })

  test('F5 stall 计数格（F5 锁面：per-member 连击同文计数；同文连击到阈终止 / 异文复位 / 组级打转 = stall 条件入词汇表）', () => {
    let st = createInitialTerminationLoopState()
    // 同文连击：A → stall 0，A → 1，A → 2，A → 3
    for (const _ of [1, 2, 3, 4]) {
      st = advanceTerminationLoopState(st, { finalText: 'same answer' })
    }
    expect(st.turns).toBe(4)
    expect(st.stallConsecutive).toBe(3)
    const stallSpec: TerminationSpec = {
      op: 'or',
      conditions: [{ kind: 'stall', maxConsecutive: 3 }],
    }
    const stalled = evaluateTerminationSpec(stallSpec, {
      ...st,
      aborted: false,
    })
    expect(stalled.terminate).toBe(true)
    expect(stalled.reason).toEqual({ type: 'stall', consecutive: 3 })
    // 异文复位 + undefined 复位
    st = advanceTerminationLoopState(st, { finalText: 'different now' })
    expect(st.stallConsecutive).toBe(0)
    st = advanceTerminationLoopState(st, { finalText: undefined })
    expect(st.stallConsecutive).toBe(0)
  })

  test('F6 配置 fail-loud（G-1 090-09 同族）：空条件 / maxTurns<1 / stall<2 / 空短语 / 非法 op → 构造期抛', () => {
    expect(() => validateTerminationSpec({ op: 'or', conditions: [] })).toThrow()
    expect(() =>
      validateTerminationSpec({
        op: 'or',
        conditions: [{ kind: 'max-turns', maxTurns: 0 }],
      }),
    ).toThrow()
    expect(() =>
      validateTerminationSpec({
        op: 'or',
        conditions: [{ kind: 'stall', maxConsecutive: 1 }],
      }),
    ).toThrow()
    expect(() =>
      validateTerminationSpec({
        op: 'or',
        conditions: [{ kind: 'text-confirm', phrases: [] }],
      }),
    ).toThrow()
    expect(() =>
      validateTerminationSpec({
        op: 'xor' as 'or',
        conditions: [{ kind: 'external-kill' }],
      }),
    ).toThrow()
  })

  test('F7 extractFinalAssistantText：末位 assistant 文本块拼接 / 无 assistant → undefined', () => {
    expect(
      extractFinalAssistantText([
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'part1 ' },
            { type: 'text', text: 'part2' },
          ],
        },
        { role: 'user', content: 'follow-up' },
      ]),
    ).toBe('part1 part2')
    expect(extractFinalAssistantText([{ role: 'user', content: 'q' }])).toBeUndefined()
  })
})

// ── 段 G：组散 shutdown 残留面（A7；工单 Review Focus 5：TeamDelete
//    active-member 守卫 teamContext 化——Form A 无 team file 守卫跳过
//    = 孤儿循环破口；fail-closed：task 态未知 = 视为活；graceful 优先）──
import { registerSpawnedTeammate } from '../../src/engine/tools/team/teamServices'

/** appState duck（task 态查表面；status: running=活 / completed|killed|failed=终）。 */
function deleteCtx(tasks?: Record<string, { status?: string }>): unknown {
  return {
    getAppState: () => ({ tasks: tasks ?? {} }),
  }
}

describe('wave0193 段 G：TeamDelete 守卫 teamContext 化 + 组散残留（A7）', () => {
  const savedEnv = process.env[GATE_ENV]

  function setupGate() {
    process.env[GATE_ENV] = '1'
    resetDefaultTeamContextStore()
  }

  function teardownGate() {
    resetTeamServices()
    resetDefaultTeamContextStore()
    if (savedEnv === undefined) delete process.env[GATE_ENV]
    else process.env[GATE_ENV] = savedEnv
  }

  test('G1 组内有活成员（task running）→ TeamDelete 拒（守卫 teamContext 化，消息含成员名）', async () => {
    setupGate()
    try {
      setTeamServices(makeMemoryServices().services)
      await TeamCreateTool.call({ team_name: 'del-guard' }, {})
      registerSpawnedTeammate({ name: 'w1', agentId: 'w1@del-guard', taskId: 'task-1' })
      const r = await TeamDeleteTool.call({}, deleteCtx({ 'task-1': { status: 'running' } }))
      const data = r.data as { success: boolean; message: string }
      expect(data.success).toBe(false)
      expect(data.message).toContain('active member')
      expect(data.message).toContain('w1')
      // 组态保留（拒散不注销）
      expect(peekTeamContext()).toBeDefined()
    } finally {
      teardownGate()
    }
  })

  test('G2 task 态未知（缺 appState / 缺 task 条目）→ fail-closed 拒（禁孤儿循环）', async () => {
    setupGate()
    try {
      setTeamServices(makeMemoryServices().services)
      await TeamCreateTool.call({ team_name: 'del-guard' }, {})
      registerSpawnedTeammate({ name: 'w1', agentId: 'w1@del-guard', taskId: 'task-1' })
      // 无 getAppState（context 空对象）
      const rNoState = await TeamDeleteTool.call({}, {})
      expect((rNoState.data as { success: boolean }).success).toBe(false)
      // 有 appState 但无该 task 条目
      const rNoEntry = await TeamDeleteTool.call({}, deleteCtx({}))
      expect((rNoEntry.data as { success: boolean }).success).toBe(false)
    } finally {
      teardownGate()
    }
  })

  test('G3 成员已 graceful shutdown（task completed）→ 散组放行全链（cleanup + 组态注销）', async () => {
    setupGate()
    try {
      const { services, calls } = makeMemoryServices()
      setTeamServices(services)
      resetDefaultTeamContextStore()
      await TeamCreateTool.call({ team_name: 'del-guard' }, {})
      registerSpawnedTeammate({ name: 'w1', agentId: 'w1@del-guard', taskId: 'task-1' })
      const r = await TeamDeleteTool.call(
        {},
        deleteCtx({ 'task-1': { status: 'completed' } }),
      )
      const data = r.data as { success: boolean; team_name?: string }
      expect(data.success).toBe(true)
      expect(data.team_name).toBe('del-guard')
      expect(calls).toContain('cleanupTeamDirectories')
      // mailbox 队列清面 = cleanupTeamDirectories 真 rm teams/<team>/（inboxes
      // 含）——真实接线由 swarm teamHelpers 承担；此处断言清面调用在场。
      expect(services.getTeamContext()).toBeUndefined()
    } finally {
      teardownGate()
    }
  })

  test('G4 成员 killed（外部 kill 终态）→ 散组放行（非活成员不阻散）', async () => {
    setupGate()
    try {
      setTeamServices(makeMemoryServices().services)
      await TeamCreateTool.call({ team_name: 'del-guard' }, {})
      registerSpawnedTeammate({ name: 'w1', agentId: 'w1@del-guard', taskId: 'task-1' })
      const r = await TeamDeleteTool.call(
        {},
        deleteCtx({ 'task-1': { status: 'killed' } }),
      )
      expect((r.data as { success: boolean }).success).toBe(true)
    } finally {
      teardownGate()
    }
  })

  test('G5 registerSpawnedTeammate 记 taskId（守卫查表面；additive 字段）', () => {
    setupGate()
    try {
      const { services } = makeMemoryServices()
      setTeamServices(services)
      resetDefaultTeamContextStore()
      // 无组 = 抛（既有 fail-fast 面回归锚）
      let threw = false
      try {
        registerSpawnedTeammate({ name: 'x', agentId: 'x@t', taskId: 'tk' })
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    } finally {
      teardownGate()
    }
  })
})

// ── 段 H：idle→mailbox 到达→唤醒重跑（工单 GREEN 判据补测；RF2 实核
//    收口 = 循环在盘补全不需要，本段补判别单测）。waitForNextPromptOrShutdown
//    依赖全为参数注入（mailbox 读面经 ATLAS_CONFIG_DIR 落盘）→ 真盘 tmp
//    inbox 判别（engine-tools-send-message-se2 真盘先例；零写真实 ~/.atlas）。
//    判别格：peer 唤醒 / lead 优先 / shutdown 优先 / abort 先置 / abort 中途
//    （keep-alive 轮询真在转）。
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { waitForNextPromptOrShutdown } from '../../src/swarm'
import { writeToMailbox } from '../../src/engine/messaging/mailbox'
import { TEAM_LEAD_NAME } from '../../src/engine/messaging'

const savedConfigDir = process.env.ATLAS_CONFIG_DIR

describe('wave0193 段 H：idle/wake 循环（mailbox 到达→唤醒重跑，A 补测）', () => {
  let tmpHome: string
  beforeAll(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'wave0193-wake-'))
    process.env.ATLAS_CONFIG_DIR = tmpHome
  })
  afterAll(() => {
    if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedConfigDir
    rmSync(tmpHome, { recursive: true, force: true })
  })

  function makeWaiter(agentName = 'w1') {
    const identity = {
      agentId: `${agentName}@wake`,
      agentName,
      teamName: 'wake-team',
      color: 'blue' as const,
      planModeRequired: false,
      parentSessionId: 'sess-wake',
    }
    const appState = {
      toolPermissionContext: { mode: 'default' },
      tasks: {},
    }
    return {
      identity,
      abortController: new AbortController(),
      getAppState: () => appState,
      setAppState: () => {},
      taskListId: 'list-wake',
    }
  }

  test('H1 peer 消息到达 → new_message 唤醒（from=发送者，FIFO）', async () => {
    const w = makeWaiter()
    await writeToMailbox(
      'w1',
      { text: 'hello from peer', from: 'peer-1' },
      'wake-team',
    )
    const result = await waitForNextPromptOrShutdown(
      w.identity,
      w.abortController,
      'task-1',
      w.getAppState,
      w.setAppState,
      w.taskListId,
    )
    expect(result.type).toBe('new_message')
    if (result.type === 'new_message') {
      expect(result.message).toBe('hello from peer')
      expect(result.from).toBe('peer-1')
    }
  })

  test('H2 lead 消息优先于 peer 消息（leader=用户意图协调面优先）', async () => {
    const w = makeWaiter('w2')
    await writeToMailbox('w2', { text: 'peer chatter', from: 'peer-1' }, 'wake-team')
    await writeToMailbox(
      'w2',
      { text: 'lead directive', from: TEAM_LEAD_NAME },
      'wake-team',
    )
    const result = await waitForNextPromptOrShutdown(
      w.identity,
      w.abortController,
      'task-1',
      w.getAppState,
      w.setAppState,
      w.taskListId,
    )
    expect(result.type).toBe('new_message')
    if (result.type === 'new_message') {
      expect(result.from).toBe(TEAM_LEAD_NAME)
      expect(result.message).toBe('lead directive')
    }
  })

  test('H3 shutdown 请求优先于未读 peer 消息（防 peer 洪泛饿死 shutdown）', async () => {
    const w = makeWaiter('w3')
    await writeToMailbox('w3', { text: 'peer chatter', from: 'peer-1' }, 'wake-team')
    const shutdownJson = JSON.stringify({
      type: 'shutdown_request',
      requestId: 'req-1',
      from: TEAM_LEAD_NAME,
      timestamp: new Date().toISOString(),
    })
    await writeToMailbox(
      'w3',
      { text: shutdownJson, from: TEAM_LEAD_NAME },
      'wake-team',
    )
    const result = await waitForNextPromptOrShutdown(
      w.identity,
      w.abortController,
      'task-1',
      w.getAppState,
      w.setAppState,
      w.taskListId,
    )
    expect(result.type).toBe('shutdown_request')
    if (result.type === 'shutdown_request') {
      expect(result.request?.type).toBe('shutdown_request')
      expect(result.request?.from).toBe(TEAM_LEAD_NAME)
    }
  })

  test('H4 abort 先置 → 立即 aborted（不进轮询）', async () => {
    const w = makeWaiter('w4')
    w.abortController.abort()
    const result = await waitForNextPromptOrShutdown(
      w.identity,
      w.abortController,
      'task-1',
      w.getAppState,
      w.setAppState,
      w.taskListId,
    )
    expect(result.type).toBe('aborted')
  })

  test('H5 空 inbox keep-alive 轮询真在转：中途 abort → aborted（非挂死）', async () => {
    const w = makeWaiter('w5')
    const waitPromise = waitForNextPromptOrShutdown(
      w.identity,
      w.abortController,
      'task-1',
      w.getAppState,
      w.setAppState,
      w.taskListId,
    )
    // 首轮 poll 空读 → sleep 500ms → 二轮前 abort 观测面
    setTimeout(() => w.abortController.abort(), 650)
    const result = await waitPromise
    expect(result.type).toBe('aborted')
  })
})

// ── 段 I：f4 gate 打回修复两格（2026-11-08 裁定；预注册 4 格外追加）──
//    ①「缺省路径有界」：resolveTerminationSpec 缺席 → DEFAULT spec
//      （max-turns 200；validate 过；200 轮终止 / 199 不终止；显式透传同
//      引用不包默认）。旧「absent = 零评估恒等」裁定废止锚。
//    ②「终态退出」：gracefulShutdownInProcessTeammates 真盘 tmp mailbox
//      （段 H 同法，零写真实 ~/.atlas）——running 成员收 mailbox shutdown
//      request + shutdownRequested 置位 + 终态后 drained 计数；无成员零
//      开销直返；超时支有界返回（不 kill 不抛）。
import {
  gracefulShutdownInProcessTeammates,
  resolveTerminationSpec,
  DEFAULT_TEAMMATE_TERMINATION_SPEC,
  DEFAULT_TEAMMATE_MAX_TURNS,
} from '../../src/swarm'
import {
  isShutdownRequest,
  readMailbox,
} from '../../src/engine/messaging/mailbox'
import type {
  InProcessTeammateTaskState,
  TaskStateBase,
} from '../../src/task'

describe('wave0193 段 I：f4 gate 打回修复（缺省有界 + 终态退出，2026-11-08）', () => {
  let tmpHome: string
  const savedConfigDirI = process.env.ATLAS_CONFIG_DIR
  beforeAll(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'wave0193-gatefix-'))
    process.env.ATLAS_CONFIG_DIR = tmpHome
  })
  afterAll(() => {
    if (savedConfigDirI === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedConfigDirI
    rmSync(tmpHome, { recursive: true, force: true })
  })

  function makeTeammateTask(taskId: string, agentName: string): InProcessTeammateTaskState {
    return {
      id: taskId,
      type: 'in_process_teammate',
      status: 'running',
      description: 'wave0193 段 I',
      startTime: Date.now(),
      outputFile: '/tmp/wave0193-seg-i.out',
      outputOffset: 0,
      notified: false,
      identity: {
        agentId: `${agentName}@gatefix`,
        agentName,
        teamName: 'gatefix-team',
        planModeRequired: false,
        parentSessionId: 'sess-gatefix',
      },
      prompt: 'p',
      awaitingPlanApproval: false,
      permissionMode: 'default',
      isIdle: false,
      shutdownRequested: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      pendingUserMessages: [],
    }
  }

  test('I1 缺省路径有界：缺席 → DEFAULT spec（validate 过 + 200 终止 / 199 不终止）', () => {
    const resolved = resolveTerminationSpec(undefined)
    expect(resolved).toBe(DEFAULT_TEAMMATE_TERMINATION_SPEC)
    expect(DEFAULT_TEAMMATE_TERMINATION_SPEC.conditions[0]).toEqual({
      kind: 'max-turns',
      maxTurns: DEFAULT_TEAMMATE_MAX_TURNS,
    })
    expect(() => validateTerminationSpec(resolved)).not.toThrow()
    const at = evaluateTerminationSpec(resolved, {
      ...createInitialTerminationLoopState(),
      turns: DEFAULT_TEAMMATE_MAX_TURNS,
      aborted: false,
    })
    expect(at.terminate).toBe(true)
    expect(at.reason).toEqual({
      type: 'max-turns',
      turns: DEFAULT_TEAMMATE_MAX_TURNS,
    })
    const below = evaluateTerminationSpec(resolved, {
      ...createInitialTerminationLoopState(),
      turns: DEFAULT_TEAMMATE_MAX_TURNS - 1,
      aborted: false,
    })
    expect(below.terminate).toBe(false)
  })

  test('I2 显式 spec 原样透传（同一引用，不包默认）', () => {
    const explicit: TerminationSpec = {
      op: 'or',
      conditions: [{ kind: 'max-turns', maxTurns: 5 }],
    }
    expect(resolveTerminationSpec(explicit)).toBe(explicit)
  })

  test('I3 running 成员 → mailbox shutdown request + 标志置位 + 终态后 drained', async () => {
    let state: { tasks: Record<string, InProcessTeammateTaskState> } = {
      tasks: { 'task-i3': makeTeammateTask('task-i3', 'w-i3') },
    }
    let completionScheduled = false
    const setAppState = (f: (prev: typeof state) => typeof state) => {
      state = f(state)
      const t = state.tasks['task-i3']
      // 模拟 runner graceful 退出：标志置位后 100ms 走轮末 completed 收尾
      if (t?.shutdownRequested && !completionScheduled) {
        completionScheduled = true
        setTimeout(() => {
          state = {
            tasks: {
              'task-i3': {
                ...state.tasks['task-i3']!,
                status: 'completed',
                endTime: Date.now(),
              },
            },
          }
        }, 100)
      }
    }
    const r = await gracefulShutdownInProcessTeammates({
      getAppState: () => state,
      setAppState: setAppState as unknown as (
        f: (prev: { tasks: Record<string, TaskStateBase> }) => {
          tasks: Record<string, TaskStateBase>
        },
      ) => void,
      timeoutMs: 3000,
    })
    expect(r.requested).toBe(1)
    expect(r.drained).toBe(1)
    expect(state.tasks['task-i3']!.shutdownRequested).toBe(true)
    // mailbox 真盘：成员 inbox 收到 shutdown request（from = team-lead）
    const msgs = await readMailbox('w-i3', 'gatefix-team')
    const shutdownMsg = msgs.map(m => isShutdownRequest(m.text)).find(Boolean)
    expect(shutdownMsg).not.toBeNull()
    expect(shutdownMsg?.from).toBe(TEAM_LEAD_NAME)
  })

  test('I4 零 running 成员 → 零开销直返（requested 0，不写 mailbox）', async () => {
    const r = await gracefulShutdownInProcessTeammates({
      getAppState: () => ({ tasks: {} }),
      setAppState: () => {},
      timeoutMs: 300,
    })
    expect(r).toEqual({ requested: 0, drained: 0, forced: 0, hardTerminated: 0 })
  })

  // I5 随 RED #3 升级阶梯改形重写（旧「超时放弃不 kill」契约废止——f4
  // 打回单裁定 fail-open 不可豁免）：无 abortController 且 kill 面 no-op
  //（setAppState 不落地）时阶梯走满仍有界返回、不抛。
  test('I5 阶梯有界返回（graceful 超时→升级；无 controller + kill no-op → forced/hard 0，不抛）', async () => {
    const state = {
      tasks: { 'task-i5': makeTeammateTask('task-i5', 'w-i5') },
    }
    const start = Date.now()
    const r = await gracefulShutdownInProcessTeammates({
      getAppState: () => state,
      setAppState: () => {},
      timeoutMs: 300,
      forcedTimeoutMs: 300,
    })
    const elapsed = Date.now() - start
    expect(r.requested).toBe(1)
    expect(r.drained).toBe(0)
    expect(r.forced).toBe(0)
    expect(r.hardTerminated).toBe(0)
    expect(elapsed).toBeLessThan(2500)
  })
})

// ── 段 K：RED #3 升级阶梯判别格（2026-11-08 f4 打回单追加；旧 fail-open
//    「超时放弃不 kill」废除的直接判别面）——
//    K1「drain 超时强制收尾」：graceful 超时 → stage3 forced abort →
//      成员响应 abort 走终态 → drained 收敛（强制收尾生效直证）。
//    K2「hard kill 终态必达」：连 abort 都不响应的成员 → stage4
//      killInProcessTeammate → status killed（F3 evicted 语义；⑤ 无孤儿
//      循环 fail-closed）。
describe('wave0193 段 K：drain 超时强制收尾（RED #3 升级阶梯判别格）', () => {
  let tmpHome: string
  const savedConfigDirK = process.env.ATLAS_CONFIG_DIR
  beforeAll(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'wave0193-ladder-'))
    process.env.ATLAS_CONFIG_DIR = tmpHome
  })
  afterAll(() => {
    if (savedConfigDirK === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedConfigDirK
    rmSync(tmpHome, { recursive: true, force: true })
  })

  type DrainState = { tasks: Record<string, TaskStateBase> }

  function makeLadderTask(
    taskId: string,
    agentName: string,
    abortController?: AbortController,
  ): InProcessTeammateTaskState {
    return {
      id: taskId,
      type: 'in_process_teammate',
      status: 'running',
      description: 'wave0193 段 K',
      startTime: Date.now(),
      outputFile: '/tmp/wave0193-seg-k.out',
      outputOffset: 0,
      notified: false,
      identity: {
        agentId: `${agentName}@ladder`,
        agentName,
        teamName: 'ladder-team',
        planModeRequired: false,
        parentSessionId: 'sess-ladder',
      },
      prompt: 'p',
      awaitingPlanApproval: false,
      permissionMode: 'default',
      isIdle: false,
      shutdownRequested: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      pendingUserMessages: [],
      abortController,
    }
  }

  function makeDrainContext(initial: DrainState) {
    let state = initial
    const setAppState = (f: (prev: DrainState) => DrainState) => {
      state = f(state)
    }
    return {
      getAppState: () => state,
      setAppState: setAppState as unknown as (
        f: (prev: { tasks: Record<string, TaskStateBase> }) => {
          tasks: Record<string, TaskStateBase>
        },
      ) => void,
      get state() {
        return state
      },
    }
  }

  test('K1 graceful 超时 → forced abort 后成员走终态（drain 超时强制收尾判别格）', async () => {
    const controller = new AbortController()
    const ctx = makeDrainContext({
      tasks: {
        'task-k1': makeLadderTask('task-k1', 'w-k1', controller),
      },
    })
    // 成员对 graceful request 不响应（无 completed 调度），仅响应 abort：
    // abort 后 50ms 走轮末 completed 收尾（模拟 runner 'aborted' 支退出）
    controller.signal.addEventListener('abort', () => {
      setTimeout(() => {
        ctx.setAppState(prev => ({
          tasks: {
            'task-k1': {
              ...(prev.tasks['task-k1'] as InProcessTeammateTaskState),
              status: 'completed',
              endTime: Date.now(),
            },
          },
        }))
      }, 50)
    })
    const r = await gracefulShutdownInProcessTeammates({
      getAppState: ctx.getAppState,
      setAppState: ctx.setAppState,
      timeoutMs: 300,
      forcedTimeoutMs: 2000,
    })
    expect(r.requested).toBe(1)
    expect(r.forced).toBe(1)
    expect(r.drained).toBe(1)
    expect(r.hardTerminated).toBe(0)
    expect(
      (ctx.state.tasks['task-k1'] as InProcessTeammateTaskState).status,
    ).toBe('completed')
  })

  test('K2 连 abort 都不响应 → hard kill 终态必达（stage4，F3 evicted 语义）', async () => {
    const controller = new AbortController()
    const ctx = makeDrainContext({
      tasks: {
        'task-k2': makeLadderTask('task-k2', 'w-k2', controller),
      },
    })
    // 成员对 graceful request 与 abort 全部不响应（无任何 completed 调度）
    const r = await gracefulShutdownInProcessTeammates({
      getAppState: ctx.getAppState,
      setAppState: ctx.setAppState,
      timeoutMs: 300,
      forcedTimeoutMs: 300,
    })
    expect(r.requested).toBe(1)
    expect(r.forced).toBe(1)
    expect(r.drained).toBe(0)
    expect(r.hardTerminated).toBe(1)
    expect(
      (ctx.state.tasks['task-k2'] as InProcessTeammateTaskState).status,
    ).toBe('killed')
  })

  test('K3 graceful 响应成员零升级（阶梯不误伤：forced/hard 全 0）', async () => {
    let state: DrainState = {
      tasks: { 'task-k3': makeLadderTask('task-k3', 'w-k3') },
    }
    let completionScheduled = false
    const setAppState = (f: (prev: DrainState) => DrainState) => {
      state = f(state)
      const t = state.tasks['task-k3'] as InProcessTeammateTaskState
      if (t?.shutdownRequested && !completionScheduled) {
        completionScheduled = true
        setTimeout(() => {
          state = {
            tasks: {
              'task-k3': {
                ...(state.tasks['task-k3'] as InProcessTeammateTaskState),
                status: 'completed',
                endTime: Date.now(),
              },
            },
          }
        }, 100)
      }
    }
    const r = await gracefulShutdownInProcessTeammates({
      getAppState: () => state,
      setAppState: setAppState as unknown as (
        f: (prev: { tasks: Record<string, TaskStateBase> }) => {
          tasks: Record<string, TaskStateBase>
        },
      ) => void,
      timeoutMs: 3000,
    })
    expect(r.requested).toBe(1)
    expect(r.drained).toBe(1)
    expect(r.forced).toBe(0)
    expect(r.hardTerminated).toBe(0)
  })
})

// ── 段 J：TUI 车道 TeamCreate A2 零持久改形判别（f4 gate 打回修复③，
//    2026-11-08；与 print 侧段 I 同族）——真盘 tmp 断言零 config.json 写
//    + roster 入 AppState.teamContext + 双副本 prompt 面逐字节同形 +
//    prompt 零 config.json 读指引（读面指引=死胡同 + 敏感文件对话框入口）。
import { TeamCreateTool as TuiTeamCreateTool } from '../../src/tui/tools/TeamCreateTool/TeamCreateTool'

describe('wave0193 段 J：TUI 车道 TeamCreate 零写盘（f4 gate 打回修复③）', () => {
  const savedEnvJ = process.env[GATE_ENV]
  const savedConfigDirJ = process.env.ATLAS_CONFIG_DIR
  let tmpHomeJ: string

  beforeAll(() => {
    tmpHomeJ = mkdtempSync(join(tmpdir(), 'wave0193-tui-'))
    process.env.ATLAS_CONFIG_DIR = tmpHomeJ
  })
  afterAll(() => {
    if (savedEnvJ === undefined) delete process.env[GATE_ENV]
    else process.env[GATE_ENV] = savedEnvJ
    if (savedConfigDirJ === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedConfigDirJ
    rmSync(tmpHomeJ, { recursive: true, force: true })
  })

  function makeTuiContext() {
    const state: { teamContext?: Record<string, unknown> } = {}
    return {
      state,
      getAppState: () => state,
      setAppState: (f: (prev: typeof state) => typeof state) => {
        Object.assign(state, f(state))
      },
    }
  }

  test('J1 门 ON 创建组：真盘零 config.json 写 + roster 入 teamContext', async () => {
    process.env[GATE_ENV] = '1'
    try {
      const ctx = makeTuiContext()
      const r = await TuiTeamCreateTool.call(
        {
          team_name: 'tui-zero',
          members: [
            { name: 'm1', role: 'dev', goal: 'g', backstory: 'b' },
          ],
        },
        ctx,
      )
      // 真 teams 目录零 config.json（无 Form A 回读者 → 写入=孤儿破口，
      // 审计 F1；tasks 目录盘面沿既有域盘面不变更——六判据口径）
      const teamsDir = join(tmpHomeJ, 'teams')
      const files = existsSync(teamsDir)
        ? readdirSync(teamsDir, { recursive: true })
        : []
      expect(
        files.filter(f => String(f).endsWith('config.json')),
      ).toEqual([])
      expect(r.data.team_name).toBe('tui-zero')
      const tc = ctx.state.teamContext as {
        roster?: Array<{ name: string; role?: string }>
        teammates: Record<string, unknown>
      }
      expect(tc.roster).toHaveLength(1)
      expect(tc.roster?.[0]?.name).toBe('m1')
      expect(tc.roster?.[0]?.role).toBe('dev')
      expect(tc.teammates['team-lead@tui-zero']).toBeDefined()
    } finally {
      if (savedEnvJ === undefined) delete process.env[GATE_ENV]
      else process.env[GATE_ENV] = savedEnvJ
    }
  })

  test('J2 members 缺 name → validateInput 拒（TUI 车道同形 errorCode 9）', async () => {
    process.env[GATE_ENV] = '1'
    try {
      const v = await TuiTeamCreateTool.validateInput(
        { team_name: 't', members: [{ role: 'x' }] },
        {},
      )
      expect(v.result).toBe(false)
      expect(v.errorCode).toBe(9)
    } finally {
      if (savedEnvJ === undefined) delete process.env[GATE_ENV]
      else process.env[GATE_ENV] = savedEnvJ
    }
  })

  test('J3 双副本 prompt 面逐字节同形 + 零 config.json 指引（读面=死胡同裁除）', async () => {
    const tuiPrompt = await TuiTeamCreateTool.prompt()
    const enginePrompt = await TeamCreateTool.description()
    expect(tuiPrompt).toBe(enginePrompt)
    expect(tuiPrompt).not.toContain('config.json')
    expect(tuiPrompt).toContain('zero-persistence')
    expect(tuiPrompt).toContain('members')
  })
})

// ── 段 L：round-2 RED-A/B 修复判别格（2026-11-08 f4 裁定；round 3 终判轮
//    前置）——
//    L1「成员 run 内 SendMessageTool 可达 getAppState」（f4 点名格）：
//      runAgent + toolContext 同源 accessor + 真 SendMessageTool（engine
//      team 域单源 = 成员池真身，resolveTeammateAgentFace Set-union 7 件
//      之一；TUI 副本非成员车道，勿引——模块加载有副作用污染段 E 模块态）
//      + fake LLM 脚本（SendMessage tool_use → 终文）→ 真盘 tmp mailbox
//      收到消息、零 `getAppState is not a function`（RED-A 修前 100% 崩）。
//    L2「透传恒等双面」：probe 工具记录 context.getAppState 型——注入
//      toolContext = 'function'；未注入 = 'undefined'（窄 spine 恒等，
//      普通子代理零回归锚）。两 run 各用独立 fake provider 实例
//      （steps 索引闭包耗尽坑：共用实例第二次 run 恒返末步文本，probe 不达）。
//    L3「TaskOutput fail-closed 校验形」（RED-B）：无 .tasks 注册表面 →
//      validateInput 结构化错误（不 throw）+ call 结构化 Error（指引
//      SendMessage mailbox 面）；有 tasks 面 → 既有行为保留。
import {
  runAgent,
  GENERAL_PURPOSE_AGENT,
  SendMessageTool,
  TaskOutputTool,
} from '../../src/engine'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'
import { readMailbox } from '../../src/engine/messaging/mailbox'

interface LScriptStep {
  content: unknown[]
  stopReason?: string
}

function fakeLlmProvider(steps: LScriptStep[]): ModelProvider {
  let i = 0
  const unused = async () => {
    throw new Error('fake ModelProvider: 方法未被消费')
  }
  return {
    chat: async () => {
      const step = steps[Math.min(i, steps.length - 1)]
      i++
      return {
        type: 'assistant',
        uuid: 'u' + i,
        timestamp: '2026-11-08T00:00:00Z',
        message: {
          id: 'm' + i,
          model: 'fake',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      } as unknown as Message
    },
    chatStream: unused as unknown as ModelProvider['chatStream'],
    healthCheck: unused as unknown as ModelProvider['healthCheck'],
    countTokens: unused as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: unused as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: unused as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  } as unknown as ModelProvider
}

describe('wave0193 段 L：round-2 RED-A/B 修复判别格（同源贯通 + fail-closed）', () => {
  let tmpHome: string
  const savedConfigDirL = process.env.ATLAS_CONFIG_DIR
  const savedGateL = process.env[GATE_ENV]
  beforeAll(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'wave0193-redab-'))
    process.env.ATLAS_CONFIG_DIR = tmpHome
    process.env[GATE_ENV] = '1'
  })
  afterAll(() => {
    if (savedConfigDirL === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedConfigDirL
    if (savedGateL === undefined) delete process.env[GATE_ENV]
    else process.env[GATE_ENV] = savedGateL
    rmSync(tmpHome, { recursive: true, force: true })
  })

  test('L1 成员 run 内 SendMessageTool 可达 getAppState（f4 点名格：真盘 mailbox 收到消息）', async () => {
    const state: Record<string, unknown> = {
      toolPermissionContext: { mode: 'default' },
      teamContext: { teamName: 'l1-team' },
      tasks: {},
    }
    const getAppState = () => state
    const setAppState = (f: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      Object.assign(state, f(state))
    }
    const provider = fakeLlmProvider([
      {
        content: [{
          type: 'tool_use',
          id: 't1',
          name: 'SendMessage',
          input: { to: 'peer-1', message: 'hello from member', summary: 'greeting' },
        }],
        stopReason: 'tool_calls',
      },
      { content: [{ type: 'text', text: 'sent greeting' }] },
    ])
    const r = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'greet peer-1',
      tools: [SendMessageTool as unknown as Tool],
      modelProvider: provider,
      parentRole: 'small',
      agentId: 'a-l1',
      // RED-A 同源贯通：toolContext 与 runner 同源 accessor（inProcessRunner
      // 落码同形——runInProcessTeammate 解构对直通）
      toolContext: { getAppState, setAppState },
    })
    expect(r.terminated).toBe(true)
    expect(r.result.content).toEqual([{ type: 'text', text: 'sent greeting' }])
    // 真盘 mailbox：消息达 peer-1 inbox（SendMessageTool.call 真执行）
    const msgs = await readMailbox('peer-1', 'l1-team')
    expect(msgs.some(m => m.text === 'hello from member')).toBe(true)
    // tool_result 面零 getAppState 崩溃（RED-A 修前 100% TypeError）
    const toolResults = r.messages.filter(
      m => m.type === 'user' && JSON.stringify(m).includes('tool_result'),
    )
    expect(JSON.stringify(toolResults)).not.toContain('getAppState is not a function')
  })

  test('L2 toolContext 透传恒等双面（注入=function / 未注入=undefined 窄 spine）', async () => {
    const seen: (string | undefined)[] = []
    const probe: Tool = {
      name: 'Probe',
      inputSchema: { type: 'object', properties: {} },
      maxResultSizeChars: 1000,
      isConcurrencySafe: () => true,
      isEnabled: () => true,
      isReadOnly: () => true,
      checkPermissions: async () => ({ behavior: 'passthrough', message: '' }),
      description: async () => 'probe',
      userFacingName: () => 'Probe',
      toAutoClassifierInput: (i: unknown) => i,
      renderToolUseMessage: () => null,
      mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: String(content),
      }),
      call: async (_args, context) => {
        seen.push(typeof (context as { getAppState?: unknown } | undefined)?.getAppState)
        return { data: 'probed' }
      },
    } as unknown as Tool
    // 两 run 各用独立 provider 实例（steps 索引闭包耗尽坑）
    const providerA = fakeLlmProvider([
      {
        content: [{ type: 'tool_use', id: 't1', name: 'Probe', input: {} }],
        stopReason: 'tool_calls',
      },
      { content: [{ type: 'text', text: 'done' }] },
    ])
    const withCtx = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'x',
      tools: [probe],
      modelProvider: providerA,
      parentRole: 'small',
      agentId: 'a-l2a',
      toolContext: { getAppState: () => ({}), setAppState: () => {} },
    })
    expect(withCtx.terminated).toBe(true)
    expect(seen).toEqual(['function'])
    const providerB = fakeLlmProvider([
      {
        content: [{ type: 'tool_use', id: 't2', name: 'Probe', input: {} }],
        stopReason: 'tool_calls',
      },
      { content: [{ type: 'text', text: 'done' }] },
    ])
    const withoutCtx = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'x',
      tools: [probe],
      modelProvider: providerB,
      parentRole: 'small',
      agentId: 'a-l2b',
    })
    expect(withoutCtx.terminated).toBe(true)
    expect(seen).toEqual(['function', 'undefined'])
  })

  test('L3 TaskOutput 无 .tasks 注册表面 → 结构化校验错误（禁 TypeError；指引 mailbox 面）', async () => {
    // RED-B 复现面：headless lead makeCtx TPC 窄视图（无 .tasks）
    const tpcOnlyCtx = {
      getAppState: () => ({ toolPermissionContext: { mode: 'default' } }),
    }
    const v = await TaskOutputTool.validateInput(
      { task_id: 't6914iqk8' },
      tpcOnlyCtx as unknown as never,
    )
    expect(v.result).toBe(false)
    if (v.result === false) {
      expect(v.message).toContain('No task registry is available')
      expect(v.message).toContain('SendMessage')
    }
    // call() 支：结构化 Error（非 TypeError fail-fast，run 不中止）
    let caught: unknown
    try {
      await TaskOutputTool.call({ task_id: 't6914iqk8' }, tpcOnlyCtx as unknown as never)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).constructor.name).not.toBe('TypeError')
    expect((caught as Error).message).toContain('SendMessage')
    // 既有行为保留：有 tasks 面 + 命中 task → validate 过
    const taskCtx = {
      getAppState: () => ({
        tasks: { t1: { id: 't1', type: 'local_agent', status: 'completed' } },
      }),
    }
    const ok = await TaskOutputTool.validateInput(
      { task_id: 't1' },
      taskCtx as unknown as never,
    )
    expect(ok.result).toBe(true)
  })
})
// ── 段 M：round-3 RED-C/D 修复判别格（f4 §7.9 裁定；round 4 = 最后轮 前置）——
//    M1「lead→member 运行中消息达成员 inbox + 零 default 落桶」（f4 点名格）：
//      lead 侧 TPC 窄视图（无 teamContext）+ TeamCreate 组态 store →
//      resolveOutgoingTeamName 双源（A5 同款）路由 m1-team；RED-C 修前
//      writeToMailbox(recipient, msg, undefined) 静默落 teams/default/ 黑洞。
//    M2「双源皆缺 fail-closed」：无组态上下文 → 结构化 Error（消息不投递）+
//      零 default 写（黑洞分支裁除）。
//    M3「RED-D 指引改形」：TeamDelete active-member 守卫消息指向真实机制面
//      （SendMessage shutdown_request），零悬空 requestShutdown 引用；
//      engine 行为格 + TUI 双副本文本锚。
import { TeamDeleteTool } from '../../src/engine'
import { clearDynamicTeamContext } from '../../src/engine/messaging/teammate'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

describe('wave0193 段 M：round-3 RED-C/D 判别格（路由 fail-closed + 指引改形）', () => {
  let tmpHomeM: string
  const savedConfigDirM = process.env.ATLAS_CONFIG_DIR
  const savedGateM = process.env[GATE_ENV]
  beforeAll(() => {
    tmpHomeM = mkdtempSync(join(tmpdir(), 'wave0193-redcd-'))
    process.env.ATLAS_CONFIG_DIR = tmpHomeM
    process.env[GATE_ENV] = '1'
    clearDynamicTeamContext()
  })
  afterAll(() => {
    if (savedConfigDirM === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = savedConfigDirM
    if (savedGateM === undefined) delete process.env[GATE_ENV]
    else process.env[GATE_ENV] = savedGateM
    resetTeamServices()
    resetDefaultTeamContextStore()
    clearDynamicTeamContext()
    rmSync(tmpHomeM, { recursive: true, force: true })
  })

  /** lead 侧 TPC 窄视图（headless makeCtx 同形：无 teamContext / 无 tasks）。 */
  function tpcOnlyCtx(): unknown {
    return {
      getAppState: () => ({ toolPermissionContext: { mode: 'default' } }),
    }
  }

  test('M1 lead→member 运行中消息达成员 inbox + 零 default 落桶（f4 点名格）', async () => {
    resetDefaultTeamContextStore()
    setTeamServices(makeMemoryServices().services)
    try {
      await TeamCreateTool.call(
        { team_name: 'm1-team', members: [{ name: 'scout' }] },
        {},
      )
      // RED-C 复现面：lead ctx 无 teamContext（TPC 窄视图）——修前
      // writeToMailbox(recipient, msg, undefined) 静默落 teams/default/
      const r = await SendMessageTool.call(
        { to: 'scout', message: 'route me to member', summary: 'route' },
        tpcOnlyCtx(),
      )
      const data = r.data as { success: boolean; message: string }
      expect(data.success).toBe(true)
      // 成员 inbox 收达（组态双源解析 → m1-team）
      const msgs = await readMailbox('scout', 'm1-team')
      expect(msgs.some(m => m.text === 'route me to member')).toBe(true)
      // 零 default 黑洞落桶
      expect(existsSync(join(tmpHomeM, 'teams', 'default'))).toBe(false)
    } finally {
      resetTeamServices()
      resetDefaultTeamContextStore()
    }
  })

  test('M2 双源皆缺 → 结构化 Error + 零 default 写（fail-closed 黑洞分支裁除）', async () => {
    resetTeamServices()
    resetDefaultTeamContextStore()
    clearDynamicTeamContext()
    let caught: unknown
    try {
      await SendMessageTool.call(
        { to: 'scout', message: 'lost message', summary: 'lost' },
        tpcOnlyCtx(),
      )
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('no team mailbox is resolvable')
    expect((caught as Error).message).toContain('NOT delivered')
    // 黑洞面零残留：default 桶未建
    expect(existsSync(join(tmpHomeM, 'teams', 'default'))).toBe(false)
  })

  test('M3 RED-D 指引改形：TeamDelete 守卫消息指向 shutdown_request 真实机制面', async () => {
    resetDefaultTeamContextStore()
    const { services } = makeMemoryServices()
    setTeamServices(services)
    try {
      services.setTeamContext({
        teamName: 'm3-team',
        teammates: { 'scout@m3-team': { name: 'scout', taskId: 'tk1' } },
        roster: [],
      } as never)
      const ctx = {
        getAppState: () => ({ tasks: { tk1: { status: 'running' } } }),
      }
      const r = await TeamDeleteTool.call({ team_name: 'm3-team' }, ctx)
      const data = r.data as { success: boolean; message: string }
      expect(data.success).toBe(false)
      // 改形后：指向真实机制面（SendMessage shutdown_request JSON）
      expect(data.message).toContain('SendMessage')
      expect(data.message).toContain('shutdown_request')
      // 零悬空引用（修前 'Use requestShutdown...' 引用不存在的工具）
      expect(data.message).not.toContain('requestShutdown')
      // TUI 双副本文本锚（J3 同形纪律：3 处同步）
      const tuiSrc = await readFile(
        join('src', 'tui', 'tools', 'TeamDeleteTool', 'TeamDeleteTool.ts'),
        'utf-8',
      )
      expect(tuiSrc).not.toContain('requestShutdown to gracefully')
      expect(tuiSrc).toContain('shutdown_request')
    } finally {
      resetTeamServices()
      resetDefaultTeamContextStore()
    }
  })
})
