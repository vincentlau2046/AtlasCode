// biome-ignore-all assist/source/organizeImports: dev-only import markers must not be reordered
/**
 * tui/constants/tools — 工具名集单一事实源切 engine（W2-2a-2，§8.74.8/§8.74.11）
 *
 * 旧形态：本模块从 25+ tui 工具目录常量文件各 import 一个 *_TOOL_NAME 再组装
 * 5 名集（双源值手工对账，engine tools/toolNames.ts 亦声明同一套值 = 漂移面）。
 * 新形态：5 名集 + MAX_WORKER_SPAWN_DEPTH 全部 re-export engine 单一事实源
 * （src/engine → tools/toolNames.ts，值逐字验真旧仓）；25+ tui 目录常量 import
 * 随工具本体在 2b 删净。8 个消费方（tools.ts / toolPool / coordinatorMode /
 * workerAgent / execAgentHook / AgentTool / agentToolUtils / 本模块）import 路径
 * 不变（本模块 re-export 面 = 旧导出面逐名一致，零行为）。
 *
 * H6 前向接缝登记（复审勿当遗漏重提）：
 *  ① IN_PROCESS_TEAMMATE_ALLOWED_TOOLS：旧 tui 版 = 5 静态名 + feature('AGENT_TRIGGERS')
 *    cron 三件套门控支（门开 +3）；engine 静态集 = 5 名（cron 条件成员不入集，见
 *    engine toolNames.ts 头注残留守）。缺省态（feature 全 off）双侧值逐字一致 =
 *    零行为；feature-on 态差 3 名 = H6 策展登记，owner = W3 活链路接线 / E-wave-end
 *    （engine 集扩门控变体或 tui 侧保留变体，届时裁定）。
 *  ② MAX_WORKER_SPAWN_DEPTH：engine 侧同值常量（coordinator 面）已入 engine 门面，
 *    本处 re-export 单源化（值 = 2，双侧逐字一致）。
 */
export {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
  MAX_WORKER_SPAWN_DEPTH,
} from 'src/engine'
