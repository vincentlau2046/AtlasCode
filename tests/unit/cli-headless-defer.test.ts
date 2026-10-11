/**
 * AD-45（0.1.52，CC 2.1.89 TOP#1）— headless 挂起协议 ② + resume 重评 ③ 判别单测（修前红）。
 *
 * 判别信号（工单 §1.1 ②③ + 零回归约束）：
 *  ① queryAgentLoop：defer 轮 → result.deferred 携挂起面 + terminated=false（非自然终止、
 *     非 maxTurns 截断）+ 轮末追加挂起标记（system subtype='deferred_tool_use'，compact_boundary
 *     同形）+ 该 tool_use 无 tool_result（不产 tool_result = 挂起面核心，修前红 = 挂起面不存在）。
 *  ② reEvaluateDeferredToolCalls（--resume 消费支，print.ts 可测顶层面）：
 *     - 再 defer → 幂等再挂起（工具不执行 + 新标记追加 last-wins）
 *     - allow → 工具执行 + tool_result 追加（挂起解除，LLM 续跑）
 *     - gate deny → is_error tool_result + 工具不执行（既有决策流逐字恒等）
 *  ③ findDeferredToolUseState（挂起态检测，last-wins + 自清除）：
 *     - 标记在场且其后无对应 tool_result = 挂起态
 *     - 标记其后有对应 tool_result = 已解决（正常 resume 逐字恒等）
 *     - 无标记（正常会话 / 中轮 crash 悬空 tool_use）= undefined（零回归：重评仅由
 *       显式挂起标记门控，crash 态不触发——工单零回归约束 3）。
 *
 * 分层纪律：零磁盘（假 provider / 假工具 / 纯函数检测面；print.ts 导入先例 =
 * cli-headless-result-text.test.ts extractFinalAssistantText 同型可测顶层面）。
 */
import { describe, test, expect } from 'bun:test'
import {
  queryAgentLoop,
  makeDeferredToolUseMarker,
  type AgentLoopDeps,
} from '../../src/engine'
import {
  reEvaluateDeferredToolCalls,
  findDeferredToolUseState,
} from '../../src/cli/print'
import type {
  Message,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from '../../src/shared'
import type { ModelProvider } from '../../src/modelprovider'

/**
 * 假文件面工具（prod-lane GATE-OPEN 回归修波）：逐字模拟真文件工具的 context
 * 读面——readTool.ts L1016 `context.abortController.signal`（非可选链 = 本波
 * 回归崩溃点，context 无 abortController 时抛 TypeError: reading 'signal'）+
 * getAppState 活 TPC 读（fileWriteTool 同族）。call 计数 + context 面回读
 * （signal 身份 / TPC mode → data，供断言 context 桥真透传非恒绿假绿）。
 */
function makeFileLikeTool(): {
  tool: Tool
  calls: { n: number; lastContext: Record<string, unknown> | undefined }
} {
  const calls = { n: 0, lastContext: undefined as Record<string, unknown> | undefined }
  return {
    calls,
    tool: {
      name: 'Read',
      isConcurrencySafe: () => true,
      call: async (_input: unknown, context: unknown) => {
        calls.n++
        calls.lastContext = context as Record<string, unknown>
        const ctx = context as {
          abortController?: AbortController
          getAppState?: () => { toolPermissionContext?: { mode?: string } }
        }
        // 真 Read 崩溃点逐字形：非可选链读 signal（context 缺 abortController
        // = TypeError，与 npm 0.1.52 生产 lane 红面同形）
        const signal = ctx.abortController.signal
        void signal
        // getAppState 可选链（活 TPC 面；缺席 = 窄 spine 零崩溃先例）
        const mode = ctx.getAppState?.()?.toolPermissionContext?.mode
        return { data: `read-ok:${mode ?? 'no-tpc'}` }
      },
      mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: String(content),
      } as ToolResultBlockParam),
    } as unknown as Tool,
  }
}

/** 假工具：call 计数（defer 支必须 0 调用 = 工具不执行）。 */
function makeSpyTool(name: string, data?: unknown): { tool: Tool; calls: { n: number } } {
  const calls = { n: 0 }
  return {
    calls,
    tool: {
      name,
      isConcurrencySafe: () => true,
      call: async () => {
        calls.n++
        return { data: data ?? `result:${name}` }
      },
      mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: String(content),
      } as ToolResultBlockParam),
    } as unknown as Tool,
  }
}

/** 假 provider：每轮返固定 assistant 内容（LLM 面非被测能力，非 tautology——loop 的挂起判定才是）。 */
function makeProvider(contentBlocks: unknown[]): ModelProvider {
  return {
    chat: async () => ({
      message: { content: contentBlocks, stop_reason: 'tool_calls' },
      uuid: 'u-llm',
      timestamp: new Date().toISOString(),
    }),
    countTokens: () => 0,
  } as unknown as ModelProvider
}

const USER_MSG = {
  type: 'user',
  role: 'user',
  uuid: 'u0',
  timestamp: 't0',
  message: { role: 'user', content: 'start task' },
} as unknown as Message

const ASSISTANT_TU: ToolUseBlock = {
  type: 'tool_use',
  id: 'toolu_1',
  name: 'Bash',
  input: { command: 'ls' },
}

const ASSISTANT_MSG = {
  type: 'assistant',
  role: 'assistant',
  uuid: 'a1',
  timestamp: 't1',
  message: { role: 'assistant', content: [ASSISTANT_TU], stop_reason: 'tool_calls' },
} as unknown as Message

function conversationWithMarker(): Message[] {
  return [
    USER_MSG,
    ASSISTANT_MSG,
    makeDeferredToolUseMarker({ toolUseId: 'toolu_1', toolName: 'Bash' }) as unknown as Message,
  ]
}

describe('AD-45 ② loop 挂起面（queryAgentLoop defer 轮）', () => {
  test('defer 轮 → result.deferred + terminated=false + 轮末挂起标记 + 该 tool_use 无 tool_result（修前红 = 挂起面不存在）', async () => {
    const { tool, calls } = makeSpyTool('Bash')
    const r = await queryAgentLoop(
      {
        modelProvider: makeProvider([ASSISTANT_TU]),
        role: 'premium',
        hooks: {
          toolHooks: {
            preToolUse: async () => ({
              hookBehavior: 'defer',
              hookPermissionDecisionReason: 'later',
            }),
          },
        },
      } as unknown as AgentLoopDeps,
      { messages: [USER_MSG], tools: [tool], context: { maxTurns: 3 } },
    )
    expect(r.deferred).toEqual({
      toolUseId: 'toolu_1',
      toolName: 'Bash',
      deferReason: 'later',
    })
    expect(r.terminated).toBe(false)
    expect(calls.n).toBe(0)
    const last = r.messages[r.messages.length - 1] as unknown as Record<string, unknown>
    expect(last.type).toBe('system')
    expect(last.subtype).toBe('deferred_tool_use')
    expect(last.tool_use_id).toBe('toolu_1')
    // 挂起面核心：该 tool_use 无 tool_result（不产 tool_result）
    const hasToolResult = r.messages.some(m => {
      const content = (m as unknown as { message?: { content?: unknown[] } }).message?.content
      return (
        Array.isArray(content) &&
        content.some(
          (b: unknown) =>
            (b as { type?: string; tool_use_id?: string })?.type === 'tool_result' &&
            (b as { tool_use_id?: string }).tool_use_id === 'toolu_1',
        )
      )
    })
    expect(hasToolResult).toBe(false)
  })
})

describe('AD-45 ② 挂起标记工厂（makeDeferredToolUseMarker）', () => {
  test('system 消息 subtype 判别式（无字符串 content → LLM 映射 params.ts system 支滤除，不进 API）', () => {
    const m = makeDeferredToolUseMarker({
      toolUseId: 'x',
      toolName: 'Bash',
      deferReason: 'r',
    }) as unknown as Record<string, unknown>
    expect(m.type).toBe('system')
    expect(m.subtype).toBe('deferred_tool_use')
    expect(m.tool_use_id).toBe('x')
    expect(m.tool_name).toBe('Bash')
    expect(m.defer_reason).toBe('r')
    expect(m.uuid).toBeTruthy()
    expect(m.content).toBeUndefined()
  })
})

describe('AD-45 ③ resume 重评（reEvaluateDeferredToolCalls --resume 消费支）', () => {
  test('再 defer → 幂等再挂起（工具不执行 + 新挂起标记追加 last-wins；修前红 = 重评语义不存在）', async () => {
    const { tool, calls } = makeSpyTool('Bash')
    const r = await reEvaluateDeferredToolCalls({
      conversation: conversationWithMarker(),
      toolUseId: 'toolu_1',
      tools: [tool],
      toolHooks: {
        preToolUse: async () => ({
          hookBehavior: 'defer',
          hookPermissionDecisionReason: 'still waiting',
        }),
      },
    })
    expect(r.suspended).toBe(true)
    expect(r.deferred?.toolUseId).toBe('toolu_1')
    expect(r.deferred?.deferReason).toBe('still waiting')
    expect(calls.n).toBe(0)
    const last = r.messages[r.messages.length - 1] as unknown as Record<string, unknown>
    expect(last.subtype).toBe('deferred_tool_use')
    expect(r.messages.length).toBe(conversationWithMarker().length + 1)
  })

  test('allow → 工具执行 + tool_result 追加（挂起解除，LLM 续跑；修前红 = 重评语义不存在）', async () => {
    const { tool, calls } = makeSpyTool('Bash', 'ok-output')
    const r = await reEvaluateDeferredToolCalls({
      conversation: conversationWithMarker(),
      toolUseId: 'toolu_1',
      tools: [tool],
      toolHooks: { preToolUse: async () => ({ hookBehavior: 'allow' }) },
    })
    expect(r.suspended).toBe(false)
    expect(calls.n).toBe(1)
    const last = r.messages[r.messages.length - 1] as unknown as {
      message?: { content?: Array<{ type?: string; tool_use_id?: string; content?: unknown }> }
    }
    const block = last.message?.content?.[0]
    expect(block?.type).toBe('tool_result')
    expect(block?.tool_use_id).toBe('toolu_1')
    expect(String(block?.content)).toBe('ok-output')
  })

  test('零回归恒等：gate deny → is_error tool_result + 工具不执行（既有决策流逐字）', async () => {
    const { tool, calls } = makeSpyTool('Bash')
    const r = await reEvaluateDeferredToolCalls({
      conversation: conversationWithMarker(),
      toolUseId: 'toolu_1',
      tools: [tool],
      checkPermission: async () => ({ allowed: false, reason: 'settings deny' }),
    })
    expect(r.suspended).toBe(false)
    expect(calls.n).toBe(0)
    const last = r.messages[r.messages.length - 1] as unknown as {
      message?: {
        content?: Array<{ type?: string; tool_use_id?: string; is_error?: boolean; content?: unknown }>
      }
    }
    const block = last.message?.content?.[0]
    expect(block?.type).toBe('tool_result')
    expect(block?.is_error).toBe(true)
    expect(String(block?.content)).toContain('permission denied: settings deny')
  })
})

describe('AD-45 ③ 挂起态检测（findDeferredToolUseState last-wins + 自清除）', () => {
  test('挂起态：标记在场且其后无对应 tool_result → 返回挂起面', () => {
    const s = findDeferredToolUseState(conversationWithMarker())
    expect(s?.toolUseId).toBe('toolu_1')
    expect(s?.toolName).toBe('Bash')
  })

  test('已解决：标记后出现该 tool_use 的 tool_result → undefined（正常 resume 逐字恒等）', () => {
    const resultMsg = {
      type: 'user',
      role: 'user',
      uuid: 'u2',
      timestamp: 't2',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
      },
    } as unknown as Message
    const s = findDeferredToolUseState([...conversationWithMarker(), resultMsg])
    expect(s).toBeUndefined()
  })

  test('零回归恒等：无标记（正常会话 / 中轮 crash 悬空 tool_use）→ undefined（重评仅由显式标记门控）', () => {
    const s = findDeferredToolUseState(conversationWithMarker().slice(0, 2))
    expect(s).toBeUndefined()
  })
})

describe('AD-45 ③ 回归修：工具执行 context 桥（headless R6 等价，prod-lane GATE-OPEN 修波）', () => {
  /**
   * 背景（0.1.52 生产 lane 红面）：--resume 重评 allow 后 file tool 抛
   * `tool error [TypeError]: Cannot read properties of undefined (reading
   * 'signal')`——重评支 executeToolUse deps 缺 signal/toolContext（且 headless
   * 常路径 loopDeps 同样未注入 toolContext = 同一 R6 缺口）。修 = 调用点
   * 透传（print.ts loopDeps.toolContext = makeCtx() + 重评参补 signal/
   * toolContext）。本族判别式：假文件面工具逐字模拟 Read 崩溃点（非可选链
   * 读 abortController.signal），全 context 面 = 执行成功零 TypeError；
   * 缺面 = TypeError 短路（负证，钉死崩溃归因 = context 缺面非工具本体）。
   */
  const fileLikeConversation = (): Message[] => {
    const tu: ToolUseBlock = {
      type: 'tool_use',
      id: 'toolu_f',
      name: 'Read',
      input: { file_path: '/tmp/x.txt' },
    }
    return [
      USER_MSG,
      {
        type: 'assistant',
        role: 'assistant',
        uuid: 'af',
        timestamp: 'tf',
        message: { role: 'assistant', content: [tu], stop_reason: 'tool_calls' },
      } as unknown as Message,
      makeDeferredToolUseMarker({ toolUseId: 'toolu_f', toolName: 'Read' }) as unknown as Message,
    ]
  }

  test('重评 allow + 调用点全 deps（signal + toolContext）→ 文件面工具执行成功零 TypeError（修前红）', async () => {
    const { tool, calls } = makeFileLikeTool()
    const runSignal = new AbortController().signal
    const r = await reEvaluateDeferredToolCalls({
      conversation: fileLikeConversation(),
      toolUseId: 'toolu_f',
      tools: [tool],
      toolHooks: { preToolUse: async () => ({ hookBehavior: 'allow' }) },
      checkPermission: async () => ({ allowed: true }),
      // 调用点面（print.ts re-eval 支透传 loopDeps.signal / loopDeps.toolContext）
      signal: runSignal,
      toolContext: {
        abortController: new AbortController(),
        getAppState: () => ({ toolPermissionContext: { mode: 'bypassPermissions' } }),
      },
    })
    expect(r.suspended).toBe(false)
    expect(calls.n).toBe(1)
    const last = r.messages[r.messages.length - 1] as unknown as {
      message?: { content?: Array<{ type?: string; content?: unknown; is_error?: boolean }> }
    }
    const block = last.message?.content?.[0]
    // 零 TypeError + 活 TPC 面真透传（data 回读 = context 桥非恒绿假绿的判别式）
    expect(String(block?.content)).toBe('read-ok:bypassPermissions')
    expect(block?.is_error).toBeUndefined()
    // engine 运行字段优先（toolCallContext 合并语义）：context.signal = 传入 signal 身份
    expect(calls.lastContext?.signal).toBe(runSignal)
  })

  test('负证：旧形最小 deps（缺 signal/toolContext）→ 文件面工具 TypeError 短路（崩溃归因 = context 缺面）', async () => {
    const { tool, calls } = makeFileLikeTool()
    const r = await reEvaluateDeferredToolCalls({
      conversation: fileLikeConversation(),
      toolUseId: 'toolu_f',
      tools: [tool],
      checkPermission: async () => ({ allowed: true }),
    })
    expect(r.suspended).toBe(false)
    expect(calls.n).toBe(1)
    const last = r.messages[r.messages.length - 1] as unknown as {
      message?: { content?: Array<{ type?: string; content?: unknown; is_error?: boolean }> }
    }
    const block = last.message?.content?.[0]
    expect(block?.is_error).toBe(true)
    expect(String(block?.content)).toContain('TypeError')
  })

  test('常路径恒等（R6 loop 桥 guard）：queryAgentLoop 注入 toolContext → 文件面工具常路径执行成功', async () => {
    const { tool, calls } = makeFileLikeTool()
    const tu: ToolUseBlock = {
      type: 'tool_use',
      id: 'toolu_f',
      name: 'Read',
      input: { file_path: '/tmp/x.txt' },
    }
    // 一次性 provider：首轮发 tool_use、二轮 end_turn（防假 provider 恒发
    // 同 tool_use 致多轮重复执行，calls 计数失真）
    let rounds = 0
    const oneShotProvider = {
      chat: async () => {
        rounds++
        return {
          message: {
            content:
              rounds === 1 ? [tu] : [{ type: 'text', text: 'done' }],
            stop_reason: rounds === 1 ? 'tool_calls' : 'end_turn',
          },
          uuid: 'u-llm',
          timestamp: new Date().toISOString(),
        }
      },
      countTokens: () => 0,
    } as unknown as ModelProvider
    const r = await queryAgentLoop(
      {
        modelProvider: oneShotProvider,
        role: 'premium',
        // R6（P0）：工具调用 context 桥（TUI 面先例；headless 修波同槽注入）
        toolContext: { abortController: new AbortController() },
        hooks: { toolHooks: { preToolUse: async () => ({ hookBehavior: 'allow' }) } },
      } as unknown as AgentLoopDeps,
      { messages: [USER_MSG], tools: [tool], context: { maxTurns: 2 } },
    )
    expect(calls.n).toBe(1)
    // tool_result 追家族（runToolBatch 产）含执行面内容，无 TypeError
    const toolResult = r.messages.flatMap(m => {
      const content = (m as unknown as { message?: { content?: unknown[] } }).message?.content
      return Array.isArray(content) ? content : []
    }).find(
      (b: unknown) =>
        (b as { type?: string; tool_use_id?: string })?.type === 'tool_result' &&
        (b as { tool_use_id?: string }).tool_use_id === 'toolu_f',
    ) as { content?: unknown; is_error?: boolean } | undefined
    expect(toolResult).toBeDefined()
    expect(String(toolResult?.content)).toBe('read-ok:no-tpc')
    expect(toolResult?.is_error).toBeUndefined()
  })
})
