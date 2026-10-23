/**
 * effort 工具 — 从旧仓 utils/effort.ts 迁入 modelprovider 域
 *
 * 仅迁 modelprovider/params.ts 消费的 3 函数 + 其依赖：
 *   convertEffortValueToLevel / resolveAppliedEffort / getDefaultEffortForModel
 *
 * 斩断依赖：
 *  - isUltrathinkEnabled 旧仓 = feature('ULTRATHINK') + growthbook；
 *    growthbook 斩断（Port 8），feature('ULTRATHINK') 默认 false → stub false
 *  - settings 依赖不直接 import：0.1.67 E-2 起 per-model 记忆经注入缝
 *    setEffortByModelSource（宿主注 settings.effortByModel 读侧，未注 = 无
 *    记忆）——替代旧「不迁」裁定（wire 发送面须查 per-model，防漏查）
 *  - EffortLevel/EffortValue/EFFORT_LEVELS 从 shared import（契约冻结 + B 波合并值导出）
 *
 * C 波再下沉 shared（effort 全量函数 + settings port）。
 */

import { EFFORT_LEVELS, isEnvTruthy } from '../shared'
import type { EffortLevel, EffortValue } from '../shared'
// 0.1.80 K1-B①：前缀名归一单一事实源（同域 capabilities，直调不经门面）
import { stripProviderPrefix } from './capabilities'

// Re-export for domain consumers/tests (值定义在 shared，域内透传)
export { EFFORT_LEVELS }

export function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value)
}

export function isValidNumericEffort(value: number): boolean {
  return Number.isInteger(value)
}

export function parseEffortValue(value: unknown): EffortValue | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'number' && isValidNumericEffort(value)) {
    return value
  }
  const str = String(value).toLowerCase()
  if (isEffortLevel(str)) {
    return str
  }
  const numericValue = parseInt(str, 10)
  if (!isNaN(numericValue) && isValidNumericEffort(numericValue)) {
    return numericValue
  }
  return undefined
}

/** 旧仓 modelSupportsEffort — env override + 模型名判定（纯函数）。 */
export function modelSupportsEffort(model: string): boolean {
  const m = model.toLowerCase()
  // 旧仓 = isEnvTruthy(process.env.ATLAS_ALWAYS_ENABLE_EFFORT)，非 feature flag
  if (isEnvTruthy(process.env.ATLAS_ALWAYS_ENABLE_EFFORT)) {
    return true
  }
  if (m.includes('fast') || m.includes('small') || m.includes('premium')) {
    return false
  }
  return true
}

/** 旧仓 isUltrathinkEnabled — growthbook 斩断后 stub false（feature 默认 false）。 */
function isUltrathinkEnabled(): boolean {
  return false
}

export function getEffortEnvOverride(): EffortValue | null | undefined {
  const envOverride = process.env.ATLAS_EFFORT_LEVEL
  return envOverride?.toLowerCase() === 'unset' ||
    envOverride?.toLowerCase() === 'auto'
    ? null
    : parseEffortValue(envOverride)
}

export function convertEffortValueToLevel(value: EffortValue): EffortLevel {
  if (typeof value === 'string') {
    return isEffortLevel(value) ? value : 'high'
  }
  return 'high'
}

export function getDefaultEffortForModel(
  model: string,
): EffortValue | undefined {
  if (isUltrathinkEnabled() && modelSupportsEffort(model)) {
    return 'medium'
  }
  return 'medium'
}

// 0.1.67 E-2：per-model thinking-effort 记忆源注入缝（B 方案 wire 面，
// settings 域不迁的替代——宿主注 settings.effortByModel 读侧，未注 = 无
// per-model 记忆（回落会话单值/缺省））。对齐 TUI utils/effort.ts 的
// resolveAppliedEffort 面（双源同形）：modelprovider 直调面（params.ts
// buildOpenAIParams）亦查 per-model 记忆，防发送面漏查。
type EffortByModelSource =
  | (() => Record<string, EffortLevel> | undefined | null)
  | null
let effortByModelSource: EffortByModelSource = null

export function setEffortByModelSource(next: EffortByModelSource): void {
  effortByModelSource = next
}

/**
 * per-model 记忆查槽（case-insensitive，对齐 TUI getPersistedEffortForModel 先例）。
 * 0.1.80 K1-B①：精确 miss → basename 回落（`prefix/model` 前缀名请求剥前缀
 * 取 basename 再查裸名键，stripProviderPrefix 单一事实源）；无 `/` 时 basename
 * = 原名，回落与精确同键恒等。
 */
function lookupEffortByModel(model: string): EffortLevel | undefined {
  const map = effortByModelSource?.()
  if (!map) return undefined
  const wanted = model.toLowerCase()
  for (const [key, level] of Object.entries(map)) {
    if (key.toLowerCase() === wanted) return level
  }
  const base = stripProviderPrefix(model).toLowerCase()
  if (base !== wanted) {
    for (const [key, level] of Object.entries(map)) {
      if (key.toLowerCase() === base) return level
    }
  }
  return undefined
}

export function resolveAppliedEffort(
  model: string,
  appStateEffortValue: EffortValue | undefined,
): EffortValue | undefined {
  const envOverride = getEffortEnvOverride()
  if (envOverride === null) {
    return undefined
  }
  // 0.1.67 E-2：per-model 记忆槽插 env 与会话单值之间（显示/发送双面对齐）；
  // env 恒胜；无 per-model 记忆回落会话单值/缺省。
  const perModelMemory = lookupEffortByModel(model)
  return envOverride ?? perModelMemory ?? appStateEffortValue ?? getDefaultEffortForModel(model)
}
