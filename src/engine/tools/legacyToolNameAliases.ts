/**
 * LEGACY 工具名 alias 表（E-4 S-4a，§8.31/§8.32）——legacy → 正规名映射单一事实源
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissionRuleParser.ts
 * LEGACY_TOOL_NAME_ALIASES（4 项，逐字）。
 *
 * 双落位裁定（§8.32）：正规名 = 工具名表面，单一事实源 toolNames /
 * agent/constants（本表不持字面量，仅映射引用）；legacy 名数据落 engine 侧
 * （toolNames 同目录），permissions 域纯字符串解析函数组经注入窗口
 * （setLegacyToolNameAliases，settingsPaths S-3c 先例）消费。
 *
 * 模块加载注册（ascendMarketplace 模块加载注册先例）：本文件经 tools 门面
 * （engine/tools/index.ts）re-export → 凡 import engine 门面的入口触发注册
 * （side-effect import）；仅用 permissions 域的入口（未注入）= identity 降级，
 * 非崩溃（区别于 bootstrap-env fail-fast 窗口）。
 * 漂移防（同步钉单测 engine-tools-legacy-aliases）：正规名单一事实源在
 * toolNames，工具改名扩本表时须与 toolNames 常量同步，勿引入字面量。
 */
import { setLegacyToolNameAliases } from '../../permissions'
import { AGENT_TOOL_NAME } from './agent/constants'
import { TASK_OUTPUT_TOOL_NAME, TASK_STOP_TOOL_NAME } from './toolNames'

/**
 * 旧工具名 → 现正规名（旧仓逐字 4 项）。
 * 工具改名时在此加 old → new，使权限规则、hooks 与持久化 wire 名
 * 解析到正规名。
 */
export const LEGACY_TOOL_NAME_ALIASES: Record<string, string> = {
  Task: AGENT_TOOL_NAME,
  KillShell: TASK_STOP_TOOL_NAME,
  AgentOutputTool: TASK_OUTPUT_TOOL_NAME,
  BashOutputTool: TASK_OUTPUT_TOOL_NAME,
}

// 模块加载注册（门面 re-export 触发 side-effect import）：permissions 域
// 解析函数组的 alias 表以此为准（H6 消费点实挂，非预声明死接缝）。
setLegacyToolNameAliases(LEGACY_TOOL_NAME_ALIASES)
