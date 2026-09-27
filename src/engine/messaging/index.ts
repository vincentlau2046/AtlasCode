/**
 * engine/messaging 门面（E-7 S-7e d1，§8.50，STR-1 门面规则——显式名块，
 * 无通配 re-export）。
 *
 * 文件式队友信箱核心（mailbox 54 导出面）+ 队友身份无状态层（teammate /
 * teammateContext）+ 域内小工具面（agentId / signal / objectGroupBy /
 * textContent / lockfile）+ 4 小文件（messagePredicates /
 * controlMessageCompat / collapseTeammateShutdowns / directMemberMessage）
 * + 域内本地化常量/schema 面（constants）。
 *
 * 外部消费方只许 `import { ... } from 'src/engine'`（STR-1）或域门面
 * `'../messaging'`，不许 reach 内部文件。
 *
 * H6 前向接缝登记（复审勿当遗漏重提）：各内部文件头注裁面（mailbox 裁面
 * 族（useInboxPoller UI 波 / SendMessageTool 工具本体波依赖方向 / 团队文件
 * 面 shell·swarm 波 / UDS Port 9）/ teammate 尾 3 AppState 函数裁（shell·
 * swarm 波自持，消费面浮现重裁 duck 化）/ collapse 本地 duck 不导出（UI 波
 * 需要时导出更名）/ directMemberMessage teamContext duck（组合根注真值）/
 * lockfile createRequire delta（Node ESM 正确路径））——预声明接缝非遗漏。
 * swarm 子树 7217L（backends 进程执行 + inProcessRunner + permissionSync +
 * teamHelpers + spawn/UI 族）= shell/swarm 波 + remote defer（Port 9），
 * 不在本域（§8.50 范围裁定）。
 */

// 队友身份无状态层（teammateContext 4 函数 + TeammateContext 型经 teammate
// 单一源 re-export，避免门面双源重名）
export {
  createTeammateContext,
  getTeammateContext,
  isInProcessTeammate,
  runWithTeammateContext,
  type TeammateContext,
  getParentSessionId,
  setDynamicTeamContext,
  clearDynamicTeamContext,
  getDynamicTeamContext,
  getAgentId,
  getAgentName,
  getTeamName,
  isTeammate,
  getTeammateColor,
  isPlanModeRequired,
  isTeamLead,
  // 尾 3 补差（C 桶 ③ shell·swarm 波 S-E2b R6；§8.50 裁除登记项核销，
  // 参数面适配 task 域 TaskAppState/SetAppState，登记见 teammate.ts 头注）
  hasActiveInProcessTeammates,
  hasWorkingInProcessTeammates,
  waitForTeammatesToBecomeIdle,
} from './teammate'

// 文件式队友信箱（54 导出面，旧 teammateMailbox.ts 1183L 随迁）
export {
  getInboxPath,
  readMailbox,
  readUnreadMessages,
  writeToMailbox,
  markMessageAsReadByIndex,
  markMessagesAsRead,
  clearMailbox,
  formatTeammateMessages,
  type TeammateMessage,
  type IdleNotificationMessage,
  createIdleNotification,
  isIdleNotification,
  type PermissionRequestMessage,
  type PermissionResponseMessage,
  createPermissionRequestMessage,
  createPermissionResponseMessage,
  isPermissionRequest,
  isPermissionResponse,
  type SandboxPermissionRequestMessage,
  type SandboxPermissionResponseMessage,
  createSandboxPermissionRequestMessage,
  createSandboxPermissionResponseMessage,
  isSandboxPermissionRequest,
  isSandboxPermissionResponse,
  PlanApprovalRequestMessageSchema,
  type PlanApprovalRequestMessage,
  PlanApprovalResponseMessageSchema,
  type PlanApprovalResponseMessage,
  ShutdownRequestMessageSchema,
  type ShutdownRequestMessage,
  ShutdownApprovedMessageSchema,
  type ShutdownApprovedMessage,
  ShutdownRejectedMessageSchema,
  type ShutdownRejectedMessage,
  createShutdownRequestMessage,
  createShutdownApprovedMessage,
  createShutdownRejectedMessage,
  sendShutdownRequestToMailbox,
  isShutdownRequest,
  isPlanApprovalRequest,
  isShutdownApproved,
  isShutdownRejected,
  isPlanApprovalResponse,
  type TaskAssignmentMessage,
  isTaskAssignment,
  type TeamPermissionUpdateMessage,
  isTeamPermissionUpdate,
  ModeSetRequestMessageSchema,
  type ModeSetRequestMessage,
  createModeSetRequestMessage,
  isModeSetRequest,
  isStructuredProtocolMessage,
  markMessagesAsReadByPredicate,
  getLastPeerDmSummary,
} from './mailbox'

// 确定性 Agent ID 面（旧 utils/agentId.ts 99L 逐字）
export {
  formatAgentId,
  parseAgentId,
  generateRequestId,
  parseRequestId,
} from './agentId'

// 事件信号原语（旧 utils/signal.ts 43L 逐字；d2 queueManager 订阅前置）
export { createSignal, type Signal } from './signal'

// Object.groupBy polyfill（旧 utils/objectGroupBy.ts 18L 逐字）
export { objectGroupBy } from './objectGroupBy'

// content block 文本提取（旧 utils/messages.ts:2897 extractTextContent 9L 逐字）
export { extractTextContent } from './textContent'

// proper-lockfile 惰性访问器（旧 utils/lockfile.ts 43L 随迁；
// createRequire delta 登记见 lockfile.ts 头注）
export { lock, lockSync, unlock, check } from './lockfile'

// 消息谓词面（旧 utils/messagePredicates.ts 8L 随迁；
// m is Message & { type: 'user' } 类型面 delta 登记见 messagePredicates.ts 头注）
export { isHumanTurn } from './messagePredicates'

// 控制消息键名兼容 shim（旧 utils/controlMessageCompat.ts 32L 逐字）
export { normalizeControlMessageKeys } from './controlMessageCompat'

// 队友 shutdown 附件折叠（旧 utils/collapseTeammateShutdowns.ts 55L 随迁；
// 本地 RenderableMessage duck 不导出，登记见 collapseTeammateShutdowns.ts 头注）
export { collapseTeammateShutdowns } from './collapseTeammateShutdowns'

// 直接成员消息（旧 utils/directMemberMessage.ts 69L 随迁；
// teamContext duck 类型面 delta 登记见 directMemberMessage.ts 头注）
export {
  parseDirectMemberMessage,
  sendDirectMemberMessage,
  type DirectMessageResult,
} from './directMemberMessage'

// 域内本地化常量 + schema 面（旧外部依赖面，登记见 constants.ts 头注）
export {
  TEAMMATE_MESSAGE_TAG,
  TEAM_LEAD_NAME,
  SEND_MESSAGE_TOOL_NAME,
  PermissionModeSchema,
  type BackendType,
} from './constants'

// 入轮命令队列（旧 utils/messageQueueManager.ts 539L 逐字，E-7 S-7e d2，
// §8.50；logOperation 族整体裁（replay 面 = shell 波前向接缝）+ Permutations
// 删链 + ContentBlockParam 宽骨架 cast 收窄等裁面/类型面 delta 登记见
// queueManager.ts 头注）
export {
  subscribeToCommandQueue,
  getCommandQueueSnapshot,
  getCommandQueue,
  getCommandQueueLength,
  hasCommandsInQueue,
  recheckCommandQueue,
  enqueue,
  enqueuePendingNotification,
  dequeue,
  dequeueAll,
  peek,
  dequeueAllMatching,
  remove,
  removeByFilter,
  clearCommandQueue,
  resetCommandQueue,
  isPromptInputModeEditable,
  isQueuedCommandEditable,
  isQueuedCommandVisible,
  popAllEditable,
  subscribeToPendingNotifications,
  getPendingNotificationsSnapshot,
  hasPendingNotifications,
  getPendingNotificationsCount,
  recheckPendingNotifications,
  dequeuePendingNotification,
  resetPendingNotifications,
  clearPendingNotifications,
  getCommandsByMaxPriority,
  isSlashCommand,
  type SetAppState,
  type PopAllEditableResult,
} from './queueManager'

// 入轮命令队列类型面（域内本地；旧 textInputTypes/messageQueueTypes 裁面
// 裁定 + OrphanedPermission/MessageOrigin/AppState 最小形 delta 登记见
// queueTypes.ts 头注）
export type {
  PromptInputMode,
  EditablePromptInputMode,
  QueuePriority,
  QueuedCommand,
  PastedContent,
  OrphanedPermission,
  MessageOrigin,
  ImageDimensions,
  AppState,
} from './queueTypes'

// agent teams / swarms 总开关（旧 utils/agentSwarmsEnabled.ts，§8.56 S-D2；
// growthbook killswitch 支裁 delta 登记见 agentSwarmsEnabled.ts 头注）
export { isAgentSwarmsEnabled } from './agentSwarmsEnabled'
