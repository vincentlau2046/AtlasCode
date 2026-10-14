/**
 * engine/context — autoCompact 窗口档位纯面（#250 concern 2：/autocompact 命令）
 *
 * settings.autoCompactWindow 档位（宿主 tui /autocompact 命令持久化到
 * userSettings）→ 阈值覆写纯 resolver：
 *   - auto：无覆写（engine 缺省 = contextWindow − 20k 摘要预留 − 13k 缓冲）
 *   - off：自动压缩禁用（手动 /compact 不受影响，isAutoCompactEnabled 面消费）
 *   - window：窗口 cap（tokens；getEffectiveContextWindowSize min cap 语义）
 *   - pct：阈值百分比（threshold = min(floor(有效窗口 × pct/100), 基础阈值)，
 *     旧仓 ATLAS_AUTOCOMPACT_PCT_OVERRIDE 同语义）
 *
 * 纯函数面（判别单测 tests/unit/engine-auto-compact-window.test.ts，零 I/O）；
 * settings 源注入缝 = autoCompact.ts setAutoCompactWindowSettingsSource
 * （宿主 contextHostWiring 接线，engine 保 React-free 红线不破）。
 *
 * 合并纪律（消费点 = autoCompact.ts 各 model-string / 0 参形 + agentLoopDeps
 * DI 注入）：env 覆写（ATLAS_AUTOCOMPACT_PCT_OVERRIDE / ATLAS_AUTO_COMPACT_WINDOW
 * / DISABLE_COMPACT / DISABLE_AUTO_COMPACT）胜 settings 档位——显式 CLI/env >
 * 持久化 settings；越界值两侧同纪律（解析 guard 忽略不生效，raw 注入安全）。
 */

/** settings.autoCompactWindow 值形（宿主 zod schema 输出结构匹配；engine 不依赖
 * tui 类型，结构型单源 = 本定义，宿主 schema 对齐本形）。 */
export type AutoCompactWindowSetting =
  | { kind: 'auto' }
  | { kind: 'off' }
  | { kind: 'window'; tokens: number }
  | { kind: 'pct'; pct: number }

/**
 * 0.1.69 D-1（每模型 autocompact 窗口）：per-model 键控档面。
 * `{ [model]: 档位 }` + `default` 兜底键（无该模型档 → default → 缺省）。
 * 宿主 /autocompact 命令写档键 = 当前主循环模型（getMainLoopModel）。
 * 根修面：用户 256K + 1M 混配面——单全局档下设 256K 档切 1M 模型仍被
 * 256K 档封顶（auto-compact 提前触发，1M 窗浪费）；per-model 各取己档。
 */
export type AutoCompactWindowPerModel = {
  default?: AutoCompactWindowSetting
  [model: string]: AutoCompactWindowSetting | undefined
}

/**
 * settings 面 raw 值形：旧单档（#250 期单全局档，遗留持久化数据）|
 * 0.1.69+ per-model 键控档。判别 = 单档必有 `kind` 字段，键控 map 无。
 * 兼容策略（Main 裁定，读侧兼容读）：无数据迁移——旧单档面读时经
 * normalizeAutoCompactWindowSetting 归一为 `default` 键，行为 = 修前精确
 * 同值（零回归锚）；写侧（/autocompact）读改写（旧单档 → default 键 +
 * 当前模型键，单点过渡，无批量迁移）。
 */
export type AutoCompactWindowSettingLike =
  | AutoCompactWindowSetting
  | AutoCompactWindowPerModel

/** 判别器：单档形（kind 字段在场）vs per-model 键控 map。 */
export function isAutoCompactWindowSetting(
  x: AutoCompactWindowSettingLike | null | undefined,
): x is AutoCompactWindowSetting {
  return (
    typeof x === 'object' &&
    x !== null &&
    'kind' in (x as Record<string, unknown>)
  )
}

/** 旧单档 → `{ default: 单档 }` 归一（读侧兼容读单点；无档 → 空 map）。 */
export function normalizeAutoCompactWindowSetting(
  raw: AutoCompactWindowSettingLike | null | undefined,
): AutoCompactWindowPerModel {
  if (!raw) return {}
  if (isAutoCompactWindowSetting(raw)) return { default: raw }
  return raw
}

/** 解析结果（喂 engine 阈值/开关面 + agentLoopDeps AutoCompactDeps 注入）。 */
export interface AutoCompactWindowResolution {
  /** 阈值 pct 覆写（pct 档；有效域 (0,100]，越界忽略）。 */
  pctOverride?: number
  /** 窗口 cap（window 档；≥1000 有效，contextWindow = min(contextWindow, cap)）。 */
  windowOverride?: number
  /** off 档：自动压缩禁用（手动 /compact 不受影响）。 */
  autoCompactDisabled?: boolean
}

/** 预设窗口档位（tokens；/autocompact 选择器 + 单测单一事实源，10k=100_000）。 */
export const AUTOCOMPACT_PRESET_WINDOW_TIERS = [
  100_000,
  128_000,
  200_000,
  256_000,
] as const

/**
 * 单档 → 覆写 resolver（纯函数核）：auto / undefined = 无覆写；off = 禁用；
 * window / pct = 对应覆写槽。越界值不产生覆写（window tokens <1000 /
 * pct 越出 (0,100] → 忽略，raw 注入安全，对齐 env 侧解析 guard 纪律）。
 */
function resolveAutoCompactWindowSingle(
  setting: AutoCompactWindowSetting | null | undefined,
): AutoCompactWindowResolution {
  if (!setting || setting.kind === 'auto') {
    return {}
  }
  if (setting.kind === 'off') {
    return { autoCompactDisabled: true }
  }
  if (setting.kind === 'window') {
    if (Number.isFinite(setting.tokens) && setting.tokens >= 1_000) {
      return { windowOverride: Math.floor(setting.tokens) }
    }
    return {}
  }
  // pct 档
  if (Number.isFinite(setting.pct) && setting.pct > 0 && setting.pct <= 100) {
    return { pctOverride: setting.pct }
  }
  return {}
}

/**
 * 档位 → 覆写 resolver（纯函数，0.1.69 D-1 扩 model 键入参）：
 *   - 1 参调用（model 缺省）= 修前单全局档语义精确同值（旧单档面经归一 =
 *     `default` 键；per-model map 无 model 入参时取 `default` 键）——零回归锚
 *   - 2 参（model 在场）：按模型键取档，无该模型档 → 回落 `default` 键 →
 *     缺省 {}（per-model 各取己档；用户 256K+1M 混配面封顶缺陷根修）
 */
export function resolveAutoCompactWindow(
  setting: AutoCompactWindowSettingLike | null | undefined,
  model?: string,
): AutoCompactWindowResolution {
  const perModel = normalizeAutoCompactWindowSetting(setting)
  const chosen = (model && perModel[model]) || perModel.default
  return resolveAutoCompactWindowSingle(chosen)
}

/**
 * 自定义档位输入解析（/autocompact 选择器自定义框，纯函数）：
 *   - "150k" / " 150 K " → { kind: 'window', tokens: 150_000 }（×1000，≥1k 有效）
 *   - "75%" / "75" → { kind: 'pct', pct: 75 }（裸数 = 百分比；(0,100] 有效）
 *   - 非法（空 / 非数 / 越界，如 "150" = 150% 越界、"0.5k" = 500 < 1k）→
 *     null（调用方保持现选 + 提示，不误写 settings）
 */
export function parseAutoCompactTierInput(
  raw: string,
): AutoCompactWindowSetting | null {
  const s = raw.trim()
  if (s === '') {
    return null
  }
  const kMatch = /^(\d+(?:\.\d+)?)\s*k$/i.exec(s)
  if (kMatch) {
    const tokens = Math.round(parseFloat(kMatch[1]) * 1_000)
    return tokens >= 1_000 ? { kind: 'window', tokens } : null
  }
  const pctMatch = /^(\d+(?:\.\d+)?)\s*%?$/.exec(s)
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1])
    return pct > 0 && pct <= 100 ? { kind: 'pct', pct } : null
  }
  return null
}

/**
 * 斜杠命令参数解析（/autocompact <arg> 直用形，纯函数）：
 *   - "auto" → { kind: 'auto' }（缺省，大小写不敏感）
 *   - "off"  → { kind: 'off' }（禁用自动压缩）
 *   - 其余 → parseAutoCompactTierInput（"150k" / "75%" / "75"）
 *   - 空串 / 未识别词 → null（调用方回执用法提示，不误写 settings）
 */
export function parseAutoCompactTierArg(
  raw: string,
): AutoCompactWindowSetting | null {
  const s = raw.trim()
  if (s === '') {
    return null
  }
  const lower = s.toLowerCase()
  if (lower === 'auto') {
    return { kind: 'auto' }
  }
  if (lower === 'off') {
    return { kind: 'off' }
  }
  return parseAutoCompactTierInput(raw)
}
