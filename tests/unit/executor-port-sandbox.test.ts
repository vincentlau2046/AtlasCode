/**
 * ExecutorSandbox 端口契约测试（C2）
 *
 * 契约断言：① fake 可结构赋值给端口 + 注入窗口 set/get 往返
 * ② 未注入 get = fail-fast 抛错（静默"未启用沙箱"会无声改变安全语义，H6 防腐）
 * ③ reset 复位未注入态。
 * fake 行为断言：④ wrap 非透传（带标记可断言，防"包装层被 fake 成 no-op 假绿"）
 * ⑤ 调用记录（命令 + signal + cleanup 计数）。
 * 窄面裁定核验：端口面 = 4 方法（isSandboxingEnabled/shouldUseSandbox/wrapWithSandbox/
 * cleanupAfterCommand），无 customConfig（旧仓 Shell.ts 恒传 undefined）——由结构契约
 * 编译期锁死。S-T4 ⑧ 新增 shouldUseSandbox（决策方法，fake 可配返回值 + 调用记录）。
 * 无网络/无真实磁盘/无 PTY。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  type ExecutorSandboxPort,
  setExecutorSandboxPort,
  getExecutorSandboxPort,
  resetExecutorSandboxPort,
} from '../../src/executor'
import { FakeExecutorSandbox } from '../fixtures/executor-port-fakes'

beforeEach(() => {
  resetExecutorSandboxPort()
})

describe('ExecutorSandboxPort 契约', () => {
  test('① fake 结构可赋值给端口（契约可实现，编译期检查 + 注入往返）', () => {
    const fake = new FakeExecutorSandbox()
    const port: ExecutorSandboxPort = fake // 结构契约
    setExecutorSandboxPort(port)
    expect(getExecutorSandboxPort()).toBe(fake)
  })

  test('② 未注入 getExecutorSandboxPort = fail-fast 抛错', () => {
    expect(() => getExecutorSandboxPort()).toThrow(/ExecutorSandboxPort 未注入/)
  })

  test('③ reset 复位未注入态', () => {
    setExecutorSandboxPort(new FakeExecutorSandbox())
    resetExecutorSandboxPort()
    expect(() => getExecutorSandboxPort()).toThrow(/ExecutorSandboxPort 未注入/)
  })

  test('④ wrapWithSandbox 非透传（返回带标记命令串，包装层可验证）', async () => {
    const fake = new FakeExecutorSandbox()
    setExecutorSandboxPort(fake)
    const wrapped = await getExecutorSandboxPort().wrapWithSandbox('echo hi')
    expect(wrapped).toBe('[sandbox] echo hi')
    // 禁用态语义可配置（真实 sandbox 域按 config 决策，fake 仅记录）
    fake.sandboxingEnabled = false
    expect(getExecutorSandboxPort().isSandboxingEnabled()).toBe(false)
  })

  test('⑤ 调用记录：wrap 命令/ signal 记录 + cleanup 计数', async () => {
    const fake = new FakeExecutorSandbox()
    setExecutorSandboxPort(fake)
    const abort = new AbortController()
    await getExecutorSandboxPort().wrapWithSandbox('echo a', '/bin/sh', abort.signal)
    await getExecutorSandboxPort().wrapWithSandbox('echo b')
    getExecutorSandboxPort().cleanupAfterCommand()
    expect(fake.wrappedCommands).toEqual(['echo a', 'echo b'])
    expect(fake.wrappedSignals[0]).toBe(abort.signal)
    expect(fake.wrappedSignals[1]).toBeUndefined()
    expect(fake.cleanups).toBe(1)
  })

  test('⑥ S-T4 ⑧ shouldUseSandbox：fake 可配返回值 + 调用记录（决策方法非 no-op 可断言）', () => {
    const fake = new FakeExecutorSandbox()
    setExecutorSandboxPort(fake)
    // 默认决策 = true
    expect(getExecutorSandboxPort().shouldUseSandbox('bazel test')).toBe(true)
    // 可配决策 = false（模拟 excludedCommands 命中 / 总门关）
    fake.shouldUseSandboxResult = false
    expect(getExecutorSandboxPort().shouldUseSandbox('bazel test')).toBe(false)
    // 调用记录（命令串逐次入列，可观测防假绿）
    expect(fake.shouldUseSandboxCalls).toEqual(['bazel test', 'bazel test'])
  })
})
