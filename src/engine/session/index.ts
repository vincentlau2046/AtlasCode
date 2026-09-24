/**
 * engine/session 门面（E-7 S-7d d1，§8.49，STR-1 门面规则）。
 *
 * JSONL 持久层核心（写面 Project 类 + record 族 / 读面 load 族 /
 * scanner 分块读 / sessionMemory 阈值状态机 + Port 5 注入窗口）+
 * SessionEnv 注入窗口。
 *
 * 外部消费方（QueryEngine / E-wave-end compose / AgentTool 门）只许
 * `import { ... } from 'src/engine'`（STR-1）或域门面 `'../session'`，
 * 不许 reach 内部文件（project.ts / load.ts / record.ts 等）。
 *
 * H6 前向接缝登记（复审勿当遗漏重提）：各内部文件头注裁面
 * （project 6 裁面 / load 裁面族 / record save* 族 / firstPrompt
 * builtInCommandNames 空集 / env 组合根注真 bootstrap 值 /
 * SessionMemoryPort 壳实现）——预声明接缝非遗漏。
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
