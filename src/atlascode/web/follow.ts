/**
 * AtlasWeb S0-R follow 订阅机（工单 §4.3 一致性/恢复 + 呈批书 §7.5
 * 采样序/cursor/lease/终态优先序，f4 批复 @f1f1099d）。
 *
 * 采样序：先注册采样（mtime+size+ino 三元组守卫）→ 再取 baseline →
 * 竞态窗口重试一致 snapshot。半行不当完整记录等下一采样；非法完整行
 * corruptData 不无限等待。增量尾读 = 上次 offset 起步只解析新增字节；
 * 稳定文件 repeat poll 走 O(1) stat 通道（零 read/零 parse/零事件）。
 * 不连续（truncate/replace/compact，ino 变或 size < offset）→
 * resetRequired + 新 generation/baseline，旧消息不再采纳。
 *
 * 终态恰一（优先序钉死）：closed > cancelled > resourceLimit/error >
 * 数据事件；resetRequired 非终态走新 baseline 链。lease 续租签名 =
 * {[Symbol.asyncIterator], renewLease(): Promise<boolean>, close():
 * Promise<void>}；idle 超时 → closed + 释放。
 */

import type {
  WebSessionEvent,
  WebSessionProjection,
} from 'src/kernel/protocol/webSessionV0'

import { WebSessionError } from './errors'
import { PARSE_BATCH_SIZE } from './limits'
import type { CursorLedger } from './cursorLedger'
import type { SessionStoreAdapter, TranscriptStat } from './sessionStoreAdapter'
import {
  computeLeafUuids,
  projectConversation,
  type NeutralProjection,
} from './projection'

type Projection = WebSessionProjection

export interface FollowLimits {
  pollingIntervalMs: number
  idleLeaseMs: number
  pendingEvents: number
  pendingBytes: number
  maxProjectionBytes: number
  maxRecordBytes: number
}

export interface FollowDeps {
  adapter: SessionStoreAdapter
  productId: string
  scopeId: string
  sessionId: string
  subscriptionId: string
  requestId?: string
  limits: FollowLimits
  signal?: AbortSignal
  ledger: CursorLedger
  /** 引擎 loader 全量基线面（显式 filePath；呈批书 §7.3 钉死形）。 */
  loadFull: (filePath: string) => Promise<{
    messages: Map<string, import('src/engine').TranscriptMessage>
    leafUuids: Set<string>
  }>
  /** 经 adapter 校验链的显式路径解析（scope 授权 + containment）。 */
  resolvePath: (scopeId: string, sessionId: string) => Promise<string>
  /** 订阅槽释放回调（终态/close 时恰一次）。 */
  onRelease: () => void
}

export interface FollowHandle {
  [Symbol.asyncIterator](): AsyncIterator<WebSessionEvent>
  renewLease(): Promise<boolean>
  close(): Promise<void>
}

/** 终态优先序（呈批书 §7.5 钉死）：closed > error(cancelled) > 其余 error。 */
function rankOf(ev: WebSessionEvent): number {
  if (ev.kind === 'closed') return 4
  if (ev.kind === 'error') {
    return ev.error.code === 'cancelled' ? 3 : 2
  }
  return 0
}

const isDataEvent = (ev: WebSessionEvent): boolean =>
  ev.kind === 'baseline' || ev.kind === 'replacement'

function envelope(deps: FollowDeps) {
  return {
    schemaVersion: 0 as const,
    productId: deps.productId,
    scopeId: deps.scopeId,
    subscriptionId: deps.subscriptionId,
    ...(deps.requestId ? { requestId: deps.requestId } : {}),
  }
}

function projectionBytes(p: Projection): number {
  return Buffer.byteLength(JSON.stringify(p))
}

function buildProjection(
  state: { messages: Map<string, import('src/engine').TranscriptMessage>; leafUuids: Set<string> },
  deps: FollowDeps,
): Projection {
  const neutral: NeutralProjection = projectConversation(state, {
    sessionId: deps.sessionId,
    productId: deps.productId,
    scopeId: deps.scopeId,
  })
  return neutral as unknown as Projection
}

export function createFollowSubscription(deps: FollowDeps): FollowHandle {
  const { adapter, limits, ledger } = deps
  let running = false
  let finished = false
  let terminalEvent: WebSessionEvent | null = null
  let terminalDelivered = false
  const queue: WebSessionEvent[] = []
  let queuedBytes = 0
  const waiters: Array<() => void> = []

  let generation = crypto.randomUUID()
  let baselineId = crypto.randomUUID()
  let revision = 0
  let state: {
    messages: Map<string, import('src/engine').TranscriptMessage>
    leafUuids: Set<string>
  } | null = null
  let offset = 0
  let anchorIno = -1
  let lastMtimeMs = -1
  let pendingPartial: Buffer = Buffer.alloc(0)
  const issuedTokens: string[] = []

  let leaseTimer: ReturnType<typeof setTimeout> | null = null
  let wakeSleep: (() => void) | null = null
  let closeRequested = false

  function notify(): void {
    while (waiters.length > 0) {
      waiters.shift()!()
    }
  }

  function disarmLease(): void {
    if (leaseTimer) {
      clearTimeout(leaseTimer)
      leaseTimer = null
    }
  }

  function armLease(): void {
    disarmLease()
    leaseTimer = setTimeout(() => {
      setTerminal(closedEvent('lease expired (idle)'))
    }, limits.idleLeaseMs)
  }

  function closedEvent(reason: string): WebSessionEvent {
    return { ...envelope(deps), kind: 'closed', reason } as WebSessionEvent
  }

  function errorEvent(
    code: 'notFound' | 'corruptData' | 'resourceLimit' | 'ioUnavailable' | 'cancelled',
    message: string,
    retryable?: boolean,
  ): WebSessionEvent {
    const err: Record<string, unknown> = { code, message }
    if (retryable !== undefined) err.retryable = retryable
    return { ...envelope(deps), kind: 'error', error: err } as WebSessionEvent
  }

  /** 终态恰一：优先序高者覆盖低者（closed > cancelled > 其余 error）。 */
  function setTerminal(ev: WebSessionEvent): void {
    if (finished) return
    if (ev.kind !== 'closed' && ev.kind !== 'error') return
    const rank = rankOf(ev)
    const curRank = terminalEvent ? rankOf(terminalEvent) : -1
    if (terminalEvent && rank <= curRank) return
    terminalEvent = ev
    running = false
    disarmLease()
    for (const t of issuedTokens) ledger.unpin(t)
    queue.push(ev)
    notify()
    deps.onRelease()
  }

  function queueData(ev: WebSessionEvent): void {
    if (terminalEvent || finished) return
    const bytes = projectionBytes(ev as unknown as Projection)
    if (bytes > limits.pendingBytes || bytes > limits.maxProjectionBytes) {
      // 单事件超 pending/projection 界：不返回半投影，主动 reset 语义 →
      // resourceLimit 终态（释放）
      setTerminal(errorEvent('resourceLimit', `event exceeds serialization limit (${bytes} bytes)`))
      return
    }
    // pending 界：最新完整 replacement 合并（丢旧数据事件），终态控制槽独立
    const dataCount = queue.filter(isDataEvent).length
    if (dataCount >= limits.pendingEvents || queuedBytes + bytes > limits.pendingBytes) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (isDataEvent(queue[i]!)) {
          const dropped = queue.splice(i, 1)[0]!
          queuedBytes -= projectionBytes(dropped as unknown as Projection)
        }
      }
    }
    queue.push(ev)
    queuedBytes += bytes
    notify()
  }

  async function issueBaseline(reason?: string): Promise<boolean> {
    if (reason) {
      queueData({
        ...envelope(deps),
        kind: 'resetRequired',
        generation,
        reason,
      } as WebSessionEvent)
    }
    try {
      const filePath = await deps.resolvePath(deps.scopeId, deps.sessionId)
      const loaded = await deps.loadFull(filePath)
      state = { messages: loaded.messages, leafUuids: loaded.leafUuids }
    } catch (e) {
      if (e instanceof WebSessionError) {
        setTerminal(errorEvent(e.code as 'notFound', e.message, e.retryable))
      } else {
        setTerminal(errorEvent('ioUnavailable', `baseline load failed: ${String(e)}`, true))
      }
      return false
    }
    const st = await adapter.statTranscript(deps.scopeId, deps.sessionId)
    if (!st) {
      setTerminal(errorEvent('notFound', 'session file disappeared during baseline'))
      return false
    }
    generation = crypto.randomUUID()
    baselineId = crypto.randomUUID()
    revision = 0
    offset = st.sizeBytes
    anchorIno = st.ino
    lastMtimeMs = st.mtimeMs
    pendingPartial = Buffer.alloc(0)
    const projection = buildProjection(state, deps)
    const bytes = projectionBytes(projection)
    if (bytes > limits.maxProjectionBytes) {
      setTerminal(errorEvent('resourceLimit', `projection exceeds limit (${bytes} bytes)`))
      return false
    }
    const cursor = ledger.issue(
      {
        productId: deps.productId,
        scopeId: deps.scopeId,
        sessionId: deps.sessionId,
        baselineId,
        generation,
        revision,
      },
      bytes,
    )
    ledger.pin(cursor)
    issuedTokens.push(cursor)
    queueData({
      ...envelope(deps),
      kind: 'baseline',
      generation,
      baselineId,
      revision,
      cursor,
      projection,
    } as WebSessionEvent)
    return true
  }

  function ingestLines(lines: Buffer[]): { changed: boolean; corrupt: string | null; oversize: boolean } {
    if (!state) return { changed: false, corrupt: null, oversize: false }
    let changed = false
    for (const line of lines) {
      if (line.length > limits.maxRecordBytes) {
        return { changed, corrupt: null, oversize: true }
      }
      let entry: unknown
      try {
        entry = JSON.parse(line.toString('utf8'))
      } catch {
        return { changed, corrupt: 'unparseable complete record', oversize: false }
      }
      const rec = entry as Record<string, unknown>
      if (
        rec &&
        typeof rec.uuid === 'string' &&
        (rec.type === 'user' || rec.type === 'assistant' || rec.type === 'system' || rec.type === 'attachment')
      ) {
        state.messages.set(rec.uuid, rec as unknown as import('src/engine').TranscriptMessage)
        changed = true
      }
      // 元数据行（summary/tag/...）不投影，忽略
    }
    if (changed) state.leafUuids = computeLeafUuids(state.messages)
    return { changed, corrupt: null, oversize: false }
  }

  async function pollOnce(): Promise<void> {
    const st: TranscriptStat | null = await adapter.statTranscript(deps.scopeId, deps.sessionId)
    if (!st) {
      setTerminal(errorEvent('notFound', 'session file removed'))
      return
    }
    // O(1) 零重解析通道：三元组未变 → 零 read/零 parse/零事件
    if (st.ino === anchorIno && st.sizeBytes === offset && st.mtimeMs === lastMtimeMs) {
      return
    }
    if (st.ino !== anchorIno || st.sizeBytes < offset) {
      // 不连续（truncate/atomic replace/compact）：resetRequired + 新 baseline
      await issueBaseline('file replaced or truncated (identity discontinuity)')
      return
    }
    const tail = await adapter.readTranscriptTail(deps.scopeId, deps.sessionId, offset, deps.signal)
    const buf = pendingPartial.length > 0 ? Buffer.concat([pendingPartial, Buffer.from(tail.bytes)]) : Buffer.from(tail.bytes)
    const lastNewline = buf.lastIndexOf(0x0a)
    if (lastNewline === -1) {
      // 半行不当完整记录，等下一采样
      if (buf.length > limits.maxRecordBytes) {
        setTerminal(errorEvent('resourceLimit', `pending record exceeds limit (${buf.length} bytes)`))
        return
      }
      pendingPartial = buf
      offset = tail.sizeBytes
      anchorIno = tail.ino
      lastMtimeMs = st.mtimeMs
      return
    }
    const complete = buf.subarray(0, lastNewline + 1)
    pendingPartial = buf.subarray(lastNewline + 1)
    offset = tail.sizeBytes
    anchorIno = tail.ino
    lastMtimeMs = st.mtimeMs

    // 批次边界（每 PARSE_BATCH 条 yield 查 abort/终态）
    const lines = complete.toString('utf8').split('\n').filter(l => l.length > 0)
    for (let i = 0; i < lines.length; i += PARSE_BATCH_SIZE) {
      if (deps.signal?.aborted) {
        setTerminal(errorEvent('cancelled', 'follow aborted'))
        return
      }
      const batch = lines.slice(i, i + PARSE_BATCH_SIZE).map(l => Buffer.from(l, 'utf8'))
      const r = ingestLines(batch)
      if (r.oversize) {
        setTerminal(errorEvent('resourceLimit', 'record exceeds max record bytes'))
        return
      }
      if (r.corrupt) {
        // 非法完整行 corruptData，不无限静默等待
        setTerminal(errorEvent('corruptData', r.corrupt))
        return
      }
    }
    if (!state) return
    const projection = buildProjection(state, deps)
    const bytes = projectionBytes(projection)
    if (bytes > limits.maxProjectionBytes) {
      setTerminal(errorEvent('resourceLimit', `projection exceeds limit (${bytes} bytes)`))
      return
    }
    revision++
    const cursor = ledger.issue(
      {
        productId: deps.productId,
        scopeId: deps.scopeId,
        sessionId: deps.sessionId,
        baselineId,
        generation,
        revision,
      },
      bytes,
    )
    ledger.pin(cursor)
    issuedTokens.push(cursor)
    queueData({
      ...envelope(deps),
      kind: 'replacement',
      generation,
      baselineId,
      revision,
      cursor,
      projection,
    } as WebSessionEvent)
  }

  async function run(): Promise<void> {
    armLease()
    if (!(await issueBaseline())) return
    running = true
    while (running && !finished) {
      // 可中断采样间隔：close/abort 即时唤醒
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          wakeSleep = null
          resolve()
        }, limits.pollingIntervalMs)
        wakeSleep = () => {
          clearTimeout(timer)
          wakeSleep = null
          resolve()
        }
        if (closeRequested) wakeSleep()
      })
      if (!running || finished) break
      if (deps.signal?.aborted) {
        setTerminal(errorEvent('cancelled', 'follow aborted'))
        break
      }
      try {
        await pollOnce()
      } catch (e) {
        if (e instanceof WebSessionError) {
          setTerminal(errorEvent(e.code as 'ioUnavailable', e.message, e.retryable))
        } else {
          setTerminal(errorEvent('ioUnavailable', `poll failed: ${String(e)}`, true))
        }
        break
      }
    }
  }

  void run()

  return {
    [Symbol.asyncIterator](): AsyncIterator<WebSessionEvent> {
      return {
        async next(): Promise<IteratorResult<WebSessionEvent>> {
          if (queue.length > 0) {
            const ev = queue.shift()!
            if (isDataEvent(ev)) queuedBytes -= projectionBytes(ev as unknown as Projection)
            if (ev.kind !== 'baseline' && ev.kind !== 'replacement' && ev.kind !== 'resetRequired') {
              terminalDelivered = true
              finished = true
              disarmLease()
            }
            return { value: ev, done: false }
          }
          if (terminalDelivered || (terminalEvent && finished)) {
            return { value: undefined, done: true }
          }
          if (terminalEvent) {
            // 终态已在队（setTerminal 必入队）；防御兜底
            return { value: undefined, done: true }
          }
          // 消费取事件自动续租（工单 §4.4）
          armLease()
          await new Promise<void>(resolve => waiters.push(resolve))
          return this.next!()
        },
        async return(): Promise<IteratorResult<WebSessionEvent>> {
          setTerminal(closedEvent('consumer stopped iteration'))
          return { value: undefined, done: true }
        },
      }
    },

    async renewLease(): Promise<boolean> {
      if (finished || terminalEvent) return false
      armLease()
      return true
    },

    async close(): Promise<void> {
      closeRequested = true
      setTerminal(closedEvent('closed by caller'))
      wakeSleep?.()
    },
  }
}
