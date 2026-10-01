/**
 * cli/hooksWiring 判别单测（P0 headless「hooks bootstrap 未注入」回归修）。
 *
 * 根因面（hooksWiring 头注）：hooks 域三窗口（bootstrap-env / shell-port /
 * config-provider）此前仅 TUI 壳组合根注入；headless 车道（cli 域）用户
 * HOME 存在 hooks 配置时 runHooks fail-fast。本测锁 cli 域侧接线：
 *  - wireCliHooksDeps 后 getHooksBootstrapEnv 可达 + 6 成员面有效
 *   （未修态 = throw「hooks bootstrap 未注入」即红）
 *  - 幂等（setter 重复调用不炸）
 *  - shell port 接线在场（runCommand 契约面；零执行，真 spawn 归
 *    executor 域 func 层）
 * 零模型 / 零网络 / 零磁盘（成员面纯读 bootstrap 状态；transcript path
 * 仅断言字符串形态不落盘）。
 */
import { describe, expect, test } from 'bun:test'
import { getHookShellPort, getHooksBootstrapEnv } from '../../src/hooks'
import { wireCliHooksDeps } from '../../src/cli'

describe('wireCliHooksDeps（cli 域侧 hooks 三窗口接线）', () => {
  test('接线后 getHooksBootstrapEnv 可达 + 6 成员面有效', () => {
    wireCliHooksDeps()
    const env = getHooksBootstrapEnv()
    expect(typeof env.getSessionId()).toBe('string')
    expect(env.getSessionId().length).toBeGreaterThan(0)
    expect(typeof env.getCwd()).toBe('string')
    const tp = env.getTranscriptPath('sess-x')
    expect(typeof tp).toBe('string')
    expect(tp.length).toBeGreaterThan(0)
    // --agent 未设 = undefined（壳 compose 同注「agent type 缺省 undefined」）
    expect(
      env.getMainThreadAgentType() === undefined ||
        typeof env.getMainThreadAgentType() === 'string',
    ).toBe(true)
    expect(typeof env.isNonInteractive()).toBe('boolean')
    expect(typeof env.hasTrustAccepted()).toBe('boolean')
  })

  test('幂等：重复调用不抛 + 成员面保持有效', () => {
    wireCliHooksDeps()
    wireCliHooksDeps()
    expect(() => getHooksBootstrapEnv()).not.toThrow()
  })

  test('shell port 接线在场（runCommand 契约面，零执行）', () => {
    wireCliHooksDeps()
    const port = getHookShellPort()
    expect(typeof port.runCommand).toBe('function')
  })
})
