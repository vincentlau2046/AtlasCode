/**
 * swarm 域门面（STR-1：外部消费者只 import 域根 index；§8.66.1.2 R1 新顶层域）。
 *
 * 域 = 旧仓 a8af45b swarm 树 22 文件 7217L + 13 utils 2283L + D 类归属件
 *（Snip/TeamCreate/TeamDelete 工具本体归 engine/tools/team/，R1 裁定）的
 * swarm/teammate 可插拔域包（框架/执行/信箱/后端层）。
 *
 * S-E2 四切片渐进门面（§8.66.1.5）：
 *   S-E2a 叶子+类型层（本提交）：constants / teammatePromptAddendum / peerAddress /
 *     agentId / teammateContext / standaloneAgent / teammateModel / permissionResponse /
 *     permissionPoller（R2 纯 registry 面）/ exec / backends/types（R3 零 any 重建）
 *   S-E2b 中层：teamHelpers / spawnUtils / spawnInProcess / inProcessTeammateTask 抽取 /
 *     inProcessTeammateHelpers / concurrentSessions / teamDiscovery / teamMemoryOps /
 *     reconnection / teammateLayoutManager / leaderPermissionBridge + messaging/teammate 尾 3 补差
 *   S-E2c backends 族：detection / teammateModeSnapshot / it2Setup / registry /
 *     TmuxBackend / ITermBackend / InProcessBackend / PaneBackendExecutor
 *   S-E2d hub+D 类+核销：inProcessRunner / permissionSync（928L）/ D 类 3 工具 /
 *     registry 槽核销（⑨⑮ materialize + ⑩ 闭合证据）/ 测试面 8-12 文件
 *
 * R7 前向接缝裁定更新（S-E2a 实测）：P-S1 agentLoop / P-S2 compaction 均裁定
 * 直连（runAgent 已在 engine 根门面 L114 / compactConversation 族已在 L227-238，
 * resetMicrocompactState + ERROR_MESSAGE_USER_ABORT 2 符号缺 root → S-E2c 扩 root
 * 头注登记）→ ports/ 目录不建。
 */
export {
  TEAM_LEAD_NAME,
  SWARM_SESSION_NAME,
  SWARM_VIEW_WINDOW_NAME,
  TMUX_COMMAND,
  HIDDEN_SESSION_NAME,
  getSwarmSocketName,
  TEAMMATE_COMMAND_ENV_VAR,
  TEAMMATE_COLOR_ENV_VAR,
  PLAN_MODE_REQUIRED_ENV_VAR,
} from './constants'
export { TEAMMATE_SYSTEM_PROMPT_ADDENDUM } from './teammatePromptAddendum'
export { parseAddress } from './peerAddress'
export {
  formatAgentId,
  parseAgentId,
  generateRequestId,
  parseRequestId,
} from './agentId'
export {
  type TeammateContext,
  getTeammateContext,
  runWithTeammateContext,
  isInProcessTeammate,
  createTeammateContext,
} from './teammateContext'
export {
  setStandaloneAgentContext,
  getStandaloneAgentName,
} from './standaloneAgent'
export { getHardcodedTeammateModelFallback } from './teammateModel'
export { type PermissionResponse } from './permissionResponse'
export {
  type PermissionResponseCallback,
  registerPermissionCallback,
  unregisterPermissionCallback,
  hasPermissionCallback,
  clearAllPendingCallbacks,
  processMailboxPermissionResponse,
  type SandboxPermissionResponseCallback,
  registerSandboxPermissionCallback,
  hasSandboxPermissionCallback,
  processSandboxPermissionResponse,
} from './permissionPoller'
export { execFileNoThrow } from './exec'
export {
  type PaneId,
  type AgentColorName,
  type PaneBackendType,
  type BackendType,
  isPaneBackend,
  type CreatePaneResult,
  type TeammateSpawnConfig,
  type TeammateSpawnResult,
  type TeammateMessage,
  type TeammateToolState,
  type TeammateExecutorContext,
  type PaneBackend,
  type TeammateExecutor,
  type BackendDetectionResult,
} from './backends/types'
