/**
 * engine/tools/toolsearch 子门面（S-E2 §8.63 MCP+ToolSearch 族子波，STR-1
 * 显式名块纪律）。
 *
 * 覆盖：ToolSearchTool 本体（1 对象 + JSON schema 1 常量 + Input/Output
 * duck 型 2 + clearToolSearchDescriptionCache 测试接缝）+ 门控面 3 导出
 * （getToolSearchMode + ToolSearchMode 型 + isToolSearchEnabledOptimistic；
 * env 改名面 ATLAS_ENABLE_TOOL_SEARCH，engine 面裁登记见各模块头注）+
 * prompt 面（TOOL_SEARCH_PROMPT 常量 + isDeferredTool）。
 *
 * 纪律（tools/index.ts config/askUser 块先例）：逐名显式 re-export，无
 * `export *`；各文件头注 delta 登记不随门面重复（单一事实源 = 各模块
 * 头注）。
 *
 * 消费方：tools/ 门面 re-export 块（namespaced 导出面）+ 注册表 49 口径
 * 注册位（2nd 专属门控槽 = isEnabled = isToolSearchEnabledOptimistic，
 * §8.63.1 口径 26/49 → 29/49；本体经 ToolRegistryDeps.baseTools 消费方
 * 注入）。
 */
export {
  getToolSearchMode,
  isToolSearchEnabledOptimistic,
  type ToolSearchMode,
} from './toolSearchGate'
export {
  isDeferredTool,
  TOOL_SEARCH_PROMPT,
} from './toolSearchPrompt'
export {
  clearToolSearchDescriptionCache,
  ToolSearchTool,
  TOOL_SEARCH_TOOL_INPUT_SCHEMA,
  type ToolSearchInput,
  type ToolSearchOutput,
} from './toolSearchTool'
