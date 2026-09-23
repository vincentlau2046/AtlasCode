/**
 * engine/pipeline 门面（§8.21 E-1 窄 spine T-2，STR-1 门面规则）。
 *
 * 执行管线（原 orchestrator/tools/，改名避撞 tools 域）。E-1 窄 spine 落：
 * 单 tool_use 执行链（executeToolUse，4 接缝）+ 批次编排（runToolBatch 串行 + 分区）
 * + 错误分类小件（classifyToolError）。
 * 残留守：并发池 / streaming executor（E-1b）/ MCP 连接生命周期（连接层纵切，见 mcp.ts；
 * MCP 工具路由本身已按 E-2 闭环）/ 钩子注入（E-5）/ 权限规则树注入（E-4）——各接缝已留，
 * 随后续纵切在此追加 re-export。
 */
export {
  executeToolUse,
  findTool,
  type PipelineDeps,
  type PermissionGate,
  type ToolHooks,
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
