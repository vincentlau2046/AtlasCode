/**
 * engine/tools — 工具名字符串常量单一事实源（§8.25 E-2 T-5d seed，逐一验真旧仓值）
 *
 * 旧仓 tools/<name>/constants.ts 各 `export const X_TOOL_NAME = '<name>'` 收敛于此。
 * T-5d 只需 coordinator/agent 面消费的子集：ASYNC_AGENT_ALLOWED_TOOLS（worker 工具面）
 * + INTERNAL_WORKER_TOOLS（worker 面从 user-context 剔除的内部工具）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 全量工具面常量集归 T-5e 注册表机制（getAllBaseTools 裁剪 + 常量）：
 *     ALL_AGENT_DISALLOWED_TOOLS / CUSTOM_AGENT_DISALLOWED_TOOLS /
 *     IN_PROCESS_TEAMMATE_ALLOWED_TOOLS（feature-gated crons）/
 *     COORDINATOR_MODE_ALLOWED_TOOLS + 其余单工具名（NOTEBOOK/PLAN/EXIT_PLAN/
 *     TASK_OUTPUT/ASK_USER_QUESTION 等）。T-5e 在此模块上扩，保持单一事实源。
 *   - feature('WORKFLOW_SCRIPTS') / feature('AGENT_TRIGGERS') 门控项（Workflow / crons）
 *     → 残留守（新仓无 bun:bundle feature()，见 bun-bundle-feature-untestable；T-5e 定门控方式）。
 *   - 逐字值验真（旧仓 grep）：SYNTHETIC_OUTPUT='StructuredOutput'（非 'SyntheticOutput'）、
 *     SKILL='Skill'、AGENT='Agent'（agent/constants.ts 已有，本模块不重复）。
 */

export const FILE_READ_TOOL_NAME = 'Read'
export const WEB_SEARCH_TOOL_NAME = 'WebSearch'
export const TODO_WRITE_TOOL_NAME = 'TodoWrite'
export const GREP_TOOL_NAME = 'Grep'
export const WEB_FETCH_TOOL_NAME = 'WebFetch'
export const GLOB_TOOL_NAME = 'Glob'
export const BASH_TOOL_NAME = 'Bash'
export const POWERSHELL_TOOL_NAME = 'PowerShell'
export const FILE_EDIT_TOOL_NAME = 'Edit'
export const FILE_WRITE_TOOL_NAME = 'Write'
export const NOTEBOOK_EDIT_TOOL_NAME = 'NotebookEdit'
export const SKILL_TOOL_NAME = 'Skill'
export const SYNTHETIC_OUTPUT_TOOL_NAME = 'StructuredOutput'
export const TOOL_SEARCH_TOOL_NAME = 'ToolSearch'
export const ENTER_WORKTREE_TOOL_NAME = 'EnterWorktree'
export const EXIT_WORKTREE_TOOL_NAME = 'ExitWorktree'
export const TEAM_CREATE_TOOL_NAME = 'TeamCreate'
export const TEAM_DELETE_TOOL_NAME = 'TeamDelete'
export const SEND_MESSAGE_TOOL_NAME = 'SendMessage'
export const TASK_STOP_TOOL_NAME = 'TaskStop'

/** Shell 工具名（旧仓 SHELL_TOOL_NAMES 逐字）。 */
export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME]

/**
 * 异步 agent 可用工具（旧仓 constants/tools.ts ASYNC_AGENT_ALLOWED_TOOLS 逐字）。
 * 单一事实源：worker 工具面 + getCoordinatorUserContext 的 user-context 派生。
 * 注：Agent tool 不在此集（depth-gated ADDED，见 workerAgent.ts D2 注）。
 */
export const ASYNC_AGENT_ALLOWED_TOOLS = new Set<string>([
  FILE_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  GLOB_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
  SKILL_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,
  EXIT_WORKTREE_TOOL_NAME,
])

/**
 * 仅进程内 teammate 可见、须从 worker user-context 剔除的内部工具
 * （旧仓 coordinator/coordinatorMode.ts INTERNAL_WORKER_TOOLS 逐字）。
 */
export const INTERNAL_WORKER_TOOLS = new Set<string>([
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])
