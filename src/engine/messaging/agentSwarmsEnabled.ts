/**
 * messaging 域 — agent teams / swarms 总开关（§8.56 S-D2 依赖闭包层，旧仓
 * utils/agentSwarmsEnabled.ts 44L 随迁；TaskUpdate 3 站点消费面）。
 *
 * 旧仓来源（a8af45b）：src/utils/agentSwarmsEnabled.ts（isAgentTeamsFlagSet
 * + isAgentSwarmsEnabled；import 重指：isEnvTruthy → shared 门面单一事实源）。
 *
 * delta ①（§8.56.3 裁面裁定 growthbook 2 站点之一，复审勿当遗漏重提）：
 *   旧仓 growthbook killswitch 支 `getFeatureValue_CACHED_MAY_BE_STALE(
 *   'atlas_amber_flint', true)` → 裁（growthbook 面归 analytics 波归位；
 *   默认值 true = 无远端配置态恒放行 → 裁后恒放行与旧缺省态行为等价，
 *   仅失「远端拉闸」能力，登记为前向接缝）。
 */
import { isEnvTruthy } from '../../shared'

/**
 * Check if --agent-teams flag is provided via CLI.
 * Checks process.argv directly to avoid import cycles with bootstrap/state.
 * Note: The flag is only shown in help for ant users, but if external users
 * pass it anyway, it will work (subject to the killswitch).
 */
function isAgentTeamsFlagSet(): boolean {
  return process.argv.includes('--agent-teams')
}

/**
 * Centralized runtime check for agent teams/teammate features.
 * This is the single gate that should be checked everywhere teammates
 * are referenced (prompts, code, tools isEnabled, UI, etc.).
 *
 * Opt-in: ATLAS_EXPERIMENTAL_AGENT_TEAMS env var OR --agent-teams flag
 * （growthbook killswitch 支裁，见头注 delta ①）。
 */
export function isAgentSwarmsEnabled(): boolean {
  return (
    isEnvTruthy(process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS) ||
    isAgentTeamsFlagSet()
  )
}
