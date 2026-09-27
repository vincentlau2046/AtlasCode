/**
 * 会话恢复处理面（E-7 S-7d d2，§8.49）：slim processResumedConversation
 * （旧仓 utils/sessionRestore.ts 551L → 本文件 engine 面子集；壳层消费方各
 * 自装配 initial state / agent 恢复 / 成本 / 记录面）。
 *
 * 随迁面（逐字/结构保留）：
 *   - 非 fork switchSession 所有权 + resetSessionFilePointer +
 *     adoptResumedSessionFile（record/env 域 d1 面）
 *   - fork 支 contentReplacements seed（recordContentReplacement；
 *     FROZEN 误分类防注释逐字保留——P-S5 探针锚点）
 *   - restoreSessionMetadata（fork 剥 worktreeSession，逐字）
 *   - saveMode（旧 `if (feature('COORDINATOR_MODE'))` 门剔除——2026-09-24
 *     审视 M-3 订正：旧仓自 73631df 起 COORDINATOR_MODE 在 ON_BY_DEFAULT 集
 *     （native-ts/bunBundle.ts），生产门恒开（仅 FEATURE_COORDINATOR_MODE
 *     kill-switch 可关），**非死代码**；测试面 feature() 恒 false（bun:bundle
 *     不可测）。新仓保留无条件调用，决策源改 coordinator 域
 *     isCoordinatorMode()（env 读，无状态：同 ATLAS_COORDINATOR_MODE 门控 +
 *     FEATURE_COORDINATOR_MODE kill-switch，语义与旧生产路径等价；
 *     session→coordinator 单向依赖，coordinator 不 import session，无环））
 *   - agentColor 'default' → undefined 归一（逐字逻辑；旧 AgentColorName
 *     （agentColorManager，shell 域）→ string，类型面 delta 登记）
 *
 * 裁面 / 解耦登记（H6 前向接缝——预声明接缝非遗漏，复审勿当遗漏重提）：
 *   - switchSession 二参 → 单参：旧 bootstrap switchSession(sid,
 *     transcriptPath ? dirname(transcriptPath) : null)（第二参 = project dir
 *     atom，d1 已裁 SessionEnv project dir atom 对）→ 本文件经新
 *     SessionEnv.switchSession(sid) 单参调用；跨项目 resume 的 project dir
 *     推导 = E-wave-end 组合根（worktree/paths 波）前向接缝。
 *   - renameRecordingForSession（asciicast 录制，shell 域）/
 *     restoreCostStateForSession（cost-tracker，shell 域）：裁，shell 波
 *     自持。
 *   - coordinator modeApi（matchSessionMode modeWarning 系统消息推）/
 *     restoreAgentFromSession + refreshAgentDefinitionsForModeSwitch（agent 波）/
 *     computeRestoredAttributionState（attribution，旧 ant-only feature）/
 *     updateSessionName（concurrentSessions——C 桶 ③ S-E2b（§8.66.1.5）
 *     已落 swarm 域 src/swarm/concurrentSessions.ts 204L〔门裁 R4 恒生效〕，
 *     本恢复点消费面残留守，drain-gate/组合根浮现重裁，核销 ⑤）/ AppState
 *     initialState 计算：全裁——ProcessedResume 收敛 engine 面（messages /
 *     contentReplacements / agentName / agentColor），壳消费方各装配。
 *   - context-collapse restoreFromEntries（旧 feature('CONTEXT_COLLAPSE')，
 *     shell 服务波）：裁。
 *   - restoreWorktreeForResume / exitRestoredWorktree（worktree 壳域 +
 *     clearMemoryFileCaches / clearSystemPromptSections / getPlansDirectory
 *     缓存失效族）：裁 → opts.onWorktreeRestore? 前向注入口（壳 worktree 波
 *     实现并注入；engine 域保留调用时点 = 非 fork、restoreSessionMetadata
 *     之后、adoptResumedSessionFile 之前）。
 *   - 旧文件级函数 `restoreSessionStateFromLog`（旧 sessionRestore.ts:99，
 *     REPL/SDK resume 入口）/ `extractTodosFromTranscript`（:77，todos 水合）：
 *     不随迁——shell/CLI 波职责（REPL /resume + todos 水合），指名登记防
 *     逐文件对照旧仓的复审者误判为遗漏（审视 N-1）。
 */
import { isCoordinatorMode } from '../coordinator'
import { getSessionEnv } from './env'
import {
  adoptResumedSessionFile,
  recordContentReplacement,
  resetSessionFilePointer,
  restoreSessionMetadata,
  saveMode,
} from './record'
import type {
  ContentReplacementRecord,
  Message,
  PersistedWorktreeSession,
  SessionId,
} from './types'

/**
 * The loaded conversation data（旧 loadConversationForResume 返回型的
 * engine 面子集——仅 restore.ts 消费 + restoreSessionMetadata 字段面）。
 */
export type ResumeLoadResult = {
  messages: Message[]
  contentReplacements?: ContentReplacementRecord[]
  sessionId: SessionId | undefined
  agentName?: string
  agentColor?: string
  // restoreSessionMetadata 字段面（逐字旧型可选面）
  customTitle?: string
  tag?: string
  agentSetting?: string
  mode?: 'coordinator' | 'normal'
  worktreeSession?: PersistedWorktreeSession | null
  prNumber?: number
  prUrl?: string
  prRepository?: string
}

/**
 * Result of processing a resumed/continued conversation（engine 面收敛；
 * 旧 fileHistorySnapshots / restoredAgentDef / initialState 字段裁面见文件头）。
 */
export type ProcessedResume = {
  messages: Message[]
  contentReplacements?: ContentReplacementRecord[]
  agentName: string | undefined
  /** 旧 AgentColorName（agentColorManager，shell 域）→ string（类型面 delta，见文件头）。 */
  agentColor: string | undefined
}

/**
 * Process a loaded conversation for resume/continue.
 *
 * Handles session ID setup, content-replacement seeding (fork), metadata
 * restoration, mode persistence, and worktree-restore hook ordering. Called
 * by both --continue and --resume paths（壳层调用点：main.tsx / REPL
 * /resume 波，E-wave-end 组合根接线）。
 */
export async function processResumedConversation(
  result: ResumeLoadResult,
  opts: {
    forkSession: boolean
    sessionIdOverride?: string
    /**
     * 前向注入口（裁面登记见文件头）：替代旧 restoreWorktreeForResume
     * （worktree 壳域）。壳 worktree 波实现（process.chdir 存在性检查 +
     * 缓存失效族）并经组合根注入。
     */
    onWorktreeRestore?: (
      worktreeSession: PersistedWorktreeSession | null | undefined,
    ) => void
  },
): Promise<ProcessedResume> {
  // Reuse the resumed session's ID unless --fork-session is specified
  if (!opts.forkSession) {
    const sid = opts.sessionIdOverride ?? result.sessionId
    if (sid) {
      // When resuming from a different project directory (git worktrees,
      // cross-project), the old second arg was the transcript file's dirname
      // (project dir). Both the SessionEnv project dir atom and the
      // transcriptPath param were cut in d1 — the new SessionEnv takes a
      // single arg（审视 N-2：旧 transcriptPath 参数已随 d1 裁面删除，
      // 见文件头登记）.
      getSessionEnv().switchSession(sid)
      await resetSessionFilePointer()
    }
  } else if (result.contentReplacements?.length) {
    // --fork-session keeps the fresh startup session ID. useLogMessages will
    // copy source messages into the new JSONL via recordTranscript, but
    // content-replacement entries are a separate entry type only written by
    // recordContentReplacement (which query.ts calls for newlyReplaced, never
    // the pre-loaded records). Without this seed, `claude -r {newSessionId}`
    // finds source tool_use_ids in messages but no matching replacement records
    // → they're classified as FROZEN → full content sent (cache miss, permanent
    // overage). insertContentReplacement stamps sessionId = getSessionId() =
    // the fresh ID, so loadTranscriptFile's keyed lookup will match.
    await recordContentReplacement(result.contentReplacements)
  }

  // Restore session metadata so /status shows the saved name and metadata
  // is re-appended on session exit. Fork doesn't take ownership of the
  // original session's worktree — a "Remove" on the fork's exit dialog
  // would delete a worktree the original session still references — so
  // strip worktreeSession from the fork path so the cache stays unset.
  restoreSessionMetadata(
    opts.forkSession ? { ...result, worktreeSession: undefined } : result,
  )

  if (!opts.forkSession) {
    // Cd back into the worktree the session was in when it last exited.
    // Done after restoreSessionMetadata (which caches the worktree state
    // from the transcript) so if the directory is gone we can override
    // the cache before adoptResumedSessionFile writes it.
    //（旧 restoreWorktreeForResume 裁 → 前向注入口，见文件头登记）
    opts.onWorktreeRestore?.(result.worktreeSession)

    // Point sessionFile at the resumed transcript and re-append metadata
    // now. resetSessionFilePointer above nulled it (so the old fresh-session
    // path doesn't leak), but that blocks reAppendSessionMetadata — which
    // bails on null — from running in the exit cleanup handler. For fork,
    // useLogMessages populates a *new* file via recordTranscript on REPL
    // mount; the normal lazy-materialize path is correct there.
    adoptResumedSessionFile()
  }

  // Persist the current mode so future resumes know what mode this session
  // was in（旧 feature('COORDINATOR_MODE') 门剔除，见文件头登记）
  saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')

  return {
    messages: result.messages,
    contentReplacements: result.contentReplacements,
    agentName: result.agentName,
    agentColor:
      result.agentColor === 'default' ? undefined : result.agentColor,
  }
}
