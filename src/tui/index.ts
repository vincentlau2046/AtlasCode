/**
 * tui 域门面（W2-2a-2 最小面，§8.74.11）——注册面单一出口：
 * 工具注册装配面（tools.ts 全 6 函数 + preset 面）+ 名集 re-export（constants/tools.ts，
 * 已切 engine toolNames 单源）+ REPL_ONLY_TOOLS。
 * 建门面动机：tests STR-1 门面收口（tests import src 域必须走域根 index.ts）——
 * 判别单测 tests/unit/tui-tools-registration-table.test.ts 经本面取件；壳侧
 * （atlascode/ui/main.tsx）仍直走 'src/tui/main.js' 薄壳 re-export（Slice D 先例，
 * 两出口并存不冲突）。扩面归 W3 活链路接线（emit 适配层 / orchestrator 改写面
 * 届时入门面），复审勿提前扩面。
 */
export {
  getAllBaseTools,
  getTools,
  getToolsForDefaultPreset,
  assembleToolPool,
  getMergedTools,
  filterToolsByDenyRules,
  TOOL_PRESETS,
  parseToolPreset,
  REPL_ONLY_TOOLS,
  type ToolPreset,
} from './tools.js'
export {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
  MAX_WORKER_SPAWN_DEPTH,
} from './constants/tools.js'
