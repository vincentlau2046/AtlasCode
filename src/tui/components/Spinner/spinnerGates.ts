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
  /**
   * 0.1.64 G1：TTFT 期间状态指示门（↑ 字形显形阈值）。已过 1s timer 门即开——
   * mode='requesting' 且本门为真时渲染轻量状态标记（对齐 Claude `Beboppin'…`），
   * 让用户在首 token 前知「请求已发出，等模型开口」。
   */
  wantsStatusIndicator: boolean
}

/**
 * 时间门纯函数：timer 1s / tokens 5s 双门。
 * 单调性：wantsTokens 为真时 wantsTimer 必真（5s 门 ⊆ 1s 门）；
 * wantsStatusIndicator 与 wantsTimer 同阈值（1s 门）。
 */
export function getSpinnerDisplayGates(
  input: SpinnerDisplayGatesInput,
): SpinnerDisplayGates {
  const { verbose, hasRunningTeammates, effectiveElapsedMs } = input
  const forceShow = verbose || hasRunningTeammates
  const wantsTimer = forceShow || effectiveElapsedMs > SHOW_TIMER_AFTER_MS
  return {
    wantsTimer,
    wantsTokens: forceShow || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS,
    wantsStatusIndicator: wantsTimer,
  }
}

/**
 * 0.1.64 G2（#250 concern 3 / 慢模型流式显示对齐）：stall 检测纯函数。
 *
 * 旧行为（useStalledAnimation L42）：`isStalled = timeSinceLastToken > 3000 &&
 * !hasActiveTools`——TTFT 期间（首 token 前 currentResponseLength===0）timer 从挂载
 * 计时，TTFT > 3s 即 spinner 渐变红，强化「卡死」错觉。新行为增
 * `currentResponseLength > 0` 守卫：仅在「已开始流式后中断 > 3s」触发 stall
 * （原语义保留）；TTFT 期间（未收到任何 token）不报 stall。
 *
 * 回归安全（messages.ts onUpdateLength 调用面已验证）：
 *   - thinking_delta（L3092）/ input_json_delta（L3075）/ text delta（L3068）均调
 *     onUpdateLength → 这些阶段 responseLength > 0，不落 G2 抑制分支；
 *   - tool-input 阶段 hasActiveTools=true → stall 已被 `!hasActiveTools` 抑制（原语义）。
 *
 * 抽纯函数面（判别单测 tests/unit/spinner-gates.test.ts）；hook 保留平滑插值/ref 逻辑，
 * 仅 isStalled+stalledIntensity 计算委托本函数。
 */
export interface ComputeStallStateInput {
  timeSinceLastToken: number
  currentResponseLength: number
  hasActiveTools: boolean
}

export interface StallState {
  isStalled: boolean
  stalledIntensity: number
}

/** stall 阈值（timeSinceLastToken 严格大于此值 + 其余条件满足才 stall）。 */
export const STALL_AFTER_MS = 3_000
/** stall 渐变窗（0→1 覆盖的时长，ms）。 */
export const STALL_FADE_MS = 2_000

export function computeStallState(input: ComputeStallStateInput): StallState {
  const { timeSinceLastToken, currentResponseLength, hasActiveTools } = input
  const isStalled =
    timeSinceLastToken > STALL_AFTER_MS &&
    !hasActiveTools &&
    currentResponseLength > 0
  const stalledIntensity = isStalled
    ? Math.min((timeSinceLastToken - STALL_AFTER_MS) / STALL_FADE_MS, 1)
    : 0
  return { isStalled, stalledIntensity }
}
