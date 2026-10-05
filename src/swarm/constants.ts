/**
 * Swarm 域常量（S-E2a 叶子层；§8.66.1.3 域骨架）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/constants.ts（33L）逐字迁移。
 * Delta ① de-Claude 机器标识改名（命名规范 v2.1：机器标识一律 atlas 短形）：
 *   SWARM_SESSION_NAME 'claude-swarm' → 'atlas-swarm'
 *   HIDDEN_SESSION_NAME 'claude-hidden' → 'atlas-hidden'
 *   getSwarmSocketName() 'claude-swarm-${pid}' → 'atlas-swarm-${pid}'
 *   （旧仓 env 面已 de-Claude 为 ATLAS_* 逐字保留；tmux 会话名是机器标识非品牌文案，
 *   随改名；同族 getTmuxInstallInstructions 的会话名文案随 S-E2c registry 迁移同改。）
 * Delta ② 品牌文案 Claude → AtlasHarness（注释面）。
 */
export const TEAM_LEAD_NAME = 'team-lead'
export const SWARM_SESSION_NAME = 'atlas-swarm'
export const SWARM_VIEW_WINDOW_NAME = 'swarm-view'
export const TMUX_COMMAND = 'tmux'
export const HIDDEN_SESSION_NAME = 'atlas-hidden'

/**
 * Gets the socket name for external swarm sessions (when user is not in tmux).
 * Uses a separate socket to isolate swarm operations from user's tmux sessions.
 * Includes PID to ensure multiple AtlasCode instances don't conflict.
 */
export function getSwarmSocketName(): string {
  return `atlas-swarm-${process.pid}`
}

/**
 * Environment variable to override the command used to spawn teammate instances.
 * If not set, defaults to process.execPath (the current AtlasCode binary).
 * This allows customization for different environments or testing.
 */
export const TEAMMATE_COMMAND_ENV_VAR = 'ATLAS_TEAMMATE_COMMAND'

/**
 * Environment variable set on spawned teammates to indicate their assigned color.
 * Used for colored output and pane identification.
 */
export const TEAMMATE_COLOR_ENV_VAR = 'ATLAS_AGENT_COLOR'

/**
 * Environment variable set on spawned teammates to require plan mode before implementation.
 * When set to 'true', teammates must enter plan mode and get approval before writing code.
 */
export const PLAN_MODE_REQUIRED_ENV_VAR = 'ATLAS_PLAN_MODE_REQUIRED'
