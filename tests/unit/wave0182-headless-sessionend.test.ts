/**
 * 0.1.82 K3-B1 判别单测：headless（-p）退出面 SessionEnd hooks 接线
 * （上游 300 对齐——「退出时后台命令在跑，SessionEnd hooks 有时不跑」）。
 *
 * 判别结论（红基线 = 068bdec）：
 *  - TUI 退出面已覆盖：exit.tsx → gracefulShutdown → executeSessionEndHooks
 *    （tui 面，专属 1.5s 预算 + failsafe timer）——恒等锚，不在本件改；
 *  - **headless 车道缺口**：print.ts runHeadless 接的是 engine 面 hooks
 *    （wireCliHooksDeps 三窗口），其 runSessionEndHooks 全仓零消费——
 *    成功支（cron 停 + drain 后台命令/agent 完）与错误支（abort +
 *    exitCode=1）均直接退出，SessionEnd 从不触发。-p 恰是最常与后台
 *    命令共存的形态（run_in_background bash / pending agent），即上游
 *    300 场景的本地等价缺口。
 *
 * 修后语义：runHeadlessSessionEndHooks（src/cli/headlessSessionEnd.ts）
 * fail-open 包装 engine 面 runSessionEndHooks（自带 1500ms 短超时档 =
 * ATLAS_SESSIONEND_HOOKS_TIMEOUT_MS，收尾不挂起）；print.ts 成功支
 * reason='prompt_input_exit'（与 TUI 正常退出一致）、错误支 reason='other'。
 *
 * 测试面：①② 走真实 engine 管线（注入 FakeHookShell 端口 + config
 * provider + bootstrap env，零磁盘零真进程——hooks.test.ts 同款注入
 * 惯例）；③ print.ts 双支接线在场断言（防回归拆线）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { readFileSync } from 'fs'
import {
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  setHookConfigProvider,
  resetHookConfigProvider,
  setHookShellPort,
  resetHookShellPort,
  type HookShellPort,
  type HookShellExecution,
} from '../../src/hooks'

/** 假 shell 端口：记录调用 + 可注入抛错（纯内存，零磁盘零进程）。 */
class FakeHookShell implements HookShellPort {
  calls: Array<{ command: string; timeoutMs?: number }> = []
  private queue: HookShellExecution[] = []
  private throwNext = false
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  failNext(): void {
    this.throwNext = true
  }
  async runCommand(
    command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    timeoutMs?: number,
  ): Promise<HookShellExecution> {
    this.calls.push({ command, timeoutMs })
    if (this.throwNext) throw new Error('wave0182-shell-port-boom')
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

function injectBootstrap(): void {
  setHooksBootstrapEnv({
    getSessionId: () => 'wave0182-sessionend-session',
    getCwd: () => '/tmp/proj',
    getTranscriptPath: id => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => 'main',
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
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

describe('K3-B1 headless 退出面 SessionEnd hooks', () => {
  test('① 配置的 SessionEnd hook 经真实 engine 管线执行（helper 触发）', async () => {
    const { runHeadlessSessionEndHooks } = await import(
      '../../src/cli/headlessSessionEnd.js'
    )
    const port = new FakeHookShell()
    port.enqueue({ stdout: 'ok', stderr: '', code: 0 })
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'SessionEnd'
          ? [{ hooks: [{ type: 'command', command: 'echo wave0182-sessionend' }] }]
          : [],
    })

    await runHeadlessSessionEndHooks('prompt_input_exit')

    expect(port.calls.length).toBe(1)
    expect(port.calls[0].command).toContain('wave0182-sessionend')
  })

  test('② fail-open：端口执行抛错不阻断退出路径', async () => {
    const { runHeadlessSessionEndHooks } = await import(
      '../../src/cli/headlessSessionEnd.js'
    )
    const port = new FakeHookShell()
    port.failNext()
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'SessionEnd'
          ? [{ hooks: [{ type: 'command', command: 'echo boom' }] }]
          : [],
    })

    // 不抛 = fail-open（退出路径不被收尾钩子异常改写）
    await runHeadlessSessionEndHooks('other')
  })

  test('③ print.ts 双支接线在场（成功支 + 错误支，防拆线）', () => {
    const source = readFileSync(new URL('../../src/cli/print.ts', import.meta.url), 'utf8')
    // 成功支：正常完成（含 SIGINT abort unwind）→ prompt_input_exit
    expect(source).toContain("runHeadlessSessionEndHooks('prompt_input_exit')")
    // 成功支调用点在后台 agent drain 之后（退出前最后收尾面）
    const drainIdx = source.indexOf('drainPendingBackgroundAgents(')
    const successIdx = source.indexOf("runHeadlessSessionEndHooks('prompt_input_exit')")
    expect(drainIdx).toBeGreaterThan(0)
    expect(successIdx).toBeGreaterThan(drainIdx)
    // 错误支：运行错误 → other
    expect(source).toContain("runHeadlessSessionEndHooks('other')")
  })
})
