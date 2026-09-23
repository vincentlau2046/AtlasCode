/**
 * engine/coordinator 契约测试（§8.25 E-2 T-5d：worker 两源提示词 + 主提示词 + user context）。
 *
 * 被测能力（port 之下全真，非 tautology）：
 *   - getCoordinatorWorkerSystemPrompt：fan-out 条件子句（判别信号 = 深度封顶 worker 无 Agent
 *     tool → 子句省略）：depth 0/1 有子句且两者输出字节一致，depth 2/3（>= MAX_WORKER_SPAWN_DEPTH）
 *     无子句。结构锚点 + Agent/Skill 插值。
 *   - WORKER_AGENT / getCoordinatorAgents：agentType/source/whenToUse/tools（ASYNC + Agent）。
 *   - getBuiltInAgents coordinator 分支（ATLAS_COORDINATOR_MODE=1 → 仅 worker，不含 general-purpose）。
 *   - getCoordinatorSystemPrompt：ATLAS_SIMPLE 分支切 worker 能力描述。
 *   - getCoordinatorUserContext：非 coordinator → {}；INTERNAL_WORKER_TOOLS 从 worker 工具面剔除；
 *     ATLAS_SIMPLE → Bash/Read/Edit；MCP 段。
 *   - matchSessionMode：会话模式对齐翻转 env。
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。env save/restore 隔离门控变量。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getCoordinatorWorkerSystemPrompt,
  getCoordinatorAgents,
  WORKER_AGENT,
  getCoordinatorSystemPrompt,
  getCoordinatorUserContext,
  matchSessionMode,
  getBuiltInAgents,
  ASYNC_AGENT_ALLOWED_TOOLS,
  MAX_WORKER_SPAWN_DEPTH,
} from '../../src/engine'

const ENV_KEYS = [
  'ATLAS_COORDINATOR_MODE',
  'FEATURE_COORDINATOR_MODE',
  'ATLAS_SIMPLE',
  'ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS',
] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]!
  }
})

describe('getCoordinatorWorkerSystemPrompt（fan-out 条件子句 = 深度封顶判别信号）', () => {
  const FAN_OUT = 'you may use it to fan out'
  test('① depth 0 < MAX → 含 fan-out 子句', () => {
    expect(getCoordinatorWorkerSystemPrompt(0)).toContain(FAN_OUT)
  })
  test('② depth 1 < MAX → 含 fan-out 子句，且与 depth 0 字节一致（同区间）', () => {
    const p0 = getCoordinatorWorkerSystemPrompt(0)
    const p1 = getCoordinatorWorkerSystemPrompt(1)
    expect(p1).toContain(FAN_OUT)
    expect(p1).toBe(p0) // 深度 0 与 1 同属「可 fan-out」区间 → 提示词完全相同
  })
  test('③ depth == MAX（2）→ 无 fan-out 子句（深度封顶 worker 不接收 Agent tool）', () => {
    const p2 = getCoordinatorWorkerSystemPrompt(MAX_WORKER_SPAWN_DEPTH)
    expect(p2).not.toContain(FAN_OUT)
    expect(p2).not.toBe(getCoordinatorWorkerSystemPrompt(0)) // 与封顶前不同
  })
  test('④ depth > MAX（3）→ 无 fan-out 子句，且与 depth 2 字节一致', () => {
    const p2 = getCoordinatorWorkerSystemPrompt(MAX_WORKER_SPAWN_DEPTH)
    const p3 = getCoordinatorWorkerSystemPrompt(3)
    expect(p3).not.toContain(FAN_OUT)
    expect(p3).toBe(p2) // 封顶区间内一致
  })
  test('⑤ 结构锚点全在（两源 closeout）', () => {
    const p = getCoordinatorWorkerSystemPrompt(0)
    for (const anchor of [
      'You are a worker agent executing a task assigned by the coordinator',
      '## Environment',
      '## Scope',
      '## Resumed Tasks',
      '## When Things Go Wrong',
      '## Output',
      '## After you finish implementing the change',
    ]) {
      expect(p).toContain(anchor)
    }
  })
  test('⑥ Agent / Skill 工具名插值', () => {
    const p = getCoordinatorWorkerSystemPrompt(0)
    expect(p).toContain('Agent')
    expect(p).toContain('Skill')
  })
})

describe('WORKER_AGENT / getCoordinatorAgents', () => {
  test('① WORKER_AGENT 字段（agentType/source/whenToUse）', () => {
    expect(WORKER_AGENT.agentType).toBe('worker')
    expect(WORKER_AGENT.source).toBe('built-in')
    expect(WORKER_AGENT.whenToUse).toContain('Coordinator worker')
    expect(WORKER_AGENT.whenToUse).toContain('subagent_type "worker"')
  })
  test('② tools = ASYNC 全量 + Agent（单一事实源，长度 = ASYNC.size + 1）', () => {
    const tools = WORKER_AGENT.tools!
    expect(tools).toHaveLength(ASYNC_AGENT_ALLOWED_TOOLS.size + 1)
    expect(tools).toContain('Agent') // depth-gated ADDED
    expect(tools).toContain('Read')
    expect(tools).toContain('Skill')
    for (const t of ASYNC_AGENT_ALLOWED_TOOLS) {
      expect(tools).toContain(t)
    }
  })
  test('③ getSystemPrompt({spawnDepth}) 委托 getCoordinatorWorkerSystemPrompt', async () => {
    expect(await WORKER_AGENT.getSystemPrompt({ spawnDepth: 0 })).toBe(
      getCoordinatorWorkerSystemPrompt(0),
    )
    expect(await WORKER_AGENT.getSystemPrompt({})).toBe(getCoordinatorWorkerSystemPrompt(0)) // 缺省 0
  })
  test('④ getCoordinatorAgents → 单一内建 worker', () => {
    const agents = getCoordinatorAgents()
    expect(agents).toHaveLength(1)
    expect(agents[0].agentType).toBe('worker')
    expect(agents[0]).toBe(WORKER_AGENT)
  })
})

describe('getBuiltInAgents coordinator 分支（ATLAS_COORDINATOR_MODE 门）', () => {
  test('① 默认（无 env）→ 兜底 general-purpose', () => {
    expect(getBuiltInAgents().map((a) => a.agentType)).toEqual(['general-purpose'])
  })
  test('② ATLAS_COORDINATOR_MODE=1 → 仅 worker（不含 general-purpose，旧仓语义）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    expect(getBuiltInAgents().map((a) => a.agentType)).toEqual(['worker'])
  })
  test('③ disable 门优先（coordinator + DISABLE 同开 → 空注册表）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    process.env.ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS = '1'
    expect(getBuiltInAgents()).toEqual([])
  })
  test('④ FEATURE_COORDINATOR_MODE=false kill-switch → coordinator 分支不激活（回落 general-purpose）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    process.env.FEATURE_COORDINATOR_MODE = 'false'
    expect(getBuiltInAgents().map((a) => a.agentType)).toEqual(['general-purpose'])
  })
})

describe('getCoordinatorSystemPrompt（ATLAS_SIMPLE 分支切 worker 能力描述）', () => {
  test('① 默认分支：标准工具 + Skill 委托', () => {
    const p = getCoordinatorSystemPrompt()
    expect(p).toContain('You are Atlas')
    expect(p).toContain('coordinator')
    expect(p).toContain('Agent')
    expect(p).toContain('SendMessage')
    expect(p).toContain('TaskStop')
    expect(p).toContain('Workers have access to standard tools')
  })
  test('② ATLAS_SIMPLE=1 → worker 仅 Bash/Read/Edit 能力描述', () => {
    process.env.ATLAS_SIMPLE = '1'
    const p = getCoordinatorSystemPrompt()
    expect(p).toContain('Workers have access to Bash, Read, and Edit tools')
    expect(p).not.toContain('Workers have access to standard tools')
  })
})

describe('getCoordinatorUserContext（worker 工具面上下文 + INTERNAL 剔除）', () => {
  test('① 非 coordinator 模式 → 空对象', () => {
    expect(getCoordinatorUserContext([])).toEqual({})
  })
  // 精确工具清单（非 SIMPLE 分支）：ASYNC 16 项中仅 StructuredOutput 属 INTERNAL 被剔 → 15 项按
  // JS 默认序（UTF-16 码元序）排列。字节级锁定全清单 + 顺序（review 加固：防 ASYNC 集改名/重排）。
  const EXPECTED_WORKER_TOOLS =
    'Bash, Edit, EnterWorktree, ExitWorktree, Glob, Grep, NotebookEdit, PowerShell, Read, Skill, TodoWrite, ToolSearch, WebFetch, WebSearch, Write'
  test('② coordinator + 非 SIMPLE → 精确工具清单（ASYNC 剔 INTERNAL 后 15 项，字节级）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    const content = getCoordinatorUserContext([]).workerToolsContext!
    expect(content).toBe(`Workers spawned via the Agent tool have access to these tools: ${EXPECTED_WORKER_TOOLS}`)
  })
  test('③ coordinator + ATLAS_SIMPLE → 精确工具清单 Bash/Read/Edit（Grep 不在）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    process.env.ATLAS_SIMPLE = '1'
    const content = getCoordinatorUserContext([]).workerToolsContext!
    expect(content).toBe('Workers spawned via the Agent tool have access to these tools: Bash, Edit, Read')
  })
  test('④ mcpClients 非空 → 追加 MCP server 名段', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    const content = getCoordinatorUserContext([{ name: 'alpha' }, { name: 'beta' }]).workerToolsContext!
    expect(content).toContain('MCP tools from connected MCP servers: alpha, beta')
  })
})

describe('matchSessionMode（会话模式对齐翻转 env）', () => {
  test('① 无已存模式（undefined）→ undefined，env 不动', () => {
    expect(matchSessionMode(undefined)).toBeUndefined()
    expect(process.env.ATLAS_COORDINATOR_MODE).toBeUndefined()
  })
  test('② normal 且当前非 coordinator → 一致，undefined', () => {
    expect(matchSessionMode('normal')).toBeUndefined()
    expect(process.env.ATLAS_COORDINATOR_MODE).toBeUndefined()
  })
  test('③ coordinator 且当前非 coordinator → 翻转 env=1 + 提示', () => {
    const msg = matchSessionMode('coordinator')
    expect(msg).toBe('Entered coordinator mode to match resumed session.')
    expect(process.env.ATLAS_COORDINATOR_MODE).toBe('1')
  })
  test('④ coordinator 且当前已是 coordinator（env=1）→ 一致，undefined', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    expect(matchSessionMode('coordinator')).toBeUndefined()
  })
  test('⑤ normal 且当前 coordinator（env=1）→ 清 env + 提示', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    const msg = matchSessionMode('normal')
    expect(msg).toBe('Exited coordinator mode to match resumed session.')
    expect(process.env.ATLAS_COORDINATOR_MODE).toBeUndefined()
  })
})
