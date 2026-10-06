/**
 * swarm 域门面（STR-1：外部消费者只 import 域根 index；§8.66.1.2 R1 新顶层域）。
 *
 * 域 = 旧仓 a8af45b swarm 树 22 文件 7217L + 13 utils 2283L + D 类归属件
 *（Snip/TeamCreate/TeamDelete 工具本体归 engine/tools/team/，R1 裁定）的
 * swarm/teammate 可插拔域包（框架/执行/信箱/后端层）。
 *
 * S-E2 四切片渐进门面（§8.66.1.5）：
 *   S-E2a 叶子+类型层：constants / teammatePromptAddendum / peerAddress /
 *     agentId / teammateContext / standaloneAgent / teammateModel / permissionResponse /
 *     permissionPoller（R2 纯 registry 面）/ exec / backends/types（R3 零 any 重建）
 *   S-E2b 中层（本提交落位）：teamHelpers / spawnUtils / spawnInProcess /
 *     inProcessTeammateTask 抽取 / inProcessTeammateHelpers / concurrentSessions /
 *     teamDiscovery / teamMemoryOps / reconnection / teammateLayoutManager /
 *     leaderPermissionBridge / cleanupRegistry / bundledMode /
 *     teammateModeSnapshot（原排 S-E2c，spawnUtils 硬依赖 getTeammateModeFromSnapshot
 *     提前，该文件头注登记）/ backends/port（seam ② 注入窗）
 *     + messaging/teammate 尾 3 补差（R6）
 *   S-E2c backends 族（本提交落位）：detection / it2Setup / registry /
 *     TmuxBackend / ITermBackend / InProcessBackend / PaneBackendExecutor /
 *     inProcessRunnerPort（S-E2d 前向接缝 ②）/ wireBackends（组合接线）
 *     + engine root 2 符号扩面 resetMicrocompactState/ERROR_MESSAGE_USER_ABORT。
 *     门面命名冲突面登记：detection.isInsideTmux 不入门面（与
 *     teammateLayoutManager.isInsideTmux 同名——后者 = port 委托消费面，
 *     门面已占该名；域内消费者直接 import './backends/detection'）；
 *     it2Setup.isIt2CliAvailable（which it2 安装性）与 detection 侧同名
 *     （session list 探活）消歧 → 门面导出名 isIt2CliInstalled（登记见
 *     it2Setup.ts 头注）。
 *   S-E2d hub+D 类+核销：inProcessRunner / permissionSync（928L）/ D 类 3 工具 /
 *     registry 槽核销（⑨⑮ materialize + ⑩ 闭合证据）/ 测试面 8-12 文件。
 *     门面命名冲突面登记：permissionSync.generateRequestId（0 参 `perm-`
 *     前缀）与 agentId generateRequestId（2 参，L53 已占名）消歧 → 门面
 *     导出名 generatePermissionRequestId（it2Setup isIt2CliInstalled
 *     消歧先例）；PermissionResponse 型 = L68 既存导出（permissionSync
 *     再导出同源，门面不重出）。
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
  AGENT_COLORS,
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
// S-E2b 中层（§8.66.1.5 切片 2）
export { registerCleanup, runCleanupFunctions } from './cleanupRegistry'
export { isRunningWithBun, isInBundledMode } from './bundledMode'
export {
  type TeammateMode,
  setCliTeammateModeOverride,
  getCliTeammateModeOverride,
  clearCliTeammateModeOverride,
  captureTeammateModeSnapshot,
  getTeammateModeFromSnapshot,
} from './teammateModeSnapshot'
export {
  type BackendModuleFace,
  setBackendModule,
  resetBackendModule,
  getBackendModule,
  requireBackendModule,
} from './backends/port'
export {
  inputSchema,
  type SpawnTeamOutput,
  type CleanupOutput,
  type TeamAllowedPath,
  type TeamFile,
  type Input,
  type Output,
  sanitizeName,
  sanitizeAgentName,
  getTeamDir,
  getTeamFilePath,
  readTeamFile,
  readTeamFileAsync,
  writeTeamFileAsync,
  removeTeammateFromTeamFile,
  addHiddenPaneId,
  removeHiddenPaneId,
  removeMemberFromTeam,
  removeMemberByAgentId,
  setMemberMode,
  syncTeammateMode,
  setMultipleMemberModes,
  setMemberActive,
  registerTeamForSessionCleanup,
  unregisterTeamForSessionCleanup,
  cleanupSessionTeams,
  cleanupTeamDirectories,
} from './teamHelpers'
export {
  type TeamSummary,
  type TeammateStatus,
  getTeammateStatuses,
} from './teamDiscovery'
export {
  isTeamMemFile,
  isTeamMemorySearch,
  isTeamMemoryWriteOrEdit,
  appendTeamMemorySummaryParts,
} from './teamMemoryOps'
export {
  InProcessTeammateTask,
  requestTeammateShutdown,
  appendTeammateMessage,
  injectUserMessageToTeammate,
  findTeammateTaskByAgentId,
  getAllInProcessTeammateTasks,
  getRunningTeammatesSorted,
} from './inProcessTeammateTask'
export {
  findInProcessTeammateTaskId,
  setAwaitingPlanApproval,
  handlePlanApprovalResponse,
  isPermissionRelatedResponse,
} from './inProcessTeammateHelpers'
export {
  type SpawnContext,
  type InProcessSpawnConfig,
  type InProcessSpawnOutput,
  spawnInProcessTeammate,
  killInProcessTeammate,
} from './spawnInProcess'
export {
  quote,
  getTeammateCommand,
  buildInheritedCliFlags,
  buildInheritedEnvVars,
} from './spawnUtils'
export {
  type SessionKind,
  type SessionStatus,
  isBgSession,
  registerSession,
  updateSessionName,
  updateSessionBridgeId,
  updateSessionActivity,
  countConcurrentSessions,
} from './concurrentSessions'
export {
  assignTeammateColor,
  getTeammateColor,
  clearTeammateColors,
  isInsideTmux,
  createTeammatePaneInSwarmView,
  enablePaneBorderStatus,
  sendCommandToPane,
} from './teammateLayoutManager'
export {
  type ToolUseConfirm,
  type SetToolUseConfirmQueueFn,
  type SetToolPermissionContextFn,
  registerLeaderToolUseConfirmQueue,
  getLeaderToolUseConfirmQueue,
  unregisterLeaderToolUseConfirmQueue,
  registerLeaderSetToolPermissionContext,
  getLeaderSetToolPermissionContext,
  unregisterLeaderSetToolPermissionContext,
} from './leaderPermissionBridge'
export {
  type TeamMemberState,
  type TeamContextShape,
  type TeamContextState,
  type SetTeamContextState,
  computeInitialTeamContext,
  initializeTeammateContextFromSession,
} from './reconnection'
// S-E2c backends 族（§8.66.1.5 切片 3）
export {
  IT2_COMMAND,
  isInsideTmuxSync,
  getLeaderPaneId,
  isTmuxAvailable,
  isInITerm2,
  isIt2CliAvailable,
  resetDetectionCache,
} from './backends/detection'
export {
  type PythonPackageManager,
  type It2InstallResult,
  type It2VerifyResult,
  detectPythonPackageManager,
  installIt2,
  verifyIt2Setup,
  getPythonApiInstructions,
  markIt2SetupComplete,
  setPreferTmuxOverIterm2,
  getPreferTmuxOverIterm2,
  isIt2CliAvailable as isIt2CliInstalled,
} from './backends/it2Setup'
export {
  ensureBackendsRegistered,
  registerTmuxBackend,
  registerITermBackend,
  detectAndGetBackend,
  getBackendByType,
  getCachedBackend,
  getCachedDetectionResult,
  markInProcessFallback,
  isInProcessEnabled,
  getResolvedTeammateMode,
  getInProcessBackend,
  getTeammateExecutor,
  resetBackendDetection,
} from './backends/registry'
export { TmuxBackend } from './backends/TmuxBackend'
export { ITermBackend } from './backends/ITermBackend'
export { InProcessBackend, createInProcessBackend } from './backends/InProcessBackend'
export {
  PaneBackendExecutor,
  createPaneBackendExecutor,
} from './backends/PaneBackendExecutor'
export {
  type StartInProcessTeammateArgs,
  type StartInProcessTeammateFn,
  setStartInProcessTeammate,
  resetStartInProcessTeammate,
  requireStartInProcessTeammate,
} from './backends/inProcessRunnerPort'
// S-E3 修波（A 路 blocker，§8.66 delta ⑧ 回填）：teammate 工具池
// ToolRegistryDeps 注入窗（组合根 compose ⑫ / createAgentLoopDeps 装配）。
export {
  setTeammateToolRegistryDeps,
  resetTeammateToolRegistryDeps,
  getTeammateToolRegistryDeps,
} from './backends/teammateToolRegistryDeps'
export { wireBackends } from './backends/wireBackends'
// S-E2d hub（§8.66.1.5 切片 4）：inProcessRunner hub 1536L（R2/R4/R7
// 裁剪）落位——seam ②（inProcessRunnerPort）真实现供体；组合根
// setStartInProcessTeammate 接线（compose.ts），本模块零顶层副作用
// （PRT-2）。
export {
  startInProcessTeammate,
  runInProcessTeammate,
  // delta ⑭ 接缝回填（S-E2d）：agent 注册表 + TPC/gate 消费端面。
  buildTeammateSystemPrompt,
  resolveTeammateAgentFace,
  createTeammateTpcBuilder,
  createInProcessPermissionGate,
  type InProcessRunnerConfig,
  type InProcessRunnerResult,
} from './inProcessRunner'
// P1（0.1.36 切片①→0.1.37 ⑧ 收敛）：mailbox 兜底协作式 deadline 纯面（判别单测
// 可测）已迁 shared 单一事实源 src/shared/permissionDeadline.ts（engine/TUI 两
// 消费面共享，boundaries tui↛swarm）；本门面 re-export 保 0.1.36 公开面（消费端
// 经 swarm 门面解析不变）。
export {
  resolveMailboxPermissionDeadlineMs,
  approvalUnavailableReason,
} from '../shared'
// S-E2d 权限同步族（旧仓 permissionSync 928L 全迁）：目录流（write/read/
// resolve/cleanup/poll）+ mailbox 变体（send…ViaMailbox 族）+ sandbox
// 变体（generateSandboxRequestId + sendSandbox…ViaMailbox 族）。
// 门面消歧：generateRequestId（0 参 perm- 前缀）→ generatePermissionRequestId
// （与 L53 agentId 2 参 generateRequestId 消歧）；PermissionResponse
// 型 L73 已占（同源 re-export 不重出）。
export {
  SwarmPermissionRequestSchema,
  type SwarmPermissionRequest,
  type PermissionResolution,
  getPermissionDir,
  generateRequestId as generatePermissionRequestId,
  createPermissionRequest,
  writePermissionRequest,
  readPendingPermissions,
  readResolvedPermission,
  resolvePermission,
  cleanupOldResolutions,
  pollForResponse,
  removeWorkerResponse,
  isTeamLeader,
  isSwarmWorker,
  deleteResolvedPermission,
  submitPermissionRequest,
  getLeaderName,
  sendPermissionRequestViaMailbox,
  sendPermissionResponseViaMailbox,
  generateSandboxRequestId,
  sendSandboxPermissionRequestViaMailbox,
  sendSandboxPermissionResponseViaMailbox,
} from './permissionSync'
