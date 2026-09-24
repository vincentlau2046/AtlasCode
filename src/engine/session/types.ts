/**
 * session 域 — transcript 持久化类型面（E-7 S-7d d1，§8.49 详案 item 1）
 *
 * 旧仓来源（a8af45b）：src/types/logs.ts 330L 裁剪随迁 + transcript 消息形状
 * （旧 types/message.ts 薄联合收敛为域内 Message 扩展形）+ ContentReplacementRecord
 * （旧 toolResultStorage.ts:539 三字段逐字）。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - FileHistorySnapshotMessage / AttributionSnapshotMessage（+FileAttributionState）
 *     = shell 域 fileHistory/attribution 面；QueueOperationMessage = UI 队列面；
 *     SpeculationAcceptMessage = 推测接受面；ContextCollapseCommitEntry /
 *     ContextCollapseSnapshotEntry（marble-origami 上下文折叠）= 零消费者
 *     （grep 确证）。以上 entry type 不入门面——**loader 侧对未知 entry type
 *     走「跳过非报错」容错**（旧 AtlasHarness 磁盘 JSONL 含这些 entry；shell
 *     域波补全时收紧）。
 *   - TranscriptMessage stamp 裁剪：sessionProjectDir（CC-34 原子对）/ promptId /
 *     slug 三戳弃——旧 bootstrap getSessionProjectDir（`: any` 恒 null）/
 *     getPromptId（`({}) as any`）/ getPlanSlugCache（per-call fresh Map →
 *     `.get` 恒 undefined）皆为 `: any` 退化 stub，裁除零行为 delta；存活戳 =
 *     userType/entrypoint/cwd/sessionId/version/gitBranch（insertMessageChain
 *     头注钉死字段序）。
 *   - LogOption 裁至 engine resume 消费子集（teamName/isTeammate/agentSetting/
 *     prNumber/prUrl/prRepository + fileHistory/attribution/contextCollapse 四字段
 *     = CLI list 面，归相邻 8 项 CLI 波残留守）。
 *
 * 类型适配登记（旧仓 → 新仓，行为不变）：
 *   - UUID（旧 crypto 品牌串）→ 本域 `type UUID = string` 别名，旧文 `as UUID`
 *     cast 逐字保留（no-op）。
 *   - AgentId / SessionId（旧 types/ids brand）→ string（残余 ② 口径，同
 *     coordinator/worktree 域先例），asAgentId/asSessionId 收敛为恒等。
 *   - Message = shared Message（旧 types/message.ts 薄联合）+ session 域字段面
 *     扩展（message/id/content/usage 内层 + isMeta/isVirtual/subtype/
 *     sourceToolAssistantUUID/attachment）：旧仓 `(m as any).message.id` 类
 *     cast 在域扩展型下直接可访，逐字块内按需去 cast（语义逐字不变）。
 */
import type {
  ContentBlock,
  Message as BaseMessage,
  Usage,
} from '../../shared'

// 旧仓 crypto UUID 品牌串 → string（新仓无品牌，cast 保留为 no-op）
export type UUID = string

/** 旧 types/ids brand → string（残余 ② 口径）。 */
export type AgentId = string
export type SessionId = string

/**
 * 旧 Transcript = (UserMessage | AssistantMessage | AttachmentMessage |
 * SystemMessage)[] → 域 Message[]（薄联合收敛，isTranscriptMessage 仍是
 * 「什么是 transcript 消息」的单一事实源）。
 */
export type Transcript = Message[]

/** 域 Message：shared 基型 + session 域字段面（旧 types/message.ts 薄联合收敛）。 */
export interface Message extends BaseMessage {
  uuid?: string
  type?: string
  timestamp?: string
  subtype?: string
  isMeta?: boolean
  isVirtual?: boolean
  /** 旧 types/message.ts UserMessage.isMeta / 内层 API message 面。 */
  message?: { id?: string; content?: unknown; usage?: Usage }
  /** 旧 UserMessage.sourceToolAssistantUUID（tool_result 回指 assistant uuid）。 */
  sourceToolAssistantUUID?: string
  /** 旧 AttachmentMessage.attachment 面（isLoggableMessage hook 分支消费）。 */
  attachment?: { type: string; [key: string]: unknown }
  /** 旧 UserMessage.isCompactSummary（compact summary 消息标记）。 */
  isCompactSummary?: boolean
  /** 旧 SystemMessage.compactMetadata 面（applyPreservedSegmentRelinks
   *  消费 preservedSegment 三段 uuid；SystemCompactBoundaryMessage 为
   *  判别收窄形，此处为宽域字段声明）。 */
  compactMetadata?: {
    preservedSegment?: {
      headUuid: string
      tailUuid: string
      anchorUuid: string
    }
  }
}

/**
 * 旧 SystemCompactBoundaryMessage（旧仓 = any stub）→ 最小形状（session 域
 * 消费面：isCompactBoundaryMessage 判别 + applyPreservedSegmentRelinks 的
 * compactMetadata.preservedSegment 三段 uuid）。
 */
export interface SystemCompactBoundaryMessage {
  type: 'system'
  subtype: 'compact_boundary'
  uuid?: string
  compactMetadata?: {
    preservedSegment?: {
      headUuid: string
      tailUuid: string
      anchorUuid: string
    }
  }
  [key: string]: unknown
}

/** 旧 types/logs.ts SerializedMessage 逐字（Message 换域扩展型）。 */
export type SerializedMessage = Message & {
  cwd: string
  userType: string
  entrypoint?: string // ATLAS_ENTRYPOINT — distinguishes cli/sdk-ts/sdk-py/etc.
  sessionId: string
  timestamp: string
  version: string
  gitBranch?: string
}

/** 旧 types/logs.ts LogOption 裁至 engine resume 消费子集（裁剪面见头注登记）。 */
export type LogOption = {
  date: string
  messages: SerializedMessage[]
  fullPath?: string
  value: number
  created: Date
  modified: Date
  firstPrompt: string
  messageCount: number
  fileSize?: number // File size in bytes (for display)
  isSidechain: boolean
  teamName?: string // Team name if this is a spawned agent session
  isLite?: boolean // True for lite logs (messages not loaded)
  sessionId?: string // Session ID for lite logs
  agentName?: string // Agent's custom name (from /rename or swarm)
  agentColor?: string // Agent's color (from /rename or swarm)
  leafUuid?: UUID // If given, this uuid must appear in the DB
  summary?: string // Optional conversation summary
  customTitle?: string // Optional user-set custom title
  tag?: string // Optional tag for the session (searchable in /resume)
  gitBranch?: string // Git branch at the end of the session
  projectPath?: string // Original project directory path
  mode?: 'coordinator' | 'normal' // Session mode for coordinator/normal detection
  worktreeSession?: PersistedWorktreeSession | null // Worktree state at session end (null = exited, undefined = never entered)
  contentReplacements?: ContentReplacementRecord[] // Replacement decisions for resume reconstruction
}

export type SummaryMessage = {
  type: 'summary'
  leafUuid: UUID
  summary: string
}

export type CustomTitleMessage = {
  type: 'custom-title'
  sessionId: UUID
  customTitle: string
}

/**
 * AI-generated session title. Distinct from CustomTitleMessage so that:
 * - User renames (custom-title) always win over AI titles in read preference
 * - reAppendSessionMetadata never re-appends AI titles (they're ephemeral/
 *   regeneratable; re-appending would clobber user renames on resume)
 * - VS Code's onlyIfNoCustomTitle CAS check only matches user titles,
 *   allowing AI to overwrite its own previous AI title but not user titles
 */
export type AiTitleMessage = {
  type: 'ai-title'
  sessionId: UUID
  aiTitle: string
}

export type LastPromptMessage = {
  type: 'last-prompt'
  sessionId: UUID
  lastPrompt: string
}

/**
 * Periodic fork-generated summary of what the agent is currently doing.
 * Written every min(5 steps, 2min) by forking the main thread mid-turn so
 * `atlas ps` can show something more useful than the last user prompt
 * (which is often "ok go" or "fix it").
 */
export type TaskSummaryMessage = {
  type: 'task-summary'
  sessionId: UUID
  summary: string
  timestamp: string
}

export type TagMessage = {
  type: 'tag'
  sessionId: UUID
  tag: string
}

export type AgentNameMessage = {
  type: 'agent-name'
  sessionId: UUID
  agentName: string
}

export type AgentColorMessage = {
  type: 'agent-color'
  sessionId: UUID
  agentColor: string
}

export type AgentSettingMessage = {
  type: 'agent-setting'
  sessionId: UUID
  agentSetting: string
}

/**
 * PR link message stored in session transcript.
 * Links a session to a GitHub pull request for tracking and navigation.
 */
export type PRLinkMessage = {
  type: 'pr-link'
  sessionId: UUID
  prNumber: number
  prUrl: string
  prRepository: string // e.g., "owner/repo"
  timestamp: string // ISO timestamp when linked
}

export type ModeEntry = {
  type: 'mode'
  sessionId: UUID
  mode: 'coordinator' | 'normal'
}

/**
 * Worktree session state persisted to the transcript for resume.
 * Subset of WorktreeSession from utils/worktree.ts — excludes ephemeral
 * fields (creationDurationMs, usedSparsePaths) that are only used for
 * first-run analytics.
 */
export type PersistedWorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

/**
 * Records whether the session is currently inside a worktree created by
 * EnterWorktree or --worktree. Last-wins: an enter writes the session,
 * an exit writes null. On --resume, restored only if the worktreePath
 * still exists on disk (the /exit dialog may have removed it).
 */
export type WorktreeStateEntry = {
  type: 'worktree-state'
  sessionId: UUID
  worktreeSession: PersistedWorktreeSession | null
}

/**
 * Records content blocks whose in-context representation was replaced with a
 * smaller stub (the full content was persisted elsewhere). Replayed on resume
 * for prompt cache stability. Written once per enforcement pass that replaces
 * at least one block. When agentId is set, the record belongs to a subagent
 * sidechain (AgentTool resume reads these); when absent, it's main-thread
 * (/resume reads these).
 */
export type ContentReplacementEntry = {
  type: 'content-replacement'
  sessionId: UUID
  agentId?: AgentId
  replacements: ContentReplacementRecord[]
}

/**
 * 旧 toolResultStorage.ts:539 三字段逐字（ContentReplacementRecord）：
 * Serializable record of one content-replacement decision. Written to the
 * transcript as a ContentReplacementEntry so decisions survive resume.
 * Discriminated by `kind` so future replacement mechanisms (user text,
 * offloaded images) can share the same transcript entry type.
 *
 * `replacement` is the exact string the model saw — stored rather than
 * derived on resume so code changes to the preview template, size formatting,
 * or path layout can't silently break prompt cache.
 */
export type ContentReplacementRecord = {
  kind: 'tool-result'
  toolUseId: string
  replacement: string
}

export type TranscriptMessage = SerializedMessage & {
  /** 域 Message.uuid 为可选扩展；transcript 消息（磁盘 JSONL 行）恒带
   *  uuid（旧仓 Message 基型必填），此处覆回必填（类型适配登记）。 */
  uuid: string
  /** 覆域 Message.type?（string 可选宽型）为必填字面量联合——Entry 并集
   *  的判别式收窄依赖（appendEntry else-if 链 / load entry 分发）；
   *  旧仓 Message 各成员 type 均必填字面量，语义逐字。 */
  type: 'user' | 'assistant' | 'attachment' | 'system'
  parentUuid: UUID | null
  logicalParentUuid?: UUID | null // Preserves logical parent when parentUuid is nullified for session breaks
  isSidechain: boolean
  gitBranch?: string
  agentId?: string // Agent ID for sidechain transcripts to enable resuming agents
  teamName?: string // Team name if this is a spawned agent session
  agentName?: string // Agent's custom name (from /rename or swarm)
  agentColor?: string // Agent's color (from /rename or swarm)
}

/**
 * Entry 并集（按留面缩，旧 logs.ts Entry 31 成员 → 18 成员；已裁成员见
 * 头注裁剪登记）。loader 对磁盘上的已裁 entry type（file-history-snapshot /
 * attribution-snapshot / queue-operation / speculation-accept /
 * marble-origami-* / progress）走「未知 type 跳过」容错。
 */
export type Entry =
  | TranscriptMessage
  | SummaryMessage
  | CustomTitleMessage
  | AiTitleMessage
  | LastPromptMessage
  | TaskSummaryMessage
  | TagMessage
  | AgentNameMessage
  | AgentColorMessage
  | AgentSettingMessage
  | PRLinkMessage
  | ModeEntry
  | WorktreeStateEntry
  | ContentReplacementEntry

export function sortLogs(logs: LogOption[]): LogOption[] {
  return logs.sort((a, b) => {
    // Sort by modified date (newest first)
    const modifiedDiff = b.modified.getTime() - a.modified.getTime()
    if (modifiedDiff !== 0) {
      return modifiedDiff
    }

    // If modified dates are equal, sort by created date (newest first)
    return b.created.getTime() - a.created.getTime()
  })
}

// ── d2：RenderableMessage 最小形（transcriptSearch 消费面）──────────────────

/**
 * RenderableMessage 最小形（E-7 S-7d d2，§8.49）：旧仓 types/message.ts:30
 * `RenderableMessage = Message`（Message = 带 `[key: string]: any` 索引签名
 * 的宽接口，非 union；2026-09-24 审视 N-3 措辞订正）→ 本域仅留 search.ts
 * computeSearchText 消费的 6 型面 + toolUseResult duck 面（UI 渲染消费方
 * = REPL /transcript 搜索波，前向接缝；兼容口径 = 运行时对象层——旧 UI
 * 消息对象满足本最小形，但旧 TS 宽类型（`type?: string` 宽判别式）不可
 * 直接赋给本字面量判别联合，UI 波落地需 cast / 重定型）。
 *
 * attachment 双成员面：relevant_memories 变体保证 memories 非缺省（computeSearchText
 * 逐字 `memories.map` 无 `!`）；catch-all 变体携带 queued_command 守卫字段
 * （commandMode/isMeta/prompt）+ 可选 memories。过检机制（2026-09-24 审视
 * M-1 订正，复现坐实）：catch-all 的 `type: string` 宽判别式**不被**
 * `=== 'relevant_memories'` 字面量比较排除（TS 对非字面量判别式成员不收窄），
 * 真支 `memories` 为 `Array | undefined`——今日通过依赖本仓 tsconfig
 * `strict: false`（无 strictNullChecks；复现 `--strict` 红 TS18048 /
 * `--strict false` 绿）。UI 波 / strict 化落地时须补守卫或重构变体
 * （catch-all 判别式收窄为具体字面量联合 / memories 移出 catch-all）。
 */
export type RenderableMessage =
  | {
      type: 'user'
      message: { content: string | ContentBlock[] }
      /** UI-native tool Out（duck 面；见 search.ts toolResultSearchText）。 */
      toolUseResult?: unknown
    }
  | { type: 'assistant'; message: { content: string | ContentBlock[] } }
  | {
      type: 'attachment'
      attachment:
        | { type: 'relevant_memories'; memories: Array<{ content: string }> }
        | {
            type: string
            memories?: Array<{ content: string }>
            commandMode?: string
            isMeta?: boolean
            prompt?: string | ContentBlock[]
          }
    }
  | {
      type: 'collapsed_read_search'
      relevantMemories?: Array<{ content: string }>
    }
  | { type: 'grouped_tool_use' }
  | { type: 'system' }
