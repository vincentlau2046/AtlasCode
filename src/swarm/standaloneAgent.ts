/**
 * Standalone agent utilities for sessions with custom names/colors
 *
 * These helpers provide access to standalone agent context (name and color)
 * for sessions that are NOT part of a swarm team. When a session is part
 * of a swarm, these functions return undefined to let swarm context take
 * precedence.
 *
 * 源 = 旧仓 a8af45b src/utils/standaloneAgent.ts（23L）适配迁移（S-E2a）。
 * Delta ① AppState → 注入窗口（seam ① 型，Port 1 sessionContextPort 先例）：
 *   旧 getStandaloneAgentName(appState) 读 appState.standaloneAgentContext；新仓无
 *   AppState 对象 → standalone agent 上下文经 setStandaloneAgentContext 窗口注入，
 *   缺省 null = 非 standalone agent（零行为）；组合根/standalone 入口接线 = 波终
 *   装配项（§8.66.1.6 残留守 ② 登记，未接线前消费点恒得 undefined）。
 * Delta ② getTeamName = engine 根门面（messaging 域 teammate.ts，§8.56 S-D2 已迁）。
 * 旧仓唯一消费点 useSwarmBanner（React 面）→ TUI 波；本函数随域门面导出供
 * TUI 波 / 组合根 prompt 面复用。
 */
import { getTeamName } from '../engine'

let _standaloneAgentContext: { name?: string } | null = null

/** 组合根 / standalone 入口注入（整换；null = 清除）。 */
export function setStandaloneAgentContext(
  context: { name?: string } | null,
): void {
  _standaloneAgentContext = context
}

/**
 * Returns the standalone agent name if set and not a swarm teammate.
 * Uses getTeamName() for consistency with isTeammate() swarm detection.
 */
export function getStandaloneAgentName(): string | undefined {
  // If in a team (swarm), don't return standalone name
  if (getTeamName()) {
    return undefined
  }
  return _standaloneAgentContext?.name
}
