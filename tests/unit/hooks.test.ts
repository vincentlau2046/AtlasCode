/**
 * hooks 域薄骨架 unit 测试（C-Deep 切片 3 T7 · 零磁盘）
 *
 * §8.16 T7 口径：unit 零磁盘走注入假 port（假 HookShellPort 返 canned
 * {stdout,stderr,code}）+ 注入 config-provider（固定 matcher 集）+ 注入
 * bootstrap-env（固定 isNonInteractive/hasTrustAccepted），断言 5 高频执行器
 * 聚合面（trust 跳过 / 匹配 / JSON 解释 / exit-2 阻塞 / 最严权限 /
 * additionalContext 聚合）+ H6⑥ 斩断 fail-fast（shell/task 边未注入抛错）。
 *
 * 分层纪律：零磁盘（假 port 纯内存 canned 返回，不 spawn / 不 fs）。真 shell /
 * 真 chokidar 归 engine 波，func 层不验（§8.16「func 真盘面 = 无」）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  setHookConfigProvider,
  resetHookConfigProvider,
  setHookShellPort,
  resetHookShellPort,
  getHookShellPort,
  setHookOutputCaptureFactory,
  getHookOutputCapture,
  setCreateHookOutput,
  createHookOutput,
  resetTaskEdges,
  runPreToolUseHooks,
  runPostToolUseHooks,
  runSessionStartHooks,
  runStopHooks,
  runSessionEndHooks,
  type HookShellPort,
  type HookShellExecution,
  type HookMatcher,
  type AggregatedHookResult,
} from '../../src/hooks'

/** 假 shell 端口：记录调用 + 按序返 canned 结果（纯内存，零磁盘）。 */
class FakeHookShell implements HookShellPort {
  calls: Array<{ command: string; timeoutMs?: number }> = []
  private queue: HookShellExecution[] = []
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  async runCommand(
    command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    timeoutMs?: number,
  ): Promise<HookShellExecution> {
    this.calls.push({ command, timeoutMs })
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
    getTranscriptPath: id => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => 'main',
    isNonInteractive: () => opts.nonInteractive ?? true,
    hasTrustAccepted: () => opts.trustAccepted ?? true,
  })
}

function injectMatchers(map: Partial<Record<string, HookMatcher[]>>): void {
  setHookConfigProvider({
    getHookMatchersForEvent: event => map[event] ?? [],
  })
}

beforeEach(() => {
  injectBootstrap()
  resetHookConfigProvider()
  resetHookShellPort()
  resetTaskEdges()
})
afterEach(() => {
  resetHooksBootstrapEnv()
  resetHookConfigProvider()
  resetHookShellPort()
  resetTaskEdges()
})

describe('hooks 信任门（shouldSkipHookDueToTrust）', () => {
  test('非交互 + 有配置钩子 → 执行（信任隐式）', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: 'ok', stderr: '', code: 0 })
    setHookShellPort(port)
    injectMatchers({ SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] })

    const res = await runSessionStartHooks('startup')
    expect(port.calls.length).toBe(1)
    expect(res.results.length).toBe(1)
  })

  test('交互 + 缺信任 → 全跳过（不执行任何钩子，不触碰 port）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({ SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] })
    injectBootstrap({ nonInteractive: false, trustAccepted: false })

    const res = await runSessionStartHooks('startup')
    expect(res.results.length).toBe(0)
    expect(port.calls.length).toBe(0) // 信任门早退，port 未被调用
  })

  test('交互 + 有信任 → 执行', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: '', stderr: '', code: 0 })
    setHookShellPort(port)
    injectMatchers({ Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] })
    injectBootstrap({ nonInteractive: false, trustAccepted: true })

    const res = await runStopHooks()
    expect(res.results.length).toBe(1)
  })
})

describe('hooks 匹配（getMatchingHooks）', () => {
  test('tool_name → matchQuery：matcher 命中才执行', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: '', stderr: '', code: 0 })
    setHookShellPort(port)
    injectMatchers({
      PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'lint' }] }],
    })

    // toolName 'Write' 命中 matcher 'Write'
    await runPreToolUseHooks('Write', { file_path: '/a' }, 'tu1')
    expect(port.calls.length).toBe(1)

    // toolName 'Read' 不命中 matcher 'Write' → 不执行
    await runPreToolUseHooks('Read', { file_path: '/a' }, 'tu2')
    expect(port.calls.length).toBe(1) // 仍是 1（第二次未执行）
  })

  test('未注入 config-provider → 无钩子（空结果，不触碰 port）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    // 不 injectMatchers（resetHookConfigProvider 已在 beforeEach）
    const res = await runPostToolUseHooks('Bash', { cmd: 'ls' }, 'out', 'tu1')
    expect(res.results.length).toBe(0)
    expect(port.calls.length).toBe(0)
  })
})

describe('hooks JSON 输出解释 + 聚合', () => {
  test('decision:block → blockingError + permissionBehavior deny', async () => {
    const port = new FakeHookShell()
    port.enqueue({
      stdout: JSON.stringify({ decision: 'block', reason: 'no way' }),
      stderr: '',
      code: 0,
    })
    setHookShellPort(port)
    injectMatchers({ PreToolUse: [{ hooks: [{ type: 'command', command: 'guard' }] }] })

    const res = await runPreToolUseHooks('Bash', { command: 'rm -rf /' }, 'tu1')
    expect(res.permissionBehavior).toBe('deny')
    expect(res.blockingError?.blockingError).toBe('no way')
    expect(res.results[0].succeeded).toBe(true) // exit 0
  })

  test('hookSpecificOutput.permissionDecision:deny → deny + 专属 reason', async () => {
    const port = new FakeHookShell()
    port.enqueue({
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'sensitive',
        },
      }),
      stderr: '',
      code: 0,
    })
    setHookShellPort(port)
    injectMatchers({ PreToolUse: [{ hooks: [{ type: 'command', command: 'guard' }] }] })

    const res = await runPreToolUseHooks('Bash', { command: 'x' }, 'tu1')
    expect(res.permissionBehavior).toBe('deny')
    expect(res.blockingError?.blockingError).toBe('sensitive')
  })

  test('additionalContext 多钩子聚合（\\n 连接）', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: JSON.stringify({ additionalContext: 'ctx-1' }), stderr: '', code: 0 })
    port.enqueue({ stdout: JSON.stringify({ additionalContext: 'ctx-2' }), stderr: '', code: 0 })
    setHookShellPort(port)
    injectMatchers({
      SessionStart: [
        { hooks: [{ type: 'command', command: 'a' }, { type: 'command', command: 'b' }] },
      ],
    })

    const res = await runSessionStartHooks('startup')
    expect(res.additionalContext).toBe('ctx-1\nctx-2')
  })

  test('最严权限聚合：一 allow 一 deny → 聚合 deny', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: JSON.stringify({ decision: 'approve' }), stderr: '', code: 0 })
    port.enqueue({ stdout: JSON.stringify({ decision: 'block' }), stderr: '', code: 0 })
    setHookShellPort(port)
    injectMatchers({
      PreToolUse: [
        {
          hooks: [
            { type: 'command', command: 'allow-h' },
            { type: 'command', command: 'deny-h' },
          ],
        },
      ],
    })

    const res = await runPreToolUseHooks('Bash', { command: 'x' }, 'tu1')
    expect(res.permissionBehavior).toBe('deny')
  })

  test('exit code 2 → stderr 阻塞错误', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: '', stderr: 'manual block', code: 2 })
    setHookShellPort(port)
    injectMatchers({ Stop: [{ hooks: [{ type: 'command', command: 'stop-guard' }] }] })

    const res = await runStopHooks()
    expect(res.results[0].blockingError?.blockingError).toBe('[stop-guard]: manual block')
    expect(res.blockingError?.blockingError).toBe('[stop-guard]: manual block')
  })

  test('continue:false + stopReason → preventContinuation', async () => {
    const port = new FakeHookShell()
    port.enqueue({
      stdout: JSON.stringify({ continue: false, stopReason: 'done' }),
      stderr: '',
      code: 0,
    })
    setHookShellPort(port)
    injectMatchers({ Stop: [{ hooks: [{ type: 'command', command: 's' }] }] })

    const res = await runStopHooks()
    expect(res.preventContinuation).toBe(true)
    expect(res.stopReason).toBe('done')
  })
})

describe('5 高频执行器事件映射', () => {
  test('各执行器请求对应事件 + SessionEnd 短超时档', async () => {
    const seen: string[] = []
    setHookConfigProvider({
      getHookMatchersForEvent: event => {
        seen.push(event)
        return []
      },
    })
    const port = new FakeHookShell()
    setHookShellPort(port)

    await runPreToolUseHooks('Bash', {}, 'tu1')
    await runPostToolUseHooks('Bash', {}, 'out', 'tu1')
    await runSessionStartHooks('startup')
    await runStopHooks()
    const endRes: AggregatedHookResult = await runSessionEndHooks('clear')

    expect(seen).toEqual([
      'PreToolUse',
      'PostToolUse',
      'SessionStart',
      'Stop',
      'SessionEnd',
    ])
    // SessionEnd 走短超时档（1500ms 默认，未显式传 timeoutMs）
    expect(endRes.results.length).toBe(0)
  })
})

describe('H6⑥ 斩断 fail-fast（注入端口未注入抛错）', () => {
  test('getHookShellPort 未注入 → 抛错', () => {
    // resetHookShellPort 已在 beforeEach
    expect(() => getHookShellPort()).toThrow()
  })

  test('getHookOutputCapture 未注入 → 抛错（task 边①）', () => {
    expect(() => getHookOutputCapture('t1')).toThrow()
  })

  test('createHookOutput 未注入 → 抛错（task 边②）', () => {
    expect(() => createHookOutput('hook_123')).toThrow()
  })

  test('注入后不抛错（set/get 闭环）', () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    expect(() => getHookShellPort()).not.toThrow()

    setHookOutputCaptureFactory(() => ({
      getStdout: async () => '',
      getStderr: () => '',
      cleanup: () => {},
    }))
    expect(() => getHookOutputCapture('t1')).not.toThrow()

    setCreateHookOutput(() => ({ marker: true }))
    expect(createHookOutput('hook_1')).toEqual({ marker: true })
  })

  test('配了钩子却未注入 shell 端口 → runHooks 抛错（fail-fast 不误伤常态）', async () => {
    injectMatchers({ Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] })
    // 不 setHookShellPort（resetHookShellPort 已清）
    await expect(runStopHooks()).rejects.toThrow()
  })
})
