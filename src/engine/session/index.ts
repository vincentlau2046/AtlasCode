/**
 * engine/session 门面（E-7 S-7d d1+d2，§8.49，STR-1 门面规则）。
 *
 * JSONL 持久层核心（写面 Project 类 + record 族 / 读面 load 族 /
 * scanner 分块读 / sessionMemory 阈值状态机 + Port 5 注入窗口）+
 * SessionEnv 注入窗口 + d2 搜索文本面（search）/ 会话恢复处理面
 * （restore）+ Port 1 真契约（ports/sessionContext）。
 *
 * 外部消费方（QueryEngine / E-wave-end compose / AgentTool 门）只许
 * `import { ... } from 'src/engine'`（STR-1）或域门面 `'../session'`，
 * 不许 reach 内部文件（project.ts / load.ts / record.ts 等）。
 *
 * H6 前向接缝登记（复审勿当遗漏重提）：各内部文件头注裁面
 * （project 6 裁面 / load 裁面族 / record save* 族 / firstPrompt
 * builtInCommandNames 空集 / env 组合根注真 bootstrap 值 /
 * SessionMemoryPort 壳实现 / d2 restore 裁面族（switchSession 二参 →
 * 单参 + onWorktreeRestore? 注入口 + coordinator/agent/attribution/
 * context-collapse/成本/录制面裁）/ search UI 消费面）——预声明接缝
 * 非遗漏。
 */
// 类型面
export type {
  UUID,
  AgentId,
  SessionId,
  Message,
  Transcript,
  SystemCompactBoundaryMessage,
  SerializedMessage,
  LogOption,
  SummaryMessage,
  CustomTitleMessage,
  AiTitleMessage,
  LastPromptMessage,
  TaskSummaryMessage,
  TagMessage,
  AgentNameMessage,
  AgentColorMessage,
  AgentSettingMessage,
  PRLinkMessage,
  ModeEntry,
  PersistedWorktreeSession,
  WorktreeStateEntry,
  ContentReplacementEntry,
  ContentReplacementRecord,
  TranscriptMessage,
  Entry,
  RenderableMessage,
} from './types'
export { sortLogs } from './types'

// SessionEnv 注入窗口
export type { SessionEnv } from './env'
export { setSessionEnv, getSessionEnv } from './env'

// 路径 + session-stamp 解耦面
export {
  getProjectDir,
  getProjectsDir,
  getTranscriptPath,
  getTranscriptPathForSession,
  MAX_TRANSCRIPT_READ_BYTES,
  setAgentTranscriptSubdir,
  clearAgentTranscriptSubdir,
  getAgentTranscriptPath,
  getUserType,
  getEntrypoint,
  getGitBranch,
  getVersion,
} from './paths'

// JSONL 域内小工具
export { parseJSONL, jsonParse, jsonStringify } from './json'

// 预压缩分块读（>5MB 面）
export { SKIP_PRECOMPACT_THRESHOLD, readTranscriptForLoad } from './scanner'

// 谓词族
export {
  isTranscriptMessage,
  isChainParticipant,
  isLegacyProgressEntry,
  isEphemeralToolProgress,
  isCompactBoundaryMessage,
  type LegacyProgressEntry,
} from './predicates'

// 写面核心（Project 单例 + 测试注入口）
export {
  LITE_READ_BUF_SIZE,
  unescapeJsonString,
  extractLastJsonStringField,
  projectInstance,
  resetProjectFlushStateForTesting,
  resetProjectForTesting,
  setSessionFileForTesting,
} from './project'

// record 族 + 元数据门面
export type { TeamInfo } from './record'
export {
  isLoggableMessage,
  cleanMessagesForLogging,
  recordTranscript,
  recordSidechainTranscript,
  recordContentReplacement,
  resetSessionFilePointer,
  adoptResumedSessionFile,
  flushSessionStorage,
  restoreSessionMetadata,
  clearSessionMetadata,
  cacheSessionTitle,
  saveMode,
  reAppendSessionMetadata,
} from './record'

// 首条有效用户消息提取
export {
  COMMAND_NAME_TAG,
  getFirstMeaningfulUserMessageTextContent,
  extractFirstPrompt,
} from './firstPrompt'

// 读面核心
export {
  removeExtraFields,
  buildConversationChain,
  loadTranscriptFromFile,
  loadTranscriptFile,
  getSessionMessages,
  clearSessionMessagesCache,
  doesMessageExistInSession,
} from './load'

// session memory 阈值状态机 + Port 5 注入窗口
export type { SessionMemoryConfig } from './sessionMemory'
export {
  DEFAULT_SESSION_MEMORY_CONFIG,
  getLastSummarizedMessageId,
  setLastSummarizedMessageId,
  markExtractionStarted,
  markExtractionCompleted,
  waitForSessionMemoryExtraction,
  setSessionMemoryPort,
  getSessionMemoryPort,
  getSessionMemoryContent,
  setSessionMemoryConfig,
  getSessionMemoryConfig,
  recordExtractionTokenCount,
  isSessionMemoryInitialized,
  markSessionMemoryInitialized,
  hasMetInitializationThreshold,
  hasMetUpdateThreshold,
  getToolCallsBetweenUpdates,
  resetSessionMemoryState,
} from './sessionMemory'
export type { SessionMemoryPort } from '../ports/sessionMemory'

// E-7 S-7d d2（§8.49）：transcript 搜索文本面（旧 utils/transcriptSearch.ts
// 202L 逐字随迁；INTERRUPT 常量域内化 + ContentBlock any→unknown 类型面
// delta 登记见 search.ts 头注）
export {
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  renderableSearchText,
  toolUseSearchText,
  toolResultSearchText,
} from './search'

// E-7 S-7d d2（§8.49）：会话恢复处理面（slim processResumedConversation；
// 裁面族 H6 登记见 restore.ts 头注）
export type { ResumeLoadResult, ProcessedResume } from './restore'
export { processResumedConversation } from './restore'

// E-7 S-7d d2（§8.49 item 3）：Port 1 真契约（快照 view 语义；零消费者
// 前向登记见 port 头注）
export type {
  SessionSnapshot,
  SessionContextPort,
} from '../ports/sessionContext'

// E-wave-end S-E2 A7（§8.52）：Port 1 注入窗口（镜像 Port 5 窗口先例
// sessionMemory.ts:123-132；壳实现 + compose 注入接缝兑现，见
// sessionContextPort.ts 头注）
export {
  setSessionContextPort,
  getSessionContextPort,
} from './sessionContextPort'
