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
import {
  TranscriptChangedDuringReadError,
  TranscriptTooLargeError,
} from '../../engine/session/readonly'
import type { ReplayPageReader } from '../../engine/session/readonly'

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
  DEFAULT_MAX_FOLLOW_PROJECTION_BYTES,
  HARD_MAX_PROJECTION_BYTES,
  DEFAULT_MAX_REPLAY_PAGE_BYTES,
  HARD_MAX_REPLAY_PAGE_BYTES,
  TITLE_HEAD_BYTES,
  TITLE_MAX_CODE_POINTS,
  TITLE_USER_MESSAGE_CODE_POINTS,
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
import { loadReplayPage } from './replayPaging'
import type { SessionFileEntry, SessionStoreAdapter } from './sessionStoreAdapter'
import { createNodeFsSessionStoreAdapter } from './sessionStoreAdapter'
// S0-R4 件 A（呈批书 L1）：搜索文本面真体复用（含 WeakMap 缓存 +
// RENDERED_AS_SENTINEL 防虚影；缓存键 = 消息对象实例——跨请求零共享可变
// 会话态，双实例隔离机制面）。engine/session 子域内 import（载体闭包允许面）。
import { renderableSearchText } from '../../engine/session/search'

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
  /** F6-PAGE 必改③：replay 分页单页序列化字节界（DEFAULT 4MiB / HARD 16MiB）。 */
  maxReplayPageBytes?: number
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
  /** 呈批书 §7.3 钉死复用形：loadTranscriptFull(precompactSkip force-full)。S0-R3 加性 maxBytes（工单 §8-2；undefined = 不设界）。S0-R4 加性 expectIno（工单 §11-1 F1 授权身份锚；undefined = 不锚定）。 */
  loadTranscriptFull: (
    filePath: string,
    opts?: { maxBytes?: number; expectIno?: number },
  ) => Promise<{
    messages: Map<string, ProjectionSourceMessage>
    leafUuids: Set<string>
  }>
  /** CLI 同规则链重建（projection 头注镜像义务）。 */
  buildConversationChain: ProjectionEngineDeps['buildConversationChain']
  /**
   * F6-PAGE S1 加性缝：replay 分页 skeleton 扫描（真体 =
   * engine/session/replayScan.ts，runtimeDefault 焊接；测试 fake 可缺席
   * ——分页请求遇缺席 → invalidRequest fail-closed）。
   */
  openReplayPageReader?: (
    filePath: string,
    opts?: { maxBytes?: number; expectIno?: number },
  ) => Promise<ReplayPageReader>
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
  /**
   * F6-PAGE S1 加性分页参（wire 契约 PageFields 同形；schemaVersion=0
   * optional 不破版）。任一在场 → 分页装窗路径；双缺省 = 旧全量 replay
   * 逐字节不变（A1 对表腿）。
   */
  pageSize?: number
  pageToken?: string
}

export interface ReplaySessionResult {
  of: 'replaySession'
  projection: WebSessionProjection
  /** F6-PAGE S1 加性（分页请求恒发；全量请求零新键）。 */
  hasMore?: boolean
  /** 仅 hasMore=true 时在场（opaque token，replayPaging.ts 编解码单源）。 */
  nextPageToken?: string
}

export interface FollowSessionRequest {
  scopeId: string
  sessionId: string
  requestId?: string
  /**
   * S0-R5 ③（呈批书 §3 @6e772c02，f4 §13 批复）：opaque resume cursor
   * （账本 token）。在场 → 续接支（零 baseline 事件，断连窗 append 从
   * 文件本身恢复）；verify 三因（unknown/expired/mismatch）→ resetRequired
   * 显式分态。协议形 webSessionV0 FollowSessionRequestSchema.resumeCursor
   * optional（本域信任上层已验，运行面 opaque string）。
   */
  resumeCursor?: string
}

/** S0-R4 件 A（工单 §3/呈批书 L1，f4 §10 @7ecf0fa4 批复）：query 界（1-256 code points）= 契约面钉死（webSessionV0），runtime 信任上层已验。 */
export interface SearchSessionsRequest {
  scopeId: string
  query: string
  pageSize?: number
  /** opaque offset cursor（会话列表序内偏移编码；不跨进程有效、mtime 漂移容忍=越界空页）。 */
  pageToken?: string
}

export interface SearchSessionsResult {
  results: Array<{
    sessionId: string
    messageId: string
    /** ≤512 Unicode code points（契约 SearchResultSchema）；命中起点起切片。 */
    snippet: string
  }>
  nextPageToken?: string
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
  maxReplayPageBytes: number
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
  /** S0-R4 件 A 第四面：会话级搜索（AbortSignal A 形，'cancelled' 零 partial payload）。 */
  searchSessions(
    req: SearchSessionsRequest,
    signal?: AbortSignal,
  ): Promise<SearchSessionsResult>
  close(): Promise<void>
}

function toSummary(entry: SessionFileEntry, productId: string, scopeId: string) {
  return {
    sessionId: entry.sessionId,
    title: null as string | null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    messageCount: null as number | null,
    productId,
    scopeId,
  }
}

/** user message content → 可标题化文本（string 直用；块数组取 text 块拼接）。 */
function userMessageText(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'object' && block !== null
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string') {
      parts.push((block as { text: string }).text)
    }
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** code point 安全截断（wire 契约 title ≤512；代理对面 TS 长度失真）。
 *  加省略号时总长仍 ≤max（省略号占一个码点窗位）。 */
function clampCodePoints(text: string, max: number, ellipsis = false): string {
  const points = Array.from(text)
  if (points.length <= max) return text
  const keep = ellipsis ? max - 1 : max
  return `${points.slice(0, keep).join('')}…`
}

/**
 * G-D（2026-11-20 用户裁「载体根修 0.1.125」）：list 面 title 提取——
 * 头读窗内完整行解析（尾截半行不解析不崩），优先序
 * custom-title → summary → 首条 user 消息（空白折叠 + 展示截断）。
 * messageCount：文件全读尽（sizeBytes ≤ 头读窗）→ user+assistant 精确
 * 计数；超界 → null（诚实不精确面，宁缺勿伪）。
 */
function extractListFace(
  bytes: Uint8Array,
  fullRead: boolean,
): { title: string | null; messageCount: number | null } {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const lines = text.split('\n')
  // 尾行：文件以 \n 结尾 → ''（丢弃空尾）；否则半行（不解析，丢弃）
  lines.pop()
  let customTitle: string | null = null
  let summaryText: string | null = null
  let firstUserText: string | null = null
  let messageCount: number | null = fullRead ? 0 : null
  for (const line of lines) {
    if (line.length === 0) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue // 坏行跳过（半行已在窗尾丢弃；窗内坏行不毒化）
    }
    const type = entry.type
    if (type === 'custom-title' && typeof entry.customTitle === 'string'
      && customTitle === null) {
      customTitle = entry.customTitle
    } else if (type === 'summary' && typeof entry.summary === 'string'
      && summaryText === null) {
      summaryText = entry.summary
    } else if ((type === 'user' || type === 'assistant')) {
      if (messageCount !== null) messageCount++
      if (type === 'user' && firstUserText === null) {
        const text2 = userMessageText(entry.message)
        if (text2 !== null && text2.trim().length > 0) firstUserText = text2
      }
    }
  }
  const raw = customTitle ?? summaryText ?? firstUserText
  let title: string | null = null
  if (raw !== null) {
    const collapsed = raw.replace(/\s+/gu, ' ').trim()
    if (collapsed.length > 0) {
      title = clampCodePoints(
        collapsed,
        raw === firstUserText && customTitle === null && summaryText === null
          ? TITLE_USER_MESSAGE_CODE_POINTS
          : TITLE_MAX_CODE_POINTS,
        true,
      )
    }
  }
  return { title, messageCount }
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
    maxReplayPageBytes: validateBoundedInt(
      'maxReplayPageBytes',
      options.limits?.maxReplayPageBytes,
      DEFAULT_MAX_REPLAY_PAGE_BYTES,
      HARD_MAX_REPLAY_PAGE_BYTES,
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
      // 呈批书 §7.3 钉死复用形：loadTranscriptFull(precompactSkip force-full)。
      // S0-R3（工单 §8-2）：maxBytes 单源自 L.maxTranscriptBytes（limits 表
      // 禁第二常量）——loader fstat 后检查点闭合 交接窗→load 之间的超界窗
      // （预解析拦截，零全量驻留）；定型错映射 resourceLimit（message 安全化，
      // 消费回归腿①接口缝）。
      let loaded
      try {
        loaded = await options.engine.loadTranscriptFull(filePath, {
          maxBytes: L.maxTranscriptBytes,
          // S0-R4 F1（工单 §11-1/呈批书 L3）：授权锚 = 既有双采样三元组之
          // pre-stat（stPre.ino）传入——零新采样点。错配 → loader 复用
          // TranscriptChangedDuringReadError → 下方既有 ioUnavailable
          // retryable 映射面不变。
          expectIno: stPre.ino,
        })
      } catch (e) {
        if (e instanceof TranscriptTooLargeError) {
          throw new WebSessionError(
            'resourceLimit',
            `transcript exceeds limit (${e.size} > ${e.maxBytes} bytes)`,
          )
        }
        if (e instanceof TranscriptChangedDuringReadError) {
          throw new WebSessionError(
            'ioUnavailable',
            e.message,
            true,
          )
        }
        throw e
      }
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
      // G-D（2026-11-20）：title/messageCount 头读提取。per-session 容错——
      // 单会话头读失败（竞态删/身份变化）→ 该行诚实 null，不毒化整列。
      const sessions = await Promise.all(entries.map(async e => {
        const summary = toSummary(e, options.productId, req.scopeId)
        try {
          const head = await adapter.readTranscriptHead?.(
            req.scopeId,
            e.sessionId,
            TITLE_HEAD_BYTES,
            signal,
          )
          if (head !== undefined) {
            const face = extractListFace(head.bytes, head.sizeBytes <= TITLE_HEAD_BYTES)
            summary.title = face.title
            summary.messageCount = face.messageCount
          }
        } catch {
          // 提取降级：title/messageCount 保持 null（诚实缺省）
        }
        return summary
      }))
      return { sessions }
    },

    /**
     * S0-R4 件 A searchSessions（工单 §3 格 1-2 + §9 取消语义 A；呈批书
     * L1/L2，f4 §10 @7ecf0fa4 批复）：
     * - 会话集与 listSessions 同源（同一 adapter.listSessionFiles，mtime desc）。
     * - 每会话经 engine 注入缝 loadTranscriptFull（opts 在场支 = fd 链域；
     *   expectIno = adapter statTranscript ino 采样，F1 授权锚同形）取全量
     *   加载后按有效会话投影链（terminal leaf 同规则镜像）逐消息
     *   renderableSearchText 匹配（大小写码点折叠；死分支不搜索防虚影）。
     * - 取消语义 A：per-session × per-record 检查点轮询；中止 → 'cancelled'
     *   分态，零 partial payload（弃半扫，不携带部分结果）。
     * - 扫描界双界单源 limits.ts：maxScanSessions（会话集）×
     *   maxParseRecords（单会话加载后核验）→ resourceLimit 既有映射面。
     * - 分页：pageToken = opaque offset cursor（会话列表序内偏移；非法
     *   token → invalidRequest 契约形拒绝；mtime 漂移容忍 = 越界空页）。
     *   分页粒度 = 会话边界（同会话命中整会话交付，token 指向次会话）。
     */
    async searchSessions(
      req: SearchSessionsRequest,
      signal?: AbortSignal,
    ): Promise<SearchSessionsResult> {
      assertStarted('search sessions')
      assertScope(req.scopeId)
      const needle = req.query.toLowerCase()
      const pageSize = Math.max(1, Math.min(req.pageSize ?? L.pageSize, L.pageSize))
      let offset = 0
      if (req.pageToken !== undefined) {
        if (!/^\d+$/.test(req.pageToken)) {
          throw new WebSessionError('invalidRequest', 'malformed pageToken')
        }
        offset = Number.parseInt(req.pageToken, 10)
      }
      acquireRead()
      try {
        if (signal?.aborted) {
          throw new WebSessionError('cancelled', 'operation aborted')
        }
        const entries = await adapter.listSessionFiles(req.scopeId)
        if (entries.length > L.maxScanSessions) {
          throw new WebSessionError(
            'resourceLimit',
            `scope ${req.scopeId} exceeds scan limit (${entries.length} > ${L.maxScanSessions})`,
          )
        }
        const results: SearchSessionsResult['results'] = []
        for (let i = offset; i < entries.length; i++) {
          const entry = entries[i]
          // per-session 检查点（§9 取消语义 A）
          if (signal?.aborted) {
            throw new WebSessionError('cancelled', 'operation aborted')
          }
          // F1 授权锚采样（adapter O(1) stat 通道）：ino 传入 loader
          // expectIno 臂。null = mid-scan 删除（授权集已不含，诚实跳过）。
          const st = await adapter.statTranscript(req.scopeId, entry.sessionId)
          if (!st) continue
          if (st.sizeBytes > L.maxTranscriptBytes) {
            throw new WebSessionError(
              'resourceLimit',
              `transcript exceeds limit (${st.sizeBytes} > ${L.maxTranscriptBytes} bytes)`,
            )
          }
          let loaded
          try {
            loaded = await options.engine.loadTranscriptFull(entry.filePath, {
              maxBytes: L.maxTranscriptBytes,
              expectIno: st.ino,
            })
          } catch (e) {
            if (e instanceof TranscriptTooLargeError) {
              throw new WebSessionError(
                'resourceLimit',
                `transcript exceeds limit (${e.size} > ${e.maxBytes} bytes)`,
              )
            }
            if (e instanceof TranscriptChangedDuringReadError) {
              throw new WebSessionError('ioUnavailable', e.message, true)
            }
            throw e
          }
          // 单会话解析记录界（双界之二；字节界 maxBytes 已预解析拦截）
          if (loaded.messages.size > L.maxParseRecords) {
            throw new WebSessionError(
              'resourceLimit',
              `transcript exceeds parse record limit (${loaded.messages.size} > ${L.maxParseRecords})`,
            )
          }
          // 有效会话投影链（projection.ts projectConversation leaf 选取同
          // 规则镜像：terminal leaf 中 timestamp 最新者，并列取先见者）；
          // 死分支不搜索（防虚影，呈批书 L1「有效会话投影内」）。
          let leaf: ProjectionSourceMessage | undefined
          for (const uuid of loaded.leafUuids) {
            const m = loaded.messages.get(uuid)
            if (!m) continue
            if (!leaf || (m.timestamp ?? '') >= (leaf.timestamp ?? '')) {
              leaf = m
            }
          }
          const chain = leaf
            ? options.engine.buildConversationChain(loaded.messages, leaf)
            : []
          for (const m of chain) {
            // per-record 检查点（§9 取消语义 A）
            if (signal?.aborted) {
              throw new WebSessionError('cancelled', 'operation aborted')
            }
            if (m.type !== 'user' && m.type !== 'assistant') continue
            const text = renderableSearchText(
              m as unknown as Parameters<typeof renderableSearchText>[0],
            )
            const idx = text.indexOf(needle)
            if (idx === -1) continue
            // snippet：命中起点起 ≤512 code points（Array.from 保 surrogate
            // pair 完整；1024 UTF-16 units ≥ 512 code points 恒成立）
            const snippet = Array.from(text.slice(idx, idx + 1024))
              .slice(0, 512)
              .join('')
            results.push({
              sessionId: entry.sessionId,
              messageId: m.uuid,
              snippet,
            })
          }
          if (results.length >= pageSize) {
            return { results, nextPageToken: String(i + 1) }
          }
        }
        return { results }
      } finally {
        releaseRead()
      }
    },

    async replaySession(
      req: ReplaySessionRequest,
      signal?: AbortSignal,
    ): Promise<ReplaySessionResult> {
      assertStarted('replay session')
      assertScope(req.scopeId)
      // F6-PAGE S1：分页参任一在场（含显式 undefined 键）→ 分页装窗路径
      // （replayPaging.ts；零全量驻留）；双缺省 = 旧全量 replay 零变更。
      if ('pageSize' in req || 'pageToken' in req) {
        const open = options.engine.openReplayPageReader
        if (!open) {
          throw new WebSessionError(
            'invalidRequest',
            'replay paging not supported by injected engine',
          )
        }
        acquireRead()
        try {
          const paged = await loadReplayPage(
            {
              adapter,
              engine: {
                openReplayPageReader: open,
                buildConversationChain: options.engine.buildConversationChain,
              },
              limits: L,
              productId: options.productId,
            },
            req.scopeId,
            req.sessionId,
            req,
            signal,
          )
          return {
            of: 'replaySession',
            projection: paged.projection,
            hasMore: paged.hasMore,
            ...(paged.nextPageToken !== undefined
              ? { nextPageToken: paged.nextPageToken }
              : {}),
          }
        } finally {
          releaseRead()
        }
      }
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
        // S0-R5 ③：resumeCursor 透传（缺省臂既有形恒等）
        ...(req.resumeCursor ? { resumeCursor: req.resumeCursor } : {}),
        limits: {
          pollingIntervalMs: L.pollingIntervalMs,
          idleLeaseMs: L.idleLeaseMs,
          pendingEvents: L.maxPendingEvents,
          pendingBytes: L.maxPendingBytes,
          // #277 格 1 根修 A1（呈批书 §1-A1 显式配置优先序）：host 显式
          // maxProjectionBytes → 两面同用（不越显式值）；缺省 → follow 16 MiB
          // （DEFAULT_MAX_FOLLOW_PROJECTION_BYTES）/ replay 4 MiB 分面解析。
          // 禁改 DEFAULT_MAX_PROJECTION_BYTES 本体（replay 全量面 :625 泄漏
          // 险——§2-6 非泄漏判别锁）。
          maxProjectionBytes:
            options.limits?.maxProjectionBytes ??
            DEFAULT_MAX_FOLLOW_PROJECTION_BYTES,
          maxRecordBytes: L.maxRecordBytes,
          // S0-R5 ②：重采样/续接全量读成本上界（钉 3；adapter readTranscript
          // 同源同界——单一事实源 L.maxTranscriptBytes）
          maxTranscriptBytes: L.maxTranscriptBytes,
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
