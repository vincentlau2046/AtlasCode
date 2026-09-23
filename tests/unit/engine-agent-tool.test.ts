/**
 * engine/tools/agent AgentTool 核心 契约测试（§8.25 E-2 T-5b）。
 *
 * 被测能力（port 之下全真，非 tautology）：
 *   - spawn 深度门：computeChildSpawnDepth（纯）+ MAX_WORKER_SPAWN_DEPTH=2 pin +
 *     isCoordinatorMode env 门（ON_BY_DEFAULT 73631df + kill-switch）→ allowFanOut。
 *   - 工具面解析：filterToolsForAgent（mcp__ 透传 / Agent 工具 fan-out carve-out）+
 *     resolveAgentTools（通配 / 按名 / 禁用集）。
 *   - 终态收集：countToolUses + finalizeAgentTool（文本抽取 + tool_use 计数 + 回退）。
 *   - runAgent：复用 queryAgentLoop（fake LLM 脚本），终态结果字段。
 *   - AgentTool.call：同步路径全链（resolve → 深度门 → resolveTools → runAgent → finalize）
 *     + 模型 override（input.model → chat role）+ 子代理真用注入工具（fake tool 被真调）。
 * I/O-free（无盘 / 无网络 / 无 PTY；LLM 经 modelprovider 接口替身）→ unit 层。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  AgentTool,
  computeChildSpawnDepth,
  countToolUses,
  finalizeAgentTool,
  filterToolsForAgent,
  isCoordinatorMode,
  MAX_WORKER_SPAWN_DEPTH,
  resolveAgentTools,
  runAgent,
  type AgentDefinition,
} from '../../src/engine'
import { GENERAL_PURPOSE_AGENT } from '../../src/engine'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'

// ── fake LLM（可脚本 + 记录每次 chat 的 role；ModelProvider 接口替身，非 mock transport）──
interface ScriptStep {
  content: unknown[]
  stopReason?: string
  usage?: Record<string, number>
}
function fakeProvider(steps: ScriptStep[]): { provider: ModelProvider; roles: ModelRole[] } {
  let i = 0
  const roles: ModelRole[] = []
  const unused = async () => {
    throw new Error('fake ModelProvider: 方法未被消费')
  }
  const provider = {
    chat: async (args: { role: ModelRole }) => {
      roles.push(args.role)
      const step = steps[Math.min(i, steps.length - 1)]
      i++
      return {
        type: 'assistant',
        uuid: 'u' + i,
        timestamp: '2026-09-23T00:00:00Z',
        message: {
          id: 'm' + i,
          model: 'fake',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          usage:
            step.usage ?? {
              input_tokens: 1,
              output_tokens: 1,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
        },
      }
    },
    chatStream: unused as unknown as ModelProvider['chatStream'],
    healthCheck: unused as unknown as ModelProvider['healthCheck'],
    countTokens: unused as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: unused as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: unused as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
  return { provider, roles }
}

/** 真实 Tool.call 语义（记录被调）：回显，供 runAgent/AgentTool 真调子代理工具。 */
function makeFakeTool(name: string, calls: string[]): Tool {
  return {
    name,
    inputSchema: { type: 'object', properties: {} },
    maxResultSizeChars: 1000,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
    isReadOnly: () => true,
    checkPermissions: async () => ({ behavior: 'passthrough', message: '' }),
    description: async () => name,
    userFacingName: () => name,
    toAutoClassifierInput: (i: unknown) => i,
    renderToolUseMessage: () => null,
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
    call: async (args: unknown) => {
      calls.push(name)
      return { data: `did-${name}:${JSON.stringify(args ?? {})}` }
    },
  } as unknown as Tool
}

function asMsg(role: string, content: unknown, usage?: Record<string, number>): Message {
  return {
    type: role,
    role,
    message: { role, content, ...(usage ? { usage } : {}) },
  } as unknown as Message
}

// ── env 门（isCoordinatorMode）：save/restore ──
const ENV_KEYS = ['ATLAS_COORDINATOR_MODE', 'FEATURE_COORDINATOR_MODE'] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  delete process.env.ATLAS_COORDINATOR_MODE
  delete process.env.FEATURE_COORDINATOR_MODE
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]!
  }
})

describe('spawn 深度门（computeChildSpawnDepth + MAX_WORKER_SPAWN_DEPTH）', () => {
  test('① 主线程（无 spawnDepth）→ 首个 worker 深度 1', () => {
    expect(computeChildSpawnDepth(undefined)).toBe(1)
    expect(computeChildSpawnDepth({})).toBe(1)
    expect(computeChildSpawnDepth({ spawnDepth: 0 })).toBe(1)
  })

  test('② 深度 N 的 agent → 子 agent 深度 N+1', () => {
    expect(computeChildSpawnDepth({ spawnDepth: 2 })).toBe(3)
  })

  test('③ MAX_WORKER_SPAWN_DEPTH=2（旧仓 constants/tools.ts:96 pin）', () => {
    expect(MAX_WORKER_SPAWN_DEPTH).toBe(2)
  })
})

describe('isCoordinatorMode（ON_BY_DEFAULT 73631df + kill-switch）', () => {
  test('① env 未设 → false（运行时门控）', () => {
    expect(isCoordinatorMode()).toBe(false)
  })
  test('② ATLAS_COORDINATOR_MODE=1 → true', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    expect(isCoordinatorMode()).toBe(true)
  })
  test('③ kill-switch FEATURE_COORDINATOR_MODE=false 覆盖 → false', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    process.env.FEATURE_COORDINATOR_MODE = 'false'
    expect(isCoordinatorMode()).toBe(false)
  })
})

describe('allowFanOut 门（isCoordinatorMode && childSpawnDepth < MAX）', () => {
  test('① coordinator off → 恒 false（即便深度够低）', () => {
    const allowFanOut = isCoordinatorMode() && 1 < MAX_WORKER_SPAWN_DEPTH
    expect(allowFanOut).toBe(false)
  })
  test('② coordinator on + 深度 1 < 2 → true（可 fan-out）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    const childSpawnDepth = computeChildSpawnDepth({ spawnDepth: 0 }) // =1
    expect(isCoordinatorMode() && childSpawnDepth < MAX_WORKER_SPAWN_DEPTH).toBe(true)
  })
  test('③ coordinator on + 深度 2 = MAX → false（深度上限，不 fan-out）', () => {
    process.env.ATLAS_COORDINATOR_MODE = '1'
    const childSpawnDepth = computeChildSpawnDepth({ spawnDepth: 1 }) // =2
    expect(isCoordinatorMode() && childSpawnDepth < MAX_WORKER_SPAWN_DEPTH).toBe(false)
  })
})

describe('filterToolsForAgent（mcp__ 透传 + Agent 工具 fan-out carve-out）', () => {
  const mcp = makeFakeTool('mcp__srv__x', [])
  const agent = makeFakeTool('Agent', [])
  const read = makeFakeTool('Read', [])
  const tools = [mcp, agent, read]

  test('① 非 fan-out：Agent 工具被剔，mcp__ + 普通工具保留', () => {
    const kept = filterToolsForAgent({ tools, isBuiltIn: true })
    expect(kept.map((t) => t.name)).toEqual(['mcp__srv__x', 'Read'])
  })
  test('② fan-out（allowFanOut）：Agent 工具被重新加回', () => {
    const kept = filterToolsForAgent({ tools, isBuiltIn: true, allowFanOut: true })
    expect(kept.map((t) => t.name)).toContain('Agent')
  })
})

describe('resolveAgentTools（通配 / 按名 / 禁用集）', () => {
  const tools = [makeFakeTool('Read', []), makeFakeTool('Edit', []), makeFakeTool('Grep', [])]
  const def: Pick<AgentDefinition, 'tools' | 'disallowedTools' | 'source'> = {
    source: 'built-in',
    tools: undefined, // 通配
    disallowedTools: [],
  }
  test('① 通配（tools=undefined）→ 全量（剔禁用后）', () => {
    const r = resolveAgentTools(def, tools)
    expect(r.hasWildcard).toBe(true)
    expect(r.resolvedTools.map((t) => t.name).sort()).toEqual(['Edit', 'Grep', 'Read'])
  })
  test('② 按名解析 + 未知工具进 invalidTools', () => {
    const r = resolveAgentTools(
      { source: 'built-in', tools: ['Read', 'Nope'] },
      tools,
    )
    expect(r.validTools).toEqual(['Read'])
    expect(r.invalidTools).toEqual(['Nope'])
    expect(r.resolvedTools.map((t) => t.name)).toEqual(['Read'])
  })
  test('③ disallowedTools 剔除', () => {
    const r = resolveAgentTools(
      { source: 'built-in', tools: ['Read', 'Edit', 'Grep'], disallowedTools: ['Edit'] },
      tools,
    )
    expect(r.resolvedTools.map((t) => t.name).sort()).toEqual(['Grep', 'Read'])
  })
})

describe('countToolUses + finalizeAgentTool（终态收集）', () => {
  const msgs: Message[] = [
    asMsg('assistant', [
      { type: 'text', text: 'looking' },
      { type: 'tool_use', id: 't1', name: 'Read', input: {} },
    ]),
    asMsg('user', [{ type: 'tool_result', tool_use_id: 't1', content: 'file' }]),
    asMsg('assistant', [{ type: 'text', text: 'done: fixed' }], { input_tokens: 5, output_tokens: 3 }),
  ]
  test('① countToolUses 数 tool_use 块', () => {
    expect(countToolUses(msgs)).toBe(1)
  })
  test('② finalizeAgentTool：末位文本 + tool_use 计数 + token 求和', () => {
    const r = finalizeAgentTool(msgs, 'a-1', { prompt: 'p', agentType: 'general-purpose', startTime: Date.now(), isAsync: false })
    expect(r.content).toEqual([{ type: 'text', text: 'done: fixed' }])
    expect(r.totalToolUseCount).toBe(1)
    expect(r.totalTokens).toBe(8) // 5 + 3
  })
  test('③ 末位纯 tool_use 时回退到最近含文本的 assistant 消息', () => {
    const msgs2: Message[] = [
      asMsg('assistant', [{ type: 'text', text: 'partial answer' }]),
      asMsg('assistant', [{ type: 'tool_use', id: 't9', name: 'Edit', input: {} }]),
    ]
    const r = finalizeAgentTool(msgs2, 'a-2', { prompt: 'p', startTime: Date.now(), isAsync: false })
    expect(r.content).toEqual([{ type: 'text', text: 'partial answer' }])
  })
})

describe('runAgent（复用 queryAgentLoop 到终态）', () => {
  test('① fake LLM 直返文本 → 1 轮终止，终态文本收集', async () => {
    const { provider } = fakeProvider([{ content: [{ type: 'text', text: 'answer-42' }] }])
    const r = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'do it',
      tools: [],
      modelProvider: provider,
      parentRole: 'small',
      agentId: 'a-run1',
    })
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(1)
    expect(r.result.content).toEqual([{ type: 'text', text: 'answer-42' }])
    expect(r.result.agentId).toBe('a-run1')
  })

  test('② 子代理真用注入工具（provider 发 tool_use → pipeline 真调 → 再收文本）', async () => {
    const calls: string[] = []
    const tool = makeFakeTool('Read', calls)
    const { provider } = fakeProvider([
      { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } }], stopReason: 'tool_calls' },
      { content: [{ type: 'text', text: 'saw the file' }] },
    ])
    const r = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'read a',
      tools: [tool],
      modelProvider: provider,
      parentRole: 'small',
      agentId: 'a-run2',
    })
    expect(calls).toEqual(['Read']) // 子代理 loop 真调了工具（非 tautology）
    expect(r.result.totalToolUseCount).toBe(1)
    expect(r.result.content).toEqual([{ type: 'text', text: 'saw the file' }])
  })

  test('③ 模型 override：input.model → chat role（premium 覆盖父 role）', async () => {
    const { provider, roles } = fakeProvider([{ content: [{ type: 'text', text: 'ok' }] }])
    await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'x',
      tools: [],
      modelProvider: provider,
      parentRole: 'small',
      overrideRole: 'premium',
      agentId: 'a-run3',
    })
    expect(roles).toEqual(['premium'])
  })
})

describe('AgentTool.call（同步路径全链）', () => {
  test('① 全链：resolve → 深度门 → resolveTools → runAgent → 终态（status completed + prompt 透传）', async () => {
    const { provider } = fakeProvider([{ content: [{ type: 'text', text: 'final' }] }])
    const res = await AgentTool.call(
      { description: 'fix', prompt: 'fix the bug' },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    const data = res.data as { status: string; prompt: string; agentId: string; content: { text: string }[] }
    expect(data.status).toBe('completed')
    expect(data.prompt).toBe('fix the bug')
    expect(data.agentId).toBeDefined()
    expect(data.content).toEqual([{ type: 'text', text: 'final' }])
  })

  test('② 注入工具池 → 子代理真调工具（call 全链 + 工具真消费）', async () => {
    const calls: string[] = []
    const tool = makeFakeTool('Grep', calls)
    const { provider } = fakeProvider([
      { content: [{ type: 'tool_use', id: 't1', name: 'Grep', input: { q: 'x' } }], stopReason: 'tool_calls' },
      { content: [{ type: 'text', text: 'found it' }] },
    ])
    await AgentTool.call(
      { description: 'find', prompt: 'find x', model: 'fast' },
      { modelProvider: provider, parentRole: 'small', tools: [tool] },
      undefined,
      undefined,
    )
    expect(calls).toEqual(['Grep'])
  })

  test('③ 模型 override 经 call → chat role（input.model=fast 覆盖父 small）', async () => {
    const { provider, roles } = fakeProvider([{ content: [{ type: 'text', text: 'ok' }] }])
    await AgentTool.call(
      { description: 'x', prompt: 'x', model: 'fast' },
      { modelProvider: provider, parentRole: 'small' },
      undefined,
      undefined,
    )
    expect(roles).toEqual(['fast'])
  })
})
