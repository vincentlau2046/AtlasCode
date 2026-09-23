/**
 * engine/query — QueryEngine 封装（§8.21 E-1 窄 spine T-1）
 *
 * 旧仓 core/orchestrator/QueryEngine.ts（1241L）的 ask() 最小纵切：把单轮
 * queryOneRound 包成对外入口 ask(modelProvider, { messages, tools, role, signal })。
 *
 * 残留守：旧仓 ask() 的完整面（session 持久化 / coordinator 用户上下文 / MCP 连接 /
 * 附件注入 / fileHistory 快照 / 结构化输出强制 / 压缩编排）归 E-1b/E-2，本纵切只保留
 * 「一次 LLM→tool→result 单轮」的最小可跑面。
 */
import type { Message, Tools } from '../../shared'
import type { ModelProvider, ModelRole } from '../../modelprovider'
import { queryOneRound, type AgentRoundResult } from './loop'

export interface AskArgs {
  messages: Message[]
  tools?: Tools
  role?: ModelRole
  signal?: AbortSignal
}

/**
 * 单轮 agent loop 入口（最小纵切）。多轮续跑 = 上层循环调用 ask（E-1b 落 while(true)）。
 */
export async function ask(
  modelProvider: ModelProvider,
  args: AskArgs,
): Promise<AgentRoundResult> {
  const deps = {
    modelProvider,
    role: args.role ?? ('small' as ModelRole),
    signal: args.signal,
  }
  return queryOneRound(deps, args.tools ?? [], args.messages)
}
