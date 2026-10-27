/**
 * 0.1.81 V3-2 K2 #18 判别锁 — P-804s：watchdog finally 挂起型 return() 不结算
 *
 * 问题面：withStreamIdleWatchdog 的 finally `await iterator.return?.()`——
 * async generator 悬停在 body 内 await 时，return() 按规范排在当前 await
 * 之后；await 永不结算 → return() 永不结算 → finally 永不完成 → 超时
 * StreamIdleTimeoutError 被吞、消费方挂死（看门狗自己引入的无限挂起面，
 * 比不装看门狗更糟：原 900s 整请求 timeout 兜底也被绕过）。
 *
 * 修法：finally return() 与有界宽限竞速（良好行为迭代器照常等待释放完成
 * = teardown 保序；挂起型到宽限上限放行原错误/返回）。
 *
 * 判别锚（修前红）：① 修前 finally await 挂死 → outcome 'hung'。
 */
import { describe, test, expect } from 'bun:test'
import { STREAM_IDLE_RETURN_GRACE_MS } from '../../src/modelprovider/constants'
import {
  StreamIdleTimeoutError,
  withStreamIdleWatchdog,
} from '../../src/modelprovider/streamIdleWatchdog'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 挂起型 async generator：首 chunk 后停在永不结算的 await 上。 */
async function* hangingStream(): AsyncGenerator<number> {
  yield 1
  await new Promise<never>(() => {})
  yield 2
}

describe('0.1.81 K2 #18 P-804s：watchdog finally 挂起型 return() 不结算', () => {
  test('① 常量锁：STREAM_IDLE_RETURN_GRACE_MS = 1_000（teardown 宽限上限）', () => {
    expect(STREAM_IDLE_RETURN_GRACE_MS).toBe(1_000)
  })

  test('② 挂起型流超时 → StreamIdleTimeoutError 必达消费方（修前红 = finally await 挂死）', async () => {
    let returnCalled = false
    const hanging = hangingStream()
    const origReturn = hanging.return.bind(hanging)
    hanging.return = () => {
      returnCalled = true
      // suspended mid-await → return() 排队永不结算
      return origReturn()
    }
    const wrapped = withStreamIdleWatchdog(hanging, 10, 50)
    const seen: number[] = []
    let thrown: unknown
    const consume = (async () => {
      for await (const v of wrapped) seen.push(v)
    })()
    const outcome = await Promise.race([
      consume.then(
        () => 'completed',
        (err) => {
          thrown = err
          return 'threw'
        },
      ),
      // 修前：finally await 挂起 return → consume 永不结算 → 'hung'
      sleep(1500).then(() => 'hung'),
    ])
    expect(outcome).toBe('threw')
    expect(thrown).toBeInstanceOf(StreamIdleTimeoutError)
    expect((thrown as StreamIdleTimeoutError).timeoutMs).toBe(10)
    expect(seen).toEqual([1])
    // best-effort 释放调用保留（调用面同步发生，不依赖结算）
    expect(returnCalled).toBe(true)
  })

  test('③ 良好行为迭代器 teardown 保序：return() 结算后才放行错误（竞速非 fire-and-forget）', async () => {
    let released = false
    const slow: AsyncGenerator<number> = (async function* () {
      yield 1
      await sleep(30) // 30ms > timeoutMs 10 → 超时；< 宽限 200ms → return 可结算
      yield 2
    })()
    const origReturn = slow.return.bind(slow)
    slow.return = () =>
      origReturn().then((r) => {
        released = true
        return r
      })
    let thrown: unknown
    try {
      for await (const v of withStreamIdleWatchdog(slow, 10, 200)) {
        void v
      }
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(StreamIdleTimeoutError)
    // finally 等待 return() 结算（竞速 ret 胜出）→ 错误传播时 released 已真
    expect(released).toBe(true)
  })
})
