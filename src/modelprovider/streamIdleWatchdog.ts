/**
 * 0.1.80 K1-E（@299 流超时件）：流空闲（stall）看门狗
 *
 * 问题面：自定义 base URL 网关流 180s 无数据即断；修前本仓流消费
 * （streamOneAttempt 的 `for await` chunk 循环）只有整请求 timeout
 * （LLM_TIMEOUT_DEFAULT_MS = 900s），中途 stall 的流要挂满 15min 才回收。
 *
 * 修法：withStreamIdleWatchdog 包装流迭代器——逐 next() 用
 * Promise.race 与 setTimeout 竞速；超过 STREAM_IDLE_TIMEOUT_MS 仍无
 * 下一个 chunk → abort 本 attempt（best-effort iterator.return 后 throw
 * StreamIdleTimeoutError）→ 走既有 shouldRetryModelError 重试面。
 *
 * 形状容忍（gate 打回归修）：修前消费点是 `for await`，会自动包装
 * sync iterable 流；本模块手动 `stream[Symbol.asyncIterator]()` 曾把
 * 该形状收紧成 TypeError（0158 fake 流即 sync generator，2 测红）。
 * 入口守卫：缺 asyncIterator 时先以 async 生成器 `yield*` 包装再进
 * watchdog 循环——async 流路径零变更，sync 流恢复修前容忍。
 *
 * 错误分类面（有意设计，非默认落点）：
 *   - message 含 "timeout" → isRetryableError /timeout/i 正则自然命中 →
 *     shouldRetryModelError = true → 既有重试面。
 *   - isClientRequestTimeout 只认 SDK 超时类（APIConnectionTimeoutError/
 *     APITimeoutError）→ 本自定义类不命中 → buildStreamErrorEvent 编码
 *     API_ERROR + retryable（非 TIMEOUT fail-fast）——chunk 间隔超时
 *     「值得重试」的语义与 #260 生成超时 fail-fast 有意区分。
 *   - 流中途超时时 streamOneAttempt 已累积 partialBlocks → 自然落
 *     0.1.58 C4-1 partial 保留支（已有内容 → partialRetained；零内容 →
 *     throw 走重试）。
 */
import {
  STREAM_IDLE_TIMEOUT_MS,
  STREAM_IDLE_RETURN_GRACE_MS,
} from './constants'

/** 流空闲超时错误（chunk 间隔超上限）。message 含 "timeout" 以落既有重试正则。 */
export class StreamIdleTimeoutError extends Error {
  /** 超时上限（ms），诊断面（日志/测试断言用）。 */
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`Stream idle timeout: no chunk received for ${timeoutMs}ms`)
    this.name = 'StreamIdleTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/**
 * 包装异步迭代器：逐 next() 与 idle timeout 竞速。
 *
 * timeoutMs 非 finite 或 ≤0 → 原样透传（yield*，零行为——测试/调试用小值
 * 注入面之外的防御）。
 */
export async function* withStreamIdleWatchdog<T>(
  stream: AsyncIterable<T> | Iterable<T>,
  timeoutMs: number = STREAM_IDLE_TIMEOUT_MS,
  returnGraceMs: number = STREAM_IDLE_RETURN_GRACE_MS,
): AsyncGenerator<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    yield* stream
    return
  }
  // 形状守卫：sync iterable（无 Symbol.asyncIterator）先经 async 生成器
  // 包装（恢复修前 for-await 的形状容忍）；async 流直取迭代器，零变更。
  const iterator: AsyncIterator<T> =
    typeof (stream as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'
      ? (stream as AsyncIterable<T>)[Symbol.asyncIterator]()
      : (async function* wrapSyncIterable() {
          yield* stream as Iterable<T>
        })()
  try {
    while (true) {
      // nextPromise 挂 catch 防超时后迟到拒绝成 unhandled rejection。
      const nextPromise = iterator.next()
      nextPromise.catch(() => {}) // 超时后迟到拒绝不炸进程
      let timer: ReturnType<typeof setTimeout> | undefined
      const timerPromise = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs)
        if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
          timer.unref()
        }
      })
      const winner = await Promise.race([nextPromise, timerPromise])
      // next() 胜出 → 清 timer（防快流下陈旧 timer 累积）
      if (timer !== undefined) clearTimeout(timer)
      if (winner === 'timeout') {
        throw new StreamIdleTimeoutError(timeoutMs)
      }
      const result = winner as IteratorResult<T>
      if (result.done) return
      yield result.value
    }
  } finally {
    // 超时 throw / 消费方提前 break → best-effort 释放底层迭代器
    // （finally 覆盖两支；return 抛错吞掉——释放失败不掩盖原错误）。
    // 0.1.81 K2 #18（P-804s）：挂起型 async generator（suspended mid-await）
    // 的 return() 按规范排在当前 await 之后——await 永不结算则 return() 永
    // 不结算，无界 await 会把超时 throw 吞成消费方无限挂死。修 = return()
    // 与有界宽限竞速：良好行为迭代器（return 结算快于宽限）照常等待释放
    // 完成 = teardown 保序零回归；挂起型到宽限上限放行原错误/返回。
    try {
      const ret = iterator.return?.()
      if (ret) {
        let graceTimer: ReturnType<typeof setTimeout> | undefined
        const grace = new Promise<void>((resolve) => {
          graceTimer = setTimeout(resolve, returnGraceMs)
          if (
            typeof graceTimer === 'object' &&
            graceTimer !== null &&
            'unref' in graceTimer
          ) {
            graceTimer.unref()
          }
        })
        // ret 拒绝吞掉（释放失败不掩盖原错误）；迟到拒绝经此分支已处理
        // （无 unhandled rejection）。
        await Promise.race([ret.then(() => undefined, () => {}), grace])
      }
    } catch {
      /* best-effort */
    }
  }
}
