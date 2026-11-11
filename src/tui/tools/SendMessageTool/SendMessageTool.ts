/**
 * 0.1.94 C-2 薄 wrapper（f4 §11③ 批复，W-D-B 工具契约统一波）：
 * SendMessageTool 逻辑实现体单源 = src/engine/tools/team/sendMessageTool.ts
 *（经 engine 门面消费，boundaries entry-point 纪律；旧 TUI 927L 副本裁除，
 * 实现体实例数 = 1 由判别格钉住）。本文件只承载 TUI 契约胶水面：
 *
 *   - zod inputSchema（TUI Tool 契约面；engine 面 = SEND_MESSAGE_TOOL_INPUT_SCHEMA
 *     纯 JSON，engine 车道消费）
 *   - prompt() 槽 = engine description() = getSendMessagePrompt（§8.68
 *     env-live 门统一形；旧 prompt.ts feature() 编译门面随 C-2 裁除）
 *   - 短描述 description() = 旧 DESCRIPTION 常量面（TUI 工具列表消费）
 *   - renderToolResultMessage（UI.tsx 渲染面移留 TUI 职责）
 *   - nameRouterPort / selfTerminatePort 注入（f4 §11①②：tui 域符号经
 *     port 承载，engine↛tui 硬边界；本文件 = TUI 组合根注入点，headless
 *     不 import 本文件 = port 缺席 = engine lane 名路由/自退支整体缺席
 *     零变更）
 *
 * 收窄形（f4 §10①）：名路由 evicted-transcript-resume 兜底支已裁（判定
 * 逻辑本体在 engine 单源 call 内，非本文件）。
 */
import { feature } from 'src/shared'
import { z } from 'zod/v4'
import {
  SendMessageTool as EngineSendMessageTool,
  resetNameRouterPort,
  resetSelfTerminatePort,
  setSelfTerminatePort,
  setNameRouterPort,
  type SendMessageToolOutput,
} from 'src/engine'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  isLocalAgentTask,
  queuePendingMessage as queuePendingMessageTask,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { isMainSessionTask } from '../../tasks/LocalMainSessionTask.js'
import { toAgentId } from '../../types/ids.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'
import { resumeAgentBackground } from '../AgentTool/resumeAgent.js'
import { SEND_MESSAGE_TOOL_NAME } from './constants.js'
import { renderToolResultMessage } from './UI.js'

const DESCRIPTION = 'Send a message to another agent'

const StructuredMessage = lazySchema(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('shutdown_request'),
      reason: z.string().optional(),
    }),
    z.object({
      type: z.literal('shutdown_response'),
      request_id: z.string(),
      approve: semanticBoolean(),
      reason: z.string().optional(),
    }),
    z.object({
      type: z.literal('plan_approval_response'),
      request_id: z.string(),
      approve: semanticBoolean(),
      feedback: z.string().optional(),
    }),
  ]),
)

const inputSchema = lazySchema(() =>
  z.object({
    to: z
      .string()
      .describe(
        feature('UDS_INBOX')
          ? 'Recipient: teammate name, "*" for broadcast, "uds:<socket-path>" for a local peer, or "bridge:<session-id>" for a Remote Control peer (use ListPeers to discover)'
          : 'Recipient: teammate name, or "*" for broadcast to all teammates',
      ),
    summary: z
      .string()
      .optional()
      .describe(
        'A 5-10 word summary shown as a preview in the UI (required when message is a string)',
      ),
    message: z.union([
      z.string().describe('Plain text message content'),
      StructuredMessage(),
    ]),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

export type Input = z.infer<InputSchema>

// Output 型族单源 engine（旧 TUI 副本本地 duck 型随 C-2 裁除）
export type {
  BroadcastOutput,
  MessageOutput,
  MessageRouting,
  RequestOutput,
  ResponseOutput,
  SendMessageToolOutput,
} from 'src/engine'
export type { SendMessageInput, StructuredMessage } from 'src/engine'

// ── 0.1.94 C-2 port 注入（f4 §11①②；本文件 = TUI 组合根注入点）──
// TUI store 无模块单例（main.tsx 创建经 context 传递）→ port 原语经
// context.getAppState() 取活态。headless 车道不 import 本文件 = port 缺席。
setNameRouterPort({
  resolveAgentId(name, context) {
    // W-D-C R3：agent 名注册表死态裁除（全仓零写面恒空，首查恒
    // undefined）——toAgentId 兜底链直查（零行为变更；lock-face
    // docs/2026-11-11-wdc-r3-lockface.md §2.1）。
    return toAgentId(name) ?? undefined
  },
  getTaskState(agentId, context) {
    const appState = (context as ToolUseContext).getAppState()
    return appState.tasks[agentId]
  },
  isRoutableAgentTask: task =>
    isLocalAgentTask(task) && !isMainSessionTask(task),
  queuePendingMessage(agentId, message, setAppState) {
    queuePendingMessageTask(
      agentId,
      message,
      setAppState as unknown as (f: (prev: never) => never) => void,
    )
  },
  async resumeAgent(args) {
    const result = await resumeAgentBackground({
      agentId: args.agentId,
      prompt: args.prompt,
      toolUseContext: args.toolUseContext as ToolUseContext,
      canUseTool: args.canUseTool as CanUseToolFn,
      invokingRequestId: args.invokingRequestId,
    })
    return { outputFile: result.outputFile }
  },
})

// 非 in-process backend 车道（tmux 成员）进程级自退兜底——动作经 port
//（f4 §11②），触发逻辑（backendType 判 + status 判补）在 engine 单源。
setSelfTerminatePort(() => {
  void gracefulShutdown(0, 'other')
})

// 测试隔离面（判别格消费；与 engine reset 面对偶）
export function resetSendMessagePortsForTest(): void {
  resetNameRouterPort()
  resetSelfTerminatePort()
}

export const SendMessageTool: Tool<InputSchema, SendMessageToolOutput> =
  buildTool({
    name: SEND_MESSAGE_TOOL_NAME,
    searchHint: 'send messages to agent teammates (swarm protocol)',
    maxResultSizeChars: 100_000,

    userFacingName() {
      return EngineSendMessageTool.userFacingName(undefined)
    },

    get inputSchema(): InputSchema {
      return inputSchema()
    },
    shouldDefer: true,

    isEnabled() {
      return EngineSendMessageTool.isEnabled()
    },

    isReadOnly(input) {
      return EngineSendMessageTool.isReadOnly(input)
    },

    backfillObservableInput(input) {
      EngineSendMessageTool.backfillObservableInput?.(
        input as unknown as Record<string, unknown>,
      )
    },

    toAutoClassifierInput(input) {
      return EngineSendMessageTool.toAutoClassifierInput(input)
    },

    async checkPermissions(input, context) {
      return (await EngineSendMessageTool.checkPermissions(
        input,
        context,
      )) as never
    },

    async validateInput(input, context) {
      return (await EngineSendMessageTool.validateInput?.(
        input,
        context,
      )) as never
    },

    async description() {
      return DESCRIPTION
    },

    async prompt() {
      // §8.68 env-live 统一形：engine description() = getSendMessagePrompt
      //（门 face 每次访问重读 env-live；gate-off = PROMPT 逐字锚点不变）
      return EngineSendMessageTool.description(undefined, undefined)
    },

    mapToolResultToToolResultBlockParam(data, toolUseID) {
      return EngineSendMessageTool.mapToolResultToToolResultBlockParam(
        data as never,
        toolUseID,
      )
    },

    async call(input, context, canUseTool, assistantMessage) {
      return EngineSendMessageTool.call(
        input,
        context,
        canUseTool,
        assistantMessage,
      ) as never
    },

    renderToolUseMessage: ((input, options) =>
      EngineSendMessageTool.renderToolUseMessage(
        input,
        options,
      )) as ToolDef<InputSchema, SendMessageToolOutput>['renderToolUseMessage'],
    renderToolResultMessage,
  } satisfies ToolDef<InputSchema, SendMessageToolOutput>)
