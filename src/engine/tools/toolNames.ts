/**
 * engine/tools — 工具名字符串常量单一事实源（§8.25 E-2 T-5d seed + T-5e 全量常量集，逐一验真旧仓值）
 *
 * 旧仓 tools/<name>/constants.ts + constants/tools.ts 各 `export const X_TOOL_NAME = '<name>'`
 * 与工具名集收敛于此（单一事实源）。T-5d 落 coordinator/agent 面子集（ASYNC + INTERNAL）；
 * T-5e 补全量：4 工具名集（ALL_AGENT_DISALLOWED / CUSTOM / IN_PROCESS_TEAMMATE /
 * COORDINATOR_MODE_ALLOWED）+ 注册表机制消费的单工具名。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 4 集为**静态集**（feature-gated 成员不入集）：旧仓 ALL_AGENT_DISALLOWED 的
 *     feature('WORKFLOW_SCRIPTS') 条件项（Workflow）+ IN_PROCESS_TEAMMATE 的
 *     feature('AGENT_TRIGGERS') 条件项（CronCreate/CronDelete/CronList）→ 残留守
 *     （新仓无 bun:bundle feature()，见 bun-bundle-feature-untestable；Workflow/cron 工具
 *     本体亦未落，门控随对应工具纵切时定 env 方式并扩集）。
 *   - 工具本体 47 个 → 残留守（T-5e 落注册表机制 getAllBaseTools(deps)；本体随后续纵切
 *     逐个落，经 deps 注入，注册表机制不变）。
 *   - 逐字值验真（旧仓 grep）：SYNTHETIC_OUTPUT='StructuredOutput'（非 'SyntheticOutput'）、
 *     SKILL='Skill'、AGENT='Agent'（agent/constants.ts 已有，本模块不重复）、
 *     EXIT_PLAN_MODE_V2='ExitPlanMode'（V2 常量名，值同 V1 语义位）、REPL='REPL'（大写）。
 */
// AGENT_TOOL_NAME 定义在 agent/constants.ts（单一事实源，本模块不重复定义；
// agent/constants 零 import 无回边，tools/toolNames → agent/constants 无循环）。
import { AGENT_TOOL_NAME } from './agent/constants'

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
// ── T-5e 补全（注册表机制 + 工具名集消费，值逐一验真旧仓）──
export const TASK_OUTPUT_TOOL_NAME = 'TaskOutput'
export const ENTER_PLAN_MODE_TOOL_NAME = 'EnterPlanMode'
export const EXIT_PLAN_MODE_V2_TOOL_NAME = 'ExitPlanMode'
export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'
export const TASK_CREATE_TOOL_NAME = 'TaskCreate'
export const TASK_GET_TOOL_NAME = 'TaskGet'
export const TASK_LIST_TOOL_NAME = 'TaskList'
export const TASK_UPDATE_TOOL_NAME = 'TaskUpdate'
export const CRON_CREATE_TOOL_NAME = 'CronCreate'
export const CRON_DELETE_TOOL_NAME = 'CronDelete'
export const CRON_LIST_TOOL_NAME = 'CronList'
export const CONFIG_TOOL_NAME = 'Config'
export const WORKFLOW_TOOL_NAME = 'Workflow'
export const REPL_TOOL_NAME = 'REPL'

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

/**
 * 对所有子 agent 禁用的工具（旧仓 constants/tools.ts ALL_AGENT_DISALLOWED_TOOLS 裁剪：
 * feature('WORKFLOW_SCRIPTS') 条件项 Workflow 不入静态集，见头注残留守）。
 * 消费面：agentToolUtils.filterToolsForAgent（T-5e 起自本模块单一事实源，T-5b 本地裁剪集已撤）。
 */
export const ALL_AGENT_DISALLOWED_TOOLS = new Set<string>([
  TASK_OUTPUT_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  // de-ANT：旧仓 ant「允许嵌套 agent」carve-out 已删；Agent 工具对子 agent 禁用（外部语义）。
  AGENT_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
])

/** 自定义（非内建）agent 额外禁用集（旧仓 CUSTOM = ALL spread 同源逐字）。 */
export const CUSTOM_AGENT_DISALLOWED_TOOLS = new Set<string>(ALL_AGENT_DISALLOWED_TOOLS)

/**
 * 仅进程内 teammate 允许的工具（旧仓 IN_PROCESS_TEAMMATE_ALLOWED_TOOLS 裁剪：
 * feature('AGENT_TRIGGERS') 条件项 crons 不入静态集，见头注残留守）。
 */
export const IN_PROCESS_TEAMMATE_ALLOWED_TOOLS = new Set<string>([
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
])

/**
 * coordinator 模式允许的工具（旧仓 COORDINATOR_MODE_ALLOWED_TOOLS 逐字：
 * 仅输出 + agent 管理面）。
 */
export const COORDINATOR_MODE_ALLOWED_TOOLS = new Set<string>([
  AGENT_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])
