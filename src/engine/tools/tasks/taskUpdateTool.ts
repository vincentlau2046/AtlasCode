/**
 * engine/tools/tasks — TaskUpdateTool 本体（§8.56 S-D3，Task 四件套 ④；
 * 49 口径 9/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskUpdateTool/TaskUpdateTool.ts 406L
 * 逐字随迁（input 9 字段（status 含 'deleted' 动作）/ output 6 字段 /
 * call = 基础字段 diff 更新 + metadata 合并（null 删 key）+ status 支
 * （deleted 早退 / completed 钩子阻支 / 常规迁移）+ owner 变更 mailbox
 * 通知 + addBlocks/addBlockedBy 级联 + mapResult 4 支）。消费方 =
 * `tasks/` 子门面 + `tools/` 门面 re-export + 注册表 ⑯ isTodoV2 槽
 * （isEnabled = isTodoV2Enabled 自门控）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema 9 字段) → 新纯 JSON schema 对象
 *    （TASK_UPDATE_TOOL_INPUT_SCHEMA，S-B5 先例）；旧 zod outputSchema →
 *    TS 型 TaskUpdateOutput（statusChange 型承载；verificationNudgeNeeded
 *    字段保留型面 = 恒 undefined，见 delta ⑧ 残留守）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 PROMPT 体
 *    （S-C5 delta ③ 先例）；旧短 DESCRIPTION 常量留 taskUpdatePrompt.ts
 *    不接线。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    true / isReadOnly false（def 无覆写取默认）/ isDestructive false /
 *    maxResultSizeChars 100_000 / shouldDefer true / searchHint
 *    'update a task' / userFacingName 'TaskUpdate' / toAutoClassifierInput
 *    = 'taskId status subject' 三段拼接（def 体，缺段不拼）。
 *  ④ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（TaskCreate ⑤ 同族）。
 *  ⑤ 旧 executeTaskCompletedHooks（AsyncGenerator）→ 新 Promise 适配
 *    runTaskCompletedHooks（S-D2 taskHooks ①②）：signal 经 context duck
 *    透传 + sessionId 经 bootstrap getSessionId()；旧 for-await 收集
 *    blockingErrors 数组 join('\n') → 新 .blockingError 单值（末次钩子
 *    阻塞为准）→ 阻支措辞逐字（getTaskCompletedHookMessage 单条，
 *    success:false + updatedFields 空数组）。**P-D2 探针锚点**（§8.56.5）：
 *    钩子阻支 → success:false + error 'TaskCompleted hook feedback: …'
 *    + 任务状态不迁移（func 层真盘 + 假 shell 端口断言）。
 *  ⑥ 旧 `context.setAppState(expandedView:'tasks')` 自动展开支 → 裁（新仓
 *    无 expandedView AppState 消费面，TUI 波前向接缝，TaskCreate ⑦ 同族）。
 *  ⑦ 旧 import 重指：utils/tasks → ../../tasks / utils/teammate →
 *    ../../messaging（getAgentId/getAgentName/getTeammateColor/getTeamName）/
 *    utils/teammateMailbox → ../../messaging（writeToMailbox）/
 *    utils/hooks → ../../../hooks（taskHooks S-D2 已落）/
 *    utils/agentSwarmsEnabled → ../../messaging（S-D2 已落）/
 *    ./constants → ../toolNames（值逐字同 'TaskUpdate'）。
 *  ⑧ 旧 verificationNudge 结构校验支（feature('VERIFICATION_AGENT') &&
 *    growthbook 'atlas_hive_evidence' && !context.agentId && 3+ 全 completed
 *    无验证步 → 提醒 spawn 验证 agent）→ **整支裁**：新仓无 bun:bundle
 *    feature() 门控面 + 无 growthbook 远端配置面（scheduler cronJitterConfig
 *    同族裁面先例）+ VERIFICATION_AGENT_TYPE 常量 = 残留守（agent/
 *    constants.ts 头注，T-5c 内建注册表未含验证 agent 本体）→ 整支无活
 *    消费者，登记为验证-agent 波前向接缝；TaskUpdateOutput.
 *    verificationNudgeNeeded 字段保留型面（恒 undefined，wire 型面 D 波
 *    前向接缝）+ mapResult 尾段提醒文案随之裁。
 *  ⑨ call 5 参声明 → 2 参声明（旧 canUseTool/_parentMessage/onProgress
 *    旧体不消费，裁，零行为；S-B5 delta ⑩ 先例）；context duck =
 *    TaskToolUseContext（taskToolInput.ts）。
 *
 * 残留守（防「以为已全」）：verification agent 本体 + VERIFICATION_AGENT_
 * TYPE 常量（T-5c 内建注册表）+ 真 ToolUseContext 全字段面（setAppState /
 *  expandedView / agentId）= 残留守（TUI 波/D 波/验证-agent 波）。
 * [§8.69 核销] 保裁确认：无 growthbook 域 + bun:bundle feature() 不可测 +
 * 双门死支，核销确认（不复活）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from '../../../shared'
import { getSessionId } from '../../../bootstrap'
import {
  getAgentId,
  getAgentName,
  getTeammateColor,
  getTeamName,
  isAgentSwarmsEnabled,
  writeToMailbox,
} from '../../messaging'
import {
  blockTask,
  deleteTask,
  getTask,
  getTaskListId,
  isTodoV2Enabled,
  type TaskStatus,
  updateTask,
} from '../../tasks'
import { TASK_UPDATE_TOOL_NAME } from '../toolNames'
import {
  getTaskCompletedHookMessage,
  runTaskCompletedHooks,
} from '../../../hooks'
import { PROMPT } from './taskUpdatePrompt'
import type {
  TaskToolUseContext,
  TaskUpdateToolInput,
} from './taskToolInput'

/**
 * 输入 JSON schema（旧仓 zod inputSchema 9 字段逐字段转写，delta ①/②；
 * 与 TaskUpdateToolInput duck 型单一事实源逐字段对齐。status 旧
 * TaskStatusSchema().or(z.literal('deleted')) 枚举约束不进 JSON schema
 * （宽骨架面，S-C4 delta ② 先例）；metadata 旧 z.record(string, unknown)
 * → additionalProperties: true）。
 */
export const TASK_UPDATE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'The ID of the task to update',
    },
    subject: {
      type: 'string',
      description: 'New subject for the task',
    },
    description: {
      type: 'string',
      description: 'New description for the task',
    },
    activeForm: {
      type: 'string',
      description:
        'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
    },
    status: {
      type: 'string',
      description: 'New status for the task',
    },
    addBlocks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Task IDs that this task blocks',
    },
    addBlockedBy: {
      type: 'array',
      items: { type: 'string' },
      description: 'Task IDs that block this task',
    },
    owner: {
      type: 'string',
      description: 'New owner for the task',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description:
        'Metadata keys to merge into the task. Set a key to null to delete it.',
    },
  },
  required: ['taskId'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type TaskUpdateOutput = {
  success: boolean
  taskId: string
  updatedFields: string[]
  error?: string
  statusChange?: {
    from: string
    to: string
  }
  /** delta ⑧：verification nudge 支整裁，字段恒 undefined（型面保留）。 */
  verificationNudgeNeeded?: boolean
}

export const TaskUpdateTool: Tool = {
  name: TASK_UPDATE_TOOL_NAME,
  inputSchema: TASK_UPDATE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TASK_UPDATE_TOOL_INPUT_SCHEMA,
  searchHint: 'update a task',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isTodoV2Enabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const i = input as TaskUpdateToolInput
    const parts = [i.taskId]
    if (i.status) parts.push(i.status)
    if (i.subject) parts.push(i.subject)
    return parts.join(' ')
  },
  userFacingName: () => 'TaskUpdate',
  // delta ④：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  description: async () => PROMPT,
  // delta ⑤/⑥/⑨：钩子 Promise 适配 + setAppState 支裁 + 2 参声明
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<TaskUpdateOutput>> {
    const {
      taskId,
      subject,
      description,
      activeForm,
      status,
      owner,
      addBlocks,
      addBlockedBy,
      metadata,
    } = args as TaskUpdateToolInput
    const ctx = context as TaskToolUseContext | undefined

    const taskListId = getTaskListId()

    // Check if task exists
    const existingTask = await getTask(taskListId, taskId)
    if (!existingTask) {
      return {
        data: {
          success: false,
          taskId,
          updatedFields: [],
          error: 'Task not found',
        },
      }
    }

    const updatedFields: string[] = []

    // Update basic fields if provided and different from current value
    const updates: {
      subject?: string
      description?: string
      activeForm?: string
      status?: TaskStatus
      owner?: string
      metadata?: Record<string, unknown>
    } = {}
    if (subject !== undefined && subject !== existingTask.subject) {
      updates.subject = subject
      updatedFields.push('subject')
    }
    if (description !== undefined && description !== existingTask.description) {
      updates.description = description
      updatedFields.push('description')
    }
    if (activeForm !== undefined && activeForm !== existingTask.activeForm) {
      updates.activeForm = activeForm
      updatedFields.push('activeForm')
    }
    if (owner !== undefined && owner !== existingTask.owner) {
      updates.owner = owner
      updatedFields.push('owner')
    }
    // Auto-set owner when a teammate marks a task as in_progress without
    // explicitly providing an owner. This ensures the task list can match
    // todo items to teammates for showing activity status.
    if (
      isAgentSwarmsEnabled() &&
      status === 'in_progress' &&
      owner === undefined &&
      !existingTask.owner
    ) {
      const agentName = getAgentName()
      if (agentName) {
        updates.owner = agentName
        updatedFields.push('owner')
      }
    }
    if (metadata !== undefined) {
      const merged = { ...(existingTask.metadata ?? {}) }
      for (const [key, value] of Object.entries(metadata)) {
        if (value === null) {
          delete merged[key]
        } else {
          merged[key] = value
        }
      }
      updates.metadata = merged
      updatedFields.push('metadata')
    }
    if (status !== undefined) {
      // Handle deletion - delete the task file and return early
      if (status === 'deleted') {
        const deleted = await deleteTask(taskListId, taskId)
        return {
          data: {
            success: deleted,
            taskId,
            updatedFields: deleted ? ['deleted'] : [],
            error: deleted ? undefined : 'Failed to delete task',
            statusChange: deleted
              ? { from: existingTask.status, to: 'deleted' }
              : undefined,
          },
        }
      }

      // For regular status updates, validate and apply if different
      if (status !== existingTask.status) {
        // Run TaskCompleted hooks when marking a task as completed
        if (status === 'completed') {
          const hookResult = await runTaskCompletedHooks(
            taskId,
            existingTask.subject,
            existingTask.description,
            getAgentName(),
            getTeamName(),
            {
              signal: ctx?.abortController?.signal,
              sessionId: getSessionId(),
            },
          )

          if (hookResult.blockingError) {
            return {
              data: {
                success: false,
                taskId,
                updatedFields: [],
                error: getTaskCompletedHookMessage(hookResult.blockingError),
              },
            }
          }
        }

        updates.status = status
        updatedFields.push('status')
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateTask(taskListId, taskId, updates)
    }

    // Notify new owner via mailbox when ownership changes
    if (updates.owner && isAgentSwarmsEnabled()) {
      const senderName = getAgentName() || 'team-lead'
      const senderColor = getTeammateColor()
      const assignmentMessage = JSON.stringify({
        type: 'task_assignment',
        taskId,
        subject: existingTask.subject,
        description: existingTask.description,
        assignedBy: senderName,
        timestamp: new Date().toISOString(),
      })
      await writeToMailbox(
        updates.owner,
        {
          from: senderName,
          text: assignmentMessage,
          timestamp: new Date().toISOString(),
          color: senderColor,
        },
        taskListId,
      )
    }

    // Add blocks if provided and not already present
    if (addBlocks && addBlocks.length > 0) {
      const newBlocks = addBlocks.filter(
        id => !existingTask.blocks.includes(id),
      )
      for (const blockId of newBlocks) {
        await blockTask(taskListId, taskId, blockId)
      }
      if (newBlocks.length > 0) {
        updatedFields.push('blocks')
      }
    }

    // Add blockedBy if provided and not already present (reverse: the blocker blocks this task)
    if (addBlockedBy && addBlockedBy.length > 0) {
      const newBlockedBy = addBlockedBy.filter(
        id => !existingTask.blockedBy.includes(id),
      )
      for (const blockerId of newBlockedBy) {
        await blockTask(taskListId, blockerId, taskId)
      }
      if (newBlockedBy.length > 0) {
        updatedFields.push('blockedBy')
      }
    }

    // delta ⑧：旧 verificationNudge 支整裁（见头注），statusChange 面保留

    return {
      data: {
        success: true,
        taskId,
        updatedFields,
        statusChange:
          updates.status !== undefined
            ? { from: existingTask.status, to: updates.status }
            : undefined,
      },
    }
  },
  // delta ③：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { success, taskId, updatedFields, error, statusChange } =
      content as TaskUpdateOutput
    if (!success) {
      // Return as non-error so it doesn't trigger sibling tool cancellation
      // in StreamingToolExecutor. "Task not found" is a benign condition
      // (e.g., task list already cleaned up) that the model can handle.
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: error || `Task #${taskId} not found`,
      }
    }

    let resultContent = `Updated task #${taskId} ${updatedFields.join(', ')}`

    // Add reminder for teammates when they complete a task (supports in-process teammates)
    if (statusChange?.to === 'completed' && getAgentId() && isAgentSwarmsEnabled()) {
      resultContent +=
        '\n\nTask completed. Call TaskList now to find your next available task or see if your work unblocked others.'
    }

    // delta ⑧：旧 verificationNudgeNeeded 尾段提醒随之裁（型面保留恒 undefined）

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: resultContent,
    }
  },
}
