/**
 * E-4 S-4d engine 接线判别信号测试（§8.36）。
 *
 * 被测能力 = 权限面到 engine 的三处真接线（非 tautology，断言的是接缝被消费）：
 *   ① createPermissionGate（域规则求值树 → pipeline PermissionGate 3 值 verdict）
 *      × executeToolUse 映射支（deny → is_error `permission denied`；
 *      ask → fail-closed is_error + 确认标记）× queryOneRound deps 透传。
 *   ② getTools / filterToolsByDenyRules（deny 规则工具面过滤：blanket 名 +
 *      MCP server 级剥整 server）。
 *   ④ resolveAgentTools spec / disallowedTools 经域 permissionRuleValueFromString
 *      解析（旧仓 verbatim；红绿对照 = S-2 split(':') 截断固有误判面）。
 *
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。fake 仅 LLM（ModelProvider 替身）
 * + 最小 Tool（shared Tool.call 契约），非 fake 自证。
 */
import { describe, test, expect } from 'bun:test'
import {
  createPermissionGate,
  executeToolUse,
  getTools,
  queryOneRound,
  resolveAgentTools,
  type Tool,
} from '../../src/engine'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type {
  AssistantMessage,
  ToolPermissionContext,
  ToolUseBlock,
} from '../../src/shared'

/** 最小 ToolPermissionContext（域 readonly 版，session 源规则）。 */
function ctx(deny: string[] = [], ask: string[] = []): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: deny.length ? { session: deny } : {},
    alwaysAskRules: ask.length ? { session: ask } : {},
    isBypassPermissionsModeAvailable: false,
  }
}

/** 最小 fake tool（shared Tool 契约消费字段：name/call/mapResult）。 */
function makeTool(
  name: string,
  mcpInfo?: { serverName: string; toolName: string },
): Tool {
  return {
    name,
    ...(mcpInfo ? { mcpInfo } : {}),
    isConcurrencySafe: () => false,
    call: async () => ({ data: `ok:${name}` }),
    mapToolResultToToolResultBlockParam: (c: unknown, id: string) => ({
      type: 'tool_result',
      tool_use_id: id,
      content: String(c),
    }),
  } as unknown as Tool
}

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-24T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

/** fake LLM：固定返 content（ModelProvider 接口替身，同 engine-query-loop 口径）。 */
function fakeProvider(content: unknown[]): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被单轮 loop 消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'u-1',
      timestamp: '2026-09-24T00:00:00Z',
      message: {
        id: 'm-1',
        model: 'fake',
        role: 'assistant',
        content,
        stop_reason: 'tool_calls',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
    chatStream: notExercised,
    healthCheck: notExercised,
    countTokens: notExercised,
    listModels: async () => [],
    transcribeAudio: notExercised,
    synthesizeSpeech: notExercised,
    verifyKey: async () => true,
  } as unknown as ModelProvider
}

describe('① 权限门工厂 × 执行链映射 × loop 透传（3 值 verdict）', () => {
  test('①a 对照：未注入门 → 工具真执行（窄 spine 默认放行不变）', async () => {
    const r = await executeToolUse(tu('t1', 'echo'), ASSISTANT, {
      tools: [makeTool('echo')],
    })
    expect(r.isError).toBe(false)
    expect(r.block.content).toBe('ok:echo')
  })

  test('①b 门 + deny 规则 → is_error `permission denied`（门真被域规则树驱动）', async () => {
    const gate = createPermissionGate(ctx(['Bash']))
    const r = await executeToolUse(tu('t2', 'Bash'), ASSISTANT, {
      tools: [makeTool('Bash')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('permission denied')
  })

  test('①c 门 + ask 规则 → fail-closed is_error + 确认标记（静默执行 = 安全洞）', async () => {
    const gate = createPermissionGate(ctx([], ['Bash']))
    const r = await executeToolUse(tu('t3', 'Bash'), ASSISTANT, {
      tools: [makeTool('Bash')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain(
      'permission confirmation required',
    )
  })

  test('①d loop 透传：queryOneRound deps.checkPermission 真接线（唯一点）', async () => {
    const gate = createPermissionGate(ctx(['echo']))
    const r = await queryOneRound(
      {
        modelProvider: fakeProvider([
          { type: 'tool_use', id: 'tu-1', name: 'echo', input: {} },
        ]),
        role: 'small' as ModelRole,
        checkPermission: gate,
      },
      [makeTool('echo')],
      [],
    )
    // loop toolResults 项 = { toolUseId, name, block }（无 isError 字段，
    // 判别信号在 block.is_error 上——pipeline 映射支产物）
    expect(r.toolResults).toHaveLength(1)
    expect(r.toolResults[0].block.is_error).toBe(true)
    expect(String(r.toolResults[0].block.content)).toContain(
      'permission denied',
    )
  })
})

describe('② deny 规则工具面过滤（getTools 池 + MCP server 级）', () => {
  test('②a blanket deny `Bash` → 池剔除 Bash，Read 保留', () => {
    const pool = getTools(ctx(['Bash']), {
      baseTools: [makeTool('Bash'), makeTool('Read')],
    })
    const names = pool.map(t => t.name)
    expect(names).not.toContain('Bash')
    expect(names).toContain('Read')
  })

  test('②b MCP server 级 deny `mcp__srv` → 剥整 server，他 server 保留', () => {
    const pool = getTools(ctx(['mcp__srv']), {
      mcpTools: [
        makeTool('mcp__srv__fetch', { serverName: 'srv', toolName: 'fetch' }),
        makeTool('mcp__other__x', { serverName: 'other', toolName: 'x' }),
      ],
    })
    const names = pool.map(t => t.name)
    expect(names).not.toContain('mcp__srv__fetch')
    expect(names).toContain('mcp__other__x')
  })
})

describe('④ resolveAgentTools spec 解析（域 parser 替 split(\':\') 截断）', () => {
  test('④a spec `Bash(npm install)` → validTools 保留 ruleContent 原串', () => {
    const r = resolveAgentTools(
      { tools: ['Bash(npm install)'], source: 'built-in' },
      [makeTool('Bash'), makeTool('Read')],
    )
    expect(r.validTools).toEqual(['Bash(npm install)'])
    expect(r.invalidTools).toEqual([])
    expect(r.resolvedTools.map(t => t.name)).toEqual(['Bash'])
  })

  test('④b disallowedTools `Bash(*)` → Bash 工具级剔除（非字面名匹配）', () => {
    const r = resolveAgentTools(
      { tools: undefined, disallowedTools: ['Bash(*)'], source: 'built-in' },
      [makeTool('Bash'), makeTool('Read')],
    )
    expect(r.hasWildcard).toBe(true)
    expect(r.resolvedTools.map(t => t.name)).toEqual(['Read'])
  })
})
