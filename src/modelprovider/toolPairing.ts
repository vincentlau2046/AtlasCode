/**
 * modelprovider — wire 终态数组 tool-pairing 防御层（wave0190 任务 A 层 2）。
 *
 * 语义对齐上游 2.1.88 `ensureToolResultPairing`（messages.ts:5133；AtlasCode 架构内
 * 自含实现，非 vendor）：落点 = **toOpenAIMessages 终态数组出口**（锁面批注 §5.1，
 * 上游 claude.ts:1136 同为 API 发送前终态数组检查）——入口前置检查有被 attachment
 * 三段处置等下游变换再破配对的绕行风险，出口检查对全源孤儿（resume/裁剪/microcompact/
 * 投影分叉）统一兜底。分层互补：层 1（engine/context/keepWindow.ts）选择时保良好输入，
 * 本层（API 时）兜畸形输入。
 *
 * 双向修复（只触 tool_calls/tool_result 形，零 attachment 语义越权——0.1.89 登记面
 * 不动）：
 *  - 正向：assistant tool_calls 缺 result → 紧随 assistant 合成 error result
 *    （role:'tool' 纯文本 + 回指 tool_call_id）；
 *  - 反向：孤儿 tool_result（tool_call_id 无前驱 assistant tool_calls 配对，含
 *    `tool_use_id ?? ''` 残面空 id）→ 剥除。
 *
 * 留痕（禁静默，0.1.89 attachmentProjection 同纪律）：AtlasCode 无 telemetry sink
 * （0.1.89 已删）→ logForDebugging + 返回值 repaired 记录（判别单测可断言）。
 * 合法全配对对话零修复零扰动（输出引用恒等——防御层 no-op 直证面）。
 */
import { logForDebugging } from '../shared'

/** 合成 error result 文本锚（token 锚 090-02）。 */
export const SYNTHETIC_TOOL_RESULT_CONTENT =
  '[tool result missing from conversation history — synthesized to preserve tool_calls/tool_result pairing. The original result was lost to compaction, resume truncation, or a malformed transcript; treat the tool as having failed and proceed.]'

export interface ToolPairingRepair {
  /** 修复后的 wire 数组（无修复时 = 输入引用恒等，零重建）。 */
  messages: any[]
  /** 正向修复：补合成 result 的 tool_call_id（按 wire 顺序）。 */
  syntheticToolCallIds: string[]
  /** 反向修复：被剥除孤儿的 tool_call_id（按 wire 顺序）。 */
  strippedOrphanToolCallIds: string[]
}

/**
 * wire 终态数组 tool-pairing 防御（纯函数）。
 * 无孤儿且无缺 result 时返回输入引用恒等（零扰动）。
 */
export function ensureToolResultPairing(messages: any[]): ToolPairingRepair {
  // 1) 前驱 tool_call id 全集（assistant.tool_calls 扫描）
  const knownCallIds = new Set<string>()
  for (const m of messages) {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) {
        if (typeof c?.id === 'string') knownCallIds.add(c.id)
      }
    }
  }

  // 2) 反向：剥孤儿 tool_result
  const strippedOrphanToolCallIds: string[] = []
  const kept: any[] = []
  for (const m of messages) {
    if (m?.role === 'tool') {
      const id = m.tool_call_id
      if (typeof id !== 'string' || !knownCallIds.has(id)) {
        strippedOrphanToolCallIds.push(typeof id === 'string' ? id : '')
        continue
      }
    }
    kept.push(m)
  }

  // 3) 正向：逐 assistant 检查其后（下一 assistant 前）result 覆盖；缺则紧随合成
  const syntheticToolCallIds: string[] = []
  const out: any[] = []
  for (let i = 0; i < kept.length; i++) {
    const m = kept[i]
    out.push(m)
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      // 该 assistant 之后、下一 assistant 之前的 result id 集
      const covered = new Set<string>()
      for (let j = i + 1; j < kept.length; j++) {
        if (kept[j]?.role === 'assistant') break
        if (kept[j]?.role === 'tool' && typeof kept[j].tool_call_id === 'string') {
          covered.add(kept[j].tool_call_id)
        }
      }
      const missing = m.tool_calls.filter(
        (c: any) => typeof c?.id === 'string' && !covered.has(c.id),
      )
      for (const c of missing) {
        out.push({ role: 'tool', tool_call_id: c.id, content: SYNTHETIC_TOOL_RESULT_CONTENT })
        syntheticToolCallIds.push(c.id)
      }
    }
  }

  // 4) 留痕（禁静默）：修复发生时 logForDebugging（无修复零日志零重建）
  if (syntheticToolCallIds.length > 0 || strippedOrphanToolCallIds.length > 0) {
    logForDebugging(
      `ensureToolResultPairing repaired wire at projection exit: +${syntheticToolCallIds.length} synthetic result(s) [${syntheticToolCallIds.join(',')}] -${strippedOrphanToolCallIds.length} orphan result(s) [${strippedOrphanToolCallIds.join(',')}]`,
      { level: 'warn' },
    )
    return { messages: out, syntheticToolCallIds, strippedOrphanToolCallIds }
  }
  return { messages, syntheticToolCallIds, strippedOrphanToolCallIds }
}
