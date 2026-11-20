/**
 * 执行出口实施波 S1 —— set-once 守卫判别单测（呈批书 §2 S1 + f4 批复 §6
 * 条件③④，@a62925c0）。
 *
 * 守卫形：armKernelInjectionGuard() 由双车道组合根单例门调用（compose.ts /
 * tui/factory.ts）；armed 后三个注入槽（bootstrapState / noopSeam /
 * sessionEnv）各至多一次注入，第二次 = 硬错；armed 态 reset 缝 = 硬错且槽
 * 不被清（条件④单向不可逆——「reset 解除 armed」形不采，注入→reset→再注入
 * = 静默顶替绕行向量）。未 armed（测试/probe 车道）现语义逐字不变。
 *
 * 文件序约束：armed 无退路（reset 即硬错），armed 全序列 = 文件末位单测、
 * 进程内终态不清理；未 armed 腿与源级扫描在前。
 */
import { describe, expect, test } from 'bun:test'
import {
  armKernelInjectionGuard,
  getKernelBootstrapState,
  resetKernelBootstrapStateForTests,
  setKernelBootstrapNoopSeam,
  setKernelBootstrapState,
} from '../../src/kernel/state/injection'
import { resetSessionEnv, setSessionEnv } from '../../src/engine/session/env'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..', '..')
const portA = { getCwd: () => '/a', getOriginalCwd: () => '/a', setCwdState: () => {}, addSlowOperation: () => {}, waitForScrollIdle: async () => {}, setLastAPIRequest: () => {}, setLastAPIRequestMessages: () => {} } as never
const portB = { ...portA } as never
const noopSeam = { addSlowOperation: () => {}, waitForScrollIdle: async () => {}, setLastAPIRequest: () => {}, setLastAPIRequestMessages: () => {} }

describe('S1 未 armed 车道（测试/probe 语义零变更）', () => {
  test('(c) 未 armed 重注合法：静默覆盖原形保留', () => {
    setKernelBootstrapState(portA)
    setKernelBootstrapState(portB)
    expect(getKernelBootstrapState()).toBe(portB)
    resetKernelBootstrapStateForTests()
  })

  test('(d) 未 armed reset 缝复位后可重注入', () => {
    setKernelBootstrapState(portA)
    resetKernelBootstrapStateForTests()
    setKernelBootstrapState(portB)
    expect(getKernelBootstrapState()).toBe(portB)
    resetKernelBootstrapStateForTests()
    resetSessionEnv()
    setSessionEnv({ getOriginalCwd: () => '/z' })
    resetSessionEnv()
  })

  test('(e) probe 车道（不 armed 不注入真状态）读门 fail-fast 语义不变', () => {
    resetKernelBootstrapStateForTests()
    expect(() => getKernelBootstrapState()).toThrow(/未注入/)
  })
})

describe('S1 arming 点与调用点纪律（条件③⑥，源级扫描锁形）', () => {
  const readSrc = (p: string) => readFileSync(join(repoRoot, p), 'utf8')

  test('双车道组合根单例门各自调 armKernelInjectionGuard（装配期恰一次）', () => {
    expect(readSrc('src/atlascode/compose.ts')).toContain('armKernelInjectionGuard()')
    expect(readSrc('src/tui/factory.ts')).toContain('armKernelInjectionGuard()')
  })

  test('src 内 setSessionEnv 调用点穷尽：env.ts（本体）+ compose.ts（组合根）外零调用者', () => {
    // 条件③：armed 后 Partial 合并即硬错——若存在合法运行时更新者须先裁。
    // 机器判：src 递归扫描（排除守卫本体 env.ts 与组合根 compose.ts）。
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const out = execFileSync('grep', ['-rl', '--include=*.ts', '--include=*.tsx', 'setSessionEnv(', 'src'], { cwd: repoRoot }).toString().trim().split('\n')
    const offenders = out.filter(f => f !== 'src/engine/session/env.ts' && f !== 'src/atlascode/compose.ts')
    expect(offenders, `unexpected setSessionEnv callers: ${JSON.stringify(offenders)}`).toEqual([])
  })

  test('src 内 setKernelBootstrapState 调用点穷尽：injection.ts（本体）+ compose.ts + factory.ts 外零调用者', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const out = execFileSync('grep', ['-rl', '--include=*.ts', '--include=*.tsx', 'setKernelBootstrapState(', 'src'], { cwd: repoRoot }).toString().trim().split('\n')
    const offenders = out.filter(f => f !== 'src/kernel/state/injection.ts' && f !== 'src/atlascode/compose.ts' && f !== 'src/tui/factory.ts')
    expect(offenders, `unexpected setKernelBootstrapState callers: ${JSON.stringify(offenders)}`).toEqual([])
  })
})

describe('S1 armed 产品模式（文件末位单测——armed 无退路，进程内终态）', () => {
  test('(a)(b)(f)(f-2) armed 全序列：二次注入硬错 + reset 缝硬错 + 槽不被顶替不清', () => {
    armKernelInjectionGuard() // 幂等；此处首 arm
    // (a) bootstrapState：首注合法，二次硬错且原 port 不被顶替。
    setKernelBootstrapState(portA)
    expect(getKernelBootstrapState()).toBe(portA)
    expect(() => setKernelBootstrapState(portB)).toThrow(/set-once/)
    expect(getKernelBootstrapState()).toBe(portA)
    // (f-2) noopSeam：首注合法，二次硬错。
    setKernelBootstrapNoopSeam(noopSeam)
    expect(() => setKernelBootstrapNoopSeam(noopSeam)).toThrow(/set-once/)
    // (b) sessionEnv：armed 后首注合法（组合根装配序），二次 = 硬错
    //     （Partial 合并形同适用）。
    setSessionEnv({ getOriginalCwd: () => '/x' })
    expect(() => setSessionEnv({ getOriginalCwd: () => '/y' })).toThrow(/set-once/)
    // (f) armed 态 reset 缝 = 硬错且槽不被清：真状态读门仍可达。
    expect(() => resetKernelBootstrapStateForTests()).toThrow(/set-once/)
    expect(() => resetSessionEnv()).toThrow(/set-once/)
    expect(getKernelBootstrapState()).toBe(portA)
  })
})
