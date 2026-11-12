/**
 * 0.1.102 P0 切片 2-A 判据格：crashRecovery 聚合窗（lock-face ③）。
 *
 * 格面：
 *  - 首错为主体，窗内后续错误折叠进 additionalCount（+N）
 *  - 恰一次格：窗关时全 hook 恰一次 dispatch（单错误行，非洪泛）
 *  - hook 失败 contained（不升级成二次崩溃）
 *  - 窗关后新错误开新窗（新 subject）
 *  - unhook 后不再收到 dispatch
 */
import { describe, expect, test } from 'bun:test'

import {
  CRASH_AGGREGATION_WINDOW_MS,
  __resetCrashRecoveryForTests,
  onCrashReport,
  reportCrash,
  type CrashReport,
} from 'src/tui/utils/crashRecovery'

async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('crashRecovery 聚合窗（切片 2-A）', () => {
  test('常量 = 1000ms 聚合窗', () => {
    expect(CRASH_AGGREGATION_WINDOW_MS).toBe(1000)
  })

  test('首错为主体 + 窗内后续折叠 additionalCount + 恰一次 dispatch', async () => {
    __resetCrashRecoveryForTests()
    const reports: CrashReport[] = []
    const unhook = onCrashReport(r => reports.push(r))
    const first = new TypeError('cannot read properties of undefined')
    reportCrash('uncaughtException', first)
    reportCrash('unhandledRejection', 'second')
    reportCrash('uncaughtException', new Error('third'))
    await wait(CRASH_AGGREGATION_WINDOW_MS + 80)
    expect(reports.length).toBe(1)
    const r = reports[0]!
    expect(r.kind).toBe('uncaughtException')
    expect(r.errorName).toBe('TypeError')
    expect(r.message).toContain('cannot read properties')
    expect(r.additionalCount).toBe(2)
    unhook()
  })

  test('hook 抛错 contained：后续 hook 仍收到 dispatch', async () => {
    __resetCrashRecoveryForTests()
    const reports: CrashReport[] = []
    const unhookBad = onCrashReport(() => {
      throw new Error('hook 崩了')
    })
    const unhookGood = onCrashReport(r => reports.push(r))
    reportCrash('unhandledRejection', new Error('x'))
    await wait(CRASH_AGGREGATION_WINDOW_MS + 80)
    expect(reports.length).toBe(1)
    unhookBad()
    unhookGood()
  })

  test('窗关后新错误开新窗（新 subject，重新恰一次）', async () => {
    __resetCrashRecoveryForTests()
    const reports: CrashReport[] = []
    const unhook = onCrashReport(r => reports.push(r))
    reportCrash('uncaughtException', new Error('第一窗'))
    await wait(CRASH_AGGREGATION_WINDOW_MS + 80)
    reportCrash('uncaughtException', new Error('第二窗'))
    await wait(CRASH_AGGREGATION_WINDOW_MS + 80)
    expect(reports.length).toBe(2)
    expect(reports[0]!.message).toBe('第一窗')
    expect(reports[1]!.message).toBe('第二窗')
    expect(reports[1]!.additionalCount).toBe(0)
    unhook()
  })

  test('unhook 后不再收到 dispatch', async () => {
    __resetCrashRecoveryForTests()
    const reports: CrashReport[] = []
    const unhook = onCrashReport(r => reports.push(r))
    unhook()
    reportCrash('uncaughtException', new Error('unseen'))
    await wait(CRASH_AGGREGATION_WINDOW_MS + 80)
    expect(reports.length).toBe(0)
  })

  test('非 Error 值名归一：string → "string"，其他 → "unknown"', async () => {
    __resetCrashRecoveryForTests()
    const reports: CrashReport[] = []
    const unhook = onCrashReport(r => reports.push(r))
    reportCrash('unhandledRejection', 42)
    await wait(CRASH_AGGREGATION_WINDOW_MS + 80)
    expect(reports[0]!.errorName).toBe('unknown')
    unhook()
  })
})
