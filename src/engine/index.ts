/**
 * engine 模块唯一公共出口（STR-1 门面规则）。
 *
 * E-1 窄 spine（§8.21）落 query + pipeline + state 纵切后 re-export。ports/
 * context/coordinator/tools 随各自纵切（E-1b/E-2/E-3…）落地后在此追加 re-export。
 */
export { queryOneRound, ask, type AgentLoopDeps, type AgentRoundResult, type AskArgs } from './query'
export {
  executeToolUse,
  findTool,
  runToolBatch,
  partitionToolCalls,
  classifyToolError,
  type PipelineDeps,
  type PermissionGate,
  type ToolHooks,
  type ToolExecutionOutcome,
  type ToolBatch,
  type ToolBatchOutcome,
} from './pipeline'
export { EngineState, type StateUpdater } from './state'
