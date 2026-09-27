/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）func 层（真盘：mkdtemp
 * ATLAS_CONFIG_DIR stamp + teams/<t>/config.json 直接落盘面，零模型）：
 * teamDiscovery.getTeammateStatuses 81L 全逻辑面（旧仓
 * utils/teamDiscovery.ts 逐字，S-E2b 落位）。
 *
 * 测面 = 未知 team（ENOENT → []）/ team-lead 成员排除（TEAM_LEAD_NAME
 * 单一事实源）/ isActive 状态映射三态（true→running / undefined 缺省
 * →running / false→idle）/ isHidden（hiddenPaneIds 成员命中 / 缺席字段
 * 全假）/ backendType 谓词过滤（tmux 保留 / in-process 丢弃 / 缺席
 * 缺席）/ 字段透传面（agentType/model/prompt/color/cwd/worktreePath/
 * mode 逐字）。
 *
 * 落盘面 = readTeamFile 同步直读 teams/<sanitizeName(name)>/config.json
 *（getAtlasConfigHomeDir 读 ATLAS_CONFIG_DIR 覆写），本测试直写 JSON 全
 * 控字段（免 writeTeamFileAsync 的 as never 强转）。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { getTeammateStatuses } from '../../src/swarm'

let dir = ''

const TEAM = 't1'

type Member = {
  agentId: string
  name: string
  agentType?: string
  model?: string
  prompt?: string
  color?: string
  joinedAt: number
  tmuxPaneId: string
  cwd: string
  worktreePath?: string
  subscriptions: string[]
  backendType?: string
  isActive?: boolean
  mode?: string
}

function member(name: string, over: Partial<Member> = {}): Member {
  return {
    agentId: `${name}@${TEAM}`,
    name,
    joinedAt: 1000,
    tmuxPaneId: `%${name}`,
    cwd: `/tmp/${name}`,
    subscriptions: [],
    ...over,
  }
}

function writeTeamFile(
  over: {
    hiddenPaneIds?: string[]
    leadAgentId?: string
    members?: Member[]
  } = {},
): void {
  mkdirSync(join(dir, 'teams', TEAM), { recursive: true })
  writeFileSync(
    join(dir, 'teams', TEAM, 'config.json'),
    JSON.stringify({
      name: TEAM,
      createdAt: 1000,
      leadAgentId: 'team-lead@t1',
      members: [member('team-lead', { agentId: 'team-lead@t1' })],
      ...over,
    }),
  )
}

function configPath(): string {
  return join(dir, 'teams', TEAM, 'config.json')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-team-disc-'))
  process.env.ATLAS_CONFIG_DIR = dir
})

afterEach(() => {
  delete process.env.ATLAS_CONFIG_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('未知 team（文件缺席 → [] ENOENT 支）', () => {
  test('无 teams 目录 → 空数组', () => {
    expect(getTeammateStatuses(TEAM)).toEqual([])
    expect(getTeammateStatuses('no-such-team')).toEqual([])
  })
})

describe('team-lead 排除 + isActive 状态映射', () => {
  test('team-lead 成员恒排除（TEAM_LEAD_NAME 面）+ 三态状态映射', () => {
    writeTeamFile({
      members: [
        member('team-lead', { agentId: 'team-lead@t1' }),
        member('w1', { isActive: true }),
        member('w2'), // isActive 缺席 = 缺省 active
        member('w3', { isActive: false }),
      ],
    })
    const statuses = getTeammateStatuses(TEAM)
    expect(statuses.map(s => s.name)).toEqual(['w1', 'w2', 'w3'])
    expect(statuses.map(s => s.status)).toEqual(['running', 'running', 'idle'])
  })
})

describe('isHidden（hiddenPaneIds 命中面）', () => {
  test('hiddenPaneIds 含成员 pane → 该成员 isHidden true，余者 false', () => {
    writeTeamFile({
      hiddenPaneIds: ['%w1'],
      members: [member('w1'), member('w2')],
    })
    const statuses = getTeammateStatuses(TEAM)
    expect(statuses[0].isHidden).toBe(true)
    expect(statuses[1].isHidden).toBe(false)
  })

  test('hiddenPaneIds 字段缺席 → 全成员 isHidden false（?? [] 支）', () => {
    writeTeamFile({ members: [member('w1')] })
    expect(getTeammateStatuses(TEAM)[0].isHidden).toBe(false)
  })
})

describe('backendType 谓词过滤（isPaneBackend 消费面）', () => {
  test('tmux 保留 / in-process 丢弃 / 缺席 缺席', () => {
    writeTeamFile({
      members: [
        member('w1', { backendType: 'tmux' }),
        member('w2', { backendType: 'in-process' }),
        member('w3'),
      ],
    })
    const [s1, s2, s3] = getTeammateStatuses(TEAM)
    expect(s1.backendType).toBe('tmux')
    expect(s2.backendType).toBeUndefined() // 非 pane 系后端不入面
    expect(s3.backendType).toBeUndefined()
  })
})

describe('字段透传面', () => {
  test('agentType/model/prompt/color/cwd/worktreePath/mode 逐字透传', () => {
    writeTeamFile({
      members: [
        member('w1', {
          agentType: 'researcher',
          model: 'gpt-x',
          prompt: 'do it',
          color: 'red',
          worktreePath: '/wt/w1',
          mode: 'acceptEdits',
        }),
      ],
    })
    const s = getTeammateStatuses(TEAM)[0]
    expect(s.agentId).toBe('w1@t1')
    expect(s.agentType).toBe('researcher')
    expect(s.model).toBe('gpt-x')
    expect(s.prompt).toBe('do it')
    expect(s.color).toBe('red')
    expect(s.tmuxPaneId).toBe('%w1')
    expect(s.cwd).toBe('/tmp/w1')
    expect(s.worktreePath).toBe('/wt/w1')
    expect(s.mode).toBe('acceptEdits')
  })
})

describe('落盘面自检（func 层真盘守门）', () => {
  test('config.json 落盘可直读（readTeamFile 路径契约 teams/<t>/config.json）', () => {
    writeTeamFile({ members: [member('w1')] })
    expect(existsSync(configPath())).toBe(true)
    const raw = JSON.parse(readFileSync(configPath(), 'utf8'))
    expect(raw.name).toBe(TEAM)
  })
})
