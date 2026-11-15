/**
 * AtlasWeb S0-R 窄只读 session runtime factory（工单 §4.2 生命周期面 /
 * 呈批书 §7.3 scopeId 钉死）。
 *
 * R-1 首车：factory + 生命周期（start/close/epoch/不可重启）+ listSessions
 * （adapter 注入缝，隔离反例先红后绿）。R-2：replaySession/followSession
 * （follow 订阅机 src/atlascode/web/follow.ts）+ limits 全表解析 + 订阅槽/
 * 并发读计数 + cursor ledger。search/poll 恢复与 ./web-session-runtime 出口
 * = R-3。
 *
 * 纪律（工单 §4.2）：创建/import 零应用配置探测/零写盘/零 timer；start 才
 * 验授权配置；未 start 调用拒 closed('not started')；close 幂等可 await；
 * close 后不可 restart（重建新实例换 epoch）；实例状态全自持（cache/
 * revision/issued cursors/subscriptions/timers 实例字段，零全局槽）。
 */

import { randomUUID } from 'node:crypto'

import type { WebSessionProjection } from './contract'

import { CursorLedger } from './cursorLedger'
import { WebSessionError } from './errors'
import { createFollowSubscription, type FollowHandle } from './follow'
import {
  HARD_MAX_SCOPES_PER_RUNTIME,
  DEFAULT_MAX_SCAN_SESSIONS,
  HARD_MAX_SCAN_SESSIONS,
  DEFAULT_MAX_TRANSCRIPT_BYTES,
  HARD_MAX_TRANSCRIPT_BYTES,
  DEFAULT_PAGE_SIZE,
  HARD_MAX_PAGE_SIZE,
  DEFAULT_MAX_RECORD_BYTES,
  HARD_MAX_RECORD_BYTES,
  DEFAULT_MAX_PARSE_RECORDS,
  HARD_MAX_PARSE_RECORDS,
  DEFAULT_MAX_PROJECTION_BYTES,
  HARD_MAX_PROJECTION_BYTES,
  DEFAULT_MAX_SUBSCRIPTIONS,
  HARD_MAX_SUBSCRIPTIONS,
  DEFAULT_MAX_CONCURRENT_READS,
  HARD_MAX_CONCURRENT_READS,
  DEFAULT_MAX_PENDING_EVENTS,
  HARD_MAX_PENDING_EVENTS,
  DEFAULT_MAX_PENDING_BYTES,
  HARD_MAX_PENDING_BYTES,
  DEFAULT_POLLING_INTERVAL_MS,
  HARD_MIN_POLLING_INTERVAL_MS,
  HARD_MAX_POLLING_INTERVAL_MS,
  DEFAULT_REQUEST_DEADLINE_MS,
  HARD_MIN_REQUEST_DEADLINE_MS,
  HARD_MAX_REQUEST_DEADLINE_MS,
  DEFAULT_IDLE_LEASE_MS,
  HARD_MIN_IDLE_LEASE_MS,
  HARD_MAX_IDLE_LEASE_MS,
  DEFAULT_CURSOR_TTL_MS,
  HARD_MIN_CURSOR_TTL_MS,
  HARD_MAX_CURSOR_TTL_MS,
  DEFAULT_CLOSE_DEADLINE_MS,
  HARD_MIN_CLOSE_DEADLINE_MS,
  HARD_MAX_CLOSE_DEADLINE_MS,
  DEFAULT_LEDGER_CAPACITY,
  HARD_MAX_LEDGER_CAPACITY,
  DEFAULT_LEDGER_PAYLOAD_BYTES,
  HARD_MAX_LEDGER_PAYLOAD_BYTES,
  validateBoundedInt,
} from './limits'
import {
  projectConversation,
  serializedProjectionBytes,
  type ProjectionEngineDeps,
  type ProjectionSourceMessage,
} from './projection'
import type { SessionFileEntry, SessionStoreAdapter } from './sessionStoreAdapter'
import { createNodeFsSessionStoreAdapter } from './sessionStoreAdapter'

export type ReadonlySessionScopes = ReadonlyArray<{
  scopeId: string
  storageDir: string
}>

export interface ReadonlySessionLimits {
  maxTranscriptBytes?: number
  maxScanSessions?: number
  pageSize?: number
  maxRecordBytes?: number
  maxParseRecords?: number
  maxProjectionBytes?: number
  maxSubscriptions?: number
  maxConcurrentReads?: number
  maxPendingEvents?: number
  maxPendingBytes?: number
  pollingIntervalMs?: number
  requestDeadlineMs?: number
  idleLeaseMs?: number
  cursorTtlMs?: number
  closeDeadlineMs?: number
  ledgerCapacity?: number
  ledgerPayloadBytes?: number
}

/**
 * engine 注入缝（R-3：本域零 'src/engine' 直接导入——§4.5 pack 加载图
 * 审计面）。CLI 真体经 src/atlascode/web/runtimeDefault.ts cast 焊接
 * （引擎适配边界，不进 pack 图）；测试注入 fake。
 */
export interface ReadonlySessionEngine {
  /** 呈批书 §7.3 钉死复用形：loadTranscriptFull(precompactSkip force-full)。 */
  loadTranscriptFull: (filePath: string) => Promise<{
    messages: Map<string, ProjectionSourceMessage>
    leafUuids: Set<string>
  }>
  /** CLI 同规则链重建（projection 头注镜像义务）。 */
  buildConversationChain: ProjectionEngineDeps['buildConversationChain']
}

export interface ReadonlySessionRuntimeOptions {
  /** 静态产品标识（ProductDefinition 单源，'atlascode'）。 */
  productId: string
  /** 授权 scopes（scopeId ↔ storageDir 显式映射；不可缺省）。 */
  scopes: ReadonlySessionScopes
  /** engine 注入（loader + 链重建）；CLI 真体见 runtimeDefault.ts。 */
  engine: ReadonlySessionEngine
  /** 只读 storage adapter；缺省 = Node fs adapter（host 可注入 fake）。 */
  adapter?: SessionStoreAdapter
  limits?: ReadonlySessionLimits
}

export interface ListSessionsRequest {
  scopeId: string
}

export interface ListSessionsResult {
  sessions: Array<{
    sessionId: string
    title: string | null
    createdAt: string | null
    updatedAt: string
    messageCount: number | null
    productId: string
    scopeId: string
  }>
}

export interface ReplaySessionRequest {
  scopeId: string
  sessionId: string
}

export interface ReplaySessionResult {
  of: 'replaySession'
  projection: WebSessionProjection
}

export interface FollowSessionRequest {
  scopeId: string
  sessionId: string
  requestId?: string
}

export type FollowSubscription = FollowHandle

/** §4.4 全表解析值（start 时经 validateBoundedInt 钉死，host 不可越硬上限）。 */
export interface ResolvedLimits {
  maxTranscriptBytes: number
  maxScanSessions: number
  pageSize: number
  maxRecordBytes: number
  maxParseRecords: number
  maxProjectionBytes: number
  maxSubscriptions: number
  maxConcurrentReads: number
  maxPendingEvents: number
  maxPendingBytes: number
  pollingIntervalMs: number
  requestDeadlineMs: number
  idleLeaseMs: number
  cursorTtlMs: number
  closeDeadlineMs: number
  ledgerCapacity: number
  ledgerPayloadBytes: number
}

export interface ReadonlySessionRuntime {
  /** 实例纪元（重建新实例换 epoch；close 后旧 epoch 永不复用）。 */
  readonly epoch: string
  readonly limits: ResolvedLimits
  start(): Promise<void>
  listSessions(
    req: ListSessionsRequest,
    signal?: AbortSignal,
  ): Promise<ListSessionsResult>
  replaySession(
    req: ReplaySessionRequest,
    signal?: AbortSignal,
  ): Promise<ReplaySessionResult>
  followSession(
    req: FollowSessionRequest,
    signal?: AbortSignal,
  ): Promise<FollowSubscription>
  close(): Promise<void>
}

function toSummary(entry: SessionFileEntry, productId: string, scopeId: string) {
  return {
    sessionId: entry.sessionId,
    title: null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    messageCount: null,
    productId,
    scopeId,
  }
}

export function createReadonlySessionRuntime(
  options: ReadonlySessionRuntimeOptions,
): ReadonlySessionRuntime {
  const epoch = randomUUID()
  const adapter =
    options.adapter ??
    createNodeFsSessionStoreAdapter({
      productId: options.productId,
      scopes: options.scopes,
      limits: { maxTranscriptBytes: options.limits?.maxTranscriptBytes },
    })
  const L: ResolvedLimits = {
    maxTranscriptBytes: validateBoundedInt(
      'maxTranscriptBytes',
      options.limits?.maxTranscriptBytes,
      DEFAULT_MAX_TRANSCRIPT_BYTES,
      HARD_MAX_TRANSCRIPT_BYTES,
    ),
    maxScanSessions: validateBoundedInt(
      'maxScanSessions',
      options.limits?.maxScanSessions,
      DEFAULT_MAX_SCAN_SESSIONS,
      HARD_MAX_SCAN_SESSIONS,
    ),
    pageSize: validateBoundedInt(
      'pageSize',
      options.limits?.pageSize,
      DEFAULT_PAGE_SIZE,
      HARD_MAX_PAGE_SIZE,
    ),
    maxRecordBytes: validateBoundedInt(
      'maxRecordBytes',
      options.limits?.maxRecordBytes,
      DEFAULT_MAX_RECORD_BYTES,
      HARD_MAX_RECORD_BYTES,
    ),
    maxParseRecords: validateBoundedInt(
      'maxParseRecords',
      options.limits?.maxParseRecords,
      DEFAULT_MAX_PARSE_RECORDS,
      HARD_MAX_PARSE_RECORDS,
    ),
    maxProjectionBytes: validateBoundedInt(
      'maxProjectionBytes',
      options.limits?.maxProjectionBytes,
      DEFAULT_MAX_PROJECTION_BYTES,
      HARD_MAX_PROJECTION_BYTES,
    ),
    maxSubscriptions: validateBoundedInt(
      'maxSubscriptions',
      options.limits?.maxSubscriptions,
      DEFAULT_MAX_SUBSCRIPTIONS,
      HARD_MAX_SUBSCRIPTIONS,
    ),
    maxConcurrentReads: validateBoundedInt(
      'maxConcurrentReads',
      options.limits?.maxConcurrentReads,
      DEFAULT_MAX_CONCURRENT_READS,
      HARD_MAX_CONCURRENT_READS,
    ),
    maxPendingEvents: validateBoundedInt(
      'maxPendingEvents',
      options.limits?.maxPendingEvents,
      DEFAULT_MAX_PENDING_EVENTS,
      HARD_MAX_PENDING_EVENTS,
    ),
    maxPendingBytes: validateBoundedInt(
      'maxPendingBytes',
      options.limits?.maxPendingBytes,
      DEFAULT_MAX_PENDING_BYTES,
      HARD_MAX_PENDING_BYTES,
    ),
    pollingIntervalMs: validateBoundedInt(
      'pollingIntervalMs',
      options.limits?.pollingIntervalMs,
      DEFAULT_POLLING_INTERVAL_MS,
      HARD_MAX_POLLING_INTERVAL_MS,
      HARD_MIN_POLLING_INTERVAL_MS,
    ),
    requestDeadlineMs: validateBoundedInt(
      'requestDeadlineMs',
      options.limits?.requestDeadlineMs,
      DEFAULT_REQUEST_DEADLINE_MS,
      HARD_MAX_REQUEST_DEADLINE_MS,
      HARD_MIN_REQUEST_DEADLINE_MS,
    ),
    idleLeaseMs: validateBoundedInt(
      'idleLeaseMs',
      options.limits?.idleLeaseMs,
      DEFAULT_IDLE_LEASE_MS,
      HARD_MAX_IDLE_LEASE_MS,
      HARD_MIN_IDLE_LEASE_MS,
    ),
    cursorTtlMs: validateBoundedInt(
      'cursorTtlMs',
      options.limits?.cursorTtlMs,
      DEFAULT_CURSOR_TTL_MS,
      HARD_MAX_CURSOR_TTL_MS,
      HARD_MIN_CURSOR_TTL_MS,
    ),
    closeDeadlineMs: validateBoundedInt(
      'closeDeadlineMs',
      options.limits?.closeDeadlineMs,
      DEFAULT_CLOSE_DEADLINE_MS,
      HARD_MAX_CLOSE_DEADLINE_MS,
      HARD_MIN_CLOSE_DEADLINE_MS,
    ),
    ledgerCapacity: validateBoundedInt(
      'ledgerCapacity',
      options.limits?.ledgerCapacity,
      DEFAULT_LEDGER_CAPACITY,
      HARD_MAX_LEDGER_CAPACITY,
    ),
    ledgerPayloadBytes: validateBoundedInt(
      'ledgerPayloadBytes',
      options.limits?.ledgerPayloadBytes,
      DEFAULT_LEDGER_PAYLOAD_BYTES,
      HARD_MAX_LEDGER_PAYLOAD_BYTES,
    ),
  }
  const authorizedScopes = new Set(options.scopes.map(s => s.scopeId))
  let state: 'idle' | 'started' | 'closed' = 'idle'
  const subscriptions = new Set<FollowSubscription>()
  let activeReads = 0
  const cursorLedger = new CursorLedger(
    L.ledgerCapacity,
    L.cursorTtlMs,
    L.ledgerPayloadBytes,
  )

  function assertStarted(operation: string): void {
    if (state === 'idle') {
      throw new WebSessionError('closed', 'not started')
    }
    if (state === 'closed') {
      throw new WebSessionError('closed', `runtime closed: cannot ${operation}`)
    }
  }

  function assertScope(scopeId: string): void {
    if (!authorizedScopes.has(scopeId)) {
      throw new WebSessionError('scopeDenied', `scope not authorized: ${scopeId}`)
    }
  }

  /** 并发读槽（§4.4 maxConcurrentReads；超界 resourceLimit，不排队）。 */
  function acquireRead(): void {
    if (activeReads >= L.maxConcurrentReads) {
      throw new WebSessionError(
        'resourceLimit',
        `concurrent read limit exceeded (${activeReads} >= ${L.maxConcurrentReads})`,
      )
    }
    activeReads++
  }

  function releaseRead(): void {
    activeReads--
  }

  async function resolvePath(scopeId: string, sessionId: string): Promise<string> {
    assertScope(scopeId)
    return adapter.resolveTranscriptPath(scopeId, sessionId)
  }

  /**
   * replay 投影加载（§4.3 一致 snapshot）：尺寸资源界先于 loadFull；
   * 前后双采样三元组全等方采纳（loader 车道 TOCTOU 守卫——validated fd
   * 关闭后按路径重开窗口内文件不得替换），不配有界重试 → ioUnavailable
   * retryable。投影序列化字节 ≤ maxProjectionBytes 交付界（零半投影）。
   */
  async function loadProjection(
    scopeId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<WebSessionProjection> {
    acquireRead()
    try {
      if (signal?.aborted) {
        throw new WebSessionError('cancelled', 'operation aborted')
      }
      // 尺寸资源界先于 loadFull（adapter stat O(1) 通道；零隐式截断）
      const stPre = await adapter.statTranscript(scopeId, sessionId)
      if (!stPre) {
        throw new WebSessionError('notFound', `session not found: ${sessionId}`)
      }
      if (stPre.sizeBytes > L.maxTranscriptBytes) {
        throw new WebSessionError(
          'resourceLimit',
          `transcript exceeds limit (${stPre.sizeBytes} > ${L.maxTranscriptBytes} bytes)`,
        )
      }
      const filePath = await resolvePath(scopeId, sessionId)
      // 呈批书 §7.3 钉死复用形：loadTranscriptFull(precompactSkip force-full)
      const loaded = await options.engine.loadTranscriptFull(filePath)
      if (signal?.aborted) {
        throw new WebSessionError('cancelled', 'operation aborted')
      }
      const stPost = await adapter.statTranscript(scopeId, sessionId)
      if (
        !stPost ||
        stPost.ino !== stPre.ino ||
        stPost.sizeBytes !== stPre.sizeBytes ||
        stPost.mtimeMs !== stPre.mtimeMs
      ) {
        throw new WebSessionError(
          'ioUnavailable',
          'transcript changed during replay load (snapshot inconsistency)',
          true,
        )
      }
      const projection = projectConversation(
        loaded,
        { sessionId, productId: options.productId, scopeId },
        { buildConversationChain: options.engine.buildConversationChain },
      )
      const bytes = serializedProjectionBytes(projection)
      if (bytes > L.maxProjectionBytes) {
        throw new WebSessionError(
          'resourceLimit',
          `projection exceeds limit (${bytes} > ${L.maxProjectionBytes} bytes)`,
        )
      }
      return projection
    } finally {
      releaseRead()
    }
  }

  return {
    epoch,
    limits: L,

    async start(): Promise<void> {
      if (state === 'closed') {
        throw new WebSessionError(
          'closed',
          'runtime closed: start cannot restart; create a new runtime (new epoch)',
        )
      }
      if (state === 'started') return
      if (options.productId !== 'atlascode') {
        throw new WebSessionError(
          'invalidRequest',
          `productId must be 'atlascode' (static ProductDefinition), got '${options.productId}'`,
        )
      }
      if (options.scopes.length === 0) {
        throw new WebSessionError('invalidRequest', 'at least one scope required')
      }
      if (options.scopes.length > HARD_MAX_SCOPES_PER_RUNTIME) {
        throw new WebSessionError(
          'invalidRequest',
          `too many scopes (${options.scopes.length} > ${HARD_MAX_SCOPES_PER_RUNTIME})`,
        )
      }
      const seen = new Set<string>()
      for (const s of options.scopes) {
        if (seen.has(s.scopeId)) {
          throw new WebSessionError(
            'invalidRequest',
            `duplicate scopeId: ${s.scopeId}`,
          )
        }
        seen.add(s.scopeId)
      }
      await adapter.start()
      state = 'started'
    },

    async listSessions(
      req: ListSessionsRequest,
      signal?: AbortSignal,
    ): Promise<ListSessionsResult> {
      assertStarted('list sessions')
      assertScope(req.scopeId)
      const entries = await adapter.listSessionFiles(req.scopeId)
      if (entries.length > L.maxScanSessions) {
        throw new WebSessionError(
          'resourceLimit',
          `scope ${req.scopeId} exceeds scan limit (${entries.length} > ${L.maxScanSessions})`,
        )
      }
      void signal
      return {
        sessions: entries.map(e => toSummary(e, options.productId, req.scopeId)),
      }
    },

    async replaySession(
      req: ReplaySessionRequest,
      signal?: AbortSignal,
    ): Promise<ReplaySessionResult> {
      assertStarted('replay session')
      assertScope(req.scopeId)
      const projection = await loadProjection(req.scopeId, req.sessionId, signal)
      return { of: 'replaySession', projection }
    },

    async followSession(
      req: FollowSessionRequest,
      signal?: AbortSignal,
    ): Promise<FollowSubscription> {
      assertStarted('follow session')
      assertScope(req.scopeId)
      if (subscriptions.size >= L.maxSubscriptions) {
        throw new WebSessionError(
          'resourceLimit',
          `subscription limit exceeded (${subscriptions.size} >= ${L.maxSubscriptions})`,
        )
      }
      const handle = createFollowSubscription({
        adapter,
        productId: options.productId,
        scopeId: req.scopeId,
        sessionId: req.sessionId,
        subscriptionId: randomUUID(),
        ...(req.requestId ? { requestId: req.requestId } : {}),
        limits: {
          pollingIntervalMs: L.pollingIntervalMs,
          idleLeaseMs: L.idleLeaseMs,
          pendingEvents: L.maxPendingEvents,
          pendingBytes: L.maxPendingBytes,
          maxProjectionBytes: L.maxProjectionBytes,
          maxRecordBytes: L.maxRecordBytes,
        },
        signal,
        ledger: cursorLedger,
        loadFull: options.engine.loadTranscriptFull,
        buildConversationChain: options.engine.buildConversationChain,
        resolvePath,
        onRelease: () => subscriptions.delete(handle),
      })
      subscriptions.add(handle)
      return handle
    },

    async close(): Promise<void> {
      if (state === 'closed') return
      state = 'closed'
      // 关停全部活跃订阅（close deadline 界；closed 终态高优先可覆一切）
      const deadline = new Promise<void>(resolve =>
        setTimeout(resolve, L.closeDeadlineMs),
      )
      await Promise.race([
        Promise.all(
          [...subscriptions].map(async sub => {
            try {
              await sub.close()
            } catch {
              // 关停面不抛：close deadline 兜底
            }
          }),
        ),
        deadline,
      ])
      subscriptions.clear()
      await adapter.close()
    },
  }
}
