/**
 * session 域 — Project 类持久核心（E-7 S-7d d1，§8.49 详案 item 4；
 * 旧 sessionStorage.ts L528-1395 Project 类 + 单例 + L2554-2596 同步写工具
 * 裁剪解耦随迁）
 *
 * 留面（逐字核）：currentSession* 元数据缓存字段族 / sessionFile +
 * pendingEntries 缓冲 + materializeSessionFile（首条 user/assistant 才物化，
 * 防 metadata-only 空文件）/ insertMessageChain（L994 逐字：tool_result
 * sourceToolAssistantUUID 覆写 + isCompactBoundary parentUuid=null /
 * logicalParentUuid + chain-participant parent 推进 + lastPrompt 200 字
 * 截断缓存 + METADATA_REWRITE_INTERVAL=20 元数据重写）/ appendEntry
 * （L1141 per-file 写队列 + flushResolvers + dedup + sidechain 分流）/
 * insertContentReplacement（L1126 agentId → sidechain 文件路由）/
 * reAppendSessionMetadata（L722 尾部 64KB 窗口语义）/ flush（L842）/
 * trackWrite / resetSessionFile（L689）/ _resetFlushState（L574）/
 * ensureCurrentSessionFile + getExistingSessionFile（stat 缓存）。
 *
 * 6 裁面（H6 前向接缝登记，复审勿当遗漏重提）：
 *   ① insertFileHistorySnapshot / ② insertAttributionSnapshot /
 *    ③ insertQueueOperation —— shell 域 fileHistory/attribution/UI 队列面；
 *   ④ removeMessageByUuid —— REPL tombstone，engine 零消费者（grep 确证）；
 *   ⑤ setRemoteIngressUrl + CCR v2 internalEvent writer/reader +
 *    REMOTE_FLUSH_INTERVAL_MS + persistToRemote —— 远程/teleport 波；
 *   ⑥ 旧 registerCleanup（coordinator/tasks cleanupRegistry 跨域）→
 *    env.registerCleanup 注入口（scheduler 先例，壳侧接线执行面）。
 *
 * 解耦/适配登记：
 *   - getSessionId/switchSession/getOriginalCwd/registerCleanup 全走
 *    SessionEnv 注入窗口（env.ts），不跨 import bootstrap（§8.49 item 2）。
 *   - 【审视 A-1 登记（E-7 d1 独立审视 MAJOR，值 delta 裁定接受）+ S-E3 A12
 *    核销（§8.52）】insertMessageChain cwd 戳：旧 `getCwd()`（活态——ALS
 *    覆盖层 ?? cwdState，Bash cd 持久化 / --resume workDir / agent worktree
 *    会刷新，消费者 = 旧 CLI ps 列表面）→ E-7 d1 冻结 `SessionEnv
 *    .getOriginalCwd()`（模块加载冻结）→ **S-E3 A12 已落**：SessionEnv 扩
 *    活态成员 `getCwd()`（域缺省 process.cwd() 活读；compose ⑨ 注 bootstrap
 *    pwd() = ALS 覆盖 ?? getCwdState，活态 cwd 状态源已随 C-Deep 切片 3 T4
 *    bootstrap/cwd.ts 就绪——d1 时「暂无活态源」前提已失效），本戳位恢复
 *    旧活态语义。影响面 = 仅逐条消息 gitBranch 同级的 cwd 戳值（会话文件
 *    定位不受影响——project dir 键控 getOriginalCwd，旧 L216/L395 同源，
 *    load.ts 键控点不动）；链完整性零 delta。
 *   - shouldSkipPersistence 裁 2 支：S-C4（§8.71.1.4）已回填——
 *    getSettingsWithErrors().settings?.cleanupPeriodDays===0（config 域面，
 *    经 engine/config 门面；旧仓 getSettings_DEPRECATED 同面更名，passthrough
 *    字段族）+ bootstrap ⑥ 族 isSessionPersistenceDisabled（持久化
 *    kill-switch 面，--no-session-persistence 支置位）；支序旧仓逐字。
 *    留 NODE_ENV=test 测试守卫 + ATLAS_SKIP_PROMPT_HISTORY（tmux 测试会话
 *    防污染语义，func 真盘测试经 TEST_ENABLE_SESSION_PERSISTENCE 覆写）。
 *   - getBranch（旧 utils/git.ts 缓存族）→ 域内 getGitBranch（paths.ts）。
 *   - VERSION（旧 MACRO 构建 define）→ package.json 读（paths.ts，头注）。
 *   - 旧 bootstrap getPlanSlugCache/getPromptId（`: any` 退化 stub）→
 *    slug/promptId 戳面裁除零 delta（§8.49 解耦判据）。
 *   - LITE_READ_BUF_SIZE / unescapeJsonString / extractLastJsonStringField
 *    随迁自旧 sessionStoragePortable.ts L17/L39/L82 逐字（portable 小工具族
 *    归本域 project 写面，头注登记）。
 *   - 同步 fs 辅助（appendEntryToFile / readFileTailSync）直用 node:fs——
 *    shared FsOperations 无 appendFileSync 同步面（详见函数头注）。
 */
import {
  appendFile as fsAppendFile,
  mkdir,
  stat,
} from 'fs/promises'
import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readSync } from 'fs'
import { dirname } from 'path'
import { isSessionPersistenceDisabled } from '../../bootstrap'
import { isEnvTruthy, isFsInaccessible, logForDebugging } from '../../shared'
import { getSettingsWithErrors } from '../config'
import { getSessionEnv } from './env'
import { jsonStringify } from './json'
import {
  getAgentTranscriptPath,
  getEntrypoint,
  getGitBranch,
  getTranscriptPath,
  getTranscriptPathForSession,
  getUserType,
  getVersion,
} from './paths'
import type {
  ContentReplacementRecord,
  Entry,
  PersistedWorktreeSession,
  Transcript,
  TranscriptMessage,
  UUID,
} from './types'
import { isChainParticipant, isCompactBoundaryMessage } from './predicates'
import { getFirstMeaningfulUserMessageTextContent } from './firstPrompt'
import { getSessionMessages } from './load'

/** Size of the head/tail buffer for lite metadata reads.（旧 portable L17 逐字） */
export const LITE_READ_BUF_SIZE = 65536

/**
 * Unescape a JSON string value extracted as raw text.
 * Only allocates a new string when escape sequences are present.（旧 portable
 * L39 逐字）
 */
export function unescapeJsonString(raw: string): string {
  if (!raw.includes('\\')) return raw
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return raw
  }
}

/**
 * Like extractJsonStringField but finds the LAST occurrence.
 * Useful for fields that are appended (customTitle, tag, etc.).（旧 portable
 * L82 逐字）
 */
export function extractLastJsonStringField(
  text: string,
  key: string,
): string | undefined {
  const patterns = [`"${key}":"`, `"${key}": "`]
  let lastValue: string | undefined
  for (const pattern of patterns) {
    let searchFrom = 0
    while (true) {
      const idx = text.indexOf(pattern, searchFrom)
      if (idx < 0) break

      const valueStart = idx + pattern.length
      let i = valueStart
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2
          continue
        }
        if (text[i] === '"') {
          lastValue = unescapeJsonString(text.slice(valueStart, i))
          break
        }
        i++
      }
      searchFrom = i + 1
    }
  }
  return lastValue
}

/** 旧 getNodeEnv 逐字（sessionStorage L407）。 */
function getNodeEnv(): string {
  return process.env.NODE_ENV || 'development'
}

let project: Project | null = null
let cleanupRegistered = false

function getProject(): Project {
  if (!project) {
    project = new Project()

    // Register flush as a cleanup handler (only once)——经 env 注入口
    // （裁面 ⑥，scheduler 先例）。
    if (!cleanupRegistered) {
      getSessionEnv().registerCleanup(async () => {
        // Flush queued writes first, then re-append session metadata
        // (customTitle, tag) so they always appear in the last 64KB tail
        // window. readLiteMetadata only reads the tail to extract these
        // fields — if enough messages are appended after a /rename, the
        // custom-title entry gets pushed outside the window and --resume
        // shows the auto-generated firstPrompt instead.
        await project?.flush()
        try {
          project?.reAppendSessionMetadata()
        } catch {
          // Best-effort — don't let metadata re-append crash the cleanup
        }
      })
      cleanupRegistered = true
    }
  }
  return project
}

/**
 * Reset the Project singleton's flush state for testing.
 * This ensures tests don't interfere with each other via shared counter state.
 */
export function resetProjectFlushStateForTesting(): void {
  project?._resetFlushState()
}

/**
 * Reset the entire Project singleton for testing.
 * This ensures tests with different ATLAS_CONFIG_DIR values
 * don't share stale sessionFile paths.
 */
export function resetProjectForTesting(): void {
  project = null
  cleanupRegistered = false
}

export function setSessionFileForTesting(path: string): void {
  getProject().sessionFile = path
}

class Project {
  // Minimal cache for current session only (not all sessions)
  currentSessionTag: string | undefined
  currentSessionTitle: string | undefined
  currentSessionAgentName: string | undefined
  currentSessionAgentColor: string | undefined
  currentSessionLastPrompt: string | undefined
  /** 计数器：自上次 reAppendSessionMetadata 以来写入的主会话 chain participant 消息数。
   *  每写满 METADATA_REWRITE_INTERVAL 条触发一次元数据重写，确保 title/last-prompt/tag
   *  始终在 JSONL 尾部 64KB 窗口内，降低 crash 时元数据丢失概率。 */
  private messagesSinceMetadataRewrite = 0
  private static readonly METADATA_REWRITE_INTERVAL = 20
  currentSessionAgentSetting: string | undefined
  currentSessionMode: 'coordinator' | 'normal' | undefined
  // Tri-state: undefined = never touched (don't write), null = exited worktree,
  // object = currently in worktree. reAppendSessionMetadata writes null so
  // --resume knows the session exited (vs. crashed while inside).
  currentSessionWorktree: PersistedWorktreeSession | null | undefined
  currentSessionPrNumber: number | undefined
  currentSessionPrUrl: string | undefined
  currentSessionPrRepository: string | undefined

  sessionFile: string | null = null
  // Entries buffered while sessionFile is null. Flushed by materializeSessionFile
  // on the first user/assistant message — prevents metadata-only session files.
  private pendingEntries: Entry[] = []
  private pendingWriteCount: number = 0
  private flushResolvers: Array<() => void> = []
  // Per-file write queues. Each entry carries a resolve callback so
  // callers of enqueueWrite can optionally await their specific write.
  private writeQueues = new Map<
    string,
    Array<{ entry: Entry; resolve: () => void }>
  >()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private activeDrain: Promise<void> | null = null
  private FLUSH_INTERVAL_MS = 100
  private readonly MAX_CHUNK_BYTES = 100 * 1024 * 1024

  constructor() {}

  /** @internal Reset flush/queue state for testing. */
  _resetFlushState(): void {
    this.pendingWriteCount = 0
    this.flushResolvers = []
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    this.activeDrain = null
    this.writeQueues = new Map()
  }

  private incrementPendingWrites(): void {
    this.pendingWriteCount++
  }

  private decrementPendingWrites(): void {
    this.pendingWriteCount--
    if (this.pendingWriteCount === 0) {
      // Resolve all waiting flush promises
      for (const resolve of this.flushResolvers) {
        resolve()
      }
      this.flushResolvers = []
    }
  }

  private async trackWrite<T>(fn: () => Promise<T>): Promise<T> {
    this.incrementPendingWrites()
    try {
      return await fn()
    } finally {
      this.decrementPendingWrites()
    }
  }

  private enqueueWrite(filePath: string, entry: Entry): Promise<void> {
    return new Promise<void>(resolve => {
      let queue = this.writeQueues.get(filePath)
      if (!queue) {
        queue = []
        this.writeQueues.set(filePath, queue)
      }
      queue.push({ entry, resolve })
      this.scheduleDrain()
    })
  }

  private scheduleDrain(): void {
    if (this.flushTimer) {
      return
    }
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null
      this.activeDrain = this.drainWriteQueue()
      await this.activeDrain
      this.activeDrain = null
      // If more items arrived during drain, schedule again
      if (this.writeQueues.size > 0) {
        this.scheduleDrain()
      }
    }, this.FLUSH_INTERVAL_MS)
  }

  private async appendToFile(filePath: string, data: string): Promise<void> {
    try {
      await fsAppendFile(filePath, data, { mode: 0o600 })
    } catch {
      // Directory may not exist — some NFS-like filesystems return
      // unexpected error codes, so don't discriminate on code.
      await mkdir(dirname(filePath), { recursive: true, mode: 0o700 })
      await fsAppendFile(filePath, data, { mode: 0o600 })
    }
  }

  private async drainWriteQueue(): Promise<void> {
    for (const [filePath, queue] of this.writeQueues) {
      if (queue.length === 0) {
        continue
      }
      const batch = queue.splice(0)

      let content = ''
      const resolvers: Array<() => void> = []

      for (const { entry, resolve } of batch) {
        const line = jsonStringify(entry) + '\n'

        if (content.length + line.length >= this.MAX_CHUNK_BYTES) {
          // Flush chunk and resolve its entries before starting a new one
          await this.appendToFile(filePath, content)
          for (const r of resolvers) {
            r()
          }
          resolvers.length = 0
          content = ''
        }

        content += line
        resolvers.push(resolve)
      }

      if (content.length > 0) {
        await this.appendToFile(filePath, content)
        for (const r of resolvers) {
          r()
        }
      }
    }

    // Clean up empty queues
    for (const [filePath, queue] of this.writeQueues) {
      if (queue.length === 0) {
        this.writeQueues.delete(filePath)
      }
    }
  }

  resetSessionFile(): void {
    this.sessionFile = null
    this.pendingEntries = []
  }

  /**
   * Re-append cached session metadata to the end of the transcript file.
   * This ensures metadata stays within the tail window that readLiteMetadata
   * reads during progressive loading.
   *
   * Called from two contexts with different file-ordering implications:
   * - During compaction (compact.ts, reactiveCompact.ts): writes metadata
   *   just before the boundary marker is emitted - these entries end up
   *   before the boundary and are recovered by scanPreBoundaryMetadata.
   * - On session exit (cleanup handler): writes metadata at EOF after all
   *   boundaries - this is what enables loadTranscriptFile's pre-compact
   *   skip to find metadata without a forward scan.
   *
   * External-writer safety for SDK-mutable fields (custom-title, tag):
   * before re-appending, refresh the cache from the tail scan window. If an
   * external process (SDK renameSession/tagSession) wrote a fresher value,
   * our stale cache absorbs it and the re-append below persists it — not
   * the stale CLI value. If no entry is in the tail (evicted, or never
   * written by the SDK), the cache is the only source of truth and is
   * re-appended as-is.
   *
   * Re-append is unconditional (even when the value is already in the
   * tail): during compaction, a title 40KB from EOF is inside the current
   * tail window but will fall out once the post-compaction session grows.
   * Skipping the re-append would defeat the purpose of this call. Fields
   * the SDK cannot touch (last-prompt, agent-*, mode, pr-link) have no
   * external-writer concern — their caches are authoritative.
   */
  reAppendSessionMetadata(skipTitleRefresh = false): void {
    if (!this.sessionFile) return
    const sessionId = getSessionEnv().getSessionId()
    if (!sessionId) return

    // One sync tail read to refresh SDK-mutable fields. Same
    // LITE_READ_BUF_SIZE window readLiteMetadata uses. Empty string on
    // failure → extract returns null → cache is the only source of truth.
    const tail = readFileTailSync(this.sessionFile)

    // Absorb any fresher SDK-written title/tag into our cache. If the SDK
    // wrote while we had the session open, our cache is stale — the tail
    // value is authoritative. If the tail has nothing (evicted or never
    // written externally), the cache stands.
    //
    // Filter with startsWith to match only top-level JSONL entries (col 0)
    // and not "type":"tag" appearing inside a nested tool_use input that
    // happens to be JSON-serialized into a message.
    const tailLines = tail.split('\n')
    if (!skipTitleRefresh) {
      const titleLine = tailLines.findLast(l =>
        l.startsWith('{"type":"custom-title"'),
      )
      if (titleLine) {
        const tailTitle = extractLastJsonStringField(titleLine, 'customTitle')
        // `!== undefined` distinguishes no-match from empty-string match.
        // renameSession rejects empty titles, but the CLI is defensive: an
        // external writer with customTitle:"" should clear the cache so the
        // re-append below skips it (instead of resurrecting a stale title).
        if (tailTitle !== undefined) {
          this.currentSessionTitle = tailTitle || undefined
        }
      }
    }
    const tagLine = tailLines.findLast(l => l.startsWith('{"type":"tag"'))
    if (tagLine) {
      const tailTag = extractLastJsonStringField(tagLine, 'tag')
      // Same: tagSession(id, null) writes `tag:""` to clear.
      if (tailTag !== undefined) {
        this.currentSessionTag = tailTag || undefined
      }
    }

    // lastPrompt is re-appended so readLiteMetadata can show what the
    // user was most recently doing. Written first so customTitle/tag/etc
    // land closer to EOF (they're the more critical fields for tail reads).
    if (this.currentSessionLastPrompt) {
      appendEntryToFile(this.sessionFile, {
        type: 'last-prompt',
        lastPrompt: this.currentSessionLastPrompt,
        sessionId,
      })
    }
    // Unconditional: cache was refreshed from tail above; re-append keeps
    // the entry at EOF so compaction-pushed content doesn't evict it.
    if (this.currentSessionTitle) {
      appendEntryToFile(this.sessionFile, {
        type: 'custom-title',
        customTitle: this.currentSessionTitle,
        sessionId,
      })
    }
    if (this.currentSessionTag) {
      appendEntryToFile(this.sessionFile, {
        type: 'tag',
        tag: this.currentSessionTag,
        sessionId,
      })
    }
    if (this.currentSessionAgentName) {
      appendEntryToFile(this.sessionFile, {
        type: 'agent-name',
        agentName: this.currentSessionAgentName,
        sessionId,
      })
    }
    if (this.currentSessionAgentColor) {
      appendEntryToFile(this.sessionFile, {
        type: 'agent-color',
        agentColor: this.currentSessionAgentColor,
        sessionId,
      })
    }
    if (this.currentSessionAgentSetting) {
      appendEntryToFile(this.sessionFile, {
        type: 'agent-setting',
        agentSetting: this.currentSessionAgentSetting,
        sessionId,
      })
    }
    if (this.currentSessionMode) {
      appendEntryToFile(this.sessionFile, {
        type: 'mode',
        mode: this.currentSessionMode,
        sessionId,
      })
    }
    if (this.currentSessionWorktree !== undefined) {
      appendEntryToFile(this.sessionFile, {
        type: 'worktree-state',
        worktreeSession: this.currentSessionWorktree,
        sessionId,
      })
    }
    if (
      this.currentSessionPrNumber !== undefined &&
      this.currentSessionPrUrl &&
      this.currentSessionPrRepository
    ) {
      appendEntryToFile(this.sessionFile, {
        type: 'pr-link',
        sessionId,
        prNumber: this.currentSessionPrNumber,
        prUrl: this.currentSessionPrUrl,
        prRepository: this.currentSessionPrRepository,
        timestamp: new Date().toISOString(),
      })
    }
  }

  async flush(): Promise<void> {
    // Cancel pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    // Wait for any in-flight drain to finish
    if (this.activeDrain) {
      await this.activeDrain
    }
    // Drain anything remaining in the queues
    await this.drainWriteQueue()

    // Wait for non-queue tracked operations（旧仓 e.g. removeMessageByUuid
    // 裁面 ④，未来 tombstone 面恢复时经 trackWrite 接入）。
    if (this.pendingWriteCount === 0) {
      return
    }
    return new Promise<void>(resolve => {
      this.flushResolvers.push(resolve)
    })
  }

  /**
   * True when test env / cleanupPeriodDays=0 / --no-session-persistence /
   * ATLAS_SKIP_PROMPT_HISTORY should suppress all transcript writes.
   * Shared guard for appendEntry and materializeSessionFile so both skip
   * consistently. The env var is set by tmuxSocket.ts so Tungsten-spawned
   * test sessions don't pollute the user's --resume list.
   *
   * S-C4（§8.71.1.4）回填 2 支（旧仓 sessionStorage 同支序逐字）：
   * cleanupPeriodDays===0（config 域面，engine/config 门面读合并 settings；
   * 旧仓 getSettings_DEPRECATED 同面）+ isSessionPersistenceDisabled()
   * （bootstrap ⑥ 族 kill-switch，cli/parse --no-session-persistence 支置位）。
   */
  private shouldSkipPersistence(): boolean {
    const allowTestPersistence = isEnvTruthy(
      process.env.TEST_ENABLE_SESSION_PERSISTENCE,
    )
    const settings = getSettingsWithErrors().settings
    return (
      (getNodeEnv() === 'test' && !allowTestPersistence) ||
      settings?.cleanupPeriodDays === 0 ||
      isSessionPersistenceDisabled() ||
      isEnvTruthy(process.env.ATLAS_SKIP_PROMPT_HISTORY)
    )
  }

  /**
   * Create the session file, write cached startup metadata, and flush
   * buffered entries. Called on the first user/assistant message.
   */
  private async materializeSessionFile(): Promise<void> {
    // Guard here too — reAppendSessionMetadata writes via appendEntryToFile
    // (not appendEntry) so it would bypass the per-entry persistence check
    // and create a metadata-only file despite --no-session-persistence.
    if (this.shouldSkipPersistence()) return
    this.ensureCurrentSessionFile()
    // mode/agentSetting are cache-only pre-materialization; write them now.
    this.reAppendSessionMetadata()
    if (this.pendingEntries.length > 0) {
      const buffered = this.pendingEntries
      this.pendingEntries = []
      for (const entry of buffered) {
        await this.appendEntry(entry)
      }
    }
  }

  async insertMessageChain(
    messages: Transcript,
    isSidechain: boolean = false,
    agentId?: string,
    startingParentUuid?: UUID | null,
    teamInfo?: { teamName?: string; agentName?: string },
  ) {
    return this.trackWrite(async () => {
      let parentUuid: UUID | null = startingParentUuid ?? null

      // First user/assistant message materializes the session file.
      // Hook progress/attachment messages alone stay buffered.
      if (
        this.sessionFile === null &&
        messages.some(m => m.type === 'user' || m.type === 'assistant')
      ) {
        await this.materializeSessionFile()
      }

      // Get current git branch once for this message chain
      let gitBranch: string | undefined
      try {
        gitBranch = await getGitBranch()
      } catch {
        // Not in a git repo or git command failed
        gitBranch = undefined
      }

      const sessionId = getSessionEnv().getSessionId()

      for (const message of messages) {
        const isCompactBoundary = isCompactBoundaryMessage(message)

        // For tool_result messages, use the assistant message UUID from the message
        // if available (set at creation time), otherwise fall back to sequential parent
        let effectiveParentUuid = parentUuid
        if (
          message.type === 'user' &&
          'sourceToolAssistantUUID' in message &&
          message.sourceToolAssistantUUID
        ) {
          effectiveParentUuid = message.sourceToolAssistantUUID
        }

        const transcriptMessage: TranscriptMessage = {
          parentUuid: isCompactBoundary ? null : effectiveParentUuid,
          logicalParentUuid: isCompactBoundary ? parentUuid : undefined,
          isSidechain,
          teamName: teamInfo?.teamName,
          agentName: teamInfo?.agentName,
          agentId,
          ...message,
          // 域 Message.type?（string 宽型）→ 必填字面量联合（TranscriptMessage
          // 覆面，判别式收窄依赖）；调用方契约：transcript 消息恒为
          // user/assistant/attachment/system（类型适配登记）。
          type: message.type as TranscriptMessage['type'],
          // uuid 必填覆写（类型适配登记，types.ts 头注同源）：旧仓 Message
          // 基型 uuid 必填，域扩展型为可选 → 显式透传（调用方契约：
          // transcript 消息恒带 uuid；cast 为旧 `as UUID` 品牌收敛）。
          uuid: message.uuid as string,
          // SerializedMessage.timestamp 必填（域 Message.timestamp 可选扩展）→
          // 显式透传（调用方契约：transcript 消息恒带 timestamp，类型适配登记）。
          timestamp: message.timestamp as string,
          // Session-stamp fields MUST come after the spread. On --fork-session
          // and --resume, messages arrive as SerializedMessage (carries source
          // sessionId/cwd/etc. because removeExtraFields only strips parentUuid
          // and isSidechain). If sessionId isn't re-stamped, FRESH.jsonl ENDs up
          // with messages stamped sessionId=A but content-replacement entries
          // stamped sessionId=FRESH (from insertContentReplacement), and
          // loadFullLog's sessionId-keyed contentReplacements lookup misses →
          // replacement records lost → FROZEN misclassification.
          userType: getUserType(),
          entrypoint: getEntrypoint(),
          // S-E3 A12（§8.52）：活态 cwd 戳（审视 A-1 可选扩已落）——旧
          // getCwd() 活态语义恢复；project dir 键控点（load.ts
          // getProjectDir(getOriginalCwd())）不动（A-1 裁定：会话文件定位
          // 不受影响）。
          cwd: getSessionEnv().getCwd(),
          sessionId,
          version: getVersion(),
          gitBranch,
        }
        await this.appendEntry(transcriptMessage)
        if (isChainParticipant(message)) {
          parentUuid = message.uuid as UUID
        }
      }

      // Cache this turn's user prompt for reAppendSessionMetadata —
      // the --resume picker shows what the user was last doing.
      // Overwritten every turn by design.
      if (!isSidechain) {
        const text = getFirstMeaningfulUserMessageTextContent(messages)
        if (text) {
          const flat = text.replace(/\n/g, ' ').trim()
          this.currentSessionLastPrompt =
            flat.length > 200 ? flat.slice(0, 200).trim() + '…' : flat
        }
      }

      // 主会话每 METADATA_REWRITE_INTERVAL 条 chain participant 消息触发一次元数据
      // 重写，确保 title/last-prompt/tag 始终在 JSONL 尾部 64KB 窗口内。即使进程
      // crash 导致 cleanup handler 未执行，距最近一次重写点最多落后
      // METADATA_REWRITE_INTERVAL 条消息，远在尾部窗口内。
      if (!isSidechain) {
        this.messagesSinceMetadataRewrite++
        if (this.messagesSinceMetadataRewrite >= Project.METADATA_REWRITE_INTERVAL) {
          this.messagesSinceMetadataRewrite = 0
          this.reAppendSessionMetadata()
        }
      }
    })
  }

  /**
   * 旧 L1126 逐字（ContentReplacementEntry 写入 + agentId → sidechain 文件
   * 路由；agentId 缺省 = 主线程 /resume 面）。
   */
  async insertContentReplacement(
    replacements: ContentReplacementRecord[],
    agentId?: string,
  ) {
    return this.trackWrite(async () => {
      const entry: Entry = {
        type: 'content-replacement',
        sessionId: getSessionEnv().getSessionId() as UUID,
        agentId,
        replacements,
      }
      await this.appendEntry(entry)
    })
  }

  async appendEntry(
    entry: Entry,
    sessionId: string = getSessionEnv().getSessionId(),
  ) {
    if (this.shouldSkipPersistence()) {
      return
    }

    const currentSessionId = getSessionEnv().getSessionId()
    const isCurrentSession = sessionId === currentSessionId

    let sessionFile: string
    if (isCurrentSession) {
      // Buffer until materializeSessionFile runs (first user/assistant message).
      if (this.sessionFile === null) {
        this.pendingEntries.push(entry)
        return
      }
      sessionFile = this.sessionFile
    } else {
      const existing = await this.getExistingSessionFile(sessionId)
      if (!existing) {
        logForDebugging(
          `appendEntry: session file not found for other session ${sessionId}`,
          { level: 'error' },
        )
        return
      }
      sessionFile = existing
    }

    // Only load current session messages if needed
    if (entry.type === 'summary') {
      // Summaries can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'custom-title') {
      // Custom titles can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'ai-title') {
      // AI titles can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'last-prompt') {
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'task-summary') {
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'tag') {
      // Tags can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'agent-name') {
      // Agent names can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'agent-color') {
      // Agent colors can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'agent-setting') {
      // Agent settings can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'pr-link') {
      // PR links can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'mode') {
      // Mode entries can always be appended
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'worktree-state') {
      void this.enqueueWrite(sessionFile, entry)
    } else if (entry.type === 'content-replacement') {
      // Content replacement records can always be appended. Subagent records
      // go to the sidechain file (for AgentTool resume); main-thread
      // records go to the session file (for /resume).
      const targetFile = entry.agentId
        ? getAgentTranscriptPath(entry.agentId)
        : sessionFile
      void this.enqueueWrite(targetFile, entry)
    } else {
      // At this point, entry must be a TranscriptMessage (user/assistant/
      // attachment/system). All other entry types have been handled above.
      // 已裁 entry 分支（file-history-snapshot / attribution-snapshot /
      // speculation-accept / marble-origami-* / queue-operation）= 裁面 ①②③
      // + 头注登记面；磁盘旧 JSONL 的未知 type 由 load 面容错跳过，写面
      // Entry 并集已缩不再接受。
      const messageSet = await getSessionMessages(sessionId)
      const isAgentSidechain =
        entry.isSidechain && entry.agentId !== undefined
      const targetFile = isAgentSidechain
        ? getAgentTranscriptPath(entry.agentId!)
        : sessionFile

      // For message entries, check if UUID already exists in current session.
      // Skip dedup for agent sidechain LOCAL writes — they go to a separate
      // file, and fork-inherited parent messages share UUIDs with the main
      // session transcript. Deduping against the main session's set would
      // drop them, leaving the persisted sidechain transcript incomplete
      // (resume-of-fork loads a 10KB file instead of the full 85KB inherited
      // context).
      //
      // The sidechain bypass applies ONLY to the local file write — remote
      // persistence (session-ingress) 裁面 ⑤，本地写语义保留。
      const isNewUuid = !messageSet.has(entry.uuid)
      if (isAgentSidechain || isNewUuid) {
        // Enqueue write — appendToFile handles ENOENT by creating directories
        void this.enqueueWrite(targetFile, entry)

        if (!isAgentSidechain) {
          // messageSet is main-file-authoritative. Sidechain entries go to a
          // separate agent file — adding their UUIDs here causes recordTranscript
          // to skip them on the main thread (line ~1270), so the message is never
          // written to the main session file. The next main-thread message then
          // chains its parentUuid to a UUID that only exists in the agent file,
          // and --resume's buildConversationChain terminates at the dangling ref.
          messageSet.add(entry.uuid)
          // 旧仓此处 `if (isTranscriptMessage(entry)) await
          // this.persistToRemote(sessionId, entry)` = 裁面 ⑤（远程/teleport 波，
          // 前向接缝登记：远程持久化接线时在此补调用点）。
          // [§8.69 核销] 保裁确认：归属正确（远程/teleport 波，非 analytics 波），核销确认。
        }
      }
    }
  }

  /**
   * Loads the sessionFile variable.
   * Do not need to create session files until they are written to.
   */
  private ensureCurrentSessionFile(): string {
    if (this.sessionFile === null) {
      this.sessionFile = getTranscriptPath()
    }

    return this.sessionFile
  }

  /**
   * Returns the session file path if it exists, null otherwise.
   * Used for writing to sessions other than the current one.
   * Caches positive results so we only stat once per session.
   */
  private existingSessionFiles = new Map<string, string>()
  private async getExistingSessionFile(
    sessionId: string,
  ): Promise<string | null> {
    const cached = this.existingSessionFiles.get(sessionId)
    if (cached) return cached

    const targetFile = getTranscriptPathForSession(sessionId)
    try {
      await stat(targetFile)
      this.existingSessionFiles.set(sessionId, targetFile)
      return targetFile
    } catch (e) {
      if (isFsInaccessible(e)) return null
      throw e
    }
  }
}

/**
 * Append an entry to a session file. Creates the parent dir if missing.
 * Sync callers（exit cleanup, materialize）。
 *
 * 解耦登记：shared FsOperations 无 appendFileSync 同步面（仅 async
 * appendFile；mkdirSync 1-arg 无 mode 选项）→ 本同步写辅助直用 node:fs
 * （readFileTailSync 同径）。壳侧可测性接缝 = E-wave-end 若需 mock 同步
 * 写，经 SessionEnv 注入口（前向登记，非遗漏）。
 */
function appendEntryToFile(
  fullPath: string,
  entry: Record<string, unknown>,
): void {
  const line = jsonStringify(entry) + '\n'
  try {
    appendFileSync(fullPath, line, { mode: 0o600 })
  } catch {
    mkdirSync(dirname(fullPath), { mode: 0o700 })
    appendFileSync(fullPath, line, { mode: 0o600 })
  }
}

/**
 * Sync tail read for reAppendSessionMetadata's external-writer check.
 * fstat on the already-open fd (no extra path lookup); reads the same
 * LITE_READ_BUF_SIZE window that readLiteMetadata scans. Returns empty
 * string on any error so callers fall through to unconditional behavior.
 * （旧 L2574 逐字）
 */
function readFileTailSync(fullPath: string): string {
  let fd: number | undefined
  try {
    fd = openSync(fullPath, 'r')
    const st = fstatSync(fd)
    const tailOffset = Math.max(0, st.size - LITE_READ_BUF_SIZE)
    const buf = Buffer.allocUnsafe(
      Math.min(LITE_READ_BUF_SIZE, st.size - tailOffset),
    )
    const bytesRead = readSync(fd, buf, 0, buf.length, tailOffset)
    return buf.toString('utf8', 0, bytesRead)
  } catch {
    return ''
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // closeSync can throw; swallow to preserve return '' contract
      }
    }
  }
}

// ── 公共记录/缓存门面（供 record.ts 消费的单例访问）────────────────────────
export function projectInstance(): Project {
  return getProject()
}
