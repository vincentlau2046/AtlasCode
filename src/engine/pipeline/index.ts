/**
 * engine/pipeline 门面（§8.21 E-1 窄 spine T-2，STR-1 门面规则）。
 *
 * 执行管线（原 orchestrator/tools/，改名避撞 tools 域）。E-1 窄 spine 落：
 * 单 tool_use 执行链（executeToolUse，4 接缝）+ 批次编排（runToolBatch 串行 + 分区）
 * + 错误分类小件（classifyToolError）。
 * 钩子消费支已落 E-5 S-5a（mergeHookPermission / PreToolUseHookOutcome 等 re-export，
 * 见导出块；preventContinuation 短路支 = §8.42 MAJOR-1 修复）；权限规则树已落 E-4
 * （filterToolsByDenyRules / getTools，engine/permissions）。
 * 残留守：并发池 / streaming executor（E-1b-full）/ MCP 连接生命周期（连接层纵切，
 * 见 mcp.ts；MCP 工具路由本身已按 E-2 闭环）——随后续纵切在此追加 re-export。
 */
export {
  executeToolUse,
  findTool,
  mergeHookPermission,
  type PipelineDeps,
  type PermissionGate,
  type PermissionCallContext,
  type ToolHooks,
  type PreToolUseHookOutcome,
  type PostToolUseHookOutcome,
  type HookPermissionBehavior,
  type GateVerdict,
  type ToolExecutionOutcome,
} from './toolExecution'
export {
  runToolBatch,
  partitionToolCalls,
  type ToolBatch,
  type ToolBatchOutcome,
} from './toolOrchestration'
export { classifyToolError } from './errorClassification'
export {
  validateInputBySchema,
  buildSchemaNotSentHint,
  type SchemaValidationResult,
} from './schemaValidation'
