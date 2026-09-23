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
 *   - 三变量消费面 = AutoCompactDeps.pctOverride / windowOverride / enabled
 *     （engine/context/autoCompact.ts）——无生产调用点 = 预声明消费接缝（消费
 *     方 = E-wave-end 组合根 loop deps 装配，当前仅测试消费）。
 *   - 旧仓 DISABLE_AUTO_COMPACT（细粒度开关）+ ATLAS_BLOCKING_LIMIT_OVERRIDE
 *     （TUI warning 态面 calculateTokenWarningState）未收拢（不在 §8.27 三变量
 *     清单；caller enabled 判定面 / TUI 面残留守）。
 */
import { isEnvTruthy } from '../../shared'

export interface AutoCompactEnvOverrides {
  /** ATLAS_AUTOCOMPACT_PCT_OVERRIDE（有效域 (0,100]；越界/未设 = undefined 无覆写）。 */
  pctOverride?: number
  /** ATLAS_AUTO_COMPACT_WINDOW（窗口 cap；>0 有效，越界/未设 = undefined）。 */
  windowOverride?: number
  /** DISABLE_COMPACT（isEnvTruthy → true = 关 auto-compact；映射 deps.enabled）。 */
  disabled?: boolean
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

  return overrides
}
