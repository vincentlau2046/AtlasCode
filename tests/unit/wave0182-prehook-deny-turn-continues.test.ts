/**
 * 0.1.82 K3-B5-1 判别固化（test-only 关账）：managed/普通 PreToolUse 钩子
 * 拒调用**不结束回合**（上游 296 修后语义）。
 *
 * 判别结论（零码关账，行为已在场）：
 *  - hooks 域聚合（runHooks.ts:129）：PreToolUse `continue:false` →
 *    preventContinuation；exit-2 / JSON block / permissionDecision deny →
 *    blockingError。两支在 pipeline executeToolUse（toolExecution.ts:384/399）
 *    均短路为 is_error tool_result 回喂 LLM——**返回值无任何向上终止字段**
 *    （preventContinuation 仅存于入参 PreToolUseHookOutcome；grep 证实
 *    toolOrchestration/loop 对工具执行结果无 preventContinuation 消费面）。
 *  - 即：钩子拒该 tool call（工具不执行 + 拒绝原因回喂）后，loop 继续
 *    下一轮（LLM 收到 `<tool_use_error>` 可调整动作）= 上游 296 修后
 *    语义已在场；§8.42 MAJOR-1 只是把 continue:false 的「终止意图」定名
 *    为「短路工具执行」，非终止回合。
 *  - managed 面不另立支：policy hooks 经 hooksConfig 四态门控合入同一
 *    runPreToolUseHooks 聚合链（hook_source 遥测面区分），语义统一。
 *
 * 本文件锁 ⑯（engine-hooks.test.ts）未锁的另一半：**回合继续**——
 *  ① 全链判别：PreToolUse continue:false 拒调用 → loop 跑满 2 轮
 *     （拒调用轮 + LLM 收错误后的收尾轮），terminated=true；
 *  ② 全链判别：exit-2 deny（blockingError 支）→ 同上；
 *  ③ executeToolUse 返回值形状：两支 deny 的结果无 turn 终止通道
 *     （防未来误加向上终止字段时静默改语义）。
 *
 * 分层纪律：unit 零磁盘（FakeHookShell 纯内存 canned 返回 + 注入
 * bootstrap-env / config provider，同 engine-hooks.test.ts 口径）；
 * LLM 经 queuedProvider 接口替身。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  createLoopHooks,
  executeToolUse,
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

// ── 夹具（同 engine-hooks.test.ts 口径）────────────────────────────────────
const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

function makeEchoTool(calls: unknown[] = []): Tool {
  return {
    name: 'echo',
    call: async (args: unknown) => {
      calls.push(args)
      return { data: `echo:${(args as { msg?: string })?.msg}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

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
    getSessionId: () => 'wave0182-b51-session',
    getCwd: () => '/tmp/proj',
    getTranscriptPath: (id) => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => undefined,
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
  })
}

function injectPreToolUseHook(): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event) =>
      event === 'PreToolUse'
        ? [{ matcher: 'echo', hooks: [{ type: 'command', command: 'pre-guard' }] }]
        : [],
  })
}

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

const ECHO_TURN = {
  content: [{ type: 'tool_use', id: 'tu-1', name: 'echo', input: { msg: 'hi' } }],
  stopReason: 'tool_calls',
}
const TEXT_TURN = { content: [{ type: 'text', text: 'adjusted after denial' }], stopReason: 'end_turn' }

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

describe('K3-B5-1 PreToolUse 钩子拒调用不结束回合（上游 296 修后语义固化）', () => {
  test('① continue:false 拒调用 → 回合继续（loop 跑满 2 轮，工具未执行）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolUseHook()
    port.enqueue({ stdout: '{"continue":false,"stopReason":"halt"}', stderr: '', code: 0 })

    const toolCalls: unknown[] = []
    const deps = {
      modelProvider: queuedProvider([ECHO_TURN, TEXT_TURN]),
      role: 'small' as const,
      hooks: createLoopHooks(),
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [makeEchoTool(toolCalls)],
    })

    // 拒调用轮 + LLM 收错误后的收尾轮 = 2 轮（若 deny 终止回合则 turns=1）
    expect(r.turns).toBe(2)
    expect(r.terminated).toBe(true)
    expect(toolCalls).toHaveLength(0) // 工具未执行
    expect(port.calls.map((c) => c.command)).toEqual(['pre-guard'])
  })

  test('② exit-2 deny（blockingError 支）→ 回合继续（loop 跑满 2 轮，工具未执行）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolUseHook()
    port.enqueue({ stdout: 'denied by policy', stderr: '', code: 2 })

    const toolCalls: unknown[] = []
    const deps = {
      modelProvider: queuedProvider([ECHO_TURN, TEXT_TURN]),
      role: 'small' as const,
      hooks: createLoopHooks(),
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [makeEchoTool(toolCalls)],
    })

    expect(r.turns).toBe(2)
    expect(r.terminated).toBe(true)
    expect(toolCalls).toHaveLength(0)
  })

  test('③ executeToolUse 返回值形状：两支 deny 均无 turn 终止通道', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolUseHook()

    // continue:false 支
    port.enqueue({ stdout: '{"continue":false}', stderr: '', code: 0 })
    const r1 = await executeToolUse(tu('t1', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeEchoTool()],
      hooks: createLoopHooks().toolHooks,
    })
    expect(r1.isError).toBe(true)
    // 返回值不得携带任何向上终止字段（preventContinuation 仅属入参 outcome）
    expect(r1).not.toHaveProperty('preventContinuation')
    expect(r1).not.toHaveProperty('stopTurn')

    // exit-2 / blockingError 支
    port.enqueue({ stdout: 'denied', stderr: '', code: 2 })
    const r2 = await executeToolUse(tu('t2', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeEchoTool()],
      hooks: createLoopHooks().toolHooks,
    })
    expect(r2.isError).toBe(true)
    expect(r2).not.toHaveProperty('preventContinuation')
    expect(r2).not.toHaveProperty('stopTurn')
  })
})
