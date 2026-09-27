/**
 * autoMode 子域 — auto-mode 安全工具白名单（§8.65，旧仓 classifierDecision.ts 91L 语义）。
 *
 * 旧仓来源：SAFE_YOLO_ALLOWLISTED_TOOLS + isAutoModeAllowlistedTool。auto-mode 分类器
 * 用它跳过不必要的 API 调用（白名单内工具安全免分类）。不含 write/edit 工具——
 * 那些走 acceptEdits fast-path（CWD 内放行，CWD 外分类）。
 *
 * 裁剪 delta（复审勿当遗漏重提）：
 * ① 旧仓 import 各工具 prompt/constants 的 `*_TOOL_NAME` 常量 + feature-gated 条件
 *    require（ant-only 工具 DCE）→ 新仓 permissions 域 L3 自治不 import engine 域，
 *    以本地字符串字面量承载（值逐一验真 engine/tools/toolNames.ts 单一事实源，
 *    漂移防 = 工具本体波统一收编，同 permissions.ts BASH_TOOL_NAME 先例）。
 * ② ant-only / 新仓 0-hit 工具不入集（旧仓 feature 门控 / de-ANT）：
 *    - Workflow（'Workflow'）= ⑪ 登记零本体 stub（无活工具本体，materialize 时入集）。
 *    - TerminalCapture / OverflowTest / VerifyPlanExecution = ⑥⑤⑫ 登记零本体 /
 *      de-ANT 0-hit（新仓无本体）。
 *    - LSP（'LSP'）入集：旧仓白名单成员（只读搜索），新仓 LSP 域 D 波 seed（只读），值逐字。
 * ③ YOLO_CLASSIFIER_TOOL_NAME（'classify_result'）经 ./usage 单一事实源引用（内部分类器自报工具）。
 */
import { YOLO_CLASSIFIER_TOOL_NAME } from './usage'

/**
 * Tools that are safe and don't need any classifier checking.
 * Used by the auto mode classifier to skip unnecessary API calls.
 * Does NOT include write/edit tools — those are handled by the
 * acceptEdits fast path (allowed in CWD, classified outside CWD).
 */
const SAFE_YOLO_ALLOWLISTED_TOOLS = new Set([
  // Read-only file operations
  'Read',
  // Search / read-only
  'Grep',
  'Glob',
  'LSP',
  'ToolSearch',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool', // no exported constant (old repo: inline literal)
  // Task management (metadata only)
  'TodoWrite',
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'TaskStop',
  'TaskOutput',
  // Plan mode / UI
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  // Swarm coordination (internal mailbox/team state only — teammates have
  // their own permission checks, so no actual security bypass).
  'TeamCreate',
  // Agent cleanup
  'TeamDelete',
  'SendMessage',
  // Internal classifier tool
  YOLO_CLASSIFIER_TOOL_NAME,
])

export function isAutoModeAllowlistedTool(toolName: string): boolean {
  return SAFE_YOLO_ALLOWLISTED_TOOLS.has(toolName)
}
