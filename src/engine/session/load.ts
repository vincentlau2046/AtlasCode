/**
 * session 域 — transcript 读面核心（E-7 S-7d d1，§8.49 详案 item 7；旧
 * sessionStorage.ts L1834-2513 + L3078-3832 逐字裁剪随迁）
 *
 * 留面（逐字核）：removeExtraFields / applyPreservedSegmentRelinks
 * （tail→head 校验 + head 重锚 + tail-splice + stale usage 清零 + 绝对最后
 * 边界前剪枝）/ applySnipRemovals（removedUuids 重放 + 路径压缩 relink）/
 * findLatestMessage（O(n) 单趟）/ buildConversationChain（seen 环检测）/
 * recoverOrphanedParallelToolResults（L2117 逐字：sibling assistant +
 * off-chain TR 恢复，P-S2 探针锚点 = 末段 inserts splice 循环）/
 * loadTranscriptFromFile（.jsonl/.json 双路）/ hasVisible* /
 * countVisibleMessages / convertToLogOption / METADATA 标记族 +
 * resolveMetadataBuf + scanPreBoundaryMetadata（边界前元数据字节级前扫）/
 * pickDepthOneUuidCandidate + walkChainBeforeParse（50% 字节门死分支
 * 预剔除）/ loadTranscriptFile（>5MB pre-compact 分块读 + 元数据首过 +
 * progressBridge legacy 链桥 + entry 分发 + leaf 计算）/ loadSessionFile
 * （env 解耦）/ getSessionMessages 域本地 memoize + clearSessionMessages
 * Cache + doesMessageExistInSession。
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - ①fileHistory / ②attribution 快照面（buildFileHistorySnapshotChain /
 *    buildAttributionSnapshotChain + 两 map）= shell 域 fileHistory/
 *    attribution 波；marble-origami contextCollapse 两 map + compact-
 *    boundary 清语义 + `atlas_pebble_leaf_prune` feature 门分支（新仓无
 *    growthbook，恒走标准 else 叶计算支）+ 空 `if (hasCycle) {}` 块 =
 *    上下文折叠零消费者面；agentContentReplacements 读面 = AgentTool
 *    resume 面（coordinator 波，agent 侧链文件读取时消费）；agent-name/
 *    color/setting/mode/pr-link 五 map = CLI list 面（旧 getLastSessionLog
 *    消费，CLI 波）——以上 entry 磁盘仍在，分发走「未知/已裁 type 跳过」
 *    容错（旧 AtlasHarness JSONL 兼容）。
 *   - logError → logForDebugging(String, { level: 'error' })（scheduler
 *    先例，shared 无 logError）。
 *   - (as any) 品牌 cast 族（message.id / uuid / leafUuid）= 类型适配
 *    收敛（域扩展型直访，no-op）。
 *   - getSessionMessages：旧 lodash memoize(Promise) → 域本地 Map 缓存
 *    in-flight Promise（语义逐字：并发调用共享同一 load）；
 *    clearSessionMessagesCache = Map.clear（旧 .cache.clear）。
 *   - loadSessionFile：旧 `getSessionProjectDir() ?? getProjectDir(
 *    getOriginalCwd())` CC-34 原子对裁（stub 恒 null）→ 纯
 *    getProjectDir(getSessionEnv().getOriginalCwd())。
 */
import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { isEnvTruthy, logForDebugging } from '../../shared'
import { getSessionEnv } from './env'
import { extractFirstPrompt } from './firstPrompt'
import { jsonParse, parseJSONL } from './json'
import {
  isCompactBoundaryMessage,
  isLegacyProgressEntry,
  isTranscriptMessage,
  type LegacyProgressEntry,
} from './predicates'
import { getProjectDir } from './paths'
import { SKIP_PRECOMPACT_THRESHOLD, readTranscriptForLoad } from './scanner'
import type {
  ContentReplacementRecord,
  Entry,
  LogOption,
  PersistedWorktreeSession,
  SerializedMessage,
  TranscriptMessage,
  UUID,
} from './types'

/** 旧 L1825 逐字。 */
export function removeExtraFields(
  transcript: TranscriptMessage[],
): SerializedMessage[] {
  return transcript.map(m => {
    const { isSidechain: _isSidechain, parentUuid: _parentUuid, ...serializedMessage } = m
    return serializedMessage
  })
}

/**
 * Splice the preserved segment back into the chain after compaction.（旧
 * L1850 逐字）
 *
 * Preserved messages exist in the JSONL with their ORIGINAL pre-compact
 * parentUuids (recordTranscript dedup-skipped them — can't rewrite).
 * The internal chain (keep[i+1]→keep[i]) is intact; only endpoints need
 * patching: head→anchor, and anchor's other children→tail. Anchor is the
 * last summary for suffix-preserving, boundary itself for prefix-preserving.
 *
 * Only the LAST seg-boundary is relinked — earlier segs were summarized
 * into it. Everything physically before the absolute-last boundary (except
 * preservedUuids) is deleted, which handles all multi-boundary shapes
 * without special-casing.
 *
 * Mutates the Map in place.
 */
function applyPreservedSegmentRelinks(
  messages: Map<string, TranscriptMessage>,
): void {
  type Seg = NonNullable<
    NonNullable<TranscriptMessage['compactMetadata']>['preservedSegment']
  >

  // Find the absolute-last boundary and the last seg-boundary (can differ:
  // manual /compact after reactive compact → seg is stale).
  let lastSeg: Seg | undefined
  let lastSegBoundaryIdx = -1
  let absoluteLastBoundaryIdx = -1
  const entryIndex = new Map<string, number>()
  let i = 0
  for (const entry of messages.values()) {
    entryIndex.set(entry.uuid, i)
    if (isCompactBoundaryMessage(entry)) {
      absoluteLastBoundaryIdx = i
      const seg = entry.compactMetadata?.preservedSegment
      if (seg) {
        lastSeg = seg
        lastSegBoundaryIdx = i
      }
    }
    i++
  }
  // No seg anywhere → no-op. findUnresolvedToolUse etc. read the full map.
  if (!lastSeg) return

  // Seg stale (no-seg boundary came after): skip relink, still prune at
  // absolute — otherwise the stale preserved chain becomes a phantom leaf.
  const segIsLive = lastSegBoundaryIdx === absoluteLastBoundaryIdx

  // Validate tail→head BEFORE mutating so malformed metadata is a true
  // no-op (walk stops at headUuid, doesn't need the relink to run first).
  const preservedUuids = new Set<string>()
  if (segIsLive) {
    const walkSeen = new Set<string>()
    let cur = messages.get(lastSeg.tailUuid)
    let reachedHead = false
    while (cur && !walkSeen.has(cur.uuid)) {
      walkSeen.add(cur.uuid)
      preservedUuids.add(cur.uuid)
      if (cur.uuid === lastSeg.headUuid) {
        reachedHead = true
        break
      }
      cur = cur.parentUuid ? messages.get(cur.parentUuid) : undefined
    }
    if (!reachedHead) {
      // tail→head walk broke — a UUID in the preserved segment isn't in the
      // transcript. Returning here skips the prune below, so resume loads
      // the full pre-compact history. Known cause: mid-turn-yielded
      // attachment pushed to mutableMessages but never recordTranscript'd
      // (SDK subprocess restarted before next turn's qe:420 flush).
      return
    }
  }

  if (segIsLive) {
    const head = messages.get(lastSeg.headUuid)
    if (head) {
      messages.set(lastSeg.headUuid, {
        ...head,
        parentUuid: lastSeg.anchorUuid,
      })
    }
    // Tail-splice: anchor's other children → tail. No-op if already pointing
    // at tail (the useLogMessages race case).
    for (const [uuid, msg] of messages) {
      if (msg.parentUuid === lastSeg.anchorUuid && uuid !== lastSeg.headUuid) {
        messages.set(uuid, { ...msg, parentUuid: lastSeg.tailUuid })
      }
    }
    // Zero stale usage: on-disk input_tokens reflect pre-compact context
    // (~190K) — stripStaleUsage only patched in-memory copies that were
    // dedup-skipped. Without this, resume → immediate autocompact spiral.
    for (const uuid of preservedUuids) {
      const msg = messages.get(uuid)
      if (msg?.type !== 'assistant') continue
      messages.set(uuid, {
        ...msg,
        message: {
          ...msg.message,
          usage: {
            ...msg.message?.usage,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      })
    }
  }

  // Prune everything physically before the absolute-last boundary that
  // isn't preserved. preservedUuids empty when !segIsLive → full prune.
  const toDelete: UUID[] = []
  for (const [uuid] of messages) {
    const idx = entryIndex.get(uuid)
    if (
      idx !== undefined &&
      idx < absoluteLastBoundaryIdx &&
      !preservedUuids.has(uuid)
    ) {
      toDelete.push(uuid)
    }
  }
  for (const uuid of toDelete) messages.delete(uuid)
}

/**
 * Delete messages that Snip executions removed from the in-memory array,
 * and relink parentUuid across the gaps.（旧 L1986 逐字）
 *
 * Unlike compact_boundary which truncates a prefix, snip removes
 * middle ranges. The JSONL is append-only, so removed messages stay on disk
 * and the surviving messages' parentUuid chains walk through them. Without
 * this filter, buildConversationChain reconstructs the full unsnipped history
 * and resume immediately PTLs (adamr-20260320-165831: 397K displayed → 1.65M
 * actual).
 *
 * Deleting alone is not enough: the surviving message AFTER a removed range
 * has parentUuid pointing INTO the gap. buildConversationChain would hit
 * messages.get(undefined) and stop, orphaning everything before the gap. So
 * after delete we relink: for each survivor with a dangling parentUuid, walk
 * backward through the removed region's own parent links to the first
 * non-removed ancestor.
 *
 * The boundary records removedUuids at execution time so we can replay the
 * exact removal on load. Older boundaries without removedUuids are skipped —
 * resume loads their pre-snip history (the pre-fix behavior).
 *
 * Mutates the Map in place.
 */
function applySnipRemovals(messages: Map<string, TranscriptMessage>): void {
  // Structural check — snipMetadata only exists on the boundary subtype.
  // Avoids the subtype literal which is in excluded-strings.txt
  // (HISTORY_SNIP is ant-only; the literal must not leak into external builds).
  type WithSnipMeta = { snipMetadata?: { removedUuids?: UUID[] } }
  const toDelete = new Set<string>()
  for (const entry of messages.values()) {
    const removedUuids = (entry as WithSnipMeta).snipMetadata?.removedUuids
    if (!removedUuids) continue
    for (const uuid of removedUuids) toDelete.add(uuid)
  }
  if (toDelete.size === 0) return

  // Capture each to-delete entry's own parentUuid BEFORE deleting so we can
  // walk backward through contiguous removed ranges. Entries not in the Map
  // (already absent, e.g. from a prior compact_boundary prune) contribute no
  // link; the relink walk will stop at the gap and pick up null (chain-root
  // behavior — same as if compact truncated there, which it did).
  const deletedParent = new Map<string, UUID | null>()
  let removedCount = 0
  for (const uuid of toDelete) {
    const entry = messages.get(uuid)
    if (!entry) continue
    deletedParent.set(uuid, entry.parentUuid)
    messages.delete(uuid)
    removedCount++
  }

  // Relink survivors with dangling parentUuid. Walk backward through
  // deletedParent until we hit a UUID not in toDelete (or null). Path
  // compression: after resolving, seed the map with the resolved link so
  // subsequent survivors sharing the same chain segment don't re-walk.
  const resolve = (start: UUID): UUID | null => {
    const path: UUID[] = []
    let cur: UUID | null | undefined = start
    while (cur && toDelete.has(cur)) {
      path.push(cur)
      cur = deletedParent.get(cur)
      if (cur === undefined) {
        cur = null
        break
      }
    }
    for (const p of path) deletedParent.set(p, cur)
    return cur
  }
  let relinkedCount = 0
  for (const [uuid, msg] of messages) {
    if (!msg.parentUuid || !toDelete.has(msg.parentUuid)) continue
    messages.set(uuid, { ...msg, parentUuid: resolve(msg.parentUuid) })
    relinkedCount++
  }

  // 计数面裁（旧仓 removedCount/relinkedCount 仅喂已删 telemetry）——
  // 登记：未来遥测恢复面按需补。
  void removedCount
  void relinkedCount
}

/**
 * O(n) single-pass: find the message with the latest timestamp matching a
 * predicate. Replaces the `[...values].filter(pred).sort((a,b) =>
 * Date(b)-Date(a))[0]` pattern which is O(n log n) + 2n Date
 * allocations.（旧 L2046 逐字）
 */
function findLatestMessage<T extends { timestamp: string }>(
  messages: Iterable<T>,
  predicate: (m: T) => boolean,
): T | undefined {
  let latest: T | undefined
  let maxTime = -Infinity
  for (const m of messages) {
    if (!predicate(m)) continue
    const t = Date.parse(m.timestamp)
    if (t > maxTime) {
      maxTime = t
      latest = m
    }
  }
  return latest
}

/**
 * Builds a conversation chain from a leaf message to root（旧 L2069 逐字）
 * @param messages Map of all messages
 * @param leafMessage The leaf message to start from
 * @returns Array of messages from root to leaf
 */
export function buildConversationChain(
  messages: Map<string, TranscriptMessage>,
  leafMessage: TranscriptMessage,
): TranscriptMessage[] {
  const transcript: TranscriptMessage[] = []
  const seen = new Set<string>()
  let currentMsg: TranscriptMessage | undefined = leafMessage
  while (currentMsg) {
    if (seen.has(currentMsg.uuid)) {
      logForDebugging(
        `Cycle detected in parentUuid chain at message ${currentMsg.uuid}. Returning partial transcript.`,
        { level: 'error' },
      )
      break
    }
    seen.add(currentMsg.uuid)
    transcript.push(currentMsg)
    currentMsg = currentMsg.parentUuid
      ? messages.get(currentMsg.parentUuid)
      : undefined
  }
  transcript.reverse()
  return recoverOrphanedParallelToolResults(messages, transcript, seen)
}

/**
 * Post-pass for buildConversationChain: recover sibling assistant blocks and
 * tool_results that the single-parent walk orphaned.（旧 L2117 逐字；类型
 * 适配：Extract<TranscriptMessage,{type:'assistant'}> 品牌收敛为直访 +
 * (as any).message.id cast 族去除——域扩展型 message.id 直访。）
 *
 * Streaming (claude.ts:~2024) emits one AssistantMessage per content_block_stop
 * — N parallel tool_uses → N messages, distinct uuid, same message.id. Each
 * tool_result's sourceToolAssistantUUID points to its own one-block assistant,
 * so insertMessageChain's override (line ~894) writes each TR's parentUuid to a
 * DIFFERENT assistant. The topology is a DAG; the walk above is a linked-list
 * traversal and keeps only one branch.
 *
 * Two loss modes observed in production (both fixed here):
 *   1. Sibling assistant orphaned: walk goes prev→asstA→TR_A→next, drops asstB
 *      (same message.id, chained off asstA) and TR_B.
 *   2. Progress-fork (legacy, pre-#23537): each tool_use asst had a progress
 *      child (continued the write chain) AND a TR child. Walk followed
 *      progress; TRs were dropped. No longer written (progress removed from
 *      transcript persistence), but old transcripts still have this shape.
 *
 * Read-side fix: the write topology is already on disk for old transcripts;
 * this recovery pass handles them.
 */
function recoverOrphanedParallelToolResults(
  messages: Map<string, TranscriptMessage>,
  chain: TranscriptMessage[],
  seen: Set<string>,
): TranscriptMessage[] {
  const chainAssistants = chain.filter(m => m.type === 'assistant')
  if (chainAssistants.length === 0) return chain

  // Anchor = last on-chain member of each sibling group. chainAssistants is
  // already in chain order, so later iterations overwrite → last wins.
  const anchorByMsgId = new Map<string, TranscriptMessage>()
  for (const a of chainAssistants) {
    const id = a.message?.id
    if (id) anchorByMsgId.set(id, a)
  }

  // O(n) precompute: sibling groups and TR index.
  // TRs indexed by parentUuid — insertMessageChain:~894 already wrote that
  // as the srcUUID, and --fork-session strips srcUUID but keeps parentUuid.
  const siblingsByMsgId = new Map<string, TranscriptMessage[]>()
  const toolResultsByAsst = new Map<string, TranscriptMessage[]>()
  for (const m of messages.values()) {
    if (m.type === 'assistant' && m.message?.id) {
      const group = siblingsByMsgId.get(m.message.id)
      if (group) group.push(m)
      else siblingsByMsgId.set(m.message.id, [m])
    } else if (
      m.type === 'user' &&
      m.parentUuid &&
      Array.isArray(m.message?.content) &&
      (m.message.content as Array<{ type: string }>).some(
        b => b.type === 'tool_result',
      )
    ) {
      const group = toolResultsByAsst.get(m.parentUuid)
      if (group) group.push(m)
      else toolResultsByAsst.set(m.parentUuid, [m])
    }
  }

  // For each message.id group touching the chain: collect off-chain siblings,
  // then off-chain TRs for ALL members. Splice right after the last on-chain
  // member so the group stays contiguous for normalizeMessagesForAPI's merge
  // and every TR lands after its tool_use.
  const processedGroups = new Set<string>()
  const inserts = new Map<string, TranscriptMessage[]>()
  let recoveredCount = 0
  for (const asst of chainAssistants) {
    const msgId = asst.message?.id
    if (!msgId || processedGroups.has(msgId)) continue
    processedGroups.add(msgId)

    const group = siblingsByMsgId.get(msgId) ?? [asst]
    const orphanedSiblings = group.filter(s => !seen.has(s.uuid))
    const orphanedTRs: TranscriptMessage[] = []
    for (const member of group) {
      const trs = toolResultsByAsst.get(member.uuid)
      if (!trs) continue
      for (const tr of trs) {
        if (!seen.has(tr.uuid)) orphanedTRs.push(tr)
      }
    }
    if (orphanedSiblings.length === 0 && orphanedTRs.length === 0) continue

    // Timestamp sort keeps content-block / completion order; stable-sort
    // preserves JSONL write order on ties.
    orphanedSiblings.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    orphanedTRs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    const anchor = anchorByMsgId.get(msgId)!
    const recovered = [...orphanedSiblings, ...orphanedTRs]
    for (const r of recovered) seen.add(r.uuid)
    recoveredCount += recovered.length
    // P-S2 突变探针锚点：下述 splice 循环（删除 → func/unit 并链测试 1 红）。
    inserts.set(anchor.uuid, recovered)
  }

  if (recoveredCount === 0) return chain

  const result: TranscriptMessage[] = []
  for (const m of chain) {
    result.push(m)
    const toInsert = inserts.get(m.uuid)
    if (toInsert) result.push(...toInsert)
  }
  return result
}

/**
 * Loads a transcript from a JSON or JSONL file and converts it to LogOption
 * format（旧 L2283 逐字裁剪：fileHistory/attribution/contextCollapse 链
 * 构造裁除，留 worktreeSession 面）
 * @param filePath Path to the transcript file (.json or .jsonl)
 * @returns LogOption containing the transcript messages
 * @throws Error if file doesn't exist or contains invalid data
 */
export async function loadTranscriptFromFile(
  filePath: string,
): Promise<LogOption> {
  if (filePath.endsWith('.jsonl')) {
    const {
      messages,
      summaries,
      customTitles,
      tags,
      leafUuids,
      contentReplacements,
      worktreeStates,
    } = await loadTranscriptFile(filePath)

    if (messages.size === 0) {
      throw new Error('No messages found in JSONL file')
    }

    // Find the most recent leaf message using pre-computed leaf UUIDs
    const leafMessage = findLatestMessage(messages.values(), msg =>
      leafUuids.has(msg.uuid),
    )

    if (!leafMessage) {
      throw new Error('No valid conversation chain found in JSONL file')
    }

    // Build the conversation chain backwards from leaf to root
    const transcript = buildConversationChain(messages, leafMessage)

    const summary = summaries.get(leafMessage.uuid)
    const customTitle = customTitles.get(leafMessage.sessionId as UUID)
    const tag = tags.get(leafMessage.sessionId as UUID)
    const sessionId = leafMessage.sessionId as UUID
    return {
      ...convertToLogOption(
        transcript,
        0,
        summary,
        customTitle,
        tag,
        filePath,
        contentReplacements.get(sessionId) ?? [],
      ),
      worktreeSession: worktreeStates.has(sessionId)
        ? worktreeStates.get(sessionId)
        : undefined,
    }
  }

  // json log files
  const content = await readFile(filePath, { encoding: 'utf-8' })
  let parsed: unknown

  try {
    parsed = jsonParse(content)
  } catch (error) {
    throw new Error(`Invalid JSON in transcript file: ${error}`)
  }

  let messages: TranscriptMessage[]

  if (Array.isArray(parsed)) {
    messages = parsed
  } else if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
    if (!Array.isArray(parsed.messages)) {
      throw new Error('Transcript messages must be an array')
    }
    messages = parsed.messages
  } else {
    throw new Error(
      'Transcript must be an array of messages or an object with a messages array',
    )
  }

  return convertToLogOption(messages, 0, undefined, undefined, undefined, filePath)
}

/**
 * Checks if a user message has visible content (text or image, not just
 * tool_result). Tool results are displayed as part of collapsed groups, not
 * as standalone messages. Also excludes meta messages which are not shown to
 * the user.（旧 L2388 逐字）
 */
function hasVisibleUserContent(message: TranscriptMessage): boolean {
  if (message.type !== 'user') return false

  // Meta messages are not shown to the user
  if (message.isMeta) return false

  const content = message.message?.content
  if (!content) return false

  // String content is always visible
  if (typeof content === 'string') {
    return content.trim().length > 0
  }

  // Array content: check for text or image blocks (not tool_result)
  if (Array.isArray(content)) {
    return (content as Array<{ type: string }>).some(
      block =>
        block.type === 'text' ||
        block.type === 'image' ||
        block.type === 'document',
    )
  }

  return false
}

/**
 * Checks if an assistant message has visible text content (not just tool_use
 * blocks). Tool uses are displayed as grouped/collapsed UI elements, not as
 * standalone messages.（旧 L2419 逐字）
 */
function hasVisibleAssistantContent(message: TranscriptMessage): boolean {
  if (message.type !== 'assistant') return false

  const content = message.message?.content
  if (!content || !Array.isArray(content)) return false

  // Check for text block (not just tool_use/thinking blocks)
  return (content as Array<{ type: string; text?: unknown }>).some(
    block =>
      block.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.trim().length > 0,
  )
}

/**
 * Counts visible messages that would appear as conversation turns in the UI.
 * Excludes:
 * - System, attachment, and progress messages
 * - User messages with isMeta flag (hidden from user)
 * - User messages that only contain tool_result blocks (displayed as collapsed groups)
 * - Assistant messages that only contain tool_use blocks (displayed as collapsed groups)
 * （旧 L2442 逐字）
 */
function countVisibleMessages(transcript: TranscriptMessage[]): number {
  let count = 0
  for (const message of transcript) {
    switch (message.type) {
      case 'user':
        // Count user messages with visible content (text, image, not just tool_result or meta)
        if (hasVisibleUserContent(message)) {
          count++
        }
        break
      case 'assistant':
        // Count assistant messages with text content (not just tool_use)
        if (hasVisibleAssistantContent(message)) {
          count++
        }
        break
      case 'attachment':
      case 'system':
        // These message types are not counted as visible conversation turns
        // （旧 `case 'progress'` 已裁——progress 不出域 Message 并集，
        // 类型适配登记：零行为 delta）。
        break
    }
  }
  return count
}

/** 旧 L2468 逐字裁剪（fileHistorySnapshots/attributionSnapshots/agentSetting
 * 三参裁除 = shell 域 / CLI list 面）。 */
function convertToLogOption(
  transcript: TranscriptMessage[],
  value: number = 0,
  summary?: string,
  customTitle?: string,
  tag?: string,
  fullPath?: string,
  contentReplacements?: ContentReplacementRecord[],
): LogOption {
  const lastMessage = transcript.at(-1)!
  const firstMessage = transcript[0]!

  // Get the first user message for the prompt
  const firstPrompt = extractFirstPrompt(transcript)

  // Create timestamps from message timestamps
  const created = new Date(firstMessage.timestamp)
  const modified = new Date(lastMessage.timestamp)

  return {
    date: lastMessage.timestamp,
    messages: removeExtraFields(transcript),
    fullPath,
    value,
    created,
    modified,
    firstPrompt,
    messageCount: countVisibleMessages(transcript),
    isSidechain: firstMessage.isSidechain,
    teamName: firstMessage.teamName,
    agentName: firstMessage.agentName,
    leafUuid: lastMessage.uuid,
    summary,
    customTitle,
    tag,
    contentReplacements,
    gitBranch: lastMessage.gitBranch,
    projectPath: firstMessage.cwd,
  }
}

/**
 * Metadata entry types that can appear before a compact boundary but must
 * still be loaded (they're session-scoped, not message-scoped).
 * Kept as raw JSON string markers for cheap line filtering during streaming.
 * （旧 L3082 逐字；agent-name/color/setting、mode、pr-link 标记保留——
 * 字节级前扫不区分消费面，分发侧按留 map 过滤。）
 */
const METADATA_TYPE_MARKERS = [
  '"type":"summary"',
  '"type":"custom-title"',
  '"type":"tag"',
  '"type":"agent-name"',
  '"type":"agent-color"',
  '"type":"agent-setting"',
  '"type":"mode"',
  '"type":"worktree-state"',
  '"type":"pr-link"',
]
const METADATA_MARKER_BUFS = METADATA_TYPE_MARKERS.map(m => Buffer.from(m))
// Longest marker is 22 bytes; +1 for leading `{` = 23.
const METADATA_PREFIX_BOUND = 25

// null = carry spans whole chunk. Skips concat when carry provably isn't
// a metadata line (markers sit at byte 1 after `{`).（旧 L3101 逐字）
function resolveMetadataBuf(
  carry: Buffer | null,
  chunkBuf: Buffer,
): Buffer | null {
  if (carry === null || carry.length === 0) return chunkBuf
  if (carry.length < METADATA_PREFIX_BOUND) {
    return Buffer.concat([carry, chunkBuf])
  }
  if (carry[0] === 0x7b /* { */) {
    for (const m of METADATA_MARKER_BUFS) {
      if (carry.compare(m, 0, m.length, 1, 1 + m.length) === 0) {
        return Buffer.concat([carry, chunkBuf])
      }
    }
  }
  const firstNl = chunkBuf.indexOf(0x0a)
  return firstNl === -1 ? null : chunkBuf.subarray(firstNl + 1)
}

/**
 * Lightweight forward scan of [0, endOffset) collecting only metadata-entry
 * lines.（旧 L3128 逐字）
 *
 * Fast path: if a chunk contains zero markers (the common case — metadata
 * entries are <50 per session), the entire chunk is skipped without line
 * splitting.
 */
async function scanPreBoundaryMetadata(
  filePath: string,
  endOffset: number,
): Promise<string[]> {
  const { createReadStream } = await import('fs')
  const NEWLINE = 0x0a

  const stream = createReadStream(filePath, { end: endOffset - 1 })
  const metadataLines: string[] = []
  let carry: Buffer | null = null

  for await (const chunk of stream) {
    const chunkBuf = chunk as Buffer
    const buf = resolveMetadataBuf(carry, chunkBuf)
    if (buf === null) {
      carry = null
      continue
    }

    // Fast path: most chunks contain zero metadata markers. Skip line splitting.
    let hasAnyMarker = false
    for (const m of METADATA_MARKER_BUFS) {
      if (buf.includes(m)) {
        hasAnyMarker = true
        break
      }
    }

    if (hasAnyMarker) {
      let lineStart = 0
      let nl = buf.indexOf(NEWLINE)
      while (nl !== -1) {
        // Bounded marker check: only look within this line's byte range
        for (const m of METADATA_MARKER_BUFS) {
          const mIdx = buf.indexOf(m, lineStart)
          if (mIdx !== -1 && mIdx < nl) {
            metadataLines.push(buf.toString('utf-8', lineStart, nl))
            break
          }
        }
        lineStart = nl + 1
        nl = buf.indexOf(NEWLINE, lineStart)
      }
      carry = buf.subarray(lineStart)
    } else {
      // No markers in this chunk — just preserve the incomplete trailing line
      const lastNl = buf.lastIndexOf(NEWLINE)
      carry = lastNl >= 0 ? buf.subarray(lastNl + 1) : buf
    }

    // Guard against quadratic carry growth for pathological huge lines
    // (e.g., a 10 MB tool-output line with no newline). Real metadata entries
    // are <1 KB, so if carry exceeds this we're mid-message-content — drop it.
    if (carry.length > 64 * 1024) carry = null
  }

  // Final incomplete line (no trailing newline at endOffset)
  if (carry !== null && carry.length > 0) {
    for (const m of METADATA_MARKER_BUFS) {
      if (carry.includes(m)) {
        metadataLines.push(carry.toString('utf-8'))
        break
      }
    }
  }

  return metadataLines
}

/**
 * Disambiguate multiple `"uuid":"<36>","timestamp":"` matches in one line by
 * finding the one at JSON nesting depth 1.（旧 L3246 逐字）
 */
function pickDepthOneUuidCandidate(
  buf: Buffer,
  lineStart: number,
  candidates: number[],
): number {
  const QUOTE = 0x22
  const BACKSLASH = 0x5c
  const OPEN_BRACE = 0x7b
  const CLOSE_BRACE = 0x7d
  let depth = 0
  let inString = false
  let escapeNext = false
  let ci = 0
  for (let i = lineStart; ci < candidates.length; i++) {
    if (i === candidates[ci]) {
      if (depth === 1 && !inString) return candidates[ci]!
      ci++
    }
    const b = buf[i]!
    if (escapeNext) {
      escapeNext = false
    } else if (inString) {
      if (b === BACKSLASH) escapeNext = true
      else if (b === QUOTE) inString = false
    } else if (b === QUOTE) inString = true
    else if (b === OPEN_BRACE) depth++
    else if (b === CLOSE_BRACE) depth--
  }
  return candidates.at(-1)!
}

/**
 * Byte-level pre-filter that excises dead fork branches before parseJSONL.
 * （旧 L3277 逐字；头注测量数据 + 双不变量原文保留）
 */
function walkChainBeforeParse(buf: Buffer): Buffer {
  const NEWLINE = 0x0a
  const OPEN_BRACE = 0x7b
  const QUOTE = 0x22
  const PARENT_PREFIX = Buffer.from('{"parentUuid":')
  const UUID_KEY = Buffer.from('"uuid":"')
  const SIDECHAIN_TRUE = Buffer.from('"isSidechain":true')
  const UUID_LEN = 36
  const TS_SUFFIX = Buffer.from('","timestamp":"')
  const TS_SUFFIX_LEN = TS_SUFFIX.length
  const PREFIX_LEN = PARENT_PREFIX.length
  const KEY_LEN = UUID_KEY.length

  // Stride-3 flat index of transcript messages: [lineStart, lineEnd, parentStart].
  // parentStart is the byte offset of the parent uuid's first char, or -1 for null.
  // Metadata lines (summary, mode, file-history-snapshot, etc.) go in metaRanges
  // unfiltered - they lack the parentUuid prefix and downstream needs all of them.
  const msgIdx: number[] = []
  const metaRanges: number[] = []
  const uuidToSlot = new Map<string, number>()

  let pos = 0
  const len = buf.length
  while (pos < len) {
    const nl = buf.indexOf(NEWLINE, pos)
    const lineEnd = nl === -1 ? len : nl + 1
    if (
      lineEnd - pos > PREFIX_LEN &&
      buf[pos] === OPEN_BRACE &&
      buf.compare(PARENT_PREFIX, 0, PREFIX_LEN, pos, pos + PREFIX_LEN) === 0
    ) {
      // `{"parentUuid":null,` or `{"parentUuid":"<36 chars>",`
      const parentStart =
        buf[pos + PREFIX_LEN] === QUOTE ? pos + PREFIX_LEN + 1 : -1
      // The top-level uuid is immediately followed by `","timestamp":"` in
      // user/assistant/attachment entries (the create* helpers put them
      // adjacent; both always defined). But the suffix is NOT unique:
      //   - agent_progress entries carry a nested Message in data.message,
      //     serialized BEFORE top-level uuid — that inner Message has its
      //     own uuid,timestamp adjacent, so its bytes also satisfy the
      //     suffix check.
      //   - mcpMeta/toolUseResult come AFTER top-level uuid and hold
      //     server-controlled Record<string,unknown> — a server returning
      //     {uuid:"<36>",timestamp:"..."} would also match.
      // Collect all suffix matches; a single one is unambiguous (common
      // case), multiple need a brace-depth check to pick the one at
      // JSON nesting depth 1. Entries with NO suffix match (some progress
      // variants put timestamp BEFORE uuid → `"uuid":"<36>"}` at EOL)
      // have only one `"uuid":"` and the first-match fallback is sound.
      let firstAny = -1
      let suffix0 = -1
      let suffixN: number[] | undefined
      let from = pos
      for (;;) {
        const next = buf.indexOf(UUID_KEY, from)
        if (next < 0 || next >= lineEnd) break
        if (firstAny < 0) firstAny = next
        const after = next + KEY_LEN + UUID_LEN
        if (
          after + TS_SUFFIX_LEN <= lineEnd &&
          buf.compare(
            TS_SUFFIX,
            0,
            TS_SUFFIX_LEN,
            after,
            after + TS_SUFFIX_LEN,
          ) === 0
        ) {
          if (suffix0 < 0) suffix0 = next
          else (suffixN ??= [suffix0]).push(next)
        }
        from = next + KEY_LEN
      }
      const uk = suffixN
        ? pickDepthOneUuidCandidate(buf, pos, suffixN)
        : suffix0 >= 0
          ? suffix0
          : firstAny
      if (uk >= 0) {
        const uuidStart = uk + KEY_LEN
        // UUIDs are pure ASCII so latin1 avoids UTF-8 decode overhead.
        const uuid = buf.toString('latin1', uuidStart, uuidStart + UUID_LEN)
        uuidToSlot.set(uuid, msgIdx.length)
        msgIdx.push(pos, lineEnd, parentStart)
      } else {
        metaRanges.push(pos, lineEnd)
      }
    } else {
      metaRanges.push(pos, lineEnd)
    }
    pos = lineEnd
  }

  // Leaf = last non-sidechain entry. isSidechain is the 2nd or 3rd key
  // (after parentUuid, maybe logicalParentUuid) so indexOf from lineStart
  // finds it within a few dozen bytes when present; when absent it spills
  // into the next line, caught by the bounds check.
  let leafSlot = -1
  for (let i = msgIdx.length - 3; i >= 0; i -= 3) {
    const sc = buf.indexOf(SIDECHAIN_TRUE, msgIdx[i]!)
    if (sc === -1 || sc >= msgIdx[i + 1]!) {
      leafSlot = i
      break
    }
  }
  if (leafSlot < 0) return buf

  // Walk parentUuid to root. Collect kept-message line starts and sum their
  // byte lengths so we can decide whether the concat is worth it. A dangling
  // parent (uuid not in file) is the normal termination for forked sessions
  // and post-boundary chains -- same semantics as buildConversationChain.
  // Correctness against index poisoning rests on the timestamp suffix check
  // above: a nested `"uuid":"` match without the suffix never becomes uk.
  const seen = new Set<number>()
  const chain = new Set<number>()
  let chainBytes = 0
  let slot: number | undefined = leafSlot
  while (slot !== undefined) {
    if (seen.has(slot)) break
    seen.add(slot)
    chain.add(msgIdx[slot]!)
    chainBytes += msgIdx[slot + 1]! - msgIdx[slot]!
    const parentStart = msgIdx[slot + 2]!
    if (parentStart < 0) break
    const parent = buf.toString('latin1', parentStart, parentStart + UUID_LEN)
    slot = uuidToSlot.get(parent)
  }

  // parseJSONL cost scales with bytes, not entry count. A session can have
  // thousands of dead entries by count but only single-digit-% of bytes if
  // the dead branches are short turns and the live chain holds the fat
  // assistant responses (measured: 107 MB session, 69% dead entries, 30%
  // dead bytes - index+concat overhead exceeded parse savings). Gate on
  // bytes: only stitch if we would drop at least half the buffer. Metadata
  // is tiny so len - chainBytes approximates dead bytes closely enough.
  // Near break-even the concat memcpy (copying chainBytes into a fresh
  // allocation) dominates, so a conservative 50% gate stays safely on the
  // winning side.
  if (len - chainBytes < len >> 1) return buf

  // Merge chain entries with metadata in original file order. Both msgIdx and
  // metaRanges are already sorted by offset; interleave them into subarray
  // views and concat once.
  const parts: Buffer[] = []
  let m = 0
  for (let i = 0; i < msgIdx.length; i += 3) {
    const start = msgIdx[i]!
    while (m < metaRanges.length && metaRanges[m]! < start) {
      parts.push(buf.subarray(metaRanges[m]!, metaRanges[m + 1]!))
      m += 2
    }
    if (chain.has(start)) {
      parts.push(buf.subarray(start, msgIdx[i + 1]!))
    }
  }
  while (m < metaRanges.length) {
    parts.push(buf.subarray(metaRanges[m]!, metaRanges[m + 1]!))
    m += 2
  }
  return Buffer.concat(parts)
}

/**
 * Loads all messages, summaries, and metadata from a transcript file.
 * （旧 L3443 逐字裁剪，返回面按头注裁面登记收缩）
 */
export async function loadTranscriptFile(
  filePath: string,
  opts?: { keepAllLeaves?: boolean },
): Promise<{
  messages: Map<string, TranscriptMessage>
  summaries: Map<string, string>
  customTitles: Map<string, string>
  tags: Map<string, string>
  worktreeStates: Map<string, PersistedWorktreeSession | null>
  contentReplacements: Map<string, ContentReplacementRecord[]>
  leafUuids: Set<string>
}> {
  const messages = new Map<string, TranscriptMessage>()
  const summaries = new Map<string, string>()
  const customTitles = new Map<string, string>()
  const tags = new Map<string, string>()
  const worktreeStates = new Map<string, PersistedWorktreeSession | null>()
  const contentReplacements = new Map<string, ContentReplacementRecord[]>()

  try {
    // For large transcripts, avoid materializing megabytes of stale content.
    // Single forward chunked read: attribution-snapshot lines are skipped at
    // the fd level (never buffered), compact boundaries truncate the
    // accumulator in-stream. Peak allocation is the OUTPUT size, not the
    // file size — a 151 MB session that is 84% stale attr-snaps allocates
    // ~32 MB instead of 159+64 MB. This matters because mimalloc does not
    // return those pages to the OS even after JS-level GC frees the backing
    // buffers (measured: arrayBuffers=0 after Bun.gc(true) but RSS stuck at
    // ~316 MB on the old scan+strip path vs ~155 MB here).
    //
    // Pre-boundary metadata is recovered via a cheap byte-level forward
    // scan of [0, boundary).（原 attribution-snapshot 跳过面 = 裁面 ②，
    // 分块读器 scanner.ts 逐字保留。）
    let buf: Buffer | null = null
    let metadataLines: string[] | null = null
    let hasPreservedSegment = false
    if (!isEnvTruthy(process.env.ATLAS_DISABLE_PRECOMPACT_SKIP)) {
      const { size } = await stat(filePath)
      if (size > SKIP_PRECOMPACT_THRESHOLD) {
        const scan = await readTranscriptForLoad(filePath, size)
        buf = scan.postBoundaryBuf
        hasPreservedSegment = scan.hasPreservedSegment
        // >0 means we truncated pre-boundary bytes and must recover
        // session-scoped metadata from that range. A preservedSegment
        // boundary does not truncate (preserved messages are physically
        // pre-boundary), so offset stays 0 unless an EARLIER non-preserved
        // boundary already truncated — in which case the preserved messages
        // for the later boundary are post-that-earlier-boundary and were
        // kept, and we still want the metadata scan.
        if (scan.boundaryStartOffset > 0) {
          metadataLines = await scanPreBoundaryMetadata(
            filePath,
            scan.boundaryStartOffset,
          )
        }
      }
    }
    buf ??= await readFile(filePath)
    // For large buffers (which here means readTranscriptForLoad output with
    // attr-snaps already stripped at the fd level — the <5MB readFile path
    // falls through the size gate below), the dominant cost is parsing dead
    // fork branches that buildConversationChain would discard anyway. Skip
    // when the caller needs all leaves (loadAllLogsFromSessionFile for
    // /insights picks the branch with most user messages, not the latest),
    // when the boundary has a preservedSegment (those messages keep their
    // pre-compact parentUuid on disk -- applyPreservedSegmentRelinks splices
    // them in-memory AFTER parse, so a pre-parse chain walk would drop them
    // as orphans), and when ATLAS_DISABLE_PRECOMPACT_SKIP is set (that kill
    // switch means "load everything, skip nothing"; this is another
    // skip-before-parse optimization and the scan it depends on for
    // hasPreservedSegment did not run).
    if (
      !opts?.keepAllLeaves &&
      !hasPreservedSegment &&
      !isEnvTruthy(process.env.ATLAS_DISABLE_PRECOMPACT_SKIP) &&
      buf.length > SKIP_PRECOMPACT_THRESHOLD
    ) {
      buf = walkChainBeforeParse(buf)
    }

    // First pass: process metadata-only lines collected during the boundary
    // scan.（留 map 子集分发；agent-*/mode/pr-link 行 = 已裁消费面，跳过）
    if (metadataLines && metadataLines.length > 0) {
      const metaEntries = parseJSONL<Entry>(
        Buffer.from(metadataLines.join('\n')),
      )
      for (const entry of metaEntries) {
        if (entry.type === 'summary' && entry.leafUuid) {
          summaries.set(entry.leafUuid, entry.summary)
        } else if (entry.type === 'custom-title' && entry.sessionId) {
          customTitles.set(entry.sessionId, entry.customTitle)
        } else if (entry.type === 'tag' && entry.sessionId) {
          tags.set(entry.sessionId, entry.tag)
        } else if (entry.type === 'worktree-state' && entry.sessionId) {
          worktreeStates.set(entry.sessionId, entry.worktreeSession)
        }
      }
    }

    const entries = parseJSONL<Entry>(buf)

    // Bridge map for legacy progress entries: progress_uuid → progress_parent_uuid.
    // PR #24099 removed progress from isTranscriptMessage, so old transcripts with
    // progress in the parentUuid chain would truncate at buildConversationChain
    // when messages.get(progressUuid) returns undefined. Since transcripts are
    // append-only (parents before children), we record each progress→parent link
    // as we see it, chain-resolving through consecutive progress entries, then
    // rewrite any subsequent message whose parentUuid lands in the bridge.
    const progressBridge = new Map<string, UUID | null>()

    for (const entry of entries) {
      // Legacy progress check runs before the Entry-typed else-if chain —
      // progress is not in the Entry union, so checking it after TypeScript
      // has narrowed `entry` intersects to `never`.
      if (isLegacyProgressEntry(entry)) {
        // 类型适配登记：LegacyProgressEntry 已裁出 Entry 并集（progress =
        // 旧仓 UI 瞬态面），谓词真支下 entry 收窄交为空 → 显式 cast
        // （磁盘旧 JSONL 仍含 progress 行，本桥是 loader 容错面）。
        const progressEntry = entry as unknown as LegacyProgressEntry
        // Chain-resolve through consecutive progress entries so a later
        // message pointing at the tail of a progress run bridges to the
        // nearest non-progress ancestor in one lookup.
        const parent = progressEntry.parentUuid
        progressBridge.set(
          progressEntry.uuid,
          parent && progressBridge.has(parent)
            ? (progressBridge.get(parent) ?? null)
            : parent,
        )
        continue
      }
      if (isTranscriptMessage(entry)) {
        if (entry.parentUuid && progressBridge.has(entry.parentUuid)) {
          entry.parentUuid = progressBridge.get(entry.parentUuid) ?? null
        }
        messages.set(entry.uuid, entry)
      } else if (entry.type === 'summary' && entry.leafUuid) {
        summaries.set(entry.leafUuid, entry.summary)
      } else if (entry.type === 'custom-title' && entry.sessionId) {
        customTitles.set(entry.sessionId, entry.customTitle)
      } else if (entry.type === 'tag' && entry.sessionId) {
        tags.set(entry.sessionId, entry.tag)
      } else if (entry.type === 'worktree-state' && entry.sessionId) {
        worktreeStates.set(entry.sessionId, entry.worktreeSession)
      } else if (entry.type === 'content-replacement' && !entry.agentId) {
        // Subagent decisions key by agentId (sidechain resume); main-thread
        // decisions key by sessionId (/resume). agentId 支 = 裁面登记（AgentTool
        // resume 读面，coordinator 波）——agent 侧链文件的记录不经本读面。
        const existing = contentReplacements.get(entry.sessionId) ?? []
        contentReplacements.set(entry.sessionId, existing)
        existing.push(...entry.replacements)
      }
      // 已裁 entry type（agent-name/color/setting/mode/pr-link/file-history-
      // snapshot/attribution-snapshot/queue-operation/speculation-accept/
      // marble-origami-*）落尽 else-if 链 = 未知 type 容错跳过（旧 AtlasHarness
      // 磁盘 JSONL 兼容，头注裁面登记）。
    }
  } catch {
    // File doesn't exist or can't be read
  }

  applyPreservedSegmentRelinks(messages)
  applySnipRemovals(messages)

  // Compute leaf UUIDs once at load time
  // Only user/assistant messages should be considered as leaves for anchoring resume.
  // Other message types (system, attachment) are metadata or auxiliary and shouldn't
  // anchor a conversation chain.
  //
  // We use standard parent relationship for main chain detection, but also need to
  // handle cases where the last message is a system/metadata message.
  // For each conversation chain (identified by following parent links), the leaf
  // is the most recent user/assistant message.
  const allMessages = [...messages.values()]

  // Standard leaf computation using parent relationships
  const parentUuids = new Set(
    allMessages
      .map(msg => msg.parentUuid)
      .filter((uuid): uuid is UUID => uuid !== null),
  )

  // Find all terminal messages (messages with no children)
  const terminalMessages = allMessages.filter(msg => !parentUuids.has(msg.uuid))

  const leafUuids = new Set<string>()
  let hasCycle = false

  // 旧仓 `atlas_pebble_leaf_prune` feature 门分支 CUTO（新仓无 growthbook，
  // 恒走标准叶计算支，头注裁面登记）。
  // Original leaf computation: walk back from terminal messages to find
  // the nearest user/assistant ancestor unconditionally
  for (const terminal of terminalMessages) {
    const seen = new Set<string>()
    let current: TranscriptMessage | undefined = terminal
    while (current) {
      if (seen.has(current.uuid)) {
        hasCycle = true
        break
      }
      seen.add(current.uuid)
      if (current.type === 'user' || current.type === 'assistant') {
        leafUuids.add(current.uuid)
        break
      }
      current = current.parentUuid
        ? messages.get(current.parentUuid)
        : undefined
    }
  }

  // 旧仓空 `if (hasCycle) {}` 块 = 裁（telemetry 面，头注登记）。
  void hasCycle

  return {
    messages,
    summaries,
    customTitles,
    tags,
    worktreeStates,
    contentReplacements,
    leafUuids,
  }
}

/**
 * Loads a transcript from a specific session file.（旧 L3788 逐字解耦：
 * sessionProjectDir CC-34 原子对裁）
 */
async function loadSessionFile(sessionId: string): Promise<
  Awaited<ReturnType<typeof loadTranscriptFile>>
> {
  const sessionFile = join(
    getProjectDir(getSessionEnv().getOriginalCwd()),
    `${sessionId}.jsonl`,
  )
  return loadTranscriptFile(sessionFile)
}

/**
 * Gets message UUIDs for a specific session without loading all sessions.
 * Memoized to avoid re-reading the same session file multiple times.
 * （旧 lodash memoize(Promise) → 域本地 Map 缓存 in-flight Promise，语义
 * 逐字：并发调用共享同一 load；clearSessionMessagesCache = Map.clear。）
 */
const _sessionMessagesCache = new Map<string, Promise<Set<string>>>()

export function getSessionMessages(sessionId: string): Promise<Set<string>> {
  let cached = _sessionMessagesCache.get(sessionId)
  if (!cached) {
    cached = (async () => {
      const { messages } = await loadSessionFile(sessionId)
      return new Set(messages.keys())
    })()
    _sessionMessagesCache.set(sessionId, cached)
  }
  return cached
}

/**
 * Clear the memoized session messages cache.
 * Call after compaction when old message UUIDs are no longer valid.
 */
export function clearSessionMessagesCache(): void {
  _sessionMessagesCache.clear()
}

/**
 * Check if a message UUID exists in the session storage（旧 L3832 逐字）
 */
export async function doesMessageExistInSession(
  sessionId: string,
  messageUuid: string,
): Promise<boolean> {
  const messageSet = await getSessionMessages(sessionId)
  return messageSet.has(messageUuid)
}

