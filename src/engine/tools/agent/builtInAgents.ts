/**
 * engine/tools/agent — 内建 agent 注册表（§8.25 E-2 T-5c，旧仓 builtInAgents.ts 裁剪）
 *
 * getBuiltInAgents() 裁剪版真核心：
 *   - ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS 门（SDK 空白起点 → 空注册表）
 *   - 兜底 GENERAL_PURPOSE_AGENT 注册
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧仓 getIsNonInteractiveSession() 门（disable 仅非交互会话生效）→ 残留守
 *     （新仓无交互会话状态面；本版 disable 门纯 env 驱动，交互会话亦生效）。
 *   - coordinator 分支（feature COORDINATOR_MODE + ATLAS_COORDINATOR_MODE →
 *     getCoordinatorAgents 懒加载，规避 tools↔coordinator 循环依赖）→ T-5d
 *     （coordinator worker 两源提示词落时补，本版登记残留守不接线）。
 *   - STATUSLINE_SETUP_AGENT / EXPLORE_AGENT / PLAN_AGENT / ATLAS_GUIDE_AGENT /
 *     VERIFICATION_AGENT 内建体 + areExplorePlanAgentsEnabled（feature/growthbook 门）
 *     + 非 SDK 入口判定 → 残留守（本版注册表仅 GENERAL_PURPOSE_AGENT；各内建体随
 *     后续纵切落）。
 */
import { isEnvTruthy } from '../../../shared'
import { GENERAL_PURPOSE_AGENT, type AgentDefinition } from './agentDefinition'

/**
 * 内建 agent 注册表（旧仓 getBuiltInAgents 裁剪）。
 *   - ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS 真 → 空注册表（SDK 空白起点）。
 *   - 其余内建体（statusline/explore/plan/guide/verification）+ coordinator 分支
 *     → 残留守（见头注），本版返回兜底 general-purpose。
 */
export function getBuiltInAgents(): AgentDefinition[] {
  if (isEnvTruthy(process.env.ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS)) {
    return []
  }
  // coordinator 分支（ATLAS_COORDINATOR_MODE → getCoordinatorAgents）→ T-5d 残留守。
  // STATUSLINE/EXPLORE/PLAN/GUIDE/VERIFICATION 内建体 → 残留守（见头注）。
  return [GENERAL_PURPOSE_AGENT]
}
