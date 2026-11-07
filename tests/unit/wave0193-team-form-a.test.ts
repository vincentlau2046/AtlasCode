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
import { mkdtempSync, rmSync } from 'node:fs'
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
