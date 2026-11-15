/**
 * AtlasWeb S0-R 窄只读 session runtime factory（工单 §4.2 生命周期面 /
 * 呈批书 §7.3 scopeId 钉死）。
 *
 * R-1 首车：factory + 生命周期（start/close/epoch/不可重启）+ listSessions
 * （adapter 注入缝，隔离反例先红后绿）。replay/follow/search/poll 恢复 =
 * R-2；./web-session-runtime 出口 = R-3。
 *
 * 纪律（工单 §4.2）：创建/import 零应用配置探测/零写盘/零 timer；start 才
 * 验授权配置；未 start 调用拒 closed('not started')；close 幂等可 await；
 * close 后不可 restart（重建新实例换 epoch）；实例状态全自持（cache/
 * revision/issued cursors/subscriptions/timers 实例字段，零全局槽）。
 */

import { randomUUID } from 'node:crypto'

import { WebSessionError } from './errors'
import {
  HARD_MAX_SCOPES_PER_RUNTIME,
  DEFAULT_MAX_SCAN_SESSIONS,
  HARD_MAX_SCAN_SESSIONS,
  validateBoundedInt,
} from './limits'
import type { SessionFileEntry, SessionStoreAdapter } from './sessionStoreAdapter'
import { createNodeFsSessionStoreAdapter } from './sessionStoreAdapter'

export type ReadonlySessionScopes = ReadonlyArray<{
  scopeId: string
  storageDir: string
}>

export interface ReadonlySessionRuntimeOptions {
  /** 静态产品标识（ProductDefinition 单源，'atlascode'）。 */
  productId: string
  /** 授权 scopes（scopeId ↔ storageDir 显式映射；不可缺省）。 */
  scopes: ReadonlySessionScopes
  /** 只读 storage adapter；缺省 = Node fs adapter（host 可注入 fake）。 */
  adapter?: SessionStoreAdapter
  limits?: {
    maxScanSessions?: number
  }
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

export interface ReadonlySessionRuntime {
  /** 实例纪元（重建新实例换 epoch；close 后旧 epoch 永不复用）。 */
  readonly epoch: string
  start(): Promise<void>
  listSessions(
    req: ListSessionsRequest,
    signal?: AbortSignal,
  ): Promise<ListSessionsResult>
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
    })
  const maxScanSessions = validateBoundedInt(
    'maxScanSessions',
    options.limits?.maxScanSessions,
    DEFAULT_MAX_SCAN_SESSIONS,
    HARD_MAX_SCAN_SESSIONS,
  )
  const authorizedScopes = new Set(options.scopes.map(s => s.scopeId))
  let state: 'idle' | 'started' | 'closed' = 'idle'

  function assertStarted(operation: string): void {
    if (state === 'idle') {
      throw new WebSessionError('closed', 'not started')
    }
    if (state === 'closed') {
      throw new WebSessionError('closed', `runtime closed: cannot ${operation}`)
    }
  }

  return {
    epoch,

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
      if (!authorizedScopes.has(req.scopeId)) {
        throw new WebSessionError(
          'scopeDenied',
          `scope not authorized: ${req.scopeId}`,
        )
      }
      const entries = await adapter.listSessionFiles(req.scopeId)
      if (entries.length > maxScanSessions) {
        throw new WebSessionError(
          'resourceLimit',
          `scope ${req.scopeId} exceeds scan limit (${entries.length} > ${maxScanSessions})`,
        )
      }
      void signal
      return {
        sessions: entries.map(e => toSummary(e, options.productId, req.scopeId)),
      }
    },

    async close(): Promise<void> {
      if (state === 'closed') return
      state = 'closed'
      await adapter.close()
    },
  }
}
