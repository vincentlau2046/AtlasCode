/**
 * session 域 — 记录/元数据门面（E-7 S-7d d1，§8.49 详案 item 5；旧
 * sessionStorage.ts L1419-1545 record* 族 + L4321-4426 cleanMessagesFor
 * Logging 链 + L2725-2852 元数据缓存门面 裁剪解耦随迁）
 *
 * 留面（逐字核）：recordTranscript（L1419 前缀跟踪 skip 语义 + P-S1 探针
 * 锚点 `!seenNewMessage && isChainParticipant` 守卫）/ recordSidechain
 * Transcript / recordContentReplacement（agentId → sidechain 文件路由）/
 * resetSessionFilePointer / adoptResumedSessionFile（L1541 skipTitleRefresh
 * =true 语义：防 --name 覆写）/ flushSessionStorage / restoreSession
 * Metadata（`??=` --name 优先语义）/ clearSessionMetadata / saveMode /
 * cacheSessionTitle / reAppendSessionMetadata 公共包装 / cleanMessagesFor
 * Logging 链（isLoggableMessage + collectReplIds + transformMessagesFor
 * ExternalTranscript，REPL 对外转录不可见化）/ TeamInfo。
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - save* 写入口族（saveCustomTitle / saveAiGeneratedTitle /
 *    saveTaskSummary / saveTag / linkSessionToPR / saveAgentName（+
 *    updateSessionName 副作用）/ saveAgentColor / saveAgentSetting /
 *    saveWorktreeState / getCurrentSession*）= CLI/UI 面（/rename、/tag、
 *    /link-pr、ps 摘要）归 CLI 波；entry 类型与 appendEntry 写分支本域
 *    保留（旧 JSONL 容错 + reAppend 元数据重尾语义），仅写入口裁剪。
 *   - recordQueueOperation / recordFileHistorySnapshot /
 *    recordAttributionSnapshot / recordContextCollapseCommit /
 *    recordContextCollapseSnapshot / removeTranscriptMessage /
 *    hydrateRemoteSession = 裁面 ①②③④⑤ 族（project.ts 头注同源）。
 *
 * 解耦登记：getProject → projectInstance（project.ts 单例）/ getSessionId
 * → SessionEnv 注入窗口 / REPL_TOOL_NAME 跨引擎 import（engine/tools/
 * toolNames，coordinator 跨引擎 import 先例）/ getFirstMeaningfulUser
 * MessageTextContent 经 firstPrompt.ts 共享（project 写面 + load 读面，
 * 避免 record↔load 环依赖）。
 */
import { isEnvTruthy } from '../../shared'
import type { ContentBlock, ContentBlockParam, ToolResultBlockParam, ToolUseBlock } from '../../shared'
import { REPL_TOOL_NAME } from '../tools/toolNames'
import { getSessionMessages } from './load'
import { getSessionEnv } from './env'
import { getTranscriptPath } from './paths'
import { isChainParticipant } from './predicates'
import { projectInstance } from './project'
import type {
  ContentReplacementRecord,
  Message,
  PersistedWorktreeSession,
  Transcript,
  UUID,
} from './types'

/** 旧 L1397 逐字。 */
export type TeamInfo = {
  teamName?: string
  agentName?: string
}

// ── cleanMessagesForLogging 链（旧 L4321-4426 逐字）────────────────────────

export function isLoggableMessage(m: Message): boolean {
  if (m.type === 'progress') return false
  // IMPORTANT: We deliberately filter out most attachments for non-ants because
  // they have sensitive info for training that we don't want exposed to the public.
  // When enabled, we allow hook_additional_context through since it contains
  // user-configured hook output that is useful for session context on resume.
  // de-ANT: `getUserType() !== 'ant'` 恒真（getUserType 已静态化为 'atlas'），坍缩。
  if (m.type === 'attachment') {
    // skill_listing（2026-10-02 裁定，R4 S1 根因收口）：模型面 skill 目录
    // 持久化例外——内容 = 用户自有 skill 元数据（无训练敏感面），且 resume 侧
    // （conversationRecovery suppressNextSkillListing 锁）依赖其转录内存在，
    // e2e 验真（R4 S1 jsonl 断言）同依赖。其余附件族维持过滤。
    if (m.attachment?.type === 'skill_listing') {
      return true
    }
    if (
      m.attachment?.type === 'hook_additional_context' &&
      isEnvTruthy(process.env.ATLAS_SAVE_HOOK_ADDITIONAL_CONTEXT)
    ) {
      return true
    }
    return false
  }
  return true
}

function collectReplIds(messages: readonly Message[]): Set<string> {
  const ids = new Set<string>()
  for (const m of messages) {
    if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
      for (const b of m.message!.content as ToolUseBlock[]) {
        if (b.type === 'tool_use' && b.name === REPL_TOOL_NAME) {
          ids.add(b.id)
        }
      }
    }
  }
  return ids
}

/**
 * For external users, make REPL invisible in the persisted transcript: strip
 * REPL tool_use/tool_result pairs and promote isVirtual messages to real. On
 * --resume the model then sees a coherent native-tool-call history (assistant
 * called Bash, got result, called Read, got result) without the REPL wrapper.
 * Ant transcripts keep the wrapper so /share training data sees REPL usage.
 *
 * replIds is pre-collected from the FULL session array, not the slice being
 * transformed — recordTranscript receives incremental slices where the REPL
 * tool_use (earlier render) and its tool_result (later render, after async
 * execution) land in separate calls. A fresh per-call Set would miss the id
 * and leave an orphaned tool_result on disk.（旧 L4367 逐字，块迭代经
 * ContentBlock 收敛 cast，语义逐字不变。）
 */
function transformMessagesForExternalTranscript(
  messages: Transcript,
  replIds: Set<string>,
): Transcript {
  return messages.flatMap(m => {
    if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
      const content = m.message!.content as ContentBlock[]
      const hasRepl = content.some(
        b => b.type === 'tool_use' && b.name === REPL_TOOL_NAME,
      )
      const filtered = hasRepl
        ? content.filter(
            b => !(b.type === 'tool_use' && b.name === REPL_TOOL_NAME),
          )
        : content
      if (filtered.length === 0) return []
      if (m.isVirtual) {
        const { isVirtual: _omit, ...rest } = m
        return [{ ...rest, message: { ...m.message, content: filtered } }]
      }
      if (filtered !== content) {
        return [{ ...m, message: { ...m.message, content: filtered } }]
      }
      return [m]
    }
    if (m.type === 'user' && Array.isArray(m.message?.content)) {
      const content = m.message!.content as ContentBlockParam[]
      const hasRepl = content.some(
        b =>
          b.type === 'tool_result' &&
          replIds.has((b as ToolResultBlockParam).tool_use_id),
      )
      const filtered = hasRepl
        ? content.filter(
            b =>
              !(
                b.type === 'tool_result' &&
                replIds.has((b as ToolResultBlockParam).tool_use_id)
              ),
          )
        : content
      if (filtered.length === 0) return []
      if (m.isVirtual) {
        const { isVirtual: _omit, ...rest } = m
        return [{ ...rest, message: { ...m.message, content: filtered } }]
      }
      if (filtered !== content) {
        return [{ ...m, message: { ...m.message, content: filtered } }]
      }
      return [m]
    }
    // string-content user, system, attachment
    if ('isVirtual' in m && m.isVirtual) {
      const { isVirtual: _omit, ...rest } = m
      return [rest]
    }
    return [m]
  }) as Transcript
}

export function cleanMessagesForLogging(
  messages: Message[],
  allMessages: readonly Message[] = messages,
): Transcript {
  const filtered = messages.filter(isLoggableMessage) as Transcript
  // de-ANT: `getUserType() !== 'ant'` 恒真（ant 分支已死），坍缩为外部转录变换。
  return transformMessagesForExternalTranscript(
    filtered,
    collectReplIds(allMessages),
  )
}

// ── record* 族（旧 L1419-1545 逐字裁剪）────────────────────────────────────

/**
 * 旧 L1419 逐字（前缀跟踪 skip 语义 + compaction 截断语义头注；P-S1 突变
 * 探针锚点 = `!seenNewMessage && isChainParticipant(m)` 守卫）。
 */
export async function recordTranscript(
  messages: Message[],
  teamInfo?: TeamInfo,
  startingParentUuidHint?: UUID,
  allMessages?: readonly Message[],
): Promise<UUID | null> {
  const cleanedMessages = cleanMessagesForLogging(messages, allMessages)
  const sessionId = getSessionEnv().getSessionId()
  const messageSet = await getSessionMessages(sessionId)
  const newMessages: typeof cleanedMessages = []
  let startingParentUuid: UUID | undefined = startingParentUuidHint
  let seenNewMessage = false
  for (const m of cleanedMessages) {
    if (messageSet.has(m.uuid as UUID)) {
      // Only track skipped messages that form a prefix. After compaction,
      // messagesToKeep appear AFTER new CB/summary, so this skips them.
      if (!seenNewMessage && isChainParticipant(m)) {
        startingParentUuid = m.uuid as UUID
      }
    } else {
      newMessages.push(m)
      seenNewMessage = true
    }
  }
  if (newMessages.length > 0) {
    await projectInstance().insertMessageChain(
      newMessages,
      false,
      undefined,
      startingParentUuid,
      teamInfo,
    )
  }
  // Return the last ACTUALLY recorded chain-participant's UUID, OR the
  // prefix-tracked UUID if no new chain participants were recorded. This lets
  // callers (useLogMessages) maintain the correct parent chain even when the
  // slice is all-recorded (rewind, /resume scenarios where every message is
  // already in messageSet). Progress is skipped — it's written to the JSONL
  // but nothing chains TO it (see isChainParticipant).
  const lastRecorded = newMessages.findLast(isChainParticipant)
  return (lastRecorded?.uuid as UUID | undefined) ?? startingParentUuid ?? null
}

export async function recordSidechainTranscript(
  messages: Message[],
  agentId?: string,
  startingParentUuid?: UUID | null,
) {
  await projectInstance().insertMessageChain(
    cleanMessagesForLogging(messages),
    true,
    agentId,
    startingParentUuid,
  )
}

export async function recordContentReplacement(
  replacements: ContentReplacementRecord[],
  agentId?: string,
) {
  await projectInstance().insertContentReplacement(replacements, agentId)
}

/**
 * Reset the session file pointer after switchSession/regenerateSessionId.
 * The new file is created lazily on the first user/assistant message.（旧
 * L1516 逐字）
 */
export async function resetSessionFilePointer() {
  projectInstance().resetSessionFile()
}

/**
 * Adopt the existing session file after --continue/--resume (non-fork).
 * Call after switchSession + resetSessionFilePointer + restoreSessionMetadata:
 * getTranscriptPath() now derives the resumed file's path from the switched
 * sessionId, and the cache holds the final metadata (--name title, resumed
 * mode/tag/agent).（旧 L1541 逐字）
 *
 * Setting sessionFile here — instead of waiting for materializeSessionFile
 * on the first user message — lets the exit cleanup handler's
 * reAppendSessionMetadata run (it bails when sessionFile is null). Without
 * this, `-c -n foo` + quit-before-message drops the title on the floor:
 * the in-memory cache is correct but never written. The resumed file
 * already exists on disk (we loaded from it), so this can't create an
 * orphan the way a fresh --name session would.
 *
 * skipTitleRefresh: restoreSessionMetadata populated the cache from the
 * same disk read microseconds ago, so refreshing from the tail here is a
 * no-op — unless --name was used, in which case it would clobber the fresh
 * CLI title with the stale disk value. After this write, disk == cache and
 * later calls (compaction, exit cleanup) absorb SDK writes normally.
 */
export function adoptResumedSessionFile(): void {
  const project = projectInstance()
  project.sessionFile = getTranscriptPath()
  project.reAppendSessionMetadata(true)
}

export async function flushSessionStorage(): Promise<void> {
  await projectInstance().flush()
}

// ── 元数据缓存门面（旧 L2725-2852 逐字裁剪）────────────────────────────────

/**
 * Restore session metadata into in-memory cache on resume.（旧 L2734 逐字：
 * `??=` 使 --name（cacheSessionTitle）优先于恢复会话的 title；REPL.tsx
 * 调用前清缓存，故 /resume 不受影响。）
 */
export function restoreSessionMetadata(meta: {
  customTitle?: string
  tag?: string
  agentName?: string
  agentColor?: string
  agentSetting?: string
  mode?: 'coordinator' | 'normal'
  worktreeSession?: PersistedWorktreeSession | null
  prNumber?: number
  prUrl?: string
  prRepository?: string
}): void {
  const project = projectInstance()
  // ??= so --name (cacheSessionTitle) wins over the resumed
  // session's title. REPL.tsx clears before calling, so /resume is unaffected.
  if (meta.customTitle) project.currentSessionTitle ??= meta.customTitle
  if (meta.tag !== undefined) project.currentSessionTag = meta.tag || undefined
  if (meta.agentName) project.currentSessionAgentName = meta.agentName
  if (meta.agentColor) project.currentSessionAgentColor = meta.agentColor
  if (meta.agentSetting) project.currentSessionAgentSetting = meta.agentSetting
  if (meta.mode) project.currentSessionMode = meta.mode
  if (meta.worktreeSession !== undefined)
    project.currentSessionWorktree = meta.worktreeSession
  if (meta.prNumber !== undefined)
    project.currentSessionPrNumber = meta.prNumber
  if (meta.prUrl) project.currentSessionPrUrl = meta.prUrl
  if (meta.prRepository) project.currentSessionPrRepository = meta.prRepository
}

/**
 * Clear all cached session metadata (title, tag, agent name/color).
 * Called when /clear creates a new session so stale metadata
 * from the previous session does not leak into the new one.（旧 L2768 逐字）
 */
export function clearSessionMetadata(): void {
  const project = projectInstance()
  project.currentSessionTitle = undefined
  project.currentSessionTag = undefined
  project.currentSessionAgentName = undefined
  project.currentSessionAgentColor = undefined
  project.currentSessionLastPrompt = undefined
  project.currentSessionAgentSetting = undefined
  project.currentSessionMode = undefined
  project.currentSessionWorktree = undefined
  project.currentSessionPrNumber = undefined
  project.currentSessionPrUrl = undefined
  project.currentSessionPrRepository = undefined
}

/**
 * 旧 L2841 逐字。Cache-only：避免启动即创建 metadata-only 会话文件（首条
 * user/assistant 消息经 materializeSessionFile 落盘）。
 */
export function cacheSessionTitle(customTitle: string): void {
  projectInstance().currentSessionTitle = customTitle
}

/**
 * Cache the session mode. Written to disk by materializeSessionFile on the
 * first user message, and re-stamped by reAppendSessionMetadata on exit.
 * Cache-only here to avoid creating metadata-only session files at startup.
 * （旧 L2850 逐字）
 */
export function saveMode(mode: 'coordinator' | 'normal'): void {
  projectInstance().currentSessionMode = mode
}

/**
 * Re-append cached session metadata (custom title, tag) to the end of the
 * transcript file. Call this after compaction so the metadata stays within
 * the tail window that readLiteMetadata reads during progressive loading.
 * （旧 L2791 公共包装逐字）
 */
export function reAppendSessionMetadata(): void {
  projectInstance().reAppendSessionMetadata()
}

