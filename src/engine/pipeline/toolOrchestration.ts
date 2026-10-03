/**
 * engine/pipeline — 一轮 tool 批次编排（§8.21 E-1 窄 spine T-2，旧仓 toolOrchestration 裁剪版）
 *
 * 把一轮 assistant 的多个 tool_use 分区（连续 concurrency-safe 归一批，非 safe 单独成批）
 * 后执行。窄 spine 全部批次串行跑（concurrency 接缝 = 1）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 分区用真 `tool.isConcurrencySafe(input)`（旧仓 partitionToolCalls 同语义；throws 保守判非 safe）。
 *   - 窄 spine 串行：连 safe 批也串行跑（concurrency 接缝留此）——
 *     E-1b 把 safe 批换成并发池（`ATLAS_MAX_TOOL_USE_CONCURRENCY` 默认 10，旧仓
 *     StreamingToolExecutor + runToolsConcurrently）；本版不预造并发池。
 *   - MCP 路由接缝（E-2）/ 工具级流式（E-1b）不在批量层，见 toolExecution 残留守。
 */
import type { AssistantMessage, ToolResultBlockParam, ToolUseBlock } from '../../shared'
import { executeToolUse, findTool, type PipelineDeps } from './toolExecution'

export type ToolBatch = { isConcurrencySafe: boolean; blocks: ToolUseBlock[] }

/**
 * 按 concurrency-safe 分区（旧仓 partitionToolCalls 真语义）：
 * 连续 safe 工具归一批，非 safe 各自单独成批。未知 tool 保守判非 safe。
 */
export function partitionToolCalls(
  toolUses: ToolUseBlock[],
  tools: Parameters<typeof findTool>[0],
): ToolBatch[] {
  return toolUses.reduce((acc: ToolBatch[], tu) => {
    const tool = findTool(tools, tu.name)
    let safe = false
    try {
      safe = tool ? tool.isConcurrencySafe(tu.input) : false
    } catch {
      // isConcurrencySafe throws（如 shell-quote 解析失败）→ 保守判非 concurrency-safe（旧仓同语义）。
      safe = false
    }
    if (safe && acc[acc.length - 1]?.isConcurrencySafe) {
      acc[acc.length - 1]!.blocks.push(tu)
    } else {
      acc.push({ isConcurrencySafe: safe, blocks: [tu] })
    }
    return acc
  }, [])
}

export interface ToolBatchOutcome {
  toolUseId: string
  name: string
  block: ToolResultBlockParam
  isError: boolean
  /** G1（#258）：工具原生 Output 透传（挂法见 toolExecution ToolExecutionOutcome 头注）。 */
  toolUseResult?: unknown
}

/**
 * 执行一轮 tool 批次（窄 spine：全串行）。E-1b 接缝：safe 批换并发池（MAX_TOOL_USE_CONCURRENCY）。
 */
export async function runToolBatch(
  toolUses: ToolUseBlock[],
  assistantMsg: AssistantMessage,
  deps: PipelineDeps,
): Promise<ToolBatchOutcome[]> {
  const outcomes: ToolBatchOutcome[] = []
  for (const batch of partitionToolCalls(toolUses, deps.tools)) {
    // 窄 spine：批次内串行（含 safe 批）。E-1b 接缝：safe 批并发池在此替换。
    for (const tu of batch.blocks) {
      const r = await executeToolUse(tu, assistantMsg, deps)
      outcomes.push({
        toolUseId: tu.id,
        name: tu.name,
        block: r.block,
        isError: r.isError,
        toolUseResult: r.toolUseResult,
      })
    }
  }
  return outcomes
}
