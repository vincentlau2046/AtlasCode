/**
 * engine/query — Agent 主循环最小纵切（§8.21 E-1 窄 spine T-1 + T-2 工具执行抽离）
 *
 * 跑通 LLM→tool→result 单轮：
 *   取 messages → modelprovider.chat（经 modelprovider 域门面，非直接 new OpenAIProvider）
 *   → 解析 assistant content 里的 tool_use 块
 *   → 委托 engine/pipeline 执行本轮工具（T-2 runToolBatch，4 接缝）
 *   → 追加 tool_result 消息 → 返回
 *
 * 裁剪版真核心（C-Deep 纵切纪律，残留守头注释防「以为已全」）：
 *   - 本版 = 单轮（一次 LLM + 一批 tool_use）。多轮 while(true) 续跑归 E-1b。
 *   - 工具执行已抽到 engine/pipeline（T-2）：本文件只管 LLM + 消息装配，工具链单一事实源在 pipeline。
 *   - 残留守（后续纵切）：流式 chatStream（E-1b）/ 上下文压缩 compact（E-1b）/
 *     错误恢复 + stop hooks（E-1b）/ MCP 路由（E-2）/ 附件注入（E-5）/
 *     tokenBudget continuation（E-1b）/ 工具执行接缝（权限 E-4 / 钩子 E-5 / 并发 E-1b，见 pipeline 残留守）。
 *
 * port 之下全真：LLM 经 modelprovider 域门面 + Tool.call 契约（shared/types.ts）——
 * 防 H6 空洞等价。engine 消费面：modelprovider（DEP-4 allow）+ shared（门面）+ pipeline（域内）。
 */
import type {
  AssistantMessage,
  Message,
  ToolResultBlockParam,
  ToolUseBlock,
  Tools,
} from '../../shared'
import type { ModelProvider, ModelRole } from '../../modelprovider'
import { runToolBatch } from '../pipeline'

export interface AgentLoopDeps {
  modelProvider: ModelProvider
  role: ModelRole
  signal?: AbortSignal
}

export interface AgentRoundResult {
  /** 续跑 / 回放用的完整消息序列：入参 messages + assistant 消息 + 各 tool_result 消息 */
  messages: Message[]
  /** 本轮每个 tool_use 的执行产物（供上层断言 / 续跑 / 遥测） */
  toolResults: Array<{ toolUseId: string; name: string; block: ToolResultBlockParam }>
  /** assistant 原始 content（含 text + tool_use 块） */
  assistantContent: unknown[]
  stopReason: string
}

/**
 * 单轮 agent loop：LLM → tool 调度（委托 pipeline）→ tool_result 追加。
 *
 * 入参 tools 是注册表（E-2 工具面填 getAllBaseTools）；本纵切不造全局注册表，
 * 由调用方注入（测试用 fake tool，非 tautology——loop 的 LLM 调用 / 解析 / 追加即被测能力）。
 * 工具执行接缝（权限 E-4 / 钩子 E-5 / MCP E-2 / 并发 E-1b）在 pipeline 内；
 * spine 走薄语义（放行 / 无操作 / 未注册），需注入接缝者直接调 pipeline 的 executeToolUse/runToolBatch。
 */
export async function queryOneRound(
  deps: AgentLoopDeps,
  tools: Tools,
  messages: Message[],
): Promise<AgentRoundResult> {
  const resp = await deps.modelProvider.chat({
    messages,
    role: deps.role,
    signal: deps.signal,
  })

  const assistantContent: unknown[] = resp.message.content ?? []
  const assistantMsg: AssistantMessage = {
    type: 'assistant',
    role: 'assistant',
    uuid: resp.uuid,
    timestamp: resp.timestamp,
    stop_reason: resp.message.stop_reason,
    message: resp.message,
  }

  const toolUses = assistantContent.filter(
    (c): c is ToolUseBlock => !!c && (c as { type?: string }).type === 'tool_use',
  )

  // loop 内工具执行委托 pipeline（T-2）：find→权限门→validate→hooks→call→mapResult→result 追加
  const outcomes = await runToolBatch(toolUses, assistantMsg, { tools })
  const toolResults = outcomes.map((o) => ({
    toolUseId: o.toolUseId,
    name: o.name,
    block: o.block,
  }))
  const resultMessages = outcomes.map((o) => ({
    type: 'user',
    role: 'user',
    message: { role: 'user', content: [o.block] },
  }))

  return {
    messages: [...messages, assistantMsg, ...resultMessages],
    toolResults,
    assistantContent,
    stopReason: resp.message.stop_reason,
  }
}
