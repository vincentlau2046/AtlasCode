/**
 * engine/tools/team — SendMessageTool 本体（S-E2 §8.62 team/collab 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/SendMessageTool/SendMessageTool.ts 917L 裁剪
 * 随迁（旧 buildTool 成员面 → 新 shared Tool 契约对象化，config/askUser face
 * 先例）：inputSchema 纯 JSON 化（旧 lazySchema z.object 3 字段 +
 * discriminatedUnion 3 型 → 纯 JSON anyOf）/ validateInput 6 检查面逐字
 * （to 空 / @ 含 / string 缺 summary / * structured / shutdown_response
 * target / shutdown_response reject 缺 reason；UDS 3 检查面裁）/
 * checkPermissions allow+updatedInput 单面（UDS bridge ask 面裁）/ call 2 参
 * 分发面（string → handleMessage/handleBroadcast / structured 3 型 guard；
 * UDS 双支 + in-process 名路由裁）/ mapToolResult jsonStringify 面 /
 * renderToolUseMessage 3 面 / prompt gate-off 锚点（PROMPT = 旧 getPrompt()
 * gate-off trim 结果逐字，delta ⑧）。
 *
 * 门控槽（49 口径 25/49 → 26/49，本子波首个专属门控槽）：
 * isEnabled = isAgentSwarmsEnabled（ATLAS_EXPERIMENTAL_AGENT_TEAMS env ∨
 * --agent-teams flag；growthbook killswitch 支 §8.56.3 先例裁 = 恒放行）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lazySchema(zod) discriminatedUnion 3 型 + semanticBoolean → 新纯 JSON
 *    schema（anyOf string + structured 3 型对象臂）+ approve boolean（旧
 *    semanticBoolean 语义字符串面裁：新 wire 面 = 模型直产 JSON，boolean 真面）；
 *    inputSchema = 3 字段 to/summary/message（required to+message）+
 *    strict: true + additionalProperties false 双字段（configTool L113 /
 *    askUserQuestionTool L197 先例，§8.61 S-E3 B 路 F2 订正口径）；to 描述 =
 *    旧 gate-off 支逐字（UDS/bridge 描述面裁，delta ②）。
 *  ② UDS_INBOX 门族 4 站点（validate 站 parseAddress 2 站 + checkPermissions
 *    bridge ask 站 + call 站 postInterClaudeMessage/sendToUdsSocket 懒 require
 *    2 站）全裁 → remote 波 [ATLAS-HOLD]（新仓 0-hit；gate-off 旧行为 = 恰本
 *    波落盘面）；parseAddress（utils/peerAddress）/ truncate / errorMessage
 *    3 依赖随裁（消费点全在裁面内，零活消费）。
 *  ③ in-process 名路由块（旧 call L800-874：appState.agentNameRegistry +
 *    queuePendingMessage + resumeAgentBackground + isLocalAgentTask/
 *    isMainSessionTask + toAgentId + appState.tasks）裁 → C 桶 ③ shell·swarm
 *    波（新仓全 0-hit）；call 4 参（canUseTool/assistantMessage = 该块 + UDS
 *    块唯一消费）→ 2 参（S-C5 delta ⑧ 先例）；旧 backfillObservableInput 面
 *    （TUI 可观测输入回填）随裁 = 新 Tool 契约无该成员槽（TUI 波）。
 *  ④ handleShutdownApproval in-process 支（own-pane teamFile 查 +
 *    findTeammateTaskByAgentId abortController + gracefulShutdown(setImmediate)
 *    尾 + "fallback path" 早退文案）裁 → C 桶 ③ shell·swarm 波（3 依赖新仓
 *    0-hit）；落盘面 = mailbox 写 + 终文案逐字（createShutdownApprovedMessage
 *    paneId/backendType 2 参缺省 = 旧 team-file-missing 面 undefined，消息
 *    内容等价）。
 *  ⑤ handleBroadcast readTeamFileAsync（旧 utils/swarm/teamHelpers，新仓
 *    0-hit = team-file 域 C 桶 ③）→ 本文件 TeamFileLoader 注入接缝（默认
 *    async () => null = 旧 team-file-missing 错误面逐字 'Team "X" does not
 *    exist'）；真读者（team-file 域）C 桶 ③ 经 setTeamFileLoader 注入。
 *  ⑥ findTeammateColor（旧 appState.teamContext.teammates 色映射查）裁：新仓
 *    AppState 无 teammates 色映射成员（C 桶 ③ 归属）；routing.targetColor =
 *    旧 teammates 缺面 undefined（字段保留，值定 undefined）。
 *  ⑦ 旧 UI.tsx renderToolResultMessage（MessageResponse/Text JSX + jsonParse
 *    3 分支）裁 → TUI 波（config delta ⑨ 先例）；新契约 renderToolResultMessage
 *    槽 = 可选成员，留不实现。
 *  ⑧ 旧 def description()/prompt() 双面 → 新 description() 单面 = PROMPT
 *    （web 族口径：本体不 import DESCRIPTION，短描述面经 team/ 子门面 +
 *    tools/ 门面 SEND_MESSAGE_DESCRIPTION 别名 re-export）。
 *  ⑨ validateInput/call 双站点 context duck = SendMessageToolUseContext（本
 *    文件新）：getAppState().teamContext? 3 字段 intra-duck 必填（新 getTeamName
 *    参面 { teamName: string } + 新 isTeamLead 参面 { leadAgentId: string }
 *    结构满足）+ toolPermissionContext.mode（plan 审批 mode 继承面）；旧
 *    appState.agentNameRegistry/tasks 成员 = delta ③ 裁面，不进 duck。
 *  ⑩ isReadOnly 逐字（旧 L539-541：string message = read-only，mailbox 写不
 *    计写面）；isConcurrencySafe = false（mailbox 串行写面，旧 def 缺成员 →
 *    新契约缺省 false，writeTool delta ④ 先例值）；isDestructive = false；
 *    shouldDefer = true 逐字。
 *
 * 消费方 = `team/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径注册位
 * （§8.62.1：自门控 isEnabled = isAgentSwarmsEnabled，26/49；本体经
 * ToolRegistryDeps.baseTools 消费方注入，注册表机制不变）。
 */
import {
  logForDebugging,
  type PermissionDecision,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import {
  TEAM_LEAD_NAME,
  type BackendType,
  createShutdownApprovedMessage,
  createShutdownRejectedMessage,
  createShutdownRequestMessage,
  generateRequestId,
  getAgentId,
  getAgentName,
  getTeammateColor,
  getTeamName,
  isAgentSwarmsEnabled,
  isTeamLead,
  isTeammate,
  writeToMailbox,
} from '../../messaging'
import { jsonStringify } from '../../session/json'
import { SEND_MESSAGE_TOOL_NAME } from '../toolNames'
import { PROMPT } from './sendMessagePrompt'

/** 结构化协议消息（旧 zod discriminatedUnion 3 型转写，delta ①：
 * semanticBoolean → boolean）。 */
export type StructuredMessage =
  | { type: 'shutdown_request'; reason?: string }
  | {
      type: 'shutdown_response'
      request_id: string
      approve: boolean
      reason?: string
    }
  | {
      type: 'plan_approval_response'
      request_id: string
      approve: boolean
      feedback?: string
    }

/** 输入 duck 型（旧 zod InputSchema 3 字段转写，delta ①）。 */
export type SendMessageInput = {
  to: string
  summary?: string
  message: string | StructuredMessage
}

export type MessageRouting = {
  sender: string
  senderColor?: string
  target: string
  targetColor?: string
  summary?: string
  content?: string
}

export type MessageOutput = {
  success: boolean
  message: string
  routing?: MessageRouting
}

export type BroadcastOutput = {
  success: boolean
  message: string
  recipients: string[]
  routing?: MessageRouting
}

export type RequestOutput = {
  success: boolean
  message: string
  request_id: string
  target: string
}

export type ResponseOutput = {
  success: boolean
  message: string
  request_id?: string
}

export type SendMessageToolOutput =
  | MessageOutput
  | BroadcastOutput
  | RequestOutput
  | ResponseOutput

/** context duck（delta ⑨）：getAppState().teamContext 3 字段 intra-duck 必填
 * + toolPermissionContext.mode（plan 审批 mode 继承面，旧 L448）。 */
export type SendMessageToolUseContext = {
  getAppState(): {
    teamContext?: {
      teamName: string
      leadAgentId: string
      teammates?: Record<string, { name?: string; color?: string }>
    }
    toolPermissionContext: { mode: string }
  }
}

/** 输入 JSON schema（旧 lazySchema z.object 3 字段逐字段转写，delta ①；
 * message 联合 = anyOf string + structured 3 型对象臂；gate-off to 描述 =
 * 旧非 UDS 支逐字，delta ②）。 */
export const SEND_MESSAGE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    to: {
      type: 'string',
      description:
        'Recipient: teammate name, or "*" for broadcast to all teammates',
    },
    summary: {
      type: 'string',
      description:
        'A 5-10 word summary shown as a preview in the UI (required when message is a string)',
    },
    message: {
      description:
        'Plain text message content, or a structured protocol message (shutdown_request / shutdown_response / plan_approval_response)',
      anyOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            type: { const: 'shutdown_request' },
            reason: { type: 'string' },
          },
          required: ['type'],
        },
        {
          type: 'object',
          properties: {
            type: { const: 'shutdown_response' },
            request_id: { type: 'string' },
            approve: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['type', 'request_id', 'approve'],
        },
        {
          type: 'object',
          properties: {
            type: { const: 'plan_approval_response' },
            request_id: { type: 'string' },
            approve: { type: 'boolean' },
            feedback: { type: 'string' },
          },
          required: ['type', 'request_id', 'approve'],
        },
      ],
    },
  },
  required: ['to', 'message'],
  additionalProperties: false,
}

/** 团队文件 duck（旧 swarm/teamHelpers teamFile.members 面，delta ⑤）。 */
export type TeamFile = {
  members: Array<{
    name: string
    agentId?: string
    tmuxPaneId?: string
    backendType?: BackendType
  }>
}

type TeamFileLoader = (teamName: string) => Promise<TeamFile | null>

// delta ⑤：旧 readTeamFileAsync（team-file 域 C 桶 ③ 未落，新仓 0-hit）→
// 本文件注入接缝；默认 = 旧 team-file-missing 错误面逐字。
let teamFileLoader: TeamFileLoader = async () => null

export function setTeamFileLoader(loader: TeamFileLoader): void {
  teamFileLoader = loader
}

export function resetTeamFileLoader(): void {
  teamFileLoader = async () => null
}

async function handleMessage(
  recipientName: string,
  content: string,
  summary: string | undefined,
  context: SendMessageToolUseContext,
): Promise<ToolResult<MessageOutput>> {
  const appState = context.getAppState()
  const teamName = getTeamName(appState.teamContext)
  const senderName =
    getAgentName() || (isTeammate() ? 'teammate' : TEAM_LEAD_NAME)
  const senderColor = getTeammateColor()

  await writeToMailbox(
    recipientName,
    {
      from: senderName,
      text: content,
      summary,
      timestamp: new Date().toISOString(),
      color: senderColor,
    },
    teamName,
  )

  // delta ⑥：findTeammateColor 裁（teammates 色映射 C 桶 ③ 归属），
  // targetColor = 旧 teammates 缺面 undefined
  return {
    data: {
      success: true,
      message: `Message sent to ${recipientName}'s inbox`,
      routing: {
        sender: senderName,
        senderColor,
        target: `@${recipientName}`,
        targetColor: undefined,
        summary,
        content,
      },
    },
  }
}

async function handleBroadcast(
  content: string,
  summary: string | undefined,
  context: SendMessageToolUseContext,
): Promise<ToolResult<BroadcastOutput>> {
  const appState = context.getAppState()
  const teamName = getTeamName(appState.teamContext)

  if (!teamName) {
    throw new Error(
      'Not in a team context. Create a team with Teammate spawnTeam first, or set ATLAS_TEAM_NAME.',
    )
  }

  const teamFile = await teamFileLoader(teamName) // delta ⑤（旧 readTeamFileAsync）
  if (!teamFile) {
    throw new Error(`Team "${teamName}" does not exist`)
  }

  const senderName =
    getAgentName() || (isTeammate() ? 'teammate' : TEAM_LEAD_NAME)
  if (!senderName) {
    throw new Error(
      'Cannot broadcast: sender name is required. Set ATLAS_AGENT_NAME.',
    )
  }

  const senderColor = getTeammateColor()

  const recipients: string[] = []
  for (const member of teamFile.members) {
    if (member.name.toLowerCase() === senderName.toLowerCase()) {
      continue
    }
    recipients.push(member.name)
  }

  if (recipients.length === 0) {
    return {
      data: {
        success: true,
        message: 'No teammates to broadcast to (you are the only team member)',
        recipients: [],
      },
    }
  }

  for (const recipientName of recipients) {
    await writeToMailbox(
      recipientName,
      {
        from: senderName,
        text: content,
        summary,
        timestamp: new Date().toISOString(),
        color: senderColor,
      },
      teamName,
    )
  }

  return {
    data: {
      success: true,
      message: `Message broadcast to ${recipients.length} teammate(s): ${recipients.join(', ')}`,
      recipients,
      routing: {
        sender: senderName,
        senderColor,
        target: '@team',
        summary,
        content,
      },
    },
  }
}

async function handleShutdownRequest(
  targetName: string,
  reason: string | undefined,
  context: SendMessageToolUseContext,
): Promise<ToolResult<RequestOutput>> {
  const appState = context.getAppState()
  const teamName = getTeamName(appState.teamContext)
  const senderName = getAgentName() || TEAM_LEAD_NAME
  const requestId = generateRequestId('shutdown', targetName)

  const shutdownMessage = createShutdownRequestMessage({
    requestId,
    from: senderName,
    reason,
  })

  await writeToMailbox(
    targetName,
    {
      from: senderName,
      text: jsonStringify(shutdownMessage),
      timestamp: new Date().toISOString(),
      color: getTeammateColor(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Shutdown request sent to ${targetName}. Request ID: ${requestId}`,
      request_id: requestId,
      target: targetName,
    },
  }
}

async function handleShutdownApproval(
  requestId: string,
  _context: SendMessageToolUseContext,
): Promise<ToolResult<ResponseOutput>> {
  const teamName = getTeamName()
  const agentId = getAgentId()
  const agentName = getAgentName() || 'teammate'

  logForDebugging(
    `[SendMessageTool] handleShutdownApproval: teamName=${teamName}, agentId=${agentId}, agentName=${agentName}`,
  )

  // delta ④：in-process 支（own-pane teamFile 查 + findTeammateTaskByAgentId
  // abort + gracefulShutdown 尾 + fallback 早退文案）裁 → C 桶 ③ shell·swarm
  // 波；paneId/backendType = 旧 team-file-missing 面 undefined
  const approvedMessage = createShutdownApprovedMessage({
    requestId,
    from: agentName,
  })

  await writeToMailbox(
    TEAM_LEAD_NAME,
    {
      from: agentName,
      text: jsonStringify(approvedMessage),
      timestamp: new Date().toISOString(),
      color: getTeammateColor(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Shutdown approved. Sent confirmation to team-lead. Agent ${agentName} is now exiting.`,
      request_id: requestId,
    },
  }
}

async function handleShutdownRejection(
  requestId: string,
  reason: string,
): Promise<ToolResult<ResponseOutput>> {
  const teamName = getTeamName()
  const agentName = getAgentName() || 'teammate'

  const rejectedMessage = createShutdownRejectedMessage({
    requestId,
    from: agentName,
    reason,
  })

  await writeToMailbox(
    TEAM_LEAD_NAME,
    {
      from: agentName,
      text: jsonStringify(rejectedMessage),
      timestamp: new Date().toISOString(),
      color: getTeammateColor(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Shutdown rejected. Reason: "${reason}". Continuing to work.`,
      request_id: requestId,
    },
  }
}

async function handlePlanApproval(
  recipientName: string,
  requestId: string,
  context: SendMessageToolUseContext,
): Promise<ToolResult<ResponseOutput>> {
  const appState = context.getAppState()
  const teamName = appState.teamContext?.teamName

  if (!isTeamLead(appState.teamContext)) {
    throw new Error(
      'Only the team lead can approve plans. Teammates cannot approve their own or other plans.',
    )
  }

  const leaderMode = appState.toolPermissionContext.mode
  const modeToInherit = leaderMode === 'plan' ? 'default' : leaderMode

  const approvalResponse = {
    type: 'plan_approval_response',
    requestId,
    approved: true,
    timestamp: new Date().toISOString(),
    permissionMode: modeToInherit,
  }

  await writeToMailbox(
    recipientName,
    {
      from: TEAM_LEAD_NAME,
      text: jsonStringify(approvalResponse),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Plan approved for ${recipientName}. They will receive the approval and can proceed with implementation.`,
      request_id: requestId,
    },
  }
}

async function handlePlanRejection(
  recipientName: string,
  requestId: string,
  feedback: string,
  context: SendMessageToolUseContext,
): Promise<ToolResult<ResponseOutput>> {
  const appState = context.getAppState()
  const teamName = appState.teamContext?.teamName

  if (!isTeamLead(appState.teamContext)) {
    throw new Error(
      'Only the team lead can reject plans. Teammates cannot reject their own or other plans.',
    )
  }

  const rejectionResponse = {
    type: 'plan_approval_response',
    requestId,
    approved: false,
    feedback,
    timestamp: new Date().toISOString(),
  }

  await writeToMailbox(
    recipientName,
    {
      from: TEAM_LEAD_NAME,
      text: jsonStringify(rejectionResponse),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )

  return {
    data: {
      success: true,
      message: `Plan rejected for ${recipientName} with feedback: "${feedback}"`,
      request_id: requestId,
    },
  }
}

// Tool 契约非参数化（readTool face 先例）；face 扩型 = checkPermissions
// 返回型收窄（web face 先例；落盘面 = 纯 allow 单支，UDS ask 支 delta ② 裁）。
type SendMessageToolFace = Tool & {
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionDecision<SendMessageInput>>
}

export const SendMessageTool: SendMessageToolFace = {
  name: SEND_MESSAGE_TOOL_NAME,
  inputSchema: SEND_MESSAGE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: SEND_MESSAGE_TOOL_INPUT_SCHEMA,
  searchHint: 'send messages to agent teammates (swarm protocol)',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ①：旧 lazySchema z.object 面 → 纯 JSON（strict + additionalProperties
  // 双字段，config/askUser 先例）
  strict: true,
  // 门控槽（49 口径 26/49 首个专属门控槽）：旧 L535-537 逐字
  isEnabled: () => isAgentSwarmsEnabled(),
  isConcurrencySafe: () => false,
  isReadOnly: (input: unknown) =>
    typeof (input as SendMessageInput).message === 'string',
  isDestructive: () => false,
  userFacingName: () => 'SendMessage',

  toAutoClassifierInput(input: unknown) {
    const { message, to } = input as SendMessageInput
    if (typeof message === 'string') {
      return `to ${to}: ${message}`
    }
    switch (message.type) {
      case 'shutdown_request':
        return `shutdown_request to ${to}`
      case 'shutdown_response':
        return `shutdown_response ${message.approve ? 'approve' : 'reject'} ${message.request_id}`
      case 'plan_approval_response':
        return `plan_approval ${message.approve ? 'approve' : 'reject'} to ${to}`
    }
  },

  async checkPermissions(input: unknown, _context: unknown) {
    // delta ②：UDS_INBOX bridge ask 支（safetyCheck 跨机 prompt 注入
    // bypass-immune 面）裁 → remote 波
    return { behavior: 'allow' as const, updatedInput: input as SendMessageInput }
  },

  async validateInput(
    input: unknown,
    _context: unknown,
  ): Promise<ValidationResult> {
    const i = input as SendMessageInput
    if (i.to.trim().length === 0) {
      return {
        result: false,
        message: 'to must not be empty',
        errorCode: 9,
      }
    }
    // delta ②：UDS address target 空检查（parseAddress 0-hit）裁
    if (i.to.includes('@')) {
      return {
        result: false,
        message:
          'to must be a bare teammate name or "*" — there is only one team per session',
        errorCode: 9,
      }
    }
    // delta ②：UDS bridge structured 拒绝 + 连接检查 / uds string 放行
    // 2 检查面裁
    if (typeof i.message === 'string') {
      if (!i.summary || i.summary.trim().length === 0) {
        return {
          result: false,
          message: 'summary is required when message is a string',
          errorCode: 9,
        }
      }
      return { result: true }
    }

    if (i.to === '*') {
      return {
        result: false,
        message: 'structured messages cannot be broadcast (to: "*")',
        errorCode: 9,
      }
    }
    // delta ②：UDS structured cross-session 拒绝面裁

    if (i.message.type === 'shutdown_response' && i.to !== TEAM_LEAD_NAME) {
      return {
        result: false,
        message: `shutdown_response must be sent to "${TEAM_LEAD_NAME}"`,
        errorCode: 9,
      }
    }

    if (
      i.message.type === 'shutdown_response' &&
      !i.message.approve &&
      (!i.message.reason || i.message.reason.trim().length === 0)
    ) {
      return {
        result: false,
        message: 'reason is required when rejecting a shutdown request',
        errorCode: 9,
      }
    }

    return { result: true }
  },

  async description(): Promise<string> {
    // delta ⑧：旧 prompt() 面 → PROMPT（gate-off 锚点逐字）
    return PROMPT
  },

  mapToolResultToToolResultBlockParam(
    data: SendMessageToolOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: jsonStringify(data),
        },
      ],
    }
  },

  async call(args: unknown, context: unknown) {
    const input = args as SendMessageInput
    const ctx = context as SendMessageToolUseContext
    // delta ②：UDS_INBOX bridge/uds 2 支裁 → remote 波
    // delta ③：in-process 名路由块裁 → C 桶 ③ shell·swarm 波
    if (typeof input.message === 'string') {
      if (input.to === '*') {
        return handleBroadcast(input.message, input.summary, ctx)
      }
      return handleMessage(input.to, input.message, input.summary, ctx)
    }

    if (input.to === '*') {
      throw new Error('structured messages cannot be broadcast')
    }

    switch (input.message.type) {
      case 'shutdown_request':
        return handleShutdownRequest(input.to, input.message.reason, ctx)
      case 'shutdown_response':
        if (input.message.approve) {
          return handleShutdownApproval(input.message.request_id, ctx)
        }
        return handleShutdownRejection(
          input.message.request_id,
          input.message.reason!,
        )
      case 'plan_approval_response':
        if (input.message.approve) {
          return handlePlanApproval(
            input.to,
            input.message.request_id,
            ctx,
          )
        }
        return handlePlanRejection(
          input.to,
          input.message.request_id,
          input.message.feedback ?? 'Plan needs revision',
          ctx,
        )
    }
  },

  renderToolUseMessage(input: unknown) {
    // delta ⑦：旧 UI.tsx 字符串面逐字（JSX 面裁 → TUI 波）
    const { message, to } = (input ?? {}) as Partial<SendMessageInput>
    if (typeof message !== 'object' || message === null) {
      return null
    }
    if (message.type === 'plan_approval_response') {
      return message.approve
        ? `approve plan from: ${to}`
        : `reject plan from: ${to}`
    }
    return null
  },
}
