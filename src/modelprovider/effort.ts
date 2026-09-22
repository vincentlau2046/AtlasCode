/**
 * effort 工具 — 从旧仓 utils/effort.ts 迁入 modelprovider 域
 *
 * 仅迁 modelprovider/params.ts 消费的 3 函数 + 其依赖：
 *   convertEffortValueToLevel / resolveAppliedEffort / getDefaultEffortForModel
 *
 * 斩断依赖：
 *  - isUltrathinkEnabled 旧仓 = feature('ULTRATHINK') + growthbook；
 *    growthbook 斩断（Port 8），feature('ULTRATHINK') 默认 false → stub false
 *  - settings 依赖（getEffortByModel 等）不被这 3 函数消费，不迁
 *  - EffortLevel/EffortValue/EFFORT_LEVELS 从 shared import（契约冻结 + B 波合并值导出）
 *
 * C 波再下沉 shared（effort 全量函数 + settings port）。
 */

import { EFFORT_LEVELS, isEnvTruthy } from '../shared'
import type { EffortLevel, EffortValue } from '../shared'

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

export function resolveAppliedEffort(
  model: string,
  appStateEffortValue: EffortValue | undefined,
): EffortValue | undefined {
  const envOverride = getEffortEnvOverride()
  if (envOverride === null) {
    return undefined
  }
  return envOverride ?? appStateEffortValue ?? getDefaultEffortForModel(model)
}
