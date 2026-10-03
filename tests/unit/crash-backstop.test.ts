import { describe, expect, test } from 'bun:test'
import {
  isCrashBackstopRegistered,
  registerGlobalCrashBackstop,
} from 'src/cli/crashBackstop'

// loop-robustness 缺口①（#262）：headless 车道全局崩溃兜底（对齐 TUI 的
// setupGracefulShutdown uncaught/unhandledRejection log+存活 处理器）。判别
// 单测（mechanism 面；行为面 crash 存活由 func/crash-backstop-wiring 活探针验）。
// mutation-red：删任一 process.on → ① 的 +1 断言 / ③④ 的 stderr 断言 RED。
describe('crashBackstop（headless 车道全局崩溃兜底）', () => {
  test('① 装兜底：恰好 +1 uncaughtException +1 unhandledRejection 处理器', () => {
    expect(isCrashBackstopRegistered()).toBe(false)
    const beforeU = process.listenerCount('uncaughtException')
    const beforeR = process.listenerCount('unhandledRejection')
    registerGlobalCrashBackstop()
    expect(isCrashBackstopRegistered()).toBe(true)
    expect(process.listenerCount('uncaughtException')).toBe(beforeU + 1)
    expect(process.listenerCount('unhandledRejection')).toBe(beforeR + 1)
  })

  test('② 幂等：二次调用不重复注册（listener 数不变）', () => {
    const u1 = process.listenerCount('uncaughtException')
    const r1 = process.listenerCount('unhandledRejection')
    registerGlobalCrashBackstop()
    expect(process.listenerCount('uncaughtException')).toBe(u1)
    expect(process.listenerCount('unhandledRejection')).toBe(r1)
    expect(isCrashBackstopRegistered()).toBe(true)
  })

  test('③ uncaughtException 处理器 log 到 stderr + 进程存活（非 Node 默认崩）', () => {
    const orig = process.stderr.write
    const chunks: string[] = []
    ;(process.stderr as unknown as { write: (...a: unknown[]) => boolean }).write = (
      ...a: unknown[]
    ) => {
      chunks.push(String(a[0]))
      return true
    }
    try {
      // 已装 handler → emit 只调 handler（log），不触发 Node 默认崩溃；测试能继续
      // 跑到断言 = 存活证明。
      process.emit('uncaughtException', new Error('unit-uncaught-probe'))
    } finally {
      process.stderr.write = orig
    }
    const out = chunks.join('')
    expect(out).toContain('[atlas][uncaughtException]')
    expect(out).toContain('unit-uncaught-probe')
  })

  test('④ unhandledRejection 处理器 log 到 stderr + 进程存活', () => {
    const orig = process.stderr.write
    const chunks: string[] = []
    ;(process.stderr as unknown as { write: (...a: unknown[]) => boolean }).write = (
      ...a: unknown[]
    ) => {
      chunks.push(String(a[0]))
      return true
    }
    try {
      process.emit('unhandledRejection', new Error('unit-rejection-probe'))
    } finally {
      process.stderr.write = orig
    }
    const out = chunks.join('')
    expect(out).toContain('[atlas][unhandledRejection]')
    expect(out).toContain('unit-rejection-probe')
  })
})
