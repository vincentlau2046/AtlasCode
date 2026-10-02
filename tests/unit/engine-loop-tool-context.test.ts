/**
 * R6（P0，user-e2e 第 3 轮）：工具调用 context 桥判别测试。
 *
 * 被测能力 = PipelineDeps/AgentLoopDeps.toolContext 槽的真透传链：
 *   ① executeToolUse 注入 toolContext → tool.call / validateInput 第 2 参
 *      = { ...toolContext, signal, checkPermission }（engine 运行字段优先，
 *      两接缝同一合并对象）——TUI 工具按 ToolUseContext 消费 getAppState 族
 *      单点修复（Write/TaskCreate/WebFetch/WebSearch 崩溃族）。
 *   ② 未注入 = 窄 spine（第 2 参恰为 { signal, checkPermission } 两键，
 *      headless 行为零改动——非 tautology：断言键集合封闭，非 fake 自证）。
 *   ③ queryAgentLoop 面：AgentLoopDeps.toolContext 经 runToolBatch 唯一点
 *      透传到 pipeline（loop→pipeline 接缝真接线，非仅接口声明）。
 * I/O-free（无盘/无网络/无 PTY）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { executeToolUse, queryAgentLoop } from '../../src/engine'
import type { AgentLoopDeps, Tool } from '../../src/engine'
import type { AssistantMessage, Message, ToolUseBlock } from '../../src/shared'
import type { ModelProvider } from '../../src/modelprovider'

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-10-02T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_use' },
} as unknown as AssistantMessage

function tu(id: string, name: string): ToolUseBlock {
  return { type: 'tool_use', id, name, input: {} }
}

/** fake TUI 面桥（ToolUseContext 消费面子集）：getAppState 族 + abortController。 */
function makeBridge() {
  return {
    getAppState: () => 'live-state',
    setAppState: () => {},
    abortController: new AbortController(),
    readFileState: new Map<string, unknown>(),
  }
}

/** fake tool：call/validateInput 均记录第 2 参 context（非 tautology：断言透传真发生）。 */
function makeProbeTool(
  name: string,
  record: (ctx: Record<string, unknown>) => void,
): Tool {
  return {
    name,
    isConcurrencySafe: () => true,
    validateInput: async (_input: unknown, ctx: unknown) => {
      record(ctx as Record<string, unknown>)
      return { result: true }
    },
    call: async (_args: unknown, ctx: unknown) => {
      record(ctx as Record<string, unknown>)
      return { data: `ok:${name}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

describe('R6 工具调用 context 桥（PipelineDeps.toolContext）', () => {
  test('① 注入 toolContext：call/validateInput 第 2 参 = 桥面 + engine 字段（同一合并对象，engine 字段优先）', async () => {
    const seen: Record<string, unknown>[] = []
    const tool = makeProbeTool('probe', ctx => seen.push(ctx))
    const bridge = makeBridge()
    const signal = new AbortController().signal
    const gate = async () => ({ allowed: true })
    const r = await executeToolUse(tu('t1', 'probe'), ASSISTANT, {
      tools: [tool],
      toolContext: bridge,
      signal,
      checkPermission: gate,
    })
    expect(r.isError).toBe(false)
    // validateInput + call 各 1 次，同一合并对象（executeToolUse 内单点构造）
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBe(seen[0])
    const ctx = seen[0]
    expect(ctx.getAppState()).toBe('live-state') // 桥面 getAppState 族真透传
    expect(ctx.abortController).toBe(bridge.abortController)
    expect(ctx.signal).toBe(signal) // engine 运行字段
    expect(ctx.checkPermission).toBe(gate)
  })

  test('② 未注入 toolContext：窄 spine 第 2 参恰为 { signal, checkPermission }（键集合封闭，headless 零改动）', async () => {
    const seen: Record<string, unknown>[] = []
    const tool = makeProbeTool('probe', ctx => seen.push(ctx))
    const signal = new AbortController().signal
    await executeToolUse(tu('t2', 'probe'), ASSISTANT, {
      tools: [tool],
      signal,
    })
    expect(seen).toHaveLength(2)
    const ctx = seen[0]
    expect(Object.keys(ctx).sort()).toEqual(['checkPermission', 'signal'])
    expect(ctx.getAppState).toBeUndefined()
    expect(ctx.signal).toBe(signal)
  })

  test('③ queryAgentLoop 面：AgentLoopDeps.toolContext 经 runToolBatch 透传到 pipeline', async () => {
    const toolUse: ToolUseBlock = { type: 'tool_use', id: 'tu-1', name: 'probe', input: {} }
    const calls: Array<{ content: unknown[] }> = [
      { content: [toolUse] },
      { content: [{ type: 'text', text: 'done' }] },
    ]
    const provider = {
      chat: async () => ({
        type: 'assistant',
        uuid: 'f-1',
        timestamp: '2026-10-02T00:00:00Z',
        message: {
          id: 'm-1',
          model: 'fake',
          role: 'assistant',
          content: calls.shift()!.content,
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }),
    } as unknown as ModelProvider

    const seen: Record<string, unknown>[] = []
    const tool = makeProbeTool('probe', ctx => seen.push(ctx))
    const bridge = makeBridge()
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small',
      toolContext: bridge,
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hi' }] as Message[],
      tools: [tool],
    })
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(2)
    // 轮 1 工具执行经 loop→pipeline 接缝拿到桥面 context
    expect(seen.length).toBeGreaterThanOrEqual(2) // validateInput + call
    const ctx = seen[0]
    expect(ctx.getAppState()).toBe('live-state')
    expect(ctx.abortController).toBe(bridge.abortController)
  })
})
