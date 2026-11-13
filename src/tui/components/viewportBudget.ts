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

/**
 * 单条消息行级尾保帽（gate-102 re-gate t107 G5d 修形，f4 D 批复 2026-11-13）：
 * 与 STREAMING_BLOCK_CAP_ROWS 同值同族语义（tail 保尾）。帧高严格有界 ⇒
 * compress 收缩步进必消除溢出 ⇒ surrender 仅剩 bottom 槽超视口极端域。
 * ⚠️ 与钉① 单源边界：钉① = 消息条数 slice 面（computeSliceStart），
 * 本帽 = 单条内容行级面（渲染前文本截断），两层不冲突，禁混源。
 */
export const MESSAGE_TAIL_CAP_ROWS = 24

/** <MIN_SURGERY_ROWS 行（极端终端）→ 完全退化：不做布局手术（钉②）。 */
export const MIN_SURGERY_ROWS = 5

/** <MIN_COMPRESS_ROWS 行 → 保底集（消息区全额归滚动区）（钉②）。 */
export const MIN_COMPRESS_ROWS = 20

/** 视口预算方案（computeViewportPlan 产出）。 */
export type ViewportPlan =
  | { mode: 'degraded' }
  | {
      mode: 'fallback'
      /** 单条消息行级尾保帽（重冻判据 2 可见性底线格：fallback 禁零渲染，
       *  恒渲染最新 1 条消息 tail 行）。 */
      messageTailCapRows: number
    }
  | {
      mode: 'compress'
      /** 剩余行数预算 = 视口行数 − 预留行（输入框/提示行）− 流式块帽。传
       *  computeSliceStart 的 cap 参（钉① 延展形）；Messages 侧每消息 ≥1 行，
       *  测量环（InlineViewportCompressor）按实测溢出再收缩。 */
      messageBudgetRows: number
      /** 流式块实际保留行数 = min(实际, STREAMING_BLOCK_CAP_ROWS)。 */
      streamingCapRows: number
      /** 单条消息行级尾保帽 = max(1, min(MESSAGE_TAIL_CAP_ROWS, 预算))——
       *  帧高严格有界 ⇒ 收缩步进必消除溢出（t107 G5d 修形本体）。 */
      messageTailCapRows: number
    }

/**
 * fallback 形单条消息行级尾保帽：max(1, min(MESSAGE_TAIL_CAP_ROWS,
 * rows − reserved − 提示行 1))。 surrendered 形与钉② <20 行保底集共用。
 */
export function fallbackTailCapRows(viewportRows: number, reservedRows: number): number {
  const rows = Number.isFinite(viewportRows) ? Math.max(0, Math.floor(viewportRows)) : 0
  const reserved = Number.isFinite(reservedRows) ? Math.max(0, Math.floor(reservedRows)) : 0
  return Math.max(1, Math.min(MESSAGE_TAIL_CAP_ROWS, rows - reserved - 1))
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
  if (rows < MIN_COMPRESS_ROWS) {
    return { mode: 'fallback', messageTailCapRows: fallbackTailCapRows(rows, reservedRows) }
  }
  const streaming = Number.isFinite(streamingRows) ? Math.max(0, Math.floor(streamingRows)) : 0
  const reserved = Number.isFinite(reservedRows) ? Math.max(0, Math.floor(reservedRows)) : 0
  // 流式块限高第二重：窄视口下让位于「输入框全保 + 视口本身」——
  // 单帧总高恒 ≤ 视口（判据格「流式单帧超限不破钉底格」）。
  const streamingCapRows = Math.min(streaming, STREAMING_BLOCK_CAP_ROWS, Math.max(0, rows - reserved))
  const messageBudgetRows = Math.max(0, rows - reserved - streamingCapRows)
  // 单条消息行级尾保帽（t107 G5d 修形）：帧高严格有界 ⇒ 收敛性成立。
  const messageTailCapRows = Math.max(1, Math.min(MESSAGE_TAIL_CAP_ROWS, messageBudgetRows))
  return { mode: 'compress', messageBudgetRows, streamingCapRows, messageTailCapRows }
}

/**
 * 实测收缩环有界重试上限（gate-102 RED 修形，f4 冻结判据 2：建议 ≤2 次）。
 * 同一溢出 episode（连续溢出帧）内至多收缩 2 次；耗尽仍溢出 → surrender
 * （锁 fallback 保底形），禁无限 setState 自激。
 */
export const MAX_SHRINK_ATTEMPTS = 2

/** 实测收缩环单步决策（resolveShrinkDecision 产出）。 */
export type ShrinkDecision =
  | { action: 'hold' }
  | { action: 'shrink'; shrinkRows: number }
  | { action: 'surrender' }

/**
 * 收缩环单步决策（gate-102 RED 修形，f4 冻结判据 1+2）：
 * - 无溢出 → hold（episode 清零）；
 * - 溢出且 episode 内收缩次数未耗尽 → shrink，收缩量钳制 = 实测溢出行数
 *   （禁 +1 盲加；是否真消除由下一次测量验证，不在本步盲断）；
 * - episode 内收缩 ≥ MAX_SHRINK_ATTEMPTS 次仍溢出 → surrender（不可收敛
 *   降级：调用方落 fallback 保底形并停止 setState，禁无限自激）。
 */
export function resolveShrinkDecision(overflowRows: number, attempts: number): ShrinkDecision {
  if (!(overflowRows > 0)) return { action: 'hold' }
  if (attempts >= MAX_SHRINK_ATTEMPTS) return { action: 'surrender' }
  return { action: 'shrink', shrinkRows: overflowRows }
}

/** Messages 消费形：capRows 传 computeSliceStart（钉① 条数 slice 面）；
 *  messageTailCapRows = 单条消息行级尾保帽（t107 G5d 修形，渲染前文本
 *  截断面——两层边界见 MESSAGE_TAIL_CAP_ROWS 注记）；streamingCapRows =
 *  流式块实际帽（不在场时 Messages 用 STREAMING_BLOCK_CAP_ROWS 常数帽）；
 *  suppressStreaming 仅 fallback 置真。undefined = 压缩器不在场（全屏路径 /
 *  退化态）→ Messages 缺省 200 行为。 */
export type ViewportRenderCap = {
  capRows: number
  streamingCapRows: number
  suppressStreaming: boolean
  messageTailCapRows: number
}

/**
 * plan → 消费形（compress 支叠加测量环收缩量 shrinkRows——实测溢出
 * 收缩只作用于消息区预算，不回改 plan 本身）。fallback 形（重冻判据 2
 * 可见性底线格）：capRows 1 = 恒渲染最新 1 条消息（行级帽 tail），禁
 * 零渲染全盲；流式块抑制照旧。
 */
export function resolveRenderCap(plan: ViewportPlan, shrinkRows = 0): ViewportRenderCap | undefined {
  switch (plan.mode) {
    case 'degraded':
      return undefined
    case 'fallback':
      return { capRows: 1, streamingCapRows: 0, suppressStreaming: true, messageTailCapRows: plan.messageTailCapRows }
    case 'compress':
      return {
        capRows: Math.max(0, plan.messageBudgetRows - Math.max(0, shrinkRows)),
        streamingCapRows: plan.streamingCapRows,
        suppressStreaming: false,
        messageTailCapRows: plan.messageTailCapRows,
      }
  }
}

/**
 * 行级尾保通用形（钉③ 流式块 + t107 G5d 修形单条消息内容帽共用——
 * 行级截断逻辑单源，禁第二实现）：按行截尾保尾（最近内容在屏，早行
 * 折叠）。返回截后文本 + 溢出行数（调用方按域选措辞：流式/条数=滚动区
 * 计数，单条内容=「N 行已折叠」）。
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
