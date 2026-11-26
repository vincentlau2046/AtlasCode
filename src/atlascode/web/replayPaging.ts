/**
 * F6-PAGE S1 — replay 分页装窗读路径 web 层（工单
 * docs/2026-11-25-f6-page-ticket.md §B 必改①②③定形；engine 侧 skeleton
 * 扫描见 src/engine/session/replayScan.ts）。
 *
 * pass2 + token 面：
 *  - token = opaque base64url JSON {v:1,scopeId,sessionId,offset,anchor}；
 *    anchor = 有效投影链 uuid 前缀 [0..offset) 指纹（SHA-256 截断 16 hex）。
 *    必改②三分态：append 前缀稳定 → 续页合法 / rewrite·compact（前缀漂移
 *    或 offset 越新链界）→ cursorExpired 含界内序数（禁错页静默）/ 域外
 *    （跨 scope/session 重放、malformed）→ invalidRequest。域绑定 =
 *    scopeId+sessionId 双字段。
 *  - 页双界（必改③）：records ≤ clamp(pageSize, L.pageSize) × bytes ≤
 *    L.maxReplayPageBytes（窗口 messages JSON 序列化字节；超界收页 leg +
 *    单记录独超页界 → resourceLimit，零隐式截断）。
 *  - 快照一致性序 = statPre → openReplayPageReader(expectIno) → 扫描/窗口
 *    → close → statPost 三元组全等（复用全量路径既有 ioUnavailable
 *    retryable 面）。分页路径扫描界 = HARD_MAX_TRANSCRIPT_BYTES（256MiB
 *    硬天花板复用单源；L.maxTranscriptBytes 帽不施加——超旧帽转录可分页
 *    可达，必改①帽语义分态）。maxParseRecords 不施加（勘正②：search 面
 *    专用帽）。
 *
 * 渲染 parity：页序数 = 有效投影链记录序（user/assistant 且 projectBlocks
 * 非空，全量 projectConversation 同规则）；窗口 messages 由 pass2 对页内
 * 记录原文（readRanges 字节随机读）全量渲染——与全量 replay 逐字段同形
 * （A2 对表腿守卫）。skeleton（内容剥除面）只用于链/可渲染性判定。
 */
import { createHash } from 'node:crypto'

import type { ReplayByteRange, ReplayPageReader } from '../../engine/session/readonly'
import {
  TranscriptChangedDuringReadError,
  TranscriptTooLargeError,
} from '../../engine/session/readonly'
import type { WebSessionProjection, WebSessionProjectionMessage } from '../../kernel/protocol/webSessionV0'
import type { ResolvedLimits } from './readonlyRuntime'
import { WebSessionError } from './errors'
import { HARD_MAX_TRANSCRIPT_BYTES } from './limits'
import {
  computeLeafUuids,
  projectBlocks,
  type ProjectionSourceMessage,
} from './projection'
import type { SessionStoreAdapter } from './sessionStoreAdapter'

// ── token 编解码（opaque；三层校验：b64url → JSON → 字段域）─────────────────

interface ReplayPageToken {
  v: 1
  scopeId: string
  sessionId: string
  offset: number
  anchor: string
}

function encodePageToken(t: ReplayPageToken): string {
  return Buffer.from(JSON.stringify(t), 'utf8').toString('base64url')
}

function decodePageToken(token: string): ReplayPageToken {
  const invalid = () =>
    new WebSessionError('invalidRequest', 'malformed replay pageToken')
  let raw: string
  try {
    raw = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    throw invalid()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw invalid()
  }
  if (!parsed || typeof parsed !== 'object') throw invalid()
  const t = parsed as Record<string, unknown>
  if (
    t.v !== 1 ||
    typeof t.scopeId !== 'string' ||
    typeof t.sessionId !== 'string' ||
    typeof t.offset !== 'number' ||
    !Number.isInteger(t.offset) ||
    t.offset < 0 ||
    typeof t.anchor !== 'string' ||
    !/^[0-9a-f]{16}$/.test(t.anchor)
  ) {
    throw invalid()
  }
  return t as unknown as ReplayPageToken
}

/** 链 uuid 前缀指纹（必改②漂移锚）：SHA-256 截断 16 hex。 */
function chainPrefixFingerprint(uuids: ReadonlyArray<string>): string {
  return createHash('sha256')
    .update(uuids.join('\n'), 'utf8')
    .digest('hex')
    .slice(0, 16)
}

// ── pass2 渲染（页内记录原文 → 中立投影消息；全量 projectConversation 同形）──

function renderRecord(raw: Uint8Array): WebSessionProjectionMessage {
  let entry: Record<string, unknown>
  try {
    entry = JSON.parse(Buffer.from(raw).toString('utf8')) as Record<string, unknown>
  } catch {
    // 扫描与读取之间行损坏（快照守卫通常已拦）——ioUnavailable retryable
    throw new WebSessionError(
      'ioUnavailable',
      'paged record unreadable (snapshot inconsistency)',
      true,
    )
  }
  const source: ProjectionSourceMessage = {
    uuid: entry.uuid as string,
    parentUuid: (entry.parentUuid as string | null) ?? null,
    type: entry.type as string,
    timestamp: (entry.timestamp as string | undefined) ?? null,
    ...(entry.message !== undefined
      ? { message: entry.message as { content?: unknown } }
      : {}),
  }
  return {
    id: source.uuid,
    role: source.type as 'user' | 'assistant',
    createdAt: source.timestamp ?? null,
    blocks: projectBlocks(source),
  }
}

// ── 主路径 ────────────────────────────────────────────────────────────────────

export interface ReplayPagedRequest {
  pageSize?: number
  pageToken?: string
}

export interface ReplayPageDeps {
  adapter: SessionStoreAdapter
  engine: {
    openReplayPageReader: (
      filePath: string,
      opts?: { maxBytes?: number; expectIno?: number },
    ) => Promise<ReplayPageReader>
    buildConversationChain: (
      messages: Map<string, ProjectionSourceMessage>,
      leaf: ProjectionSourceMessage,
    ) => ProjectionSourceMessage[]
  }
  limits: ResolvedLimits
  productId: string
}

export interface ReplayPageResult {
  projection: WebSessionProjection
  hasMore: boolean
  nextPageToken?: string
}

export async function loadReplayPage(
  deps: ReplayPageDeps,
  scopeId: string,
  sessionId: string,
  req: ReplayPagedRequest,
  signal?: AbortSignal,
): Promise<ReplayPageResult> {
  const { adapter, engine, limits: L } = deps

  // ① token 解码 + 域绑定（先于 stat：域外 token 与文件存在性正交）
  let tok: ReplayPageToken | undefined
  if (req.pageToken !== undefined) {
    tok = decodePageToken(req.pageToken)
    if (tok.scopeId !== scopeId || tok.sessionId !== sessionId) {
      throw new WebSessionError(
        'invalidRequest',
        'replay pageToken domain mismatch (scopeId/sessionId bound)',
      )
    }
  }
  const pageSize = Math.max(1, Math.min(req.pageSize ?? L.pageSize, L.pageSize))

  // ② statPre（notFound 同全量形）
  const stPre = await adapter.statTranscript(scopeId, sessionId)
  if (!stPre) {
    throw new WebSessionError('notFound', `session not found: ${sessionId}`)
  }

  // ③ engine 侧 skeleton 扫描（fd 链 + expectIno 授权锚；扫描界 =
  //    HARD_MAX_TRANSCRIPT_BYTES 硬天花板，L.maxTranscriptBytes 不施加）。
  //    路径解析不走 adapter.resolveTranscriptPath——该方法经 openValidated
  //    施加 adapter 侧 L.maxTranscriptBytes 界（follow 车道钉 3 单一事实源，
  //    分页帽分态不得绕经）；改由 listSessionFiles 取 filePath，授权锚仍由
  //    expectIno = stPre.ino 闭环（路径解析与 open 之间替换 → ino 错配 →
  //    ioUnavailable retryable）。
  const entries = await adapter.listSessionFiles(scopeId)
  const entry = entries.find(e => e.sessionId === sessionId)
  if (!entry) {
    throw new WebSessionError(
      'ioUnavailable',
      `session listed at stat but missing at scan: ${sessionId}`,
      true,
    )
  }
  const filePath = entry.filePath
  let reader: ReplayPageReader
  try {
    reader = await engine.openReplayPageReader(filePath, {
      maxBytes: HARD_MAX_TRANSCRIPT_BYTES,
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
      throw new WebSessionError('ioUnavailable', e.message, true)
    }
    throw e
  }

  try {
    // ④ 有效投影链（全量 projectConversation 同规则：terminal leaf 中
    //    timestamp 最新者 → 注入链重建 → user/assistant 且可渲染）
    const skeletons = reader.skeletons as unknown as Map<string, ProjectionSourceMessage>
    const leafUuids = computeLeafUuids(skeletons)
    let leaf: ProjectionSourceMessage | undefined
    for (const uuid of leafUuids) {
      const m = skeletons.get(uuid)
      if (!m) continue
      if (!leaf || (m.timestamp ?? '') >= (leaf.timestamp ?? '')) {
        leaf = m
      }
    }
    const chain = leaf ? engine.buildConversationChain(skeletons, leaf) : []
    const effective = chain.filter(
      m =>
        (m.type === 'user' || m.type === 'assistant') &&
        projectBlocks(m).length > 0,
    )

    // ⑤ 三分态判定（必改②）
    const offset = tok?.offset ?? 0
    if (offset > effective.length) {
      // 含界内序数语义的缺腿：offset 越新链界（rewrite 变短/compact），
      // 禁错页静默 → cursorExpired
      throw new WebSessionError(
        'cursorExpired',
        `replay pageToken offset ${offset} beyond effective chain length ${effective.length}`,
      )
    }
    if (tok) {
      const anchor = chainPrefixFingerprint(
        effective.slice(0, offset).map(m => m.uuid),
      )
      if (anchor !== tok.anchor) {
        throw new WebSessionError(
          'cursorExpired',
          'replay pageToken anchor drift (chain rewritten or compacted)',
        )
      }
    }

    // ⑥ 页窗口组装（records × bytes 双界；pass2 按字节范围逐记录读+渲染）
    const messages: WebSessionProjectionMessage[] = []
    let bytesSum = 0
    let count = 0
    let i = offset
    for (; i < effective.length && count < pageSize; i++) {
      if (signal?.aborted) {
        throw new WebSessionError('cancelled', 'operation aborted')
      }
      const range: ReplayByteRange | undefined = reader.ranges.get(
        effective[i].uuid,
      )
      if (!range) {
        // 链成员缺字节范围（relink/snip 剪枝后残链）——诚实不可交付
        throw new WebSessionError(
          'ioUnavailable',
          'paged chain member has no byte range (snapshot inconsistency)',
          true,
        )
      }
      const [raw] = await reader.readRanges([range])
      const msg = renderRecord(raw)
      const b = Buffer.byteLength(JSON.stringify(msg))
      // 窗口数组序列化字节：'[' + join(',') + ']'（增量精确口径）
      const projected = 2 + bytesSum + b + count
      if (projected > L.maxReplayPageBytes) {
        if (count === 0) {
          // 单记录独超页界 → resourceLimit（零隐式截断，必改③）
          throw new WebSessionError(
            'resourceLimit',
            `single record exceeds replay page limit (${projected} > ${L.maxReplayPageBytes} bytes)`,
          )
        }
        break // 超界收页：本记录落下一页
      }
      messages.push(msg)
      bytesSum += b
      count++
    }

    const nextOffset = offset + count
    const hasMore = nextOffset < effective.length
    let nextPageToken: string | undefined
    if (hasMore) {
      nextPageToken = encodePageToken({
        v: 1,
        scopeId,
        sessionId,
        offset: nextOffset,
        anchor: chainPrefixFingerprint(
          effective.slice(0, nextOffset).map(m => m.uuid),
        ),
      })
    }

    // ⑦ statPost 三元组复核（全量路径同形；close 由 finally 恒达）
    const stPost = await adapter.statTranscript(scopeId, sessionId)
    if (
      !stPost ||
      stPost.ino !== stPre.ino ||
      stPost.sizeBytes !== stPre.sizeBytes ||
      stPost.mtimeMs !== stPre.mtimeMs
    ) {
      throw new WebSessionError(
        'ioUnavailable',
        'transcript changed during replay page (snapshot inconsistency)',
        true,
      )
    }

    return {
      projection: {
        sessionId,
        productId: deps.productId,
        scopeId,
        semantics: 'persisted-effective-conversation',
        messages,
        truncated: false,
      },
      hasMore,
      ...(nextPageToken !== undefined ? { nextPageToken } : {}),
    }
  } finally {
    await reader.close().catch(() => {})
  }
}
