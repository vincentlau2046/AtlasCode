/**
 * 0.1.82 K3-A1 判别单测：钩子执行 12 并发上限（上游 CC 2.1.302 对齐）。
 *
 * 红基线 = 8404fd0：engine runHooksStream 对全部 matched 钩子无界立即启动
 * （streaming.ts `matched.map((m) => runOneHook(...))`）→ 13 钩子峰值并发 = 13 红。
 * 修后：启动侧有界池（≤ MAX_HOOK_CONCURRENCY=12），每完成一钩子补位一个；
 * yield 仍取确定性 match 序（§8.40 裁定 4 不变，13 钩子时延差下回归锁定）。
 *
 * runHooks 顺序面天然 ≤1 并发不受本件影响（不改，落码裁定记录）。
 * 分层纪律：零磁盘（假 HookShellPort 纯内存 + 注入端口，同 hooks-stream.test.ts 口径）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  setHookConfigProvider,
  resetHookConfigProvider,
  setHookShellPort,
  resetHookShellPort,
  runHooksStream,
  type HookEvent,
  type HookInput,
  type HookMatcher,
  type HookShellExecution,
  type HookShellPort,
} from '../../src/hooks'

/** 门控端口：记录 start/end 事件 + 在跑峰值；每钩子 10ms 时延让启动交错可见。 */
class GatedShell implements HookShellPort {
  events: string[] = []
  inFlight = 0
  peak = 0
  async runCommand(
    command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    _timeoutMs?: number,
  ): Promise<HookShellExecution> {
    this.inFlight++
    this.peak = Math.max(this.peak, this.inFlight)
    this.events.push(`start:${command}`)
    await new Promise((r) => setTimeout(r, 10))
    this.events.push(`end:${command}`)
    this.inFlight--
    return { stdout: '', stderr: '', code: 0 }
  }
}

function injectPreToolMatchers(commands: string[]): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event: HookEvent) =>
      event === 'PreToolUse'
        ? commands.map(
            (command): HookMatcher => ({
              matcher: 'echo',
              hooks: [{ type: 'command', command }],
            }),
          )
        : [],
  })
}

function makeInput(event: HookEvent, extra: Record<string, unknown> = {}): HookInput {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript-test-session.jsonl',
    cwd: '/tmp/proj',
    hook_event_name: event,
    ...extra,
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

/** 13 个命令钩子（> 12 上限，第 13 个必须排队）。 */
const THIRTEEN_HOOKS = Array.from(
  { length: 13 },
  (_, i) => `hook-${String(i + 1).padStart(2, '0')}`,
)

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

describe('K3-A1 钩子并发上限（12；红基线 8404fd0 无界 13 并发）', () => {
  test('① 峰值并发 ≤ 12（13 钩子门控端口判别；修前 13 红）', async () => {
    const port = new GatedShell()
    setHookShellPort(port)
    injectPreToolMatchers(THIRTEEN_HOOKS)

    const results: string[] = []
    for await (const yieldValue of runHooksStream(
      'PreToolUse',
      makeInput('PreToolUse', { tool_name: 'echo' }),
    )) {
      if (yieldValue.kind === 'hook_result') {
        results.push(yieldValue.result.command)
      }
    }

    // 全部 13 个钩子都执行
    expect(port.events.filter((e) => e.startsWith('start:'))).toHaveLength(13)
    expect(results).toHaveLength(13)
    // 判别：在跑峰值不超过 12（修前无界启动 → peak = 13 → 红）
    expect(port.peak).toBeLessThanOrEqual(12)
  })

  test('② 第 13 个钩子排队：start 晚于首钩子 end（修前 13 个全先启动 → 红）', async () => {
    const port = new GatedShell()
    setHookShellPort(port)
    injectPreToolMatchers(THIRTEEN_HOOKS)

    for await (const _ of runHooksStream(
      'PreToolUse',
      makeInput('PreToolUse', { tool_name: 'echo' }),
    )) {
      // 只消费
    }

    // 有界池：第 13 个仅在槽位释放（首钩子完成）后启动
    expect(port.events.indexOf('start:hook-13')).toBeGreaterThan(
      port.events.indexOf('end:hook-01'),
    )
  })

  test('③ match 序 yield 不因上限回归（13 钩子、首钩子最慢，result 仍 match 序）', async () => {
    // 时延差端口：hook-01（match 首）30ms，其余 5ms。若上限化实现退化为
    // completion-order，快钩先完成先 yield → results[0] ≠ hook-01 → 红。
    class DelayedShell implements HookShellPort {
      async runCommand(
        command: string,
        _env: Record<string, string>,
        _signal: AbortSignal,
        _timeoutMs?: number,
      ): Promise<HookShellExecution> {
        const delay = command === 'hook-01' ? 30 : 5
        await new Promise((r) => setTimeout(r, delay))
        return { stdout: '', stderr: '', code: 0 }
      }
    }
    const port = new DelayedShell()
    setHookShellPort(port)
    injectPreToolMatchers(THIRTEEN_HOOKS)

    const results: string[] = []
    for await (const yieldValue of runHooksStream(
      'PreToolUse',
      makeInput('PreToolUse', { tool_name: 'echo' }),
    )) {
      if (yieldValue.kind === 'hook_result') {
        results.push(yieldValue.result.command)
      }
    }

    expect(results).toEqual(THIRTEEN_HOOKS)
  })
})
