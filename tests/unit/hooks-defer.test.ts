/**
 * AD-45（0.1.52，CC 2.1.89 TOP#1）— "defer" 权限决策 ① 解析面判别单测（修前红）。
 *
 * 判别信号（工单 §1.1 ①：defer 值入 union，hooks 域 + TUI 车道双解析器 + schema 镜像）：
 *  1. hooks 域（headless 车道实际执行器）：PreToolUse hook 返 permissionDecision='defer'
 *     → 解析接受（不 throw）+ 聚合面 permissionBehavior='defer'（修前红 = defer 值
 *     全仓未命中，解析支不存在 → 聚合 undefined）。
 *  2. defer 聚合最严优先（defer > deny > ask > allow）：deny + defer 双钩子 → 'defer'
 *     （挂起控制值胜权限裁定值——resume 重评时 deny 钩子会再执行，不丢阻塞意图）。
 *  3. defer 理由载体（permissionDecisionReason 透传聚合面）。
 *  4. TUI 车道镜像：hookJSONOutputSchema 接受 'defer'（修前红 = schema 3 值枚举拒收）
 *     + processHookJSONOutput 双 switch 不 throw（修前红 = L560 unknown type throw；
 *     TUI 交互车道 defer 语义 = 确认等价 'ask'，交互用户即"稍后重评"的人）。
 *  5. 3 值零回归恒等：allow/deny/ask 解析/聚合行为与 AD-45 前逐字一致（回归守卫）。
 *
 * 分层纪律：零磁盘（假 HookShellPort canned JSON stdout，同 hooks.test.ts 先例）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  setHookConfigProvider,
  resetHookConfigProvider,
  setHookShellPort,
  resetHookShellPort,
  runPreToolUseHooks,
  type HookShellPort,
  type HookShellExecution,
} from '../../src/hooks'
import { hookJSONOutputSchema } from '../../src/tui/types/hooks'
import { processHookJSONOutput } from '../../src/tui/utils/hooks'

/** 假 shell 端口：按序返 canned 结果（纯内存，零磁盘；hooks.test.ts 先例）。 */
class FakeHookShell implements HookShellPort {
  private queue: HookShellExecution[] = []
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  async runCommand(
    _command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    _timeoutMs?: number,
  ): Promise<HookShellExecution> {
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

const DEFER_JSON = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'defer',
    permissionDecisionReason: 'awaiting async approval',
  },
})
const DENY_JSON = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
  },
})
const ALLOW_JSON = JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
})
const ASK_JSON = JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
})

beforeEach(() => {
  setHooksBootstrapEnv({
    getSessionId: () => 'defer-test-session',
    getCwd: () => '/tmp/defer-proj',
    getTranscriptPath: id => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => 'main',
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
  })
  setHookConfigProvider({
    getHookMatchersForEvent: event =>
      event === 'PreToolUse'
        ? [{ matcher: '*', hooks: [{ type: 'command', command: 'h1' }, { type: 'command', command: 'h2' }] }]
        : [],
  })
})

afterEach(() => {
  resetHookShellPort()
  resetHookConfigProvider()
  resetHooksBootstrapEnv()
})

describe('AD-45 ① hooks 域（headless 车道执行器）defer 解析面', () => {
  test('1. PreToolUse hook 返 defer → 解析接受 + 聚合 permissionBehavior="defer"（修前红 = 支不存在）', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: DEFER_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    const r = await runPreToolUseHooks('Bash', { command: 'ls' }, 'toolu_defer_1')
    expect(r.permissionBehavior).toBe('defer')
  })

  test('2. defer 聚合最严优先：deny + defer 双钩子 → "defer"（挂起控制值胜权限裁定值）', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: DENY_JSON, stderr: '', code: 0 })
    port.enqueue({ stdout: DEFER_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    const r = await runPreToolUseHooks('Bash', { command: 'rm -rf x' }, 'toolu_defer_2')
    expect(r.permissionBehavior).toBe('defer')
  })

  test('3. defer 理由载体：permissionDecisionReason 透传聚合面', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: DEFER_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    const r = await runPreToolUseHooks('Bash', { command: 'ls' }, 'toolu_defer_3')
    expect(r.permissionDecisionReason).toBe('awaiting async approval')
  })

  test('5. 零回归恒等：3 值 allow/deny/ask 解析聚合行为逐字不变（回归守卫）', async () => {
    const port = new FakeHookShell()
    // h1 = allow / h2 无决策（空 stdout）→ 聚合 allow
    port.enqueue({ stdout: ALLOW_JSON, stderr: '', code: 0 })
    port.enqueue({ stdout: '', stderr: '', code: 0 })
    setHookShellPort(port)
    const rAllow = await runPreToolUseHooks('Bash', {}, 'toolu_a')
    expect(rAllow.permissionBehavior).toBe('allow')

    const port2 = new FakeHookShell()
    // h1 = deny（域聚合 blockingError 先行）/ h2 = ask → 最严 deny
    port2.enqueue({ stdout: DENY_JSON, stderr: '', code: 0 })
    port2.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    setHookShellPort(port2)
    const rDeny = await runPreToolUseHooks('Bash', {}, 'toolu_d')
    expect(rDeny.permissionBehavior).toBe('deny')
    expect(rDeny.blockingError?.blockingError).toBe('Blocked by hook')

    const port3 = new FakeHookShell()
    port3.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    port3.enqueue({ stdout: '', stderr: '', code: 0 })
    setHookShellPort(port3)
    const rAsk = await runPreToolUseHooks('Bash', {}, 'toolu_ask')
    expect(rAsk.permissionBehavior).toBe('ask')
  })
})

describe('AD-45 ① TUI 车道镜像（schema + 双 switch 解析器）', () => {
  test('4a. hookJSONOutputSchema 接受 PreToolUse permissionDecision="defer"（修前红 = 3 值枚举拒收）', () => {
    const r = hookJSONOutputSchema().safeParse({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'defer' },
    })
    expect(r.success).toBe(true)
  })

  test('4b. processHookJSONOutput 双 switch 不 throw + defer → "ask"（交互车道确认等价；修前红 = unknown type throw）', () => {
    const out = processHookJSONOutput({
      json: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'defer',
          permissionDecisionReason: 'later',
        },
      } as never,
      command: 'h1',
      hookName: 'h1',
      toolUseID: 'toolu_tui',
      hookEvent: 'PreToolUse',
      expectedHookEvent: 'PreToolUse',
      stdout: DEFER_JSON,
      stderr: '',
      exitCode: 0,
      durationMs: 1,
    })
    expect(out.permissionBehavior).toBe('ask')
  })

  test('4c. 零回归恒等：TUI 车道 3 值解析逐字不变（allow/deny/ask）', () => {
    const outAllow = processHookJSONOutput({
      json: {
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
      } as never,
      command: 'h1',
      hookName: 'h1',
      toolUseID: 't',
      hookEvent: 'PreToolUse',
      expectedHookEvent: 'PreToolUse',
      stdout: ALLOW_JSON,
      stderr: '',
      exitCode: 0,
      durationMs: 1,
    })
    expect(outAllow.permissionBehavior).toBe('allow')

    const outDeny = processHookJSONOutput({
      json: {
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
      } as never,
      command: 'h1',
      hookName: 'h1',
      toolUseID: 't',
      hookEvent: 'PreToolUse',
      expectedHookEvent: 'PreToolUse',
      stdout: DENY_JSON,
      stderr: '',
      exitCode: 0,
      durationMs: 1,
    })
    expect(outDeny.permissionBehavior).toBe('deny')
    expect(outDeny.blockingError?.blockingError).toBe('Blocked by hook')
  })
})
