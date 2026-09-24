/**
 * engine/hooks L3 连接器 + pipeline 钩子消费支 契约测试（E-5 S-5a，§8.39 判别信号）
 *
 * 被测能力 = settings.hooks 生产链真生效（非 tautology）：
 *  - createToolHooks 适配器（hooks 域真执行器 runPreToolUseHooks/runPostToolUseHooks
 *    + 假 shell 端口 canned 返回 + 假 config provider）→ pipeline executeToolUse 消费支
 *    （blockingError 短路 / updatedInput 回写 / hookBehavior 合权限门）
 *  - mergeHookPermission 纯函数矩阵（不变量：hook 'allow' 不绕过 settings deny/ask）
 *  - queryAgentLoop stop hooks 消费点（preventContinuation → 续跑）
 *
 * 分层纪律：unit 零磁盘（假 HookShellPort 纯内存 canned 返回 + 注入 bootstrap-env /
 * config provider，同 hooks.test.ts 口径）；LLM 仅 loop 测试经 ModelProvider 接口替身。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  createLoopHooks,
  createToolHooks,
  executeToolUse,
  mergeHookPermission,
  queryAgentLoop,
  type Tool,
} from '../../src/engine'
import type { ModelProvider } from '../../src/modelprovider'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'
import {
  resetHookConfigProvider,
  resetHookShellPort,
  setHookConfigProvider,
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  setHookShellPort,
  type HookShellExecution,
  type HookShellPort,
} from '../../src/hooks'

// ── 夹具（同 hooks.test.ts / engine-pipeline.test.ts 口径）─────────────────
const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

/** fake tool：记录 call 实参（updatedInput 回写判别信号消费点）。 */
function makeRecordingTool(name: string, calls: unknown[]): Tool {
  return {
    name,
    call: async (input: unknown) => {
      calls.push(input)
      return { data: `result:${name}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

/** 假 shell 端口：记录调用 + 按序返 canned 结果（纯内存，零磁盘）。 */
class FakeHookShell implements HookShellPort {
  calls: Array<{ command: string }> = []
  private queue: HookShellExecution[] = []
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  async runCommand(
    command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    _timeoutMs?: number,
  ): Promise<HookShellExecution> {
    this.calls.push({ command })
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

function injectBootstrap(): void {
  setHooksBootstrapEnv({
    getSessionId: () => 'test-session',
    getCwd: () => '/tmp/proj',
    getTranscriptPath: (id) => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => undefined,
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
  })
}

function injectMatchers(map: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event) => map[event] ?? [],
  })
}

beforeEach(() => {
  injectBootstrap()
  resetHookConfigProvider()
  resetHookShellPort()
})
afterEach(() => {
  resetHooksBootstrapEnv()
  resetHookConfigProvider()
  resetHookShellPort()
})

/** 配 PreToolUse 钩子（tool_name 匹配）+ 假端口，返回端口（enqueue canned 结果用）。 */
function setupPreToolHook(command = 'guard'): FakeHookShell {
  const port = new FakeHookShell()
  setHookShellPort(port)
  injectMatchers({
    PreToolUse: [{ matcher: 'echo', hooks: [{ type: 'command', command }] }],
  })
  return port
}

describe('engine/pipeline 钩子消费支（C-6：消费 AggregatedHookResult，非 fire-and-forget）', () => {
  test('① pre-hook blockingError（permissionDecision deny）→ tool_result is_error（工具不执行）', async () => {
    const port = setupPreToolHook()
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"forbidden tool"}}',
      stderr: '',
      code: 0,
    })
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t1', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('hook blocked: forbidden tool')
    expect(calls).toHaveLength(0) // 阻塞支短路，tool.call 未执行
    expect(port.calls).toHaveLength(1) // 钩子本体真经 shell 端口执行
  })

  test('② 不变量：hook allow + settings 门 deny → 门胜（hook allow 不绕过 settings deny）', async () => {
    const port = setupPreToolHook()
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"allow"}}',
      stderr: '',
      code: 0,
    })
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t2', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: false, reason: 'settings deny rule' }),
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('permission denied: settings deny rule')
    expect(calls).toHaveLength(0)
  })

  test('③ hook allow + 门放行 → 执行（hook 权限裁定合流后不翻案）', async () => {
    const port = setupPreToolHook()
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"allow"}}',
      stderr: '',
      code: 0,
    })
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t3', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(r.isError).toBe(false)
    expect(calls).toHaveLength(1)
  })

  test('④ updatedInput 回写：权限门 + tool.call 均消费钩子改写后入参（last wins 语义透传）', async () => {
    const port = setupPreToolHook()
    port.enqueue({
      stdout: '{"updatedInput":{"msg":"rewritten"}}',
      stderr: '',
      code: 0,
    })
    const calls: unknown[] = []
    let gateInput: unknown = 'unset'
    const r = await executeToolUse(tu('t4', 'echo', { msg: 'orig' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
      checkPermission: async (_t, input) => {
        gateInput = input
        return { allowed: true }
      },
    })
    expect(r.isError).toBe(false)
    expect(gateInput).toEqual({ msg: 'rewritten' }) // 门在 effective 入参上重判
    expect(calls).toEqual([{ msg: 'rewritten' }]) // call 消费 effective 入参
  })

  test('⑤ hook ask + 门放行 → fail-closed 确认标记（prompt 面残留守，同 E-4 ask 裁定）', async () => {
    const port = setupPreToolHook()
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"ask"}}',
      stderr: '',
      code: 0,
    })
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t5', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('permission confirmation required')
    expect(calls).toHaveLength(0)
  })

  test('⑥ 窄 spine 回归：未注入 hooks = 行为不变（无钩子调用、门/call 主路径）', async () => {
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t6', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
    })
    expect(r.isError).toBe(false)
    expect(calls).toEqual([{ msg: 'hi' }])
  })
})

describe('mergeHookPermission 纯函数矩阵（§8.39 C-6 不变量）', () => {
  const allow = { allowed: true }
  const denyRule = { allowed: false, reason: 'settings deny' }
  const askRule = { allowed: false, ask: true, reason: 'settings ask' }

  test('⑦ hook deny = 最严（门放行亦拒，兜底支）', () => {
    expect(mergeHookPermission('deny', allow)).toEqual({ allowed: false, reason: 'blocked by hook' })
  })

  test('⑧ hook allow 不绕过 settings deny / ask（门 verdict 原样返回）', () => {
    expect(mergeHookPermission('allow', denyRule)).toBe(denyRule)
    expect(mergeHookPermission('allow', askRule)).toBe(askRule)
  })

  test('⑨ hook allow + 门放行 → 放行；passthrough / 缺省 = 门 verdict', () => {
    expect(mergeHookPermission('allow', allow)).toBe(allow)
    expect(mergeHookPermission('passthrough', denyRule)).toBe(denyRule)
    expect(mergeHookPermission(undefined, allow)).toBe(allow)
  })

  test('⑩ hook ask：门放行 → fail-closed 确认；门已拒 → 门优先（ask 不覆盖 deny/ask 门）', () => {
    expect(mergeHookPermission('ask', allow)).toEqual({ allowed: false, ask: true, reason: 'hook requested confirmation' })
    expect(mergeHookPermission('ask', denyRule)).toBe(denyRule)
    expect(mergeHookPermission('ask', askRule)).toBe(askRule)
  })
})

// ── loop stop hooks 消费点（C-4）+ createLoopHooks 全链 ─────────────────────
function queuedProvider(rounds: Array<{ content: unknown[]; stopReason?: string }>): ModelProvider {
  let i = 0
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被 loop 消费')
  }
  const chat = async () => {
    const r = rounds[Math.min(i, rounds.length - 1)]
    i++
    return {
      type: 'assistant',
      uuid: `u-${i}`,
      timestamp: '2026-09-23T00:00:00Z',
      message: {
        id: `m-${i}`,
        model: 'fake-model',
        role: 'assistant',
        content: r.content,
        stop_reason: r.stopReason ?? 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    } as const
  }
  return {
    chat,
    chatStream: notExercised as unknown as ModelProvider['chatStream'],
    healthCheck: notExercised as unknown as ModelProvider['healthCheck'],
    countTokens: notExercised as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: notExercised as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: notExercised as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

function makeEchoTool(): Tool {
  return {
    name: 'echo',
    call: async (args: unknown) => ({ data: `echo:${(args as { msg?: string })?.msg}` }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

const ECHO_TURN = {
  content: [{ type: 'tool_use', id: 'tu-1', name: 'echo', input: { msg: 'hi' } }],
  stopReason: 'tool_calls',
}
const TEXT_TURN = { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }

describe('queryAgentLoop stop hooks 消费点（C-4：preventContinuation → 续跑）', () => {
  test('⑪ stop hooks preventContinuation=true → 阻止停止续跑（maxTurns 守卫兜底）', async () => {
    let stopCalls = 0
    const deps = {
      modelProvider: queuedProvider([ECHO_TURN, TEXT_TURN, TEXT_TURN]),
      role: 'small' as const,
      hooks: {
        stopHooks: async () => {
          stopCalls++
          return { preventContinuation: stopCalls === 1 } // 第 1 次防停，第 2 次放行
        },
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [makeEchoTool()],
    })
    expect(stopCalls).toBe(2) // 两轮 terminal（turn 2/3）各触发一次 stop hooks
    expect(r.turns).toBe(3) // 第 2 轮防停 → 续跑至第 3 轮
    expect(r.terminated).toBe(true)
  })

  test('⑫ 未注入 hooks = 窄 spine 不变（无 stop hooks，terminal 即终止）', async () => {
    const deps = {
      modelProvider: queuedProvider([ECHO_TURN, TEXT_TURN]),
      role: 'small' as const,
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [makeEchoTool()],
    })
    expect(r.turns).toBe(2)
    expect(r.terminated).toBe(true)
  })

  test('⑬ createLoopHooks 全链：loop → pipeline → hooks 域执行器 → shell 端口（pre + stop 真执行）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PreToolUse: [{ matcher: 'echo', hooks: [{ type: 'command', command: 'pre-guard' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'stop-guard' }] }],
    })
    port.enqueue({ stdout: '', stderr: '', code: 0 }) // PreToolUse 放行
    port.enqueue({ stdout: '{"continue":false,"stopReason":"not done yet"}', stderr: '', code: 0 }) // Stop 防停
    port.enqueue({ stdout: '', stderr: '', code: 0 }) // 第 2 次 Stop 放行

    const hooks = createLoopHooks()
    const deps = {
      modelProvider: queuedProvider([ECHO_TURN, TEXT_TURN, TEXT_TURN]),
      role: 'small' as const,
      hooks,
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [makeEchoTool()],
    })
    expect(port.calls.map((c) => c.command)).toEqual(['pre-guard', 'stop-guard', 'stop-guard'])
    expect(r.turns).toBe(3) // Stop 第 1 次 continue:false → 防停续跑
    expect(r.terminated).toBe(true)
  })

  test('⑭ createLoopHooks stopHooks 直接消费面：continue:false → preventContinuation true', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({ Stop: [{ hooks: [{ type: 'command', command: 'stop-guard' }] }] })
    port.enqueue({ stdout: '{"continue":false}', stderr: '', code: 0 })

    const hooks = createLoopHooks()
    expect(await hooks.stopHooks?.()).toEqual({ preventContinuation: true })
    // 队列耗尽 → 默认空输出（无 continue:false）→ 不防停
    expect(await hooks.stopHooks?.()).toEqual({ preventContinuation: undefined })
  })
})

describe('§8.42 整波审视 MAJOR-1：pre-hook turn 终止意图透传 + 短路支', () => {
  test('⑮ 适配器透传：PreToolUse continue:false + stopReason → PreToolUseHookOutcome 两字段', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PreToolUse: [{ matcher: 'echo', hooks: [{ type: 'command', command: 'stopper' }] }],
    })
    port.enqueue({
      stdout: '{"continue":false,"stopReason":"halt now"}',
      stderr: '',
      code: 0,
    })
    const hooks = createToolHooks()
    const r = await hooks.preToolUse?.(
      { name: 'echo' } as Tool,
      { msg: 'hi' },
      'tu-1',
    )
    expect(r?.preventContinuation).toBe(true)
    expect(r?.stopReason).toBe('halt now')
  })

  test('⑯ 全链短路：pre-hook 防停 → executeToolUse is_error（工具不执行，旧仓 L869 逐字消息）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PreToolUse: [{ matcher: 'echo', hooks: [{ type: 'command', command: 'stopper' }] }],
    })
    port.enqueue({
      stdout: '{"continue":false,"stopReason":"halt now"}',
      stderr: '',
      code: 0,
    })
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t1', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toBe(
      '<tool_use_error>Execution stopped by PreToolUse hook: halt now</tool_use_error>',
    )
    expect(calls).toHaveLength(0) // 工具未执行
  })

  test('⑰ 无防停钩子 → 短路支不触发（放行主路径不变）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PreToolUse: [{ matcher: 'echo', hooks: [{ type: 'command', command: 'pass' }] }],
    })
    port.enqueue({ stdout: '', stderr: '', code: 0 })
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t1', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeRecordingTool('echo', calls)],
      hooks: createToolHooks(),
    })
    expect(r.isError).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
