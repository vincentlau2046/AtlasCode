/**
 * engine/query — Agent 主循环最小纵切（§8.21 E-1 窄 spine T-1）
 *
 * 跑通 LLM→tool→result 单轮：
 *   取 messages → modelprovider.chat（经 modelprovider 域门面，非直接 new OpenAIProvider）
 *   → 解析 assistant content 里的 tool_use 块
 *   → 经 tools 注册表 find + Tool.call（shared/types.ts 下沉契约）
 *   → 追加 tool_result 消息 → 返回
 *
 * 裁剪版真核心（C-Deep 纵切纪律，残留守头注释防「以为已全」）：
 *   - 本版 = 单轮（一次 LLM + 一批 tool_use）。多轮 while(true) 续跑归 E-1b。
 *   - 残留守（后续纵切）：流式 chatStream（E-1b）/ 上下文压缩 compact（E-1b）/
 *     错误恢复 + stop hooks（E-1b）/ MCP 路由（E-2）/ 附件注入（E-5）/
 *     tokenBudget continuation（E-1b）/ 未知 tool 完整处理（E-2 工具面，本版 is_error 兜底）。
 *
 * port 之下全真：LLM 经 modelprovider 域门面 + Tool.call 契约（shared/types.ts）——
 * 防 H6 空洞等价。engine 消费面：modelprovider（DEP-4 allow）+ shared（门面）。
 */
import type {
  AssistantMessage,
  Message,
  ToolResultBlockParam,
  ToolUseBlock,
  Tools,
} from '../../shared'
import type { ModelProvider, ModelRole } from '../../modelprovider'

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
 * 单轮 agent loop：LLM → tool 调度 → tool_result 追加。
 *
 * 入参 tools 是注册表（E-2 工具面填 getAllBaseTools）；本纵切不造全局注册表，
 * 由调用方注入（测试用 fake tool，非 tautology——loop 的 find/call/mapResult/append
 * 即被测能力）。
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
  const assistantMsg: Message = {
    type: 'assistant',
    uuid: resp.uuid,
    timestamp: resp.timestamp,
    stop_reason: resp.message.stop_reason,
    message: resp.message,
  }

  const toolUses = assistantContent.filter(
    (c): c is ToolUseBlock => !!c && (c as { type?: string }).type === 'tool_use',
  )

  const toolResults: AgentRoundResult['toolResults'] = []
  const resultMessages: Message[] = []
  for (const tu of toolUses) {
    const tool = tools.find(
      (t) => t.name === tu.name || (t.aliases?.includes(tu.name) ?? false),
    )
    if (!tool) {
      // 残留守：未知 tool 完整处理（E-2 工具面）。最小纵切以 is_error tool_result 兜底，
      // 保证 LLM 仍能收到该 tool_use 的回应（不静默丢弃）。
      const block: ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: tu.id,
        content: `unknown tool: ${tu.name}`,
        is_error: true,
      }
      toolResults.push({ toolUseId: tu.id, name: tu.name, block })
      resultMessages.push({ type: 'user', role: 'user', message: { role: 'user', content: [block] } })
      continue
    }
    const res = await tool.call(tu.input, undefined, undefined, assistantMsg as AssistantMessage)
    const block = tool.mapToolResultToToolResultBlockParam(res.data, tu.id)
    toolResults.push({ toolUseId: tu.id, name: tu.name, block })
    resultMessages.push({ type: 'user', role: 'user', message: { role: 'user', content: [block] } })
  }

  return {
    messages: [...messages, assistantMsg, ...resultMessages],
    toolResults,
    assistantContent,
    stopReason: resp.message.stop_reason,
  }
}
