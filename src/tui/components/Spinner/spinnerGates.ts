/**
 * #250 concern 3（issule-analyst 专项）：spinner 早显时间门。
 *
 * 旧行为：timer + token 计数共用 30s 门（SHOW_TOKENS_AFTER_MS=30_000）——回合前
 * 30 秒状态行只有 spinner+glitter 消息，用户看不到「在处理多久 / 已出多少
 * token」，感知面滞后。新行为拆双门：
 *   - timer：1s 后显（快速「在处理」反馈，formatDuration 起步即 1s 起跳）
 *   - tokens：5s 后显（给首响应留缓冲；totalTokens > 0 值门在组件侧
 *     showTokens 保留——5s 内无输出 token 不显 0 计数闪帧）
 * verbose / hasRunningTeammates 两路强制显（原语义不变）。
 *
 * 纯函数面（判别单测 tests/unit/spinner-gates.test.ts）；.tsx 侧只留最小
 * 调用（编译态 .tsx 最小插入约定）。
 *
 * 裁定（记 #250）：可选「getTurnOutputTokens 真计数」不接——getTokenCounter
 * 本仓是 OTel no-op（bootstrapState 残留守 `() => null`），真 usage 计数走
 * cost-tracker session 面（非 turn 面）；spinner 是流式进度指示器，
 * chars/4 响应长度估计值（随流式增长平滑动画）是正确信号，真 usage 只在
 * 每次 API 响应完成时跳变，作 spinner 进度反而更滞后。留前向缝。
 */

/** timer 显形阈值（effectiveElapsedMs 严格大于此值才显）。 */
export const SHOW_TIMER_AFTER_MS = 1_000

/** token 计数显形阈值（effectiveElapsedMs 严格大于此值才显）。 */
export const SHOW_TOKENS_AFTER_MS = 5_000

export interface SpinnerDisplayGatesInput {
  /** verbose 模式强制显（原语义）。 */
  verbose: boolean
  /** 有在跑 teammate 时强制显（原语义）。 */
  hasRunningTeammates: boolean
  /** 有效已耗时（teammate 场景取 max(leader elapsed, turn 锚点 elapsed)）。 */
  effectiveElapsedMs: number
}

export interface SpinnerDisplayGates {
  wantsTimer: boolean
  wantsTokens: boolean
}

/**
 * 时间门纯函数：timer 1s / tokens 5s 双门。
 * 单调性：wantsTokens 为真时 wantsTimer 必真（5s 门 ⊆ 1s 门）。
 */
export function getSpinnerDisplayGates(
  input: SpinnerDisplayGatesInput,
): SpinnerDisplayGates {
  const { verbose, hasRunningTeammates, effectiveElapsedMs } = input
  const forceShow = verbose || hasRunningTeammates
  return {
    wantsTimer: forceShow || effectiveElapsedMs > SHOW_TIMER_AFTER_MS,
    wantsTokens: forceShow || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS,
  }
}
