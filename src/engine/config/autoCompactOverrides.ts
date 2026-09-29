/**
 * engine/config — autoCompact env 覆写读侧（§8.29 E-3 S-3d：旧仓 autoCompact.ts
 * 三 env 覆写收拢至 config 面，S-3b 前 autoCompact 头注残留守③ 核销）
 *
 * 三变量（旧仓 autoCompact.ts 语义 + 解析 guard 逐字）：
 *   - ATLAS_AUTOCOMPACT_PCT_OVERRIDE = 有效窗口百分比（autoCompact.ts:79，
 *     有效域 (0,100]，越界忽略）
 *   - ATLAS_AUTO_COMPACT_WINDOW = 上下文窗口 cap（autoCompact.ts:40，>0 有效）
 *   - DISABLE_COMPACT = 总开关（autoCompact.ts:148 isEnvTruthy；新仓收拢为
 *     AutoCompactDeps.enabled 判定面）
 *
 * 残留守登记（H6 防空洞）：
 *   - 五变量消费面 = AutoCompactDeps.pctOverride / windowOverride / enabled
 *     （engine/context/autoCompact.ts）+ calculateTokenWarningState 参数面
 *     （autoCompactEnabled / blockingLimitOverride）——无生产调用点 = 预声明
 *     消费接缝（消费方 = E-wave-end 组合根 loop deps 装配 + W3 TUI 活链路
 *     装配，当前仅测试消费）。
 *   - W2-2-pre 扩面①（§8.74.2 缺面先迁①配套）：DISABLE_AUTO_COMPACT（旧仓
 *     autoCompact.ts:152 细粒度开关，isEnvTruthy）+ ATLAS_BLOCKING_LIMIT_OVERRIDE
 *     （旧仓 :127 TUI warning 态面，parseInt >0 有效）收拢至本读侧（解析 guard
 *     与旧仓逐字）。
 */
import { isEnvTruthy } from '../../shared'

export interface AutoCompactEnvOverrides {
  /** ATLAS_AUTOCOMPACT_PCT_OVERRIDE（有效域 (0,100]；越界/未设 = undefined 无覆写）。 */
  pctOverride?: number
  /** ATLAS_AUTO_COMPACT_WINDOW（窗口 cap；>0 有效，越界/未设 = undefined）。 */
  windowOverride?: number
  /** DISABLE_COMPACT（isEnvTruthy → true = 关 auto-compact；映射 deps.enabled）。 */
  disabled?: boolean
  /**
   * DISABLE_AUTO_COMPACT（W2-2-pre 扩面①，旧仓 :152 细粒度开关 isEnvTruthy →
   * true = 关 auto-compact 但保留手动 /compact；映射 isAutoCompactEnabled 纯函数面）。
   */
  autoCompactDisabled?: boolean
  /**
   * ATLAS_BLOCKING_LIMIT_OVERRIDE（W2-2-pre 扩面①，旧仓 :127 TUI warning 态面
   * parseInt >0 有效，越界/未设 = undefined；映射 calculateTokenWarningState）。
   */
  blockingLimitOverride?: number
}

/**
 * 读 autoCompact 三 env 覆写（config 面拥有解析语义，unit 可隔离测；
 * 调用方把结果填进 AutoCompactDeps，旧仓「阈值计算时读 env」行为等价——
 * 解析 guard 在 config 面与 autoCompact 阈值面双处保留，raw 注入亦安全）。
 */
export function getAutoCompactEnvOverrides(): AutoCompactEnvOverrides {
  const overrides: AutoCompactEnvOverrides = {}

  const pct = parseFloat(process.env['ATLAS_AUTOCOMPACT_PCT_OVERRIDE'] ?? '')
  if (!Number.isNaN(pct) && pct > 0 && pct <= 100) {
    overrides.pctOverride = pct
  }

  const windowTokens = parseInt(
    process.env['ATLAS_AUTO_COMPACT_WINDOW'] ?? '',
    10,
  )
  if (!Number.isNaN(windowTokens) && windowTokens > 0) {
    overrides.windowOverride = windowTokens
  }

  if (isEnvTruthy(process.env['DISABLE_COMPACT'])) {
    overrides.disabled = true
  }

  // W2-2-pre 扩面①（旧仓 autoCompact.ts:152 / :127 解析 guard 逐字）
  if (isEnvTruthy(process.env['DISABLE_AUTO_COMPACT'])) {
    overrides.autoCompactDisabled = true
  }
  const blockingLimit = parseInt(
    process.env['ATLAS_BLOCKING_LIMIT_OVERRIDE'] ?? '',
    10,
  )
  if (!Number.isNaN(blockingLimit) && blockingLimit > 0) {
    overrides.blockingLimitOverride = blockingLimit
  }

  return overrides
}
