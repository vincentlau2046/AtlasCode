/**
 * engine 模块唯一公共出口（STR-1 门面规则）。
 *
 * E-1 窄 spine（§8.21）落 query + pipeline + state 纵切后 re-export。ports/
 * context/coordinator/tools 随各自纵切（E-1b/E-2/E-3…）落地后在此追加 re-export。
 */
export {
  queryOneRound,
  queryAgentLoop,
  DEFAULT_AGENT_LOOP_MAX_TURNS,
  ask,
  type AgentLoopDeps,
  type AgentRoundResult,
  type AgentLoopContextConfig,
  type AgentLoopArgs,
  type AgentLoopResult,
  type AskArgs,
} from './query'
export {
  executeToolUse,
  findTool,
  runToolBatch,
  partitionToolCalls,
  classifyToolError,
  validateInputBySchema,
  buildSchemaNotSentHint,
  type PipelineDeps,
  type PermissionGate,
  type ToolHooks,
  type ToolExecutionOutcome,
  type ToolBatch,
  type ToolBatchOutcome,
  type SchemaValidationResult,
} from './pipeline'
export { EngineState, type StateUpdater } from './state'
export {
  getAutoCompactThreshold,
  shouldAutoCompact,
  autoCompactIfNeeded,
  compactConversation,
  microcompactMessages,
  buildPostCompactMessages,
  estimateMessageTokens,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
  type AutoCompactOutcome,
  type CompactionResult,
  type CompactDeps,
  type MicrocompactDeps,
  type MicrocompactOutcome,
} from './context'
