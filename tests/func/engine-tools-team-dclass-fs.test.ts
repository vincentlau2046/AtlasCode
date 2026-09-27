/**
 * D 类 3 工具（§8.66.1.5 测试面 item ⑪）func 层：Snip 恒注册面 +
 * TeamCreate/TeamDelete agentSwarms 门三态 + inputSchema 面 +
 * TeamServices 注入接缝 fail-fast + call 体三分面。
 *
 * 层位裁定 = func（非 unit）：TeamCreate/TeamDelete call 体直调
 * engine/tasks 非注入闭包（resetTaskList 锁 + 高水位 / ensureTasksDir
 * mkdir，落点 getTasksDir = $ATLAS_CONFIG_DIR/tasks/<id>）→ 真盘 I/O
 * 经 mkdtemp ATLAS_CONFIG_DIR stamp 收口 tmp（unit 零盘规则不适用）。
 * 团队文件 9 面 + 上下文 2 面 = TeamServices 假实现（内存 Map，零盘）；
 * 团队上下文 store 经 createDefaultTeamContextStore 真闭包（非 stub）。
 *
 * 测面 =
 *  - Snip：name/恒注册（isEnabled 恒 true 零 env 依赖）/ inputSchema
 *    双属性 + additionalProperties true（passthrough 转写）/ call 固定值
 *    {snipped:true, savedTokens:0} / 缺省面显化 7 成员逐值 / mapToolResult
 *    jsonStringify 面 / prompt 面
 *  - 门三态：ATLAS_EXPERIMENTAL_AGENT_TEAMS 未设 → TeamCreate/TeamDelete
 *    isEnabled false + Snip true；'1' → 三者 true（--agent-teams argv 支
 *    测试进程不可驱动，登记不测）
 *  - TeamCreate：validateInput ec9 三态 / call 既有上下文 throw 逐字 /
 *    成功面 3 字段 + 团队文件写面 + register 登记 + 上下文设面 + tasks
 *    目录真盘面 / 撞名 word-slug 支 / renderToolUseMessage 防御支
 *  - TeamDelete：call 三分（无上下文 / 活成员拒清理逐字 / 全 idle 清理
 *    + 清面链 4 面）+ 文件缺位亦清理支 + 缺省面显化
 *  - requireTeamServices 未注入 fail-fast throw 逐字
 */
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  createDefaultTeamContextStore,
  requireTeamServices,
  resetDefaultTeamContextStore,
  resetTeamServices,
  setTeamServices,
  SNIP_PROMPT,
  SNIP_TOOL_INPUT_SCHEMA,
  SnipTool,
  TEAM_CREATE_PROMPT,
  TEAM_CREATE_TOOL_INPUT_SCHEMA,
  TeamCreateTool,
  TEAM_DELETE_PROMPT,
  TEAM_DELETE_TOOL_INPUT_SCHEMA,
  TeamDeleteTool,
  type TeamContextShape,
  type TeamServices,
  type TeamServicesFile,
} from '../../src/engine/tools'
import { clearLeaderTeamName } from '../../src/engine/tasks'
import { sanitizeName } from '../../src/swarm'

let dir = ''
let prevTeamsEnv: string | undefined

type TeamMember = TeamServicesFile['members'][number]

function makeFakeServices(): {
  teamFiles: Map<string, TeamServicesFile>
  calls: string[]
  services: TeamServices
} {
  const teamFiles = new Map<string, TeamServicesFile>()
  const calls: string[] = []
  const contextStore = createDefaultTeamContextStore()
  const services: TeamServices = {
    readTeamFile: n => teamFiles.get(n) ?? null,
    writeTeamFileAsync: async (n, f) => {
      teamFiles.set(n, f)
    },
    getTeamFilePath: n => `/fake/teams/${n}/config.json`,
    registerTeamForSessionCleanup: n => {
      calls.push(`register:${n}`)
    },
    unregisterTeamForSessionCleanup: n => {
      calls.push(`unregister:${n}`)
    },
    cleanupTeamDirectories: async n => {
      calls.push(`cleanup:${n}`)
    },
    assignTeammateColor: () => 'red',
    clearTeammateColors: () => {
      calls.push('clearColors')
    },
    // 真实现委托（swarm 门面单一事实源，假面零逻辑漂移）
    sanitizeName,
    ...contextStore,
  }
  setTeamServices(services)
  return { teamFiles, calls, services }
}

function makeContext(teamName: string): TeamContextShape {
  return {
    teamName,
    teamFilePath: `/fake/teams/${teamName}/config.json`,
    leadAgentId: `team-lead@${teamName}`,
    teammates: {},
  }
}

function makeMember(
  name: string,
  over: Partial<TeamMember> = {},
): TeamMember {
  return {
    agentId: `${name}@t1`,
    name,
    joinedAt: 1000,
    tmuxPaneId: '',
    cwd: '/tmp',
    subscriptions: [],
    ...over,
  }
}

function makeTeamFile(
  name: string,
  members: TeamMember[],
): TeamServicesFile {
  return {
    name,
    createdAt: 1000,
    leadAgentId: `team-lead@${name}`,
    members,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-dclass-'))
  process.env.ATLAS_CONFIG_DIR = dir
  prevTeamsEnv = process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
})

afterEach(() => {
  if (prevTeamsEnv !== undefined) {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = prevTeamsEnv
  }
  delete process.env.ATLAS_CONFIG_DIR
  resetTeamServices()
  resetDefaultTeamContextStore()
  clearLeaderTeamName()
  rmSync(dir, { recursive: true, force: true })
})

// ── F-DC1 Snip 恒注册面 ───────────────────────────────────────────────

describe('F-DC1 SnipTool 恒注册 + call 固定值面', () => {
  test('name + inputSchema 面（双属性 + passthrough 转写 additionalProperties true）', () => {
    expect(SnipTool.name).toBe('Snip')
    expect(SNIP_TOOL_INPUT_SCHEMA.additionalProperties).toBe(true)
    expect(Object.keys(SNIP_TOOL_INPUT_SCHEMA.properties)).toEqual([
      'summary',
      'keepLastN',
    ])
    expect(SNIP_TOOL_INPUT_SCHEMA.properties.summary.type).toBe('string')
    expect(SNIP_TOOL_INPUT_SCHEMA.properties.keepLastN.type).toBe('number')
    expect(SnipTool.inputJSONSchema).toBe(SNIP_TOOL_INPUT_SCHEMA)
  })

  test('call 零参固定值（旧 5 参全不消费 delta ⑤，纯 no-op 面）', async () => {
    const r = await SnipTool.call()
    expect(r.data).toEqual({ snipped: true, savedTokens: 0 })
  })

  test('缺省面显化 7 成员逐值（buildTool 缺省 delta ④ 登记验真）', () => {
    expect(SnipTool.isEnabled()).toBe(true) // 恒注册（旧门 feature 裁）
    expect(SnipTool.isReadOnly()).toBe(false)
    expect(SnipTool.isDestructive()).toBe(false)
    expect(SnipTool.isConcurrencySafe()).toBe(true)
    expect(SnipTool.userFacingName()).toBe('Snip')
    expect(SnipTool.toAutoClassifierInput()).toBe('')
    expect(SnipTool.shouldDefer).toBeUndefined() // delta ⑧ 裁不写
  })

  test('checkPermissions 缺省面（allow + updatedInput 原引用）', async () => {
    const input = { summary: 's' }
    const r = await SnipTool.checkPermissions(input)
    expect(r.behavior).toBe('allow')
    expect(r.updatedInput).toBe(input)
  })

  test('renderToolUseMessage 恒 null（delta ⑧ 逐字）+ mapToolResult jsonStringify 面', () => {
    expect(SnipTool.renderToolUseMessage()).toBeNull()
    const block = SnipTool.mapToolResultToToolResultBlockParam(
      { snipped: true, savedTokens: 0 },
      'tu-1',
    )
    expect(block.type).toBe('tool_result')
    expect(block.tool_use_id).toBe('tu-1')
    expect((block.content[0] as { text: string }).text).toBe(
      JSON.stringify({ snipped: true, savedTokens: 0 }),
    )
  })

  test('description 单面 = SNIP_PROMPT（非空串）', async () => {
    expect(await SnipTool.description()).toBe(SNIP_PROMPT)
    expect(typeof SNIP_PROMPT).toBe('string')
    expect(SNIP_PROMPT.length).toBeGreaterThan(0)
  })
})

// ── F-DC2 门三态（agentSwarms 门控槽）────────────────────────────────

describe('F-DC2 isEnabled 门三态', () => {
  test('env 未设 → TeamCreate/TeamDelete 门闭 + Snip 恒开', () => {
    expect(TeamCreateTool.isEnabled()).toBe(false)
    expect(TeamDeleteTool.isEnabled()).toBe(false)
    expect(SnipTool.isEnabled()).toBe(true)
  })

  test("ATLAS_EXPERIMENTAL_AGENT_TEAMS='1' → TeamCreate/TeamDelete 门开", () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    expect(TeamCreateTool.isEnabled()).toBe(true)
    expect(TeamDeleteTool.isEnabled()).toBe(true)
    expect(SnipTool.isEnabled()).toBe(true) // 无 env 依赖恒真
  })
})

// ── F-DC3 TeamCreate/TeamDelete inputSchema 面 ───────────────────────

describe('F-DC3 TeamCreate/TeamDelete inputSchema 面', () => {
  test('TeamCreate：required [team_name] + strict 双字段 + 3 属性', () => {
    expect(TeamCreateTool.name).toBe('TeamCreate')
    expect(TEAM_CREATE_TOOL_INPUT_SCHEMA.required).toEqual(['team_name'])
    expect(TEAM_CREATE_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false)
    expect(Object.keys(TEAM_CREATE_TOOL_INPUT_SCHEMA.properties)).toEqual([
      'team_name',
      'description',
      'agent_type',
    ])
    expect(TeamCreateTool.strict).toBe(true)
    expect(TeamCreateTool.inputJSONSchema).toBe(TEAM_CREATE_TOOL_INPUT_SCHEMA)
  })

  test('TeamDelete：空 properties + additionalProperties false（strictObject({}) 转写）', () => {
    expect(TeamDeleteTool.name).toBe('TeamDelete')
    expect(Object.keys(TEAM_DELETE_TOOL_INPUT_SCHEMA.properties)).toHaveLength(0)
    expect(TEAM_DELETE_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false)
    expect(TeamDeleteTool.toAutoClassifierInput()).toBe('')
  })
})

// ── F-DC4 requireTeamServices fail-fast ──────────────────────────────

describe('F-DC4 接缝 fail-fast（未注入编程错误早暴露）', () => {
  test('resetTeamServices 后 requireTeamServices throw 逐字', () => {
    resetTeamServices()
    expect(() => requireTeamServices()).toThrow(
      'TeamServices not wired — call setTeamServices at composition root first (swarm team-file seam, C 桶 ③ S-E2d)',
    )
  })
})

// ── F-DC5 TeamCreate validateInput + 面成员 ──────────────────────────

describe('F-DC5 TeamCreateTool validateInput + 面成员', () => {
  test('空 team_name 三态（空串 / 全空白 / 缺席）→ ec9 逐字', async () => {
    for (const input of [{ team_name: '' }, { team_name: '   ' }, {}]) {
      expect(await TeamCreateTool.validateInput(input, undefined)).toEqual({
        result: false,
        message: 'team_name is required for TeamCreate',
        errorCode: 9,
      })
    }
  })

  test('有效 team_name → result true', async () => {
    expect(await TeamCreateTool.validateInput({ team_name: 't' }, undefined)).toEqual({
      result: true,
    })
  })

  test('toAutoClassifierInput = input.team_name（旧 def 逐字）', () => {
    expect(TeamCreateTool.toAutoClassifierInput({ team_name: 'x' })).toBe('x')
  })

  test('renderToolUseMessage 字符串面 + input ?? {} 防御支（delta ⑥）', () => {
    expect(TeamCreateTool.renderToolUseMessage({ team_name: 'x' })).toBe(
      'create team: x',
    )
    expect(TeamCreateTool.renderToolUseMessage(undefined)).toBe(
      'create team: undefined',
    )
  })

  test('description 单面 = TEAM_CREATE_PROMPT（非空串）', async () => {
    expect(await TeamCreateTool.description()).toBe(TEAM_CREATE_PROMPT)
    expect(TEAM_CREATE_PROMPT.length).toBeGreaterThan(0)
  })
})

// ── F-DC6 TeamCreateTool call 体（假 TeamServices + tmp 收口真盘）────

describe('F-DC6 TeamCreateTool call 体', () => {
  test('既有团队上下文 → throw 逐字（一 leader 一 team 面）', async () => {
    const f = makeFakeServices()
    f.services.setTeamContext(makeContext('existing'))
    await expect(
      TeamCreateTool.call({ team_name: 'new' }, undefined),
    ).rejects.toThrow(
      'Already leading team "existing". A leader can only manage one team at a time. Use TeamDelete to end the current team before creating a new one.',
    )
  })

  test('成功面（3 字段 + 团队文件写面 + register 登记 + 上下文设面 + tasks 目录真盘）', async () => {
    const f = makeFakeServices()
    const r = await TeamCreateTool.call(
      { team_name: 'my team', description: 'd', agent_type: 'researcher' },
      undefined,
    )
    expect(r.data).toEqual({
      team_name: 'my team',
      team_file_path: '/fake/teams/my team/config.json',
      lead_agent_id: 'team-lead@my team',
    })
    const file = f.teamFiles.get('my team')!
    expect(file.members).toHaveLength(1)
    expect(file.members[0].name).toBe('team-lead')
    expect(file.members[0].agentType).toBe('researcher')
    expect(file.leadAgentId).toBe('team-lead@my team')
    expect(f.calls).toContain('register:my team')
    const ctx = f.services.getTeamContext()!
    expect(ctx.teamName).toBe('my team')
    expect(ctx.teammates['team-lead@my team'].color).toBe('red')
    // engine/tasks 非注入闭包真盘面（resetTaskList 锁 + ensureTasksDir mkdir，
    // swarm sanitizeName('my team') = 'my-team'）
    expect(existsSync(join(dir, 'tasks', 'my-team'))).toBe(true)
  })

  test('撞名支：已存在团队 → word slug 新名（非确定性，仅验改面）', async () => {
    const f = makeFakeServices()
    f.teamFiles.set(
      'taken',
      makeTeamFile('taken', [makeMember('team-lead', { agentId: 'team-lead@taken' })]),
    )
    const r = await TeamCreateTool.call({ team_name: 'taken' }, undefined)
    expect(r.data.team_name).not.toBe('taken')
    expect(f.teamFiles.has(r.data.team_name)).toBe(true)
    expect(r.data.lead_agent_id).toBe(`team-lead@${r.data.team_name}`)
    expect(f.calls).toContain(`register:${r.data.team_name}`)
  })

  test('mapToolResult jsonStringify 落盘面', () => {
    const data = {
      team_name: 't',
      team_file_path: 'p',
      lead_agent_id: 'l',
    }
    const block = TeamCreateTool.mapToolResultToToolResultBlockParam(data, 'tu-2')
    expect((block.content[0] as { text: string }).text).toBe(JSON.stringify(data))
  })
})

// ── F-DC7 TeamDeleteTool call 体三分 ─────────────────────────────────

describe('F-DC7 TeamDeleteTool call 体', () => {
  test('无团队上下文 → success true + 无清理文案（逐字）', async () => {
    const f = makeFakeServices()
    const r = await TeamDeleteTool.call({}, undefined)
    expect(r.data).toEqual({
      success: true,
      message: 'No team name found, nothing to clean up',
      team_name: undefined,
    })
    expect(f.calls).toEqual([])
  })

  test('活成员拒清理（逐字文案 + 成员名序 + 不清理支 + 上下文保留）', async () => {
    const f = makeFakeServices()
    f.services.setTeamContext(makeContext('t1'))
    f.teamFiles.set(
      't1',
      makeTeamFile('t1', [
        makeMember('team-lead', { agentId: 'team-lead@t1' }),
        makeMember('w1', { isActive: true }),
        makeMember('w2'), // isActive 缺席 = active
        makeMember('w3', { isActive: false }),
      ]),
    )
    const r = await TeamDeleteTool.call({}, undefined)
    expect(r.data.success).toBe(false)
    expect(r.data.message).toBe(
      'Cannot cleanup team with 2 active member(s): w1, w2. Use requestShutdown to gracefully terminate teammates first.',
    )
    expect(r.data.team_name).toBe('t1')
    expect(f.calls).not.toContain('cleanup:t1')
    expect(f.services.getTeamContext()?.teamName).toBe('t1') // 保留
  })

  test('全 idle 成员 → 清理链 4 面（cleanup/unregister/clearColors/清上下文）', async () => {
    const f = makeFakeServices()
    f.services.setTeamContext(makeContext('t1'))
    f.teamFiles.set(
      't1',
      makeTeamFile('t1', [
        makeMember('team-lead', { agentId: 'team-lead@t1' }),
        makeMember('w1', { isActive: false }),
        makeMember('w2', { isActive: false }),
      ]),
    )
    const r = await TeamDeleteTool.call({}, undefined)
    expect(r.data).toEqual({
      success: true,
      message: 'Cleaned up directories and worktrees for team "t1"',
      team_name: 't1',
    })
    expect(f.calls).toContain('cleanup:t1')
    expect(f.calls).toContain('unregister:t1')
    expect(f.calls).toContain('clearColors')
    expect(f.services.getTeamContext()).toBeUndefined() // 清面
  })

  test('上下文在但团队文件缺位 → 仍走清理成功支（readTeamFile null 支）', async () => {
    const f = makeFakeServices()
    f.services.setTeamContext(makeContext('ghost'))
    const r = await TeamDeleteTool.call({}, undefined)
    expect(r.data.success).toBe(true)
    expect(r.data.message).toBe(
      'Cleaned up directories and worktrees for team "ghost"',
    )
    expect(f.calls).toContain('cleanup:ghost')
  })

  test('缺省面显化 7 成员逐值 + renderToolUseMessage 常量面（delta ⑤ 逐字）', async () => {
    const input = { x: 1 }
    expect(TeamDeleteTool.isEnabled()).toBe(false) // env 已删（beforeEach）
    expect(TeamDeleteTool.isReadOnly()).toBe(false)
    expect(TeamDeleteTool.isDestructive()).toBe(false)
    expect(TeamDeleteTool.isConcurrencySafe()).toBe(false)
    expect(TeamDeleteTool.userFacingName()).toBe('')
    expect(TeamDeleteTool.toAutoClassifierInput()).toBe('')
    expect(TeamDeleteTool.renderToolUseMessage(undefined)).toBe(
      'cleanup team: current',
    )
    const r = await TeamDeleteTool.checkPermissions(input)
    expect(r.behavior).toBe('allow')
    expect(r.updatedInput).toBe(input)
  })

  test('description 单面 = TEAM_DELETE_PROMPT（非空串）', async () => {
    expect(await TeamDeleteTool.description()).toBe(TEAM_DELETE_PROMPT)
    expect(TEAM_DELETE_PROMPT.length).toBeGreaterThan(0)
  })
})

// ── F-DC8 类型面编译断言（tsc 验真，运行时零成本）────────────────────

describe('F-DC8 类型面编译断言', () => {
  test('TeamServicesFile 成员 duck（isActive 可选 + 必填字段面）', () => {
    const m: TeamMember = makeMember('w1')
    expect(m.isActive).toBeUndefined()
    const full: TeamServicesFile = makeTeamFile('t1', [m])
    expect(full.members).toHaveLength(1)
  })

  test('TeamServices 11 成员接口 assignability（假实现 = 真闭包单元非 stub）', () => {
    const ref: TeamServices = makeFakeServices().services
    // 9 团队文件面 + 2 上下文态面（createDefaultTeamContextStore 展开）
    expect(Object.keys(ref)).toHaveLength(11)
  })
})
