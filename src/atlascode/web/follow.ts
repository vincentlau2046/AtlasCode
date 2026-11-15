/**
 * AtlasWeb S0-R follow 订阅机（工单 §4.3 一致性/恢复 + 呈批书 §7.5
 * 采样序/cursor/lease/终态优先序，f4 批复 @f1f1099d + §5.7 @98c51bd6
 * 终态形态钉死：closed 恒为唯一 terminal 事件 kind——error 终态路径 =
 * error{code} → closed 成对送达，终态后零数据事件）。
 *
 * 采样序（§4.3 先采样后 baseline，一致 snapshot）：baseline 前后双采样
 * 三元组全等方采纳（ino/size/mtime），不夏现有界重试（3 次）→
 * ioUnavailable retryable。半行不当完整记录等下一采样；非法完整行
 * corruptData 不无限等待。增量尾读 = 上次 offset 起步只解析新增字节；
 * 稳定文件 repeat poll 走 O(1) stat 通道（零 read/零 parse/零事件）。
 * 不连续（truncate/replace/compact，ino 变或 size < offset）→
 * resetRequired + 新 generation/baseline，旧消息不再采纳。
 *
 * 终态恰一（优先序 §7.5）：closed(4) > error(cancelled)(3) > 其余
 * error(2)，高可覆低（替换队内未消费终态对）；resetRequired 非终态。
 * close() 加盟 worker 停止（有界 2s）；订阅槽释放恰一次（worker 实停
 * 才释放，杜绝 close 竞态下槽位早释的限额绕过）。
 */

import type {
  WebSessionEvent,
  WebSessionProjection,
} from './contract'

import { WebSessionError } from './errors'
import { PARSE_BATCH_SIZE } from './limits'
import type { CursorLedger } from './cursorLedger'
import type { SessionStoreAdapter, TranscriptStat } from './sessionStoreAdapter'
import {
  computeLeafUuids,
  projectConversation,
  serializedProjectionBytes,
  type ProjectionEngineDeps,
  type ProjectionSourceMessage,
} from './projection'

type Projection = WebSessionProjection

/** 投影消息源结构面（engine TranscriptMessage 的结构超集镜像，pack 域零引擎导入）。 */
export type FollowSourceMessage = ProjectionSourceMessage

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
  /** 引擎 loader 全量基线面（显式 filePath；呈批书 §7.3 钉死形，注入缝）。 */
  loadFull: (filePath: string) => Promise<{
    messages: Map<string, ProjectionSourceMessage>
    leafUuids: Set<string>
  }>
  /** 经 adapter 校验链的显式路径解析（scope 授权 + containment）。 */
  resolvePath: (scopeId: string, sessionId: string) => Promise<string>
  /** CLI 同规则链重建注入缝（projection 头注镜像义务）。 */
  buildConversationChain: ProjectionEngineDeps['buildConversationChain']
  /** 订阅槽释放回调（worker 实停时恰一次）。 */
  onRelease: () => void
}

export interface FollowHandle {
  [Symbol.asyncIterator](): AsyncIterator<WebSessionEvent>
  renewLease(): Promise<boolean>
  close(): Promise<void>
}

/** 终态优先序（呈批书 §7.5）：closed > error(cancelled) > 其余 error。 */
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

function buildProjection(
  state: { messages: Map<string, ProjectionSourceMessage>; leafUuids: Set<string> },
  deps: FollowDeps,
): Projection {
  return projectConversation(
    state,
    {
      sessionId: deps.sessionId,
      productId: deps.productId,
      scopeId: deps.scopeId,
    },
    { buildConversationChain: deps.buildConversationChain },
  )
}

const CLOSE_JOIN_TIMEOUT_MS = 2000
const BASELINE_SAMPLE_ATTEMPTS = 3

export function createFollowSubscription(deps: FollowDeps): FollowHandle {
  const { adapter, limits, ledger } = deps
  let running = false
  let finished = false
  let terminalEvent: WebSessionEvent | null = null
  let terminalRank = -1
  let terminalDelivered = false
  const queue: WebSessionEvent[] = []
  let queuedBytes = 0
  const waiters: Array<() => void> = []

  let generation = crypto.randomUUID()
  let baselineId = crypto.randomUUID()
  let revision = 0
  let state: {
    messages: Map<string, ProjectionSourceMessage>
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
  let released = false
  let workerDoneResolve: (() => void) | null = null
  const workerDone = new Promise<void>(resolve => {
    workerDoneResolve = resolve
  })

  function notify(): void {
    while (waiters.length > 0) {
      waiters.shift()!()
    }
  }

  /** 订阅槽释放恰一次（worker 实停路径；终态路径不早释）。 */
  function releaseOnce(): void {
    if (!released) {
      released = true
      deps.onRelease()
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

  /** 摘除队内未消费终态对（error+closed 或 closed），供高优先覆写。 */
  function stripTerminalFromQueue(): void {
    for (let i = queue.length - 1; i >= 0; i--) {
      const k = queue[i]!.kind
      if (k === 'error' || k === 'closed') queue.splice(i, 1)
    }
  }

  /**
   * 终态恰一（§5.7 钉死形）：closed 恒为唯一 terminal kind。error 终态 =
   * error 事件 + closed 事件成对入队（终态后零数据事件——queueData 早退）；
   * 高优先可覆低（替换未消费终态对）。槽位不在此释放（worker 实停才释）。
   */
  function setTerminal(ev: WebSessionEvent): void {
    if (finished) return
    if (ev.kind !== 'closed' && ev.kind !== 'error') return
    const rank = ev.kind === 'closed' ? 4 : rankOf(ev)
    if (terminalEvent && rank <= terminalRank) return
    stripTerminalFromQueue()
    if (ev.kind === 'error') {
      queue.push(ev)
      queue.push(closedEvent('terminal error'))
    } else {
      queue.push(ev)
    }
    terminalEvent = closedEvent('terminal')
    terminalRank = rank
    running = false
    disarmLease()
    for (const t of issuedTokens) ledger.unpin(t)
    notify()
  }

  function queueData(ev: WebSessionEvent): void {
    if (terminalEvent || finished) return
    const bytes = serializedProjectionBytes(ev)
    if (bytes > limits.pendingBytes || bytes > limits.maxProjectionBytes) {
      // 单事件超 pending/projection 界：不返回半投影 → resourceLimit 终态
      setTerminal(
        errorEvent('resourceLimit', `event exceeds serialization limit (${bytes} bytes)`),
      )
      return
    }
    // pending 界：最新完整 replacement 合并（丢旧数据事件），终态控制槽独立
    const dataCount = queue.filter(isDataEvent).length
    if (dataCount >= limits.pendingEvents || queuedBytes + bytes > limits.pendingBytes) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (isDataEvent(queue[i]!)) {
          const dropped = queue.splice(i, 1)[0]!
          queuedBytes -= serializedProjectionBytes(dropped)
        }
      }
    }
    queue.push(ev)
    queuedBytes += bytes
    notify()
  }

  /** 终态/关闭/取消短路谓词（每个 baseline await 后复检）。 */
  function interrupted(): boolean {
    return terminalEvent !== null || finished || closeRequested
  }

  /**
   * baseline（§4.3 一致 snapshot）：前后双采样三元组全等方采纳；不等
   * 有界重试（3 次）→ ioUnavailable retryable。close/cancel/终态在
   * 每个 await 后复检短路。
   */
  async function issueBaseline(reason?: string): Promise<boolean> {
    if (interrupted()) return false
    if (deps.signal?.aborted) {
      setTerminal(errorEvent('cancelled', 'follow aborted'))
      return false
    }
    if (reason) {
      queueData({
        ...envelope(deps),
        kind: 'resetRequired',
        generation,
        reason,
      } as WebSessionEvent)
      if (terminalEvent) return false
    }
    let loaded: {
      messages: Map<string, ProjectionSourceMessage>
      leafUuids: Set<string>
    } | null = null
    let stPost: TranscriptStat | null = null
    for (let attempt = 0; attempt < BASELINE_SAMPLE_ATTEMPTS; attempt++) {
      const stPre = await adapter.statTranscript(deps.scopeId, deps.sessionId)
      if (!stPre) {
        setTerminal(errorEvent('notFound', 'session file missing before baseline'))
        return false
      }
      if (interrupted()) return false
      try {
        const filePath = await deps.resolvePath(deps.scopeId, deps.sessionId)
        if (interrupted()) return false
        loaded = await deps.loadFull(filePath)
      } catch (e) {
        if (e instanceof WebSessionError) {
          setTerminal(errorEvent(e.code as 'notFound', e.message, e.retryable))
        } else {
          setTerminal(errorEvent('ioUnavailable', `baseline load failed: ${String(e)}`, true))
        }
        return false
      }
      if (interrupted()) return false
      stPost = await adapter.statTranscript(deps.scopeId, deps.sessionId)
      if (!stPost) {
        setTerminal(errorEvent('notFound', 'session file disappeared during baseline'))
        return false
      }
      if (
        stPost.ino === stPre.ino &&
        stPost.sizeBytes === stPre.sizeBytes &&
        stPost.mtimeMs === stPre.mtimeMs
      ) {
        break
      }
      // 竞态窗口（采样期写入/替换）：有界重试一致 snapshot
      loaded = null
      stPost = null
      if (interrupted()) return false
    }
    if (!loaded || !stPost) {
      setTerminal(
        errorEvent('ioUnavailable', 'baseline snapshot never stabilized under concurrent writes', true),
      )
      return false
    }
    state = { messages: loaded.messages, leafUuids: loaded.leafUuids }
    generation = crypto.randomUUID()
    baselineId = crypto.randomUUID()
    revision = 0
    offset = stPost.sizeBytes
    anchorIno = stPost.ino
    lastMtimeMs = stPost.mtimeMs
    pendingPartial = Buffer.alloc(0)
    const projection = buildProjection(state, deps)
    const bytes = serializedProjectionBytes(projection)
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

  function ingestLines(
    lines: Buffer[],
  ): { changed: boolean; corrupt: string | null; oversize: boolean } {
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
        state.messages.set(rec.uuid, rec as unknown as ProjectionSourceMessage)
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
      if (deps.signal?.aborted || interrupted()) {
        if (deps.signal?.aborted && !interrupted()) {
          setTerminal(errorEvent('cancelled', 'follow aborted'))
        }
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
    if (!state || interrupted()) return
    const projection = buildProjection(state, deps)
    const bytes = serializedProjectionBytes(projection)
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
    try {
      armLease()
      const ok = await issueBaseline()
      // baseline 期间 close/cancel/终态 → 不启用 poll 循环（不可复活）
      if (!ok || interrupted()) return
      running = true
      while (running && !finished && !terminalEvent && !closeRequested) {
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
        if (interrupted() || finished) break
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
    } finally {
      // worker 实停才释放订阅槽（close 加盟本停止点）
      disarmLease()
      releaseOnce()
      workerDoneResolve?.()
    }
  }

  void run()

  return {
    [Symbol.asyncIterator](): AsyncIterator<WebSessionEvent> {
      return {
        async next(): Promise<IteratorResult<WebSessionEvent>> {
          if (queue.length > 0) {
            const ev = queue.shift()!
            if (isDataEvent(ev)) queuedBytes -= serializedProjectionBytes(ev)
            if (ev.kind === 'closed') {
              // closed 恒为唯一 terminal kind：送达即结算
              terminalDelivered = true
              finished = true
              disarmLease()
            }
            return { value: ev, done: false }
          }
          if (terminalDelivered || finished) {
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
      // 加盟 worker 实停（有界 2s；worker 在 finally 释放订阅槽）
      await Promise.race([
        workerDone,
        new Promise<void>(resolve => setTimeout(resolve, CLOSE_JOIN_TIMEOUT_MS)),
      ])
    },
  }
}
