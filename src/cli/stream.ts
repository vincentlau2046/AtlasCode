/**
 * 异步队列流（旧仓 utils/stream.ts 76L 逐字随迁）。
 *
 * delta 登记：旧仓 = 全局 utils 共享件 → 新仓 cli 域本地件（shared 值面
 * 缺口先例：域内本地定义 + TODO PR to shared，shared 归 S1 独占裁定）。
 * 消费方 = structuredIO.outbound（sendRequest + print.ts 双写点，drain 环
 * 为唯一读点）+ print 输出环。
 */
export class Stream<T> implements AsyncIterator<T> {
  private readonly queue: T[] = []
  private readResolve?: (value: IteratorResult<T>) => void
  private readReject?: (error: unknown) => void
  private isDone: boolean = false
  private hasError: unknown | undefined
  private started = false

  constructor(private readonly returned?: () => void) {}

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    if (this.started) {
      throw new Error('Stream can only be iterated once')
    }
    this.started = true
    return this
  }

  next(): Promise<IteratorResult<T, unknown>> {
    if (this.queue.length > 0) {
      return Promise.resolve({
        done: false,
        value: this.queue.shift()!,
      })
    }
    if (this.isDone) {
      return Promise.resolve({ done: true, value: undefined })
    }
    if (this.hasError) {
      return Promise.reject(this.hasError)
    }
    return new Promise<IteratorResult<T>>((resolve, reject) => {
      this.readResolve = resolve
      this.readReject = reject
    })
  }

  enqueue(value: T): void {
    if (this.readResolve) {
      const resolve = this.readResolve
      this.readResolve = undefined
      this.readReject = undefined
      resolve({ done: false, value })
    } else {
      this.queue.push(value)
    }
  }

  done(): void {
    this.isDone = true
    if (this.readResolve) {
      const resolve = this.readResolve
      this.readResolve = undefined
      this.readReject = undefined
      resolve({ done: true, value: undefined })
    }
  }

  error(error: unknown): void {
    this.hasError = error
    if (this.readReject) {
      const reject = this.readReject
      this.readResolve = undefined
      this.readReject = undefined
      reject(error)
    }
  }

  return(): Promise<IteratorResult<T, unknown>> {
    this.isDone = true
    if (this.returned) {
      this.returned()
    }
    return Promise.resolve({ done: true, value: undefined })
  }
}
