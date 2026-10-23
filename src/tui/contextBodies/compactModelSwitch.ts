/**
 * 0.1.80 V3-1 K1-C① — 主循环模型切换 previous-model 记录（React-free store）
 *
 * 上游 299 症状：大窗模型 → 小窗模型切换后，auto-compact 摘要立刻用小窗
 * 模型，而此刻上下文还是按大窗攒的——摘要请求更易撞小窗 PTL，且摘要质量
 * 降级。修法 = 切换点记录前模型，压缩摘要解析时若**前模型窗 > 当前模型窗**
 * 则摘要先用前（大窗）模型。
 *
 * 设计裁定（Main，随波记入工单 §0）：
 *  - **sticky-peek 非 one-shot**：记录不因消费清除，直至下一次切换覆写。
 *    理由 = compactConversation PTL 截头重试链会在同一压缩内多次进
 *    streamCompactSummary，one-shot 消费会让重试请求回落小窗模型（同一
 *    压缩内模型漂移）；sticky 使整段压缩（含重试）模型稳定。"悄悄耗额度"
 *    面由 K1-C②（compact_start 显形摘要模型）补齐，不靠 one-shot。
 *  - 窗查询 = getProviderContextWindow ?? HARD_DEFAULT_CONTEXT_WINDOW
 *    （K1-B① basename 回落在链内：`prefix/model` 前缀名取裸名声明窗）。
 *  - 前窗 ≤ 当前窗 → 不替换（大→小方向才换；小→大本就用大模型）。
 *
 * compactWarningStore 同款先例：React-free 模块态，hook/组件留 tui 壳。
 */
import { getProviderContextWindow, HARD_DEFAULT_CONTEXT_WINDOW } from 'src/modelprovider'

let previousMainLoopModel: string | null = null

/**
 * 主循环模型切换单点记录（onChangeAppState 两分支调用）。
 * previous 为空（首启/回默认）或与 next 同名 → 清记录（无可换面）。
 */
export function recordMainLoopModelSwitch(
  previous: string | null | undefined,
  next: string | null | undefined,
): void {
  if (!previous || previous === next) {
    previousMainLoopModel = null
    return
  }
  previousMainLoopModel = previous
}

/**
 * 压缩摘要模型解析（compact.ts streamCompactSummary 接线，优先级链 =
 * modelOverride（D-3 fallback 支）→ 本解析 → mainLoopModel）。
 * sticky-peek：不消费记录（见头注设计裁定）。
 */
export function resolveSwitchedCompactModel(
  current: string | undefined,
): string | undefined {
  const previous = previousMainLoopModel
  if (!previous || !current || previous === current) return undefined
  const previousWindow =
    getProviderContextWindow(previous) ?? HARD_DEFAULT_CONTEXT_WINDOW
  const currentWindow =
    getProviderContextWindow(current) ?? HARD_DEFAULT_CONTEXT_WINDOW
  return previousWindow > currentWindow ? previous : undefined
}

/** K1-C② compact_start spinner 文案 — 摘要模型显式化（不"悄悄"耗额度 @301）。 */
export function formatCompactStartMessage(
  summaryModel: string | undefined,
): string {
  return summaryModel
    ? `Compacting conversation (summary: ${summaryModel})`
    : 'Compacting conversation'
}

/** 测试隔离：清模块态记录。 */
export function resetCompactModelSwitchForTesting(): void {
  previousMainLoopModel = null
}
