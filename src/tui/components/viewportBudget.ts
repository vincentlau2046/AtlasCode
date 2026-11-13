/**
 * Inline 视口压缩器纯预算面（0.1.102 P0 切片 3，lock-face ④ 三钉）。
 *
 * 问题（用户 P0 #3）：默认 inline 模式（FullscreenLayout 非全屏支）无钉底
 * 机制——消息流动态渲染 + 输入框在渲染树尾部，帧高 > 终端行数时终端原生
 * 滚动接管，输入框被推出视口。本模块 = 预算分配的纯函数层（React-free，
 * 判别单测面）；测量/收缩反馈环在 `InlineViewportCompressor.tsx`。
 *
 * 三钉（lock-face ④，f4 批复 2026-11-12）：
 * - 钉① 截断锚单源：消息区截断复用 `computeSliceStart`（Messages.tsx，
 *   UUID 锚 SliceAnchor），本模块只产出「剩余行数预算」（cap 参），
 *   禁第二截断实现。「N 条已入滚动区」提示行行数 = start 之前被截消息数。
 * - 钉② 小终端退化规则：<5 行完全退化（不做布局手术，终端原生滚动接管）；
 *   <20 行保底集（输入框单行 + 错误/提示行 + 「N 条已入滚动区」1 行，
 *   消息区全额归滚动区 = cap 0）；≥20 行走正常预算分配序。
 * - 钉③ 流式单帧超限竞态定形：流式块常数帽 STREAMING_BLOCK_CAP_ROWS——
 *   预算分配序 = 输入框/提示行全保 → 流式块限高（超出折叠入「已入滚动区」
 *   计数）→ 消息区自尾截断。流式块按帽截断后单帧总高恒 ≤ 预算 + 提示行
 *   （判据格「流式单帧超限不破钉底格」的实现本体）。
 */

/** 流式块行数常数帽（钉③；f4 认可三常数之一）。 */
export const STREAMING_BLOCK_CAP_ROWS = 24

/** <MIN_SURGERY_ROWS 行（极端终端）→ 完全退化：不做布局手术（钉②）。 */
export const MIN_SURGERY_ROWS = 5

/** <MIN_COMPRESS_ROWS 行 → 保底集（消息区全额归滚动区）（钉②）。 */
export const MIN_COMPRESS_ROWS = 20

/** 视口预算方案（computeViewportPlan 产出）。 */
export type ViewportPlan =
  | { mode: 'degraded' }
  | { mode: 'fallback' }
  | {
      mode: 'compress'
      /** 剩余行数预算 = 视口行数 − 预留行（输入框/提示行）− 流式块帽。传
       *  computeSliceStart 的 cap 参（钉① 延展形）；Messages 侧每消息 ≥1 行，
       *  测量环（InlineViewportCompressor）按实测溢出再收缩。 */
      messageBudgetRows: number
      /** 流式块实际保留行数 = min(实际, STREAMING_BLOCK_CAP_ROWS)。 */
      streamingCapRows: number
    }

/**
 * 预算分配序（钉③）：输入框/提示行全保（reservedRows 原样扣）→ 流式块限高
 * （streamingRows 截到帽）→ 消息区自尾截断（剩余 = messageBudgetRows）。
 * 边界（钉②）：viewportRows < 5 → degraded；< 20 → fallback；否则 compress。
 * 非法输入（非有限/负数）按 0 夹紧，fail-visible 交由调用方退化支。
 */
export function computeViewportPlan(
  viewportRows: number,
  reservedRows: number,
  streamingRows = 0,
): ViewportPlan {
  const rows = Number.isFinite(viewportRows) ? Math.max(0, Math.floor(viewportRows)) : 0
  if (rows < MIN_SURGERY_ROWS) return { mode: 'degraded' }
  if (rows < MIN_COMPRESS_ROWS) return { mode: 'fallback' }
  const streaming = Number.isFinite(streamingRows) ? Math.max(0, Math.floor(streamingRows)) : 0
  const reserved = Number.isFinite(reservedRows) ? Math.max(0, Math.floor(reservedRows)) : 0
  // 流式块限高第二重：窄视口下让位于「输入框全保 + 视口本身」——
  // 单帧总高恒 ≤ 视口（判据格「流式单帧超限不破钉底格」）。
  const streamingCapRows = Math.min(streaming, STREAMING_BLOCK_CAP_ROWS, Math.max(0, rows - reserved))
  const messageBudgetRows = Math.max(0, rows - reserved - streamingCapRows)
  return { mode: 'compress', messageBudgetRows, streamingCapRows }
}

/** Messages 消费形：capRows 传 computeSliceStart；streamingCapRows = 流式块
 *  实际帽（plan 已按视口二次限高；不在场时 Messages 用 STREAMING_BLOCK_CAP_ROWS
 *  常数帽）；suppressStreaming 仅保底集（fallback）置真——保底集 = 输入框 +
 *  错误/提示行 + 提示行，流式块不占行。undefined = 压缩器不在场（全屏路径 /
 *  退化态）→ Messages 缺省 200 行为。 */
export type ViewportRenderCap = {
  capRows: number
  streamingCapRows: number
  suppressStreaming: boolean
}

/**
 * plan → 消费形（compress 支叠加测量环收缩量 shrinkRows——实测溢出
 * 收缩只作用于消息区预算，不回改 plan 本身）。
 */
export function resolveRenderCap(plan: ViewportPlan, shrinkRows = 0): ViewportRenderCap | undefined {
  switch (plan.mode) {
    case 'degraded':
      return undefined
    case 'fallback':
      return { capRows: 0, streamingCapRows: 0, suppressStreaming: true }
    case 'compress':
      return {
        capRows: Math.max(0, plan.messageBudgetRows - Math.max(0, shrinkRows)),
        streamingCapRows: plan.streamingCapRows,
        suppressStreaming: false,
      }
  }
}

/**
 * 流式块常数帽（钉③）：按行截尾保尾（最近内容在屏，早行折叠）。返回
 * 截后文本 + 溢出行数（调用方折叠入「已入滚动区」计数提示）。
 * 联动断言（判据格「流式单帧超限不破钉底格」）：任意输入，输出行数
 * ≤ cap ≤ STREAMING_BLOCK_CAP_ROWS。
 */
export function capStreamingText(
  text: string,
  cap = STREAMING_BLOCK_CAP_ROWS,
): { text: string; overflowRows: number } {
  const lines = text.split('\n')
  const limit = Math.max(0, cap)
  if (lines.length <= limit) return { text, overflowRows: 0 }
  return {
    text: lines.slice(-limit).join('\n'),
    overflowRows: lines.length - limit,
  }
}
