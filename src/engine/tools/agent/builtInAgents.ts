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
 *   - coordinator 分支（T-5d 已接线）：isCoordinatorMode() 真 → getCoordinatorAgents()
 *     （仅内建 worker，不含 general-purpose，旧仓语义逐字）。直接 import 无循环依赖：
 *     workerAgent 值依赖仅 agent/constants + tools/toolNames（均无回边到本文件）。
 *   - STATUSLINE_SETUP_AGENT / EXPLORE_AGENT / PLAN_AGENT / ATLAS_GUIDE_AGENT /
 *     VERIFICATION_AGENT 内建体 + areExplorePlanAgentsEnabled（feature/growthbook 门）
 *     + 非 SDK 入口判定 → 残留守（本版注册表 = general-purpose 或 coordinator worker；
 *     各内建体随后续纵切落）。
 */
import { isEnvTruthy } from '../../../shared'
import { isCoordinatorMode } from '../../coordinator/coordinatorMode'
import { getCoordinatorAgents } from '../../coordinator/workerAgent'
import { GENERAL_PURPOSE_AGENT, type AgentDefinition } from './agentDefinition'

/**
 * 内建 agent 注册表（旧仓 getBuiltInAgents 裁剪）。
 *   - ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS 真 → 空注册表（SDK 空白起点）。
 *   - coordinator 模式（isCoordinatorMode）→ 仅内建 worker（getCoordinatorAgents）。
 *   - 其余内建体（statusline/explore/plan/guide/verification）→ 残留守（见头注），
 *     默认返回兜底 general-purpose。
 */
export function getBuiltInAgents(): AgentDefinition[] {
  if (isEnvTruthy(process.env.ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS)) {
    return []
  }
  if (isCoordinatorMode()) {
    return getCoordinatorAgents()
  }
  // STATUSLINE/EXPLORE/PLAN/GUIDE/VERIFICATION 内建体 → 残留守（见头注）。
  return [GENERAL_PURPOSE_AGENT]
}
