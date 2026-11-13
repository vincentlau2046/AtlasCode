/**
 * 0.1.104 切片 2 判据格：per-tool timeoutMs 声明预算 wrapper
 * （工单 docs/2026-11-13-p0-wave-01104-watchdog-default-off-ticket.md §4
 * 格 3/4/5 + 审计补格 + 钉⑥；lock-face 必答 2/3/4/5）。
 *
 *   格 3 timeoutMs 到期格：声明短预算工具 + 超预算实执行 → 结构化
 *        TOOL_TIMEOUT isError tool_result（content 前缀机器可读标记，模型可路由）
 *        + abort reason 经既有通道到达工具消费面（零孤儿面）。
 *   格 4 无声明永限期：未声明工具超预算长执行零干预（cooperative 零行为变更）。
 *   格 5 嵌套消歧格：外层 deps.signal 先 abort → 既有 catch 透传（不误记内层超时）；
 *        guard 自身哨兵 abort → TOOL_TIMEOUT 替换（单点比对）。
 *   补格：disarm/不二 firing（guard 语义）+ 钉⑥ 转后台 disarm（MCP 后台工具
 *        零 TOOL_TIMEOUT）+ 格 10 无声明/声明工具 wire schema 零 diff。
 *   格 2a 预执行等待零预算：权限门 deny 早退支 → guard 不存在（不 arm）。
 * I/O 面：纯内存 fake tool，零网络零磁盘 → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { executeToolUse, type Tool } from '../../src/engine'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-11-13T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/** 可声明 timeoutMs 的 fake tool：call 挂起 untilRelease / 或自 sleep；捕获到达的 signal。 */
function fakeTool(opts: {
  name: string
  timeoutMs?: number
  callMs?: number
  isMcp?: boolean
}): { tool: Tool; seenSignals: AbortSignal[] } {
  const seenSignals: AbortSignal[] = []
  const tool = {
    name: opts.name,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.isMcp === true ? { isMcp: true } : {}),
    inputSchema: { type: 'object', properties: {} },
    isConcurrencySafe: () => false,
    isEnabled: () => true,
    isReadOnly: () => true,
    call: async (_input: unknown, context: unknown) => {
      const signal = (context as { signal?: AbortSignal })?.signal
      seenSignals.push(signal as AbortSignal)
      // abort-aware：既有工具消费面语义（signal 到达即拒绝，清理责任在工具侧）
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, opts.callMs ?? 0)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error(`aborted: ${String(signal.reason)}`))
        })
      })
      return { data: 'ok' }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: String(content),
    }),
    userFacingName: () => opts.name,
    toAutoClassifierInput: (input: unknown) => input,
  } as unknown as Tool
  return { tool, seenSignals }
}

describe('0.1.104 格 3：timeoutMs 到期 → 结构化 TOOL_TIMEOUT isError tool_result', () => {
  test('声明 50ms 工具 + 300ms 实执行 → TOOL_TIMEOUT 块（is_error + 前缀标记）+ abort 到达工具', async () => {
    const { tool, seenSignals } = fakeTool({ name: 'SlowOp', timeoutMs: 50, callMs: 300 })
    const r = await executeToolUse(tu('g3-1', 'SlowOp'), ASSISTANT, { tools: [tool] })
    expect(r.isError).toBe(true)
    expect(r.block?.is_error).toBe(true)
    expect(r.block?.content).toContain('TOOL_TIMEOUT: SlowOp')
    expect(r.block?.content).toContain('50ms')
    // 零孤儿面：组合 signal 经既有 context.signal 通道到达工具（abort 消费面可用）
    expect(seenSignals.length).toBeGreaterThan(0)
    expect(seenSignals[0]!.aborted).toBe(true)
    expect(seenSignals[0]!.reason !== undefined).toBe(true)
  })

  test('声明预算内完成 → 正常结果零干预（dispose 清 timer 面）', async () => {
    const { tool } = fakeTool({ name: 'FastOp', timeoutMs: 5_000, callMs: 30 })
    const r = await executeToolUse(tu('g3-2', 'FastOp'), ASSISTANT, { tools: [tool] })
    expect(r.isError).toBe(false)
    expect(r.block?.content).toBe('ok')
  })
})

describe('0.1.104 格 4：无声明永限期（cooperative 零行为变更）', () => {
  test('未声明 timeoutMs 工具超预算长执行 → 正常完成零干预', async () => {
    const { tool, seenSignals } = fakeTool({ name: 'Unbounded', callMs: 200 })
    const r = await executeToolUse(tu('g4-1', 'Unbounded'), ASSISTANT, { tools: [tool] })
    expect(r.isError).toBe(false)
    expect(r.block?.content).toBe('ok')
    expect(seenSignals[0]?.aborted ?? false).toBe(false)
  })

  test('timeoutMs=0 / 负值 → 视同无声明（不建 guard）', async () => {
    const zero = fakeTool({ name: 'ZeroBudget', timeoutMs: 0, callMs: 120 })
    const neg = fakeTool({ name: 'NegBudget', timeoutMs: -5, callMs: 120 })
    const r0 = await executeToolUse(tu('g4-2', 'ZeroBudget'), ASSISTANT, { tools: [zero.tool] })
    const rN = await executeToolUse(tu('g4-3', 'NegBudget'), ASSISTANT, { tools: [neg.tool] })
    expect(r0.isError).toBe(false)
    expect(rN.isError).toBe(false)
  })
})

describe('0.1.104 格 5：嵌套消歧（哨兵单点比对）', () => {
  test('外层 deps.signal 先 abort → 既有 catch 透传（非 TOOL_TIMEOUT）', async () => {
    const { tool } = fakeTool({ name: 'OuterCancelled', timeoutMs: 10_000, callMs: 500 })
    const outer = new AbortController()
    const run = executeToolUse(tu('g5-1', 'OuterCancelled'), ASSISTANT, {
      tools: [tool],
      signal: outer.signal,
    })
    await sleep(30)
    outer.abort(new Error('用户中断'))
    const r = await run
    expect(r.isError).toBe(true)
    expect(String(r.block?.content)).not.toContain('TOOL_TIMEOUT')
  })

  test('guard 哨兵 reason 单点比对：isTimeoutAbort 仅对自身 deadline 为真', async () => {
    const { createToolTimeoutGuard, TOOL_TIMEOUT_ABORT_REASON } = await import(
      '../../src/engine/pipeline/toolTimeout'
    )
    const g = createToolTimeoutGuard({ timeoutMs: 20 })
    expect(g.isTimeoutAbort()).toBe(false)
    // 外层 abort（非哨兵 reason）→ false（嵌套消歧）
    const outer = new AbortController()
    const g2 = createToolTimeoutGuard({ timeoutMs: 10_000, outerSignal: outer.signal })
    outer.abort(new Error('outer cancel'))
    expect(g2.isTimeoutAbort()).toBe(false)
    expect(g2.signal.aborted).toBe(true)
    // 自身 deadline 到期 → 哨兵 abort → true
    await sleep(60)
    expect(g.isTimeoutAbort()).toBe(true)
    expect(g.signal.reason).toBe(TOOL_TIMEOUT_ABORT_REASON)
    // 不二 firing：二次到期语义幂等（controller 一次性）
    expect(g.isTimeoutAbort()).toBe(true)
    g.dispose()
    g2.dispose()
  })
})

describe('0.1.104 补格：guard 语义 + 钉⑥ 转后台 disarm + 格 10 wire 零 diff', () => {
  test('disarm：deadline 到期前解除 → 永不 abort', async () => {
    const { createToolTimeoutGuard } = await import(
      '../../src/engine/pipeline/toolTimeout'
    )
    const g = createToolTimeoutGuard({ timeoutMs: 40 })
    g.disarm()
    await sleep(120)
    expect(g.signal.aborted).toBe(false)
    expect(g.isTimeoutAbort()).toBe(false)
  })

  test('格 2a 预执行零预算：权限门 deny 早退 → tool.call 不发生（guard 未及 arm 面）', async () => {
    let called = false
    const tool = {
      name: 'Denied',
      timeoutMs: 50,
      isConcurrencySafe: () => false,
      call: async () => {
        called = true
        return { data: 'ok' }
      },
      mapToolResultToToolResultBlockParam: (c: unknown, id: string) => ({
        type: 'tool_result',
        tool_use_id: id,
        content: String(c),
      }),
    } as unknown as Tool
    const r = await executeToolUse(tu('g2a', 'Denied'), ASSISTANT, {
      tools: [tool],
      checkPermission: async () => ({ allowed: false, reason: 'nope' }),
    })
    expect(r.isError).toBe(true)
    expect(String(r.block?.content)).toContain('permission denied')
    expect(called).toBe(false)
  })

  test('钉⑥：MCP 工具转后台 → disarm deadline，不产 TOOL_TIMEOUT（backgrounded 早返块）', async () => {
    const { tool } = fakeTool({ name: 'mcp__slow', timeoutMs: 50, callMs: 300, isMcp: true })
    const backgrounded: Array<{ outcome: { ok: boolean } }> = []
    const r = await executeToolUse(tu('n6', 'mcp__slow'), ASSISTANT, {
      tools: [tool],
      mcpAutoBackgroundMs: 10,
      onMcpToolBackgrounded: (info: unknown) => {
        backgrounded.push(info as { outcome: { ok: boolean } })
      },
    })
    // 早返面：backgrounded 非	error 块（deadline 10ms 已 disarm——50ms 预算不再生效）
    expect(r.isError).toBe(false)
    expect(String(r.block?.content)).not.toContain('TOOL_TIMEOUT')
    expect(String(r.block?.content)).toContain('still running')
    // 后台 continuation：工具 300ms 完成（未被 50ms deadline 杀死 = disarm 生效）
    // → 真终态经 onBackgrounded 送达（ok 面）
    await sleep(500)
    expect(backgrounded.length).toBe(1)
    expect(backgrounded[0]!.outcome.ok).toBe(true)
  })

  test('格 10：timeoutMs 不入 LLM schema——WebFetch/WebSearch inputJSONSchema 零键', async () => {
    const { WebFetchTool } = await import('../../src/engine/tools/web/webFetchTool')
    const { WebSearchTool } = await import('../../src/engine/tools/web/webSearchTool')
    // 声明在场（首批 2 件）
    expect(WebFetchTool.timeoutMs).toBe(90_000)
    expect(WebSearchTool.timeoutMs).toBe(30_000)
    // wire 面：inputJSONSchema 字符串不含 timeoutMs（schema 零 diff）
    expect(JSON.stringify(WebFetchTool.inputJSONSchema)).not.toContain('timeoutMs')
    expect(JSON.stringify(WebSearchTool.inputJSONSchema)).not.toContain('timeoutMs')
    expect(JSON.stringify(WebFetchTool.inputSchema)).not.toContain('timeoutMs')
    expect(JSON.stringify(WebSearchTool.inputSchema)).not.toContain('timeoutMs')
  })
})
