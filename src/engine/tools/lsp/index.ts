/**
 * engine/tools/lsp — LSPTool 子域门面（§8.67 D 波 S-E2c；STR-1 显式
 * 命名 re-export，零 `export *`；49 本体 ⑬ 槽 = LSP 本体落面）。
 *
 * 消费方：`tools/` 门面 re-export（lsp 子域块）+ `engine/` root 门面
 * 按消费面收窄（LSPTool + LSP_TOOL_NAME 由 toolNames 块出）+ 组合根
 * baseTools 注入位（S-E2d 回填）。域依赖面：LSP 域 `src/lsp/`
 * 门面（manager 单例 4 函数族 + wire 型）+ shared/permissions/
 * bootstrap 三叶 + ../files 叶子子域（getDisplayPath，跨子域 import
 * house 先例）。
 */
export {
  LSPTool,
  LSP_TOOL_INPUT_SCHEMA,
  type LSPToolOutput,
} from './lspTool'
export {
  lspToolInputSchema,
  type LSPToolInput,
  isValidLSPOperation,
} from './lspSchemas'
export { LSP_DESCRIPTION } from './lspPrompt'
export {
  formatDocumentSymbolResult,
  formatFindReferencesResult,
  formatGoToDefinitionResult,
  formatHoverResult,
  formatIncomingCallsResult,
  formatOutgoingCallsResult,
  formatPrepareCallHierarchyResult,
  formatWorkspaceSymbolResult,
} from './lspFormatters'
export { getSymbolAtPosition } from './lspSymbolContext'
