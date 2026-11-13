/**
 * 0.1.102 P0 切片 2-B 判据格：loop watchdog（lock-face ① f4 批 2026-11-12）。
 *
 * 格面：
 *  - env 解析（缺省 120000 / 0=关 / 非法回缺省 / 合法透传）
 *  - fire 形：armed + 窗内零事件 + 全豁免计数零 → abort（LoopWatchdogTimeoutError）
 *  - 四豁免：permission 等待 / LLM 在途 / 工具 batch 在途 / backoff 窗（到期重排不 fire）
 *  - arm/disarm 事件驱动：round_start arm / round_end·loop_end disarm（轮间空闲不触发格）
 *  - reset：事件重开计时窗
 *  - outer signal 镜像：outer abort → watchdog signal 同步 abort（reason 透传）
 *  - dispose：封锁后续 arm/fire
 *  - turnRecovery backoff 钩子进出场（豁免 (d) 消费面）
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_LOOP_WATCHDOG_MS,
  LOOP_WATCHDOG_ENV_KEY,
  LoopWatchdog,
  LoopWatchdogTimeoutError,
  createLoopWatchdogFromEnv,
  resolveLoopWatchdogTimeoutMs,
} from 'src/engine/query/loopWatchdog'
import { withTurnRecovery } from 'src/engine/query/turnRecovery'

const TICK = 30

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('resolveLoopWatchdogTimeoutMs', () => {
  // 0.1.104 切片 1 fail-safe 翻转（lock-face 必答 1 三态表；历史锚：0.1.102–0.1.103
  // 曾为缺省 120s 开启——DEFAULT_LOOP_WATCHDOG_MS=120_000，随翻转删除）。
  test('缺省关三态：未设 / 空 / 纯空白 → 0（关）', () => {
    expect(resolveLoopWatchdogTimeoutMs({})).toBe(0)
    expect(resolveLoopWatchdogTimeoutMs({ [LOOP_WATCHDOG_ENV_KEY]: '' })).toBe(0)
    expect(resolveLoopWatchdogTimeoutMs({ [LOOP_WATCHDOG_ENV_KEY]: '   ' })).toBe(0)
  })

  test('非法/负值归关（fail-safe 同向；负值禁「无限期」新语义）', () => {
    expect(resolveLoopWatchdogTimeoutMs({ [LOOP_WATCHDOG_ENV_KEY]: '-1' })).toBe(0)
    expect(resolveLoopWatchdogTimeoutMs({ [LOOP_WATCHDOG_ENV_KEY]: 'abc' })).toBe(0)
  })

  test('显式 0 = 显式关；显式正值 = opt-in 透传', () => {
    expect(resolveLoopWatchdogTimeoutMs({ [LOOP_WATCHDOG_ENV_KEY]: '0' })).toBe(0)
    expect(resolveLoopWatchdogTimeoutMs({ [LOOP_WATCHDOG_ENV_KEY]: '5000' })).toBe(5000)
  })

  test('格 1 spy 锚：缺省（无 env）零窗实例 armed 也不排 timer 不 fire（毫秒级结构格）', async () => {
    const wd = createLoopWatchdogFromEnv({})
    wd.noteEvent('round_start')
    expect(wd.isArmed).toBe(true)
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    expect(wd.abortSignal.aborted).toBe(false)
    wd.dispose()
  })
})

describe('LoopWatchdog fire 形', () => {
  test('armed + 窗内零事件 + 全豁免零 → fire（abort reason = LoopWatchdogTimeoutError）', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    expect(wd.abortSignal.aborted).toBe(true)
    expect(wd.abortSignal.reason).toBeInstanceOf(LoopWatchdogTimeoutError)
    const reason = wd.abortSignal.reason as LoopWatchdogTimeoutError
    expect(reason.message).toContain(LOOP_WATCHDOG_ENV_KEY)
    wd.dispose()
  })

  test('未 armed（disarmed）不 fire —— 轮间空闲不触发格', async () => {
    const wd = new LoopWatchdog(TICK)
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    expect(wd.abortSignal.aborted).toBe(false)
    wd.dispose()
  })

  test('round_start arm / round_end disarm 事件驱动', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.noteEvent('round_start')
    expect(wd.isArmed).toBe(true)
    // round_end 到达 → disarm → 窗到不 fire
    wd.noteEvent('round_end')
    expect(wd.isArmed).toBe(false)
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    // 重新 round_start → arm → 到期 fire
    wd.noteEvent('round_start')
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })

  test('任意事件 reset 计时窗（持续事件不 fire）', async () => {
    const wd = new LoopWatchdog(TICK * 2)
    wd.arm()
    // 每 TICK 拍一次事件（≈ 窗的一半），跨 4 个窗周期不 fire
    for (let i = 0; i < 8; i++) {
      await wait(TICK)
      wd.noteEvent('stream_delta')
    }
    expect(wd.isFired).toBe(false)
    // 停拍 → 窗到 fire
    await wait(TICK * 5)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })
})

describe('LoopWatchdog 四豁免', () => {
  test('(b) permission 等待豁免：在途不 fire，释放后到期 fire', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    wd.beginPermissionWait()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    // 二重计数：一层释放不清空另一层
    wd.beginPermissionWait()
    wd.endPermissionWait()
    await wait(TICK * 2)
    expect(wd.isFired).toBe(false)
    wd.endPermissionWait()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })

  test('(c) LLM 在途计活豁免', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    wd.beginLlmCall()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    wd.endLlmCall()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })

  test('(c) 工具 batch 在途计活豁免（trackToolBatch 进出场）', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const tracked = wd.trackToolBatch(gate)
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    expect(wd.activitySnapshot().toolInFlight).toBe(1)
    release()
    await tracked
    expect(wd.activitySnapshot().toolInFlight).toBe(0)
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })

  test('(d) backoff 窗计活豁免', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    wd.beginBackoff()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    wd.endBackoff()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })

  test('到期检查全零才 fire：多豁免并存时全部归零才触发', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    wd.beginPermissionWait()
    wd.beginLlmCall()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    wd.endLlmCall()
    await wait(TICK * 2)
    expect(wd.isFired).toBe(false) // permission 仍在途
    wd.endPermissionWait()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })
})

describe('LoopWatchdog 生命周期面', () => {
  test('outer signal 镜像：outer abort → watchdog signal 同步 abort（reason 透传）', () => {
    const wd = new LoopWatchdog(TICK * 10)
    const outer = new AbortController()
    wd.attachOuterSignal(outer.signal)
    outer.abort(new Error('用户中断'))
    expect(wd.abortSignal.aborted).toBe(true)
    expect((wd.abortSignal.reason as Error).message).toBe('用户中断')
    // watchdog 自身未 fire（镜像 abort ≠ 超时 fire）
    expect(wd.isFired).toBe(false)
    wd.dispose()
  })

  test('watchdog fire 不回写 outer signal（自有 controller，禁用用户 abort 面）', async () => {
    const wd = new LoopWatchdog(TICK)
    const outer = new AbortController()
    wd.attachOuterSignal(outer.signal)
    wd.arm()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    expect(outer.signal.aborted).toBe(false)
    wd.dispose()
  })

  test('dispose 后不 fire 不 arm', async () => {
    const wd = new LoopWatchdog(TICK)
    wd.arm()
    wd.dispose()
    wd.arm()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    expect(wd.abortSignal.aborted).toBe(false)
  })

  test('timeoutMs=0 整面关（armed 也不 fire）', async () => {
    const wd = new LoopWatchdog(0)
    wd.arm()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    wd.dispose()
  })

  test('onExpiry 钩子 fire 时恰好一次', async () => {
    const wd = new LoopWatchdog(TICK)
    let calls = 0
    wd.onExpiry(() => {
      calls++
    })
    wd.arm()
    await wait(TICK * 3)
    expect(calls).toBe(1)
    wd.dispose()
  })
})

describe('withTurnRecovery backoff 钩子（豁免 (d) 消费面）', () => {
  test('可重试错误退避时 onBackoffStart/End 各恰一次（ms=退避值）', async () => {
    const events: Array<{ phase: 'start' | 'end'; ms: number }> = []
    let calls = 0
    const result = await withTurnRecovery(
      () => {
        calls++
        if (calls === 1) {
          // 可重试模型错误（5xx 形）：modelprovider shouldRetryModelError 判真
          const err = new Error('boom') as Error & { status?: number }
          err.status = 500
          throw err
        }
        return Promise.resolve('ok')
      },
      {
        config: {
          enabled: true,
          maxRetries: 3,
          backoffBaseMs: 10,
          backoffCapMs: 1000,
        },
        onBackoffStart: ms => events.push({ phase: 'start', ms }),
        onBackoffEnd: ms => events.push({ phase: 'end', ms }),
      },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
    expect(events).toEqual([
      { phase: 'start', ms: 10 },
      { phase: 'end', ms: 10 },
    ])
  })

  test('零退避（backoffBaseMs=0）不调钩（无窗不豁免）', async () => {
    let hookCalls = 0
    let calls = 0
    await withTurnRecovery(
      () => {
        calls++
        if (calls === 1) {
          const err = new Error('boom') as Error & { status?: number }
          err.status = 500
          throw err
        }
        return Promise.resolve('ok')
      },
      {
        config: { enabled: true, maxRetries: 3, backoffBaseMs: 0, backoffCapMs: 0 },
        onBackoffStart: () => hookCalls++,
        onBackoffEnd: () => hookCalls++,
      },
    )
    expect(hookCalls).toBe(0)
  })
})

describe('createLoopWatchdogFromEnv', () => {
  test('env 接线：ATLAS_LOOP_WATCHDOG_MS 透传实例窗口', async () => {
    const wd = createLoopWatchdogFromEnv({ [LOOP_WATCHDOG_ENV_KEY]: String(TICK) })
    wd.arm()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(true)
    wd.dispose()
  })

  test('env=0 实例整面关', async () => {
    const wd = createLoopWatchdogFromEnv({ [LOOP_WATCHDOG_ENV_KEY]: '0' })
    wd.arm()
    await wait(TICK * 3)
    expect(wd.isFired).toBe(false)
    wd.dispose()
  })
})
