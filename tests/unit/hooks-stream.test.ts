/**
 * hooks 域流式执行核心 unit 测试（E-5 S-5b，§8.40 判别信号；零磁盘）
 *
 * 被测能力 = runHooksStream（旧仓 executeHooks 执行循环移植，解耦 message/attachment）：
 *  - 流式 yield 序（逐钩子 progress/result yield 先于聚合返回值；progress 先于执行）
 *  - 并发执行循环（旧仓 all() 语义：全钩子并行，总墙钟 = max 非 sum；latch 端口判别）
 *  - 字段映射（exit-2→blockingError / continue:false→preventContinuation /
 *    permissionDecision 三值 + 最严聚合 / updatedInput last-wins / additionalContext 拼接）
 *  - 守卫族 = 与 runHooks 一致（trust skip / 无匹配 → 立即空聚合，不触碰端口）
 *  - L3 门面面（engine 根 import 消费，re-export 真 —— 防 H6 死接缝）
 *
 * 分层纪律：零磁盘（假 HookShellPort 纯内存 canned 返回 + 注入 config provider +
 * bootstrap-env，同 hooks.test.ts 口径）；L3 面测试 import engine 根门面（同
 * engine-hooks.test.ts 口径）。for-await 不暴露生成器返回值（JS 语义）→ drain 助手
 * 手动 .next() 循环（yields + final 聚合返回值）。
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
  type AggregatedHookResult,
  type HookEvent,
  type HookInput,
  type HookMatcher,
  type HookShellExecution,
  type HookShellPort,
  type HookStreamYield,
} from '../../src/hooks'
import { runHooksStream as engineRunHooksStream } from '../../src/engine'

/** 流式消费助手（for-await 不暴露生成器返回值，§8.40 裁定 4）。 */
async function drain(
  gen: AsyncGenerator<HookStreamYield, AggregatedHookResult, void>,
): Promise<{ yields: HookStreamYield[]; final: AggregatedHookResult }> {
  const yields: HookStreamYield[] = []
  let r: IteratorResult<HookStreamYield, AggregatedHookResult> = await gen.next()
  while (!r.done) {
    yields.push(r.value)
    r = await gen.next()
  }
  return { yields, final: r.value }
}

/** 假 shell 端口：记录调用 + 按序返 canned 结果（纯内存，零磁盘）。 */
class FakeHookShell implements HookShellPort {
  calls: string[] = []
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
    this.calls.push(command)
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

function injectBootstrap(opts: {
  nonInteractive?: boolean
  trustAccepted?: boolean
} = {}): void {
  setHooksBootstrapEnv({
    getSessionId: () => 'test-session',
    getCwd: () => '/tmp/proj',
    getTranscriptPath: (id) => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => undefined,
    isNonInteractive: () => opts.nonInteractive ?? true,
    hasTrustAccepted: () => opts.trustAccepted ?? true,
  })
}

/** PreToolUse matcher 注入（tool_name 匹配：matcher 'echo' ⇔ hookInput.tool_name 'echo'）。 */
function injectPreToolMatchers(commands: string[]): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event) =>
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

/** Stop matcher 注入（无 matchQuery，缺省 matcher = 通配全事件）。 */
function injectStopMatchers(commands: string[]): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event) =>
      event === 'Stop'
        ? commands.map((command): HookMatcher => ({
            hooks: [{ type: 'command', command }],
          }))
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

describe('runHooksStream 流式执行核心（§8.40 判别信号）', () => {
  test('① 流式 yield 序：逐钩子 progress/result yield 先于聚合返回值（progress 先于执行；result 按 match 序）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['hook-a', 'hook-b'])
    port.enqueue({ stdout: '', stderr: '', code: 0 })
    port.enqueue({ stdout: '', stderr: '', code: 0 })

    const { yields, final } = await drain(
      runHooksStream(
        'PreToolUse',
        makeInput('PreToolUse', { tool_name: 'echo' }),
        { toolUseID: 'tu-1' },
      ),
    )
    // yield 序列 = [progress A, progress B, result A, result B]（全部先于聚合返回值）
    expect(yields.map((y) => y.kind)).toEqual([
      'hook_progress',
      'hook_progress',
      'hook_result',
      'hook_result',
    ])
    expect(yields[0]).toEqual({
      kind: 'hook_progress',
      hookEvent: 'PreToolUse',
      command: 'hook-a',
      toolUseID: 'tu-1',
    })
    expect((yields[2] as { kind: 'hook_result' }).result.command).toBe('hook-a')
    expect((yields[3] as { kind: 'hook_result' }).result.command).toBe('hook-b')
    // 聚合 = 生成器返回值（for-await 消费面）
    expect(final.results).toHaveLength(2)
    expect(port.calls).toEqual(['hook-a', 'hook-b'])
  })

  test('② 并发执行：全钩子并行（latch 端口判别；顺序变异 → 500ms 兜底后事件序红）', async () => {
    /** latch 端口：'slow' 待 'fast' 启动后才 resolve（并发 = 可解；顺序变异 = 500ms 兜底不挂套件）。 */
    class LatchShell implements HookShellPort {
      events: string[] = []
      private fastStarted: Promise<void>
      private resolveFast!: () => void
      constructor() {
        this.fastStarted = new Promise<void>((resolve) => {
          this.resolveFast = resolve
        })
      }
      async runCommand(
        command: string,
        _env: Record<string, string>,
        _signal: AbortSignal,
        _timeoutMs?: number,
      ): Promise<HookShellExecution> {
        this.events.push(`${command}:start`)
        if (command === 'fast') this.resolveFast()
        if (command === 'slow') {
          await Promise.race([
            this.fastStarted,
            new Promise((r) => setTimeout(r, 500)),
          ])
        }
        this.events.push(`${command}:end`)
        return { stdout: '', stderr: '', code: 0 }
      }
    }
    const port = new LatchShell()
    setHookShellPort(port)
    injectPreToolMatchers(['slow', 'fast'])

    const { yields } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(yields).toHaveLength(4)
    // 并发判别：fast 启动先于 slow 结束（顺序执行 = fast 在 slow 结束后才启动 → 红）
    expect(port.events.indexOf('fast:start')).toBeLessThan(port.events.indexOf('slow:end'))
  })

  test('②b match 序时延差判别（§8.42 MINOR-4）：慢首钩 + 快次钩 → result yield 仍 match 序', async () => {
    // 时延差端口：'hook-slow'（match 首）延迟 30ms，'hook-fast'（match 次）0ms。
    // 若实现退化为 completion-order（旧仓 all() 语义），快钩先完成先 yield →
    // yields[2] = hook-fast → 红。match 序实现 = 快钩完成被 await 队列挡住，
    // 首 yield 仍为 hook-slow。
    class DelayedShell implements HookShellPort {
      async runCommand(
        command: string,
        _env: Record<string, string>,
        _signal: AbortSignal,
        _timeoutMs?: number,
      ): Promise<HookShellExecution> {
        if (command === 'hook-slow') await new Promise((r) => setTimeout(r, 30))
        return { stdout: '', stderr: '', code: 0 }
      }
    }
    const port = new DelayedShell()
    setHookShellPort(port)
    injectPreToolMatchers(['hook-slow', 'hook-fast'])

    const { yields } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    const results = yields.filter((y) => y.kind === 'hook_result')
    expect((results[0] as { kind: 'hook_result' }).result.command).toBe('hook-slow')
    expect((results[1] as { kind: 'hook_result' }).result.command).toBe('hook-fast')
  })

  test('③ exit-2 → blockingError（聚合 + 单钩子结果，stderr 归因 + command 归因）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['guard'])
    port.enqueue({ stdout: '', stderr: 'denied by policy', code: 2 })

    const { final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(final.blockingError?.blockingError).toContain('denied by policy')
    expect(final.blockingError?.command).toBe('guard')
    expect(final.results[0].blockingError?.blockingError).toContain('denied by policy')
    expect(final.results[0].succeeded).toBe(false)
  })

  test('④ continue:false → preventContinuation（+stopReason）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectStopMatchers(['stop-guard'])
    port.enqueue({
      stdout: '{"continue":false,"stopReason":"more work"}',
      stderr: '',
      code: 0,
    })

    const { final } = await drain(runHooksStream('Stop', makeInput('Stop')))
    expect(final.preventContinuation).toBe(true)
    expect(final.stopReason).toBe('more work')
  })

  test('⑤a permissionDecision allow → 聚合 allow', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['guard'])
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"allow"}}',
      stderr: '',
      code: 0,
    })

    const { final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(final.permissionBehavior).toBe('allow')
  })

  test('⑤b permissionDecision deny → 聚合 deny + blockingError（reason 归因）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['guard'])
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"no"}}',
      stderr: '',
      code: 0,
    })

    const { final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(final.permissionBehavior).toBe('deny')
    expect(final.blockingError?.blockingError).toBe('no')
  })

  test('⑤c permissionDecision ask → 聚合 ask', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['guard'])
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"ask"}}',
      stderr: '',
      code: 0,
    })

    const { final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(final.permissionBehavior).toBe('ask')
  })

  test('⑤d 最严聚合：allow+deny→deny / ask+allow→ask（多钩子 permissionBehavior 优先级）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['a', 'b'])
    const input = makeInput('PreToolUse', { tool_name: 'echo' })

    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"allow"}}',
      stderr: '',
      code: 0,
    })
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"no"}}',
      stderr: '',
      code: 0,
    })
    const r1 = await drain(runHooksStream('PreToolUse', input))
    expect(r1.final.permissionBehavior).toBe('deny')

    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"ask"}}',
      stderr: '',
      code: 0,
    })
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"allow"}}',
      stderr: '',
      code: 0,
    })
    const r2 = await drain(runHooksStream('PreToolUse', input))
    expect(r2.final.permissionBehavior).toBe('ask')
  })

  test('⑥ updatedInput last-wins + additionalContext 拼接（字段映射）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['h1', 'h2'])
    port.enqueue({
      stdout: '{"updatedInput":{"msg":"v1"},"additionalContext":"ctx1"}',
      stderr: '',
      code: 0,
    })
    port.enqueue({
      stdout: '{"updatedInput":{"msg":"v2"},"additionalContext":"ctx2"}',
      stderr: '',
      code: 0,
    })

    const { final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(final.updatedInput).toEqual({ msg: 'v2' })
    expect(final.additionalContext).toBe('ctx1\nctx2')
  })

  test('⑦ 信任门（交互式缺信任）→ 立即空聚合（不触碰端口）', async () => {
    injectBootstrap({ nonInteractive: false, trustAccepted: false })
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['guard'])
    port.enqueue({ stdout: '', stderr: '', code: 0 })

    const { yields, final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(yields).toEqual([])
    expect(final.results).toEqual([])
    expect(port.calls).toEqual([])
  })

  test('⑧ 无匹配 → 立即空聚合（不触碰端口，shell 端口未注入亦不误伤）', async () => {
    // 无 config provider 注入（reset 态）→ getMatchingHooks 空
    const { yields, final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(yields).toEqual([])
    expect(final.results).toEqual([])
  })

  test('⑨ spawn 抛错 → 非阻塞错误结果（无 blockingError，聚合不污染）', async () => {
    class ThrowingShell implements HookShellPort {
      async runCommand(): Promise<HookShellExecution> {
        throw new Error('spawn ENOENT')
      }
    }
    setHookShellPort(new ThrowingShell())
    injectPreToolMatchers(['guard'])

    const { final } = await drain(
      runHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(final.results).toHaveLength(1)
    expect(final.results[0].succeeded).toBe(false)
    expect(final.results[0].stderr).toContain('spawn ENOENT')
    expect(final.blockingError).toBeUndefined()
    expect(final.preventContinuation).toBeUndefined()
  })
})

describe('L3 门面面（re-export 真，防 H6 死接缝）', () => {
  test('⑩ engine 根门面 import 消费 runHooksStream（端到端：假端口 → deny 映射）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectPreToolMatchers(['guard'])
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"nope"}}',
      stderr: '',
      code: 0,
    })

    const { yields, final } = await drain(
      engineRunHooksStream('PreToolUse', makeInput('PreToolUse', { tool_name: 'echo' })),
    )
    expect(yields).toHaveLength(2)
    expect(final.permissionBehavior).toBe('deny')
    expect(final.blockingError?.blockingError).toBe('nope')
  })
})
