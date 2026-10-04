import { sanitizeToolNameForAnalytics } from '../../../services/analytics/metadata.js'
import type { ToolPermissionContext } from '../../../Tool.js'
import type { AppState } from '../../../state/AppState.js'
import { applyAutoModePermissionOption } from '../../../utils/permissions/autoModePermissionOption.js'
import {
  ATLAS_FOLDER_PERMISSION_PATTERN,
  FILE_EDIT_TOOL_NAME,
  GLOBAL_ATLAS_FOLDER_PERMISSION_PATTERN,
} from '../../../tools/FileEditTool/constants.js'
import { env } from '../../../utils/env.js'
import { generateSuggestions } from '../../../utils/permissions/filesystem.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import {
  type CompletionType,
  logUnaryEvent,
} from '../../../utils/unaryLogging.js'
import type { ToolUseConfirm } from '../PermissionRequest.js'
import type {
  FileOperationType,
  PermissionOption,
} from './permissionOptions.js'

function logPermissionEvent(
  event: 'accept' | 'reject',
  completionType: CompletionType,
  languageName: string | Promise<string>,
  messageId: string,
  hasFeedback?: boolean,
): void {
  void logUnaryEvent({
    completion_type: completionType,
    event,
    metadata: {
      language_name: languageName,
      message_id: messageId,
      platform: env.platform,
      hasFeedback: hasFeedback ?? false,
    },
  })
}

export type PermissionHandlerParams = {
  messageId: string
  path: string | null
  toolUseConfirm: ToolUseConfirm
  toolPermissionContext: ToolPermissionContext
  onDone: () => void
  onReject: () => void
  completionType: CompletionType
  languageName: string | Promise<string>
  operationType: FileOperationType
  // 2026-10-04 issule 工单 Task A2：'accept-auto-mode' 处理器需要发布切模
  setAppState: (updater: (prev: AppState) => AppState) => void
}

export type PermissionHandlerOptions = {
  hasFeedback?: boolean
  feedback?: string
  enteredFeedbackMode?: boolean
  scope?: 'claude-folder' | 'global-claude-folder'
}

function handleAcceptOnce(
  params: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  const { messageId, toolUseConfirm, onDone, completionType, languageName } =
    params

  logPermissionEvent('accept', completionType, languageName, messageId)

  // Log accept submission with feedback context

  onDone()
  toolUseConfirm.onAllow(toolUseConfirm.input, [], options?.feedback)
}

function handleAcceptSession(
  params: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  const {
    messageId,
    path,
    toolUseConfirm,
    toolPermissionContext,
    onDone,
    completionType,
    languageName,
    operationType,
  } = params

  logPermissionEvent('accept', completionType, languageName, messageId)

  // For claude-folder scope, grant session-level access to all .atlas/ files
  if (
    options?.scope === 'claude-folder' ||
    options?.scope === 'global-claude-folder'
  ) {
    const pattern =
      options.scope === 'global-claude-folder'
        ? GLOBAL_ATLAS_FOLDER_PERMISSION_PATTERN
        : ATLAS_FOLDER_PERMISSION_PATTERN
    const suggestions: PermissionUpdate[] = [
      {
        type: 'addRules',
        rules: [
          {
            toolName: FILE_EDIT_TOOL_NAME,
            ruleContent: pattern,
          },
        ],
        behavior: 'allow',
        destination: 'session',
      },
    ]
    onDone()
    toolUseConfirm.onAllow(toolUseConfirm.input, suggestions)
    return
  }

  // Generate permission updates if path is provided
  const suggestions = path
    ? generateSuggestions(path, operationType, toolPermissionContext)
    : []

  onDone()
  // Pass permission updates directly to onAllow
  toolUseConfirm.onAllow(toolUseConfirm.input, suggestions)
}

function handleReject(
  params: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  const {
    messageId,
    toolUseConfirm,
    onDone,
    onReject,
    completionType,
    languageName,
  } = params

  logPermissionEvent(
    'reject',
    completionType,
    languageName,
    messageId,
    options?.hasFeedback,
  )

  // Log reject submission with feedback context

  onDone()
  onReject()
  toolUseConfirm.onReject(options?.feedback)
}

/**
 * 2026-10-05 §4b A 波 A2：Esc 取消（合成的 {type:'cancel'} 选项）= abort
 * 本轮、无 feedback 送回 agent。与显式 No（reject，agent 继续运行）区分。
 */
function handleCancel(
  params: PermissionHandlerParams,
  options?: PermissionHandlerOptions,
): void {
  const { messageId, toolUseConfirm, onDone, onReject, completionType, languageName } =
    params

  logPermissionEvent(
    'reject',
    completionType,
    languageName,
    messageId,
    options?.hasFeedback,
  )

  onDone()
  onReject()
  toolUseConfirm.onAbort()
}

/**
 * 2026-10-04 issule 工单 Task A2：第 4 选项 = auto mode。切本 session 到
 * auto（transitionPermissionMode + 危险权限剥离），并把当前这 1 个 pending
 * 请求 re-dispatch 走 auto 门控（recheckPermission）：非危险工具 auto 放行
 * （recheck 自行 resolve + 移队列，弹框关闭），危险工具弹框留在原地再问。
 * 注意不调 onDone() —— 队列项由 recheck 的 resolve 路径移除；提前 onDone
 * 会把项移出队列导致 recheck 失手、agent loop 挂起。
 */
function handleAcceptAutoMode(
  params: PermissionHandlerParams,
  _options?: PermissionHandlerOptions,
): void {
  applyAutoModePermissionOption(
    params.toolPermissionContext,
    params.setAppState,
    () => params.toolUseConfirm.recheckPermission(),
  )
}

export const PERMISSION_HANDLERS: Record<
  PermissionOption['type'],
  (params: PermissionHandlerParams, options?: PermissionHandlerOptions) => void
> = {
  'accept-once': handleAcceptOnce,
  'accept-session': handleAcceptSession,
  reject: handleReject,
  cancel: handleCancel,
  'accept-auto-mode': handleAcceptAutoMode,
}
