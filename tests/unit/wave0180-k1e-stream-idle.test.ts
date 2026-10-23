/**
 * 0.1.80 V3-1 K1-E 判别锁 — 流空闲（stall）超时 300s（@299 流超时件）
 *
 * 问题面：自定义 base URL 网关流 180s 无数据即断（上游 2.1.299 → 300s 放宽）；
 * 修前本仓流消费只有整请求 timeout（900s）——中途 stall 的流要挂满 15min。
 *
 * 修法：STREAM_IDLE_TIMEOUT_MS = 300_000（chunk 间隔上限，非整请求上限）
 * + withStreamIdleWatchdog 包装 streamOneAttempt chunk 循环。
 *
 * 错误分类面（有意设计）：
 *   - StreamIdleTimeoutError message 含 "timeout" → isRetryableError 正则
 *     命中 → shouldRetryModelError = true → 既有重试面。
 *   - isClientRequestTimeout 只认 SDK 超时类 → 本自定义类不命中 →
 *     buildStreamErrorEvent 编 API_ERROR + retryable（非 #260 TIMEOUT
 *     fail-fast——chunk 间隔超时「值得重试」语义有意区分）。
 *
 * 判别锚（修前红）：①常量修前不存在；⑤接线修前 absent——还原接线后
 * streamOneAttempt 源码不含 watchdog 调用。
 */
import { describe, test, expect } from 'bun:test'
import { STREAM_IDLE_TIMEOUT_MS } from '../../src/modelprovider/constants'
import {
  StreamIdleTimeoutError,
  withStreamIdleWatchdog,
} from '../../src/modelprovider/streamIdleWatchdog'
import { shouldRetryModelError, isClientRequestTimeout } from '../../src/modelprovider/modelprovider'
import { readFileSync } from 'node:fs'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 快流脚手架：立即产出 chunks。 */
async function* fastStream(): AsyncGenerator<number> {
  for (const v of [1, 2, 3]) yield v
}

/** 慢流脚手架：首 chunk 后 sleep 超过 timeoutMs。 */
async function* slowStream(delayMs: number): AsyncGenerator<number> {
  yield 1
  await sleep(delayMs)
  yield 2
}

describe('K1-E STREAM_IDLE_TIMEOUT_MS 常量', () => {
  test('① 常量锁 = 300_000（上游 2.1.299 语义：chunk 间隔上限 300s）', () => {
    expect(STREAM_IDLE_TIMEOUT_MS).toBe(300_000)
  })

  test('①b streamOneAttempt 接线在场（还原接线后此锚红）', () => {
    const src = readFileSync(
      new URL('../../src/modelprovider/modelprovider.ts', import.meta.url),
      'utf8',
    )
    expect(src).toContain(
      'withStreamIdleWatchdog<any>(stream, STREAM_IDLE_TIMEOUT_MS)',
    )
  })
})

describe('K1-E withStreamIdleWatchdog 行为', () => {
  test('② 慢流超时 → StreamIdleTimeoutError throw + 底层迭代器释放', async () => {
    let returned = false
    const slow: AsyncGenerator<number> = (async function* () {
      yield 1
      await sleep(80)
      yield 2
    })()
    const origReturn = slow.return.bind(slow)
    slow.return = () => {
      returned = true
      return origReturn()
    }
    const wrapped = withStreamIdleWatchdog(slow, 10)
    const seen: number[] = []
    let thrown: unknown
    try {
      for await (const v of wrapped) seen.push(v)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(StreamIdleTimeoutError)
    expect((thrown as StreamIdleTimeoutError).timeoutMs).toBe(10)
    expect((thrown as Error).message).toContain('timeout')
    expect(seen).toEqual([1])
    expect(returned).toBe(true)
  })

  test('③ 快流不触发（零误伤）', async () => {
    const out: number[] = []
    for await (const v of withStreamIdleWatchdog(fastStream(), 5_000)) {
      out.push(v)
    }
    expect(out).toEqual([1, 2, 3])
  })

  test('③b 慢于 timeout 但流内正常 sleep 后结束——间隔恰在下限内不误伤', async () => {
    // 每chunk间隔 20ms < timeoutMs 100ms：正常完结
    const out: number[] = []
    for await (const v of withStreamIdleWatchdog(slowStream(20), 100)) {
      out.push(v)
    }
    expect(out).toEqual([1, 2])
  })

  test('④ timeoutMs ≤0 / 非 finite → 原样透传（零行为）', async () => {
    const outZero: number[] = []
    for await (const v of withStreamIdleWatchdog(slowStream(30), 0)) {
      outZero.push(v)
    }
    expect(outZero).toEqual([1, 2])

    const outNan: number[] = []
    for await (const v of withStreamIdleWatchdog(slowStream(30), Number.NaN)) {
      outNan.push(v)
    }
    expect(outNan).toEqual([1, 2])
  })
})

describe('K1-E 错误分类面（既有重试面接通锚）', () => {
  test('⑤ shouldRetryModelError(StreamIdleTimeoutError) = true（重试面接通）', () => {
    expect(shouldRetryModelError(new StreamIdleTimeoutError(300_000))).toBe(true)
  })

  test('⑤b isClientRequestTimeout 不认自定义类 → buildStreamErrorEvent 编 API_ERROR/retryable（非 #260 TIMEOUT fail-fast）', () => {
    expect(isClientRequestTimeout(new StreamIdleTimeoutError(300_000))).toBe(false)
    // signal.aborted 优先短路语义保持（abort 支恒不可重试）
    const ac = new AbortController()
    ac.abort()
    expect(shouldRetryModelError(new StreamIdleTimeoutError(300_000), ac.signal)).toBe(false)
  })
})
