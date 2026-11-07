/**
 * shared/agentSwarmsEnabled — agent teams / swarms 总开关（0.1.93 W-D-A
 * 从 engine/messaging/agentSwarmsEnabled.ts 下移单源：modelprovider/params.ts
 * wire 投影需门判读而 engine→modelprovider 单向（反向 import 成环），故门
 * 面落 shared 底层，engine 侧 re-export 保持消费面零变）。
 *
 * 来源（a8af45b src/utils/agentSwarmsEnabled.ts；新仓 engine/messaging
 * 随迁本体的 growthbook killswitch 支裁史见 engine 侧文件头注 delta ①）。
 */
import { isEnvTruthy } from './env'

/**
 * Check if --agent-teams flag is provided via CLI.
 * Checks process.argv directly to avoid import cycles with bootstrap/state.
 */
function isAgentTeamsFlagSet(): boolean {
  return process.argv.includes('--agent-teams')
}

/**
 * Centralized runtime check for agent teams/teammate features.
 * Opt-in: ATLAS_EXPERIMENTAL_AGENT_TEAMS env var OR --agent-teams flag.
 */
export function isAgentSwarmsEnabled(): boolean {
  return (
    isEnvTruthy(process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS) ||
    isAgentTeamsFlagSet()
  )
}
