import { isUltrathinkEnabled } from './thinking.js'
import { getInitialSettings, getSettingsForSource } from './settings/settings.js'
// (isProSubscriber / isMaxSubscriber / isTeamSubscriber removed with D1)
import { isEnvTruthy } from './envUtils.js'
import type { EffortLevel } from 'src/tui/entrypoints/sdk/runtimeTypes.js'

export type { EffortLevel }

export const EFFORT_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly EffortLevel[]

export type EffortValue = EffortLevel | number

// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports the effort parameter.
export function modelSupportsEffort(model: string): boolean {
  const m = model.toLowerCase()
  if (isEnvTruthy((process.env.ATLAS_ALWAYS_ENABLE_EFFORT))) {
    return true
  }
  // 角色模型（fast/small/premium）不支持 effort 参数（claude 版本前缀
  // 'premium-4-6'/'small-4-6' 死形已随 P6-3 B-13 删除——现网无此模型串）
  if (m.includes('fast') || m.includes('small') || m.includes('premium')) {
    return false
  }

  // IMPORTANT: Do not change the default effort support without notifying
  // the model launch DRI and research. This is a sensitive setting that can
  // greatly affect model quality and bashing.

  // Default to true for unknown model strings. The 3P "different format"
  // carve-out is gone (provider is always firstParty).
  return true
}

// 'max' support is unknown for provider-owned models (per-model support sets
// can't be known in advance — see the thinking-effort tier design), so
// unknown models default to false (anti-degradation rule). The picker no
// longer gates on this (it shows the fixed 5 tiers); print.ts SDK descript-
// ion still consumes it.
export function modelSupportsMaxEffort(_model: string): boolean {
  return false
}

export function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value)
}

/**
 * Cycle to the adjacent tier in the fixed picker order
 * (low → medium → high → xhigh → max). No per-model tier filtering or
 * cross-tier mapping (per-model support sets can't be known in advance) —
 * effort is an Atlas-global value (last-write-wins); a model that rejects
 * the tier surfaces its gateway 400 to the user (send-as-is, no fallback).
 * Stale levels outside the cycle clamp to the Atlas default 'medium'.
 */
export function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
): EffortLevel {
  const levels = EFFORT_LEVELS
  const idx = (levels as readonly string[]).indexOf(current)
  const currentIndex =
    idx !== -1 ? idx : (levels as readonly string[]).indexOf('medium')
  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!
  }
  return levels[(currentIndex - 1 + levels.length) % levels.length]!
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

/**
 * Numeric values are model-default only and not persisted.
 * 'max' is session-scoped for external users (ants can persist it).
 * Write sites call this before saving to settings so the Zod schema
 * (which only accepts string levels) never rejects a write.
 */
export function toPersistableEffort(
  value: EffortValue | undefined,
): EffortLevel | undefined {
  if (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  ) {
    return value
  }
  return undefined
}

export function getInitialEffortSetting(): EffortLevel | undefined {
  // toPersistableEffort filters 'max' for non-ants on read, so a manually
  // edited settings.json doesn't leak session-scoped max into a fresh session.
  return toPersistableEffort(getInitialSettings().effortLevel)
}

/**
 * Per-model thinking-effort memory (B 方案): the tier the user last picked
 * for each model in the model picker (settings.effortByModel). Read from the
 * userSettings source only — the same discipline as
 * resolvePickerEffortPersistence's priorPersisted (merged settings would
 * leak project/policy layers into the user's global settings.json).
 *
 * Keys are matched case-insensitively: model ids keep their configured case
 * ('Qwen38-27B-TXT') while alias resolution may lowercase them.
 *
 * Display priority: effortByModel[model] > global effortLevel > default med.
 */
export function getEffortByModel(): Record<string, EffortLevel> {
  const raw = (
    getSettingsForSource('userSettings') as { effortByModel?: unknown } | undefined
  )?.effortByModel
  const out: Record<string, EffortLevel> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      // Defensive: remote/hand-edited values may carry unknown tiers.
      if (isEffortLevel(value)) out[key] = value
    }
  }
  return out
}

export function getPersistedEffortForModel(
  model: string | null | undefined,
): EffortLevel | undefined {
  if (!model) return undefined
  const wanted = model.toLowerCase()
  for (const [key, level] of Object.entries(getEffortByModel())) {
    if (key.toLowerCase() === wanted) return level
  }
  return undefined
}

/** Merge a per-model tier into the current map (returns a new object). */
export function withEffortForModel(
  model: string,
  level: EffortLevel,
): Record<string, EffortLevel> {
  return { ...getEffortByModel(), [model]: level }
}

/**
 * Session-startup effort value: CLI --effort (caller checks first) →
 * per-model memory of the startup model → global effortLevel → undefined
 * (the wire layer then falls back to the Atlas default 'medium').
 */
export function getStartupEffortValue(
  startupModel: string | null | undefined,
): EffortValue | undefined {
  return getPersistedEffortForModel(startupModel) ?? getInitialEffortSetting()
}

/**
 * The tier the model picker displays for a focused model:
 *   per-model memory > explicit session effort value > the model's default.
 *
 * `sessionEffort` should be the session's effort value only when it is an
 * EXPLICIT in-session choice (CLI --effort, /effort, picker select — tracked
 * by AppState.effortExplicit). An inherited startup value (per-model memory
 * fallback / global effortLevel) must be passed as `undefined` so the display
 * falls through to the focused model's own default, keeping the tier control
 * per-model instead of stuck on another model's value (B 方案 display rule).
 *
 * Pure (reads settings only) so the picker's focus handler stays thin and
 * this precedence is unit-testable without the TUI graph.
 */
export function getPickerDisplayEffort(
  focusedModel: string | null | undefined,
  sessionEffort: EffortValue | undefined,
  modelDefault: EffortLevel,
): EffortLevel {
  return (
    getPersistedEffortForModel(focusedModel) ??
    (sessionEffort !== undefined
      ? convertEffortValueToLevel(sessionEffort)
      : modelDefault)
  )
}

/**
 * Decide what effort level (if any) to persist when the user selects a model
 * in ModelPicker. Keeps an explicit prior /effort choice sticky even when it
 * matches the picked model's default, while letting purely-default and
 * session-ephemeral effort (CLI --effort, EffortCallout default) fall through
 * to undefined so it follows future model-default changes.
 *
 * priorPersisted must come from userSettings on disk
 * (getSettingsForSource('userSettings')?.effortLevel), NOT merged settings
 * (project/policy layers would leak into the user's global settings.json)
 * and NOT AppState.effortValue (includes session-scoped sources that
 * deliberately do not write to settings.json).
 */
export function resolvePickerEffortPersistence(
  picked: EffortLevel | undefined,
  modelDefault: EffortLevel,
  priorPersisted: EffortLevel | undefined,
  toggledInPicker: boolean,
): EffortLevel | undefined {
  const hadExplicit = priorPersisted !== undefined || toggledInPicker
  return hadExplicit || picked !== modelDefault ? picked : undefined
}

export function getEffortEnvOverride(): EffortValue | null | undefined {
  const envOverride = (process.env.ATLAS_EFFORT_LEVEL)
  return envOverride?.toLowerCase() === 'unset' ||
    envOverride?.toLowerCase() === 'auto'
    ? null
    : parseEffortValue(envOverride)
}

/**
 * Resolve the effort value that will actually be sent to the API for a given
 * model, following the full precedence chain:
 *   env ATLAS_EFFORT_LEVEL → appState.effortValue → model default
 *
 * Send-as-is: the resolved level is what the wire layer sends verbatim —
 * there is NO reactive fallback/downgrade here. If the target model doesn't
 * accept the tier (e.g. Qwen only knows low/medium/xhigh), the gateway 400
 * is user-visible and the user changes the tier themselves.
 *
 * Returns undefined when no effort parameter should be sent (env set to
 * 'unset', or no default exists for the model).
 */
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

/**
 * Resolve the effort level to show the user. Wraps resolveAppliedEffort
 * with the 'medium' fallback (Atlas default state, what the wire sends when
 * no effort param is set). Single source of truth for the status bar and
 * /effort output (CC-1088).
 */
export function getDisplayedEffortLevel(
  model: string,
  appStateEffort: EffortValue | undefined,
): EffortLevel {
  const resolved = resolveAppliedEffort(model, appStateEffort) ?? 'medium'
  return convertEffortValueToLevel(resolved)
}

/**
 * Build the ` with {level} effort` suffix shown in Logo/Spinner.
 * Returns empty string if the user hasn't explicitly set an effort value.
 * Delegates to resolveAppliedEffort() so the displayed level matches what
 * the API actually receives (send-as-is, no clamping).
 */
export function getEffortSuffix(
  model: string,
  effortValue: EffortValue | undefined,
): string {
  if (effortValue === undefined) return ''
  const resolved = resolveAppliedEffort(model, effortValue)
  if (resolved === undefined) return ''
  return ` with ${convertEffortValueToLevel(resolved)} effort`
}

export function isValidNumericEffort(value: number): boolean {
  return Number.isInteger(value)
}

export function convertEffortValueToLevel(value: EffortValue): EffortLevel {
  if (typeof value === 'string') {
    // Runtime guard: value may come from remote config (GrowthBook) where
    // TypeScript types can't help us. Coerce unknown strings to 'high'
    // rather than passing them through unchecked.
    return isEffortLevel(value) ? value : 'high'
  }
  return 'high'
}

/**
 * Get user-facing description for effort levels
 *
 * @param level The effort level to describe
 * @returns Human-readable description
 */
export function getEffortLevelDescription(level: EffortLevel): string {
  switch (level) {
    case 'low':
      return 'Quick, straightforward implementation with minimal overhead'
    case 'medium':
      return 'Balanced approach with standard implementation and testing'
    case 'high':
      return 'Comprehensive implementation with extensive testing and documentation'
    case 'xhigh':
      return 'Extra-high reasoning above high (supported by some models, e.g. Qwen)'
    case 'max':
      return 'Maximum capability with deepest reasoning (supported models only)'
  }
}

/**
 * Get user-facing description for effort values (both string and numeric)
 *
 * @param value The effort value to describe
 * @returns Human-readable description
 */
export function getEffortValueDescription(value: EffortValue): string {
  if (typeof value === 'string') {
    return getEffortLevelDescription(value)
  }
  return 'Balanced approach with standard implementation and testing'
}

// （OpusDefaultEffortConfig 类型 / OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT /
//  getOpusDefaultEffortConfig 及 atlas_grey_step2 特性位已随 P6-3 B-13 删除——
//  其唯一消费者是 getDefaultEffortForModel 里 D1 后恒 false 的 opus-4-6 死分支）

// @[MODEL LAUNCH]: Update the default effort levels for new models
export function getDefaultEffortForModel(
  model: string,
): EffortValue | undefined {
  // IMPORTANT: Do not change the default effort level without notifying
  // the model launch DRI and research. Default effort is a sensitive setting
  // that can greatly affect model quality and bashing.
  //（opus-4-6 死分支已随 P6-3 B-13 删除——D1 后 isPro/Max/Team 订阅判定恒 false，
  //  该分支两个内层 if(false) 永不命中，且 opus-4-6 现网无此模型串）

  // When ultrathink feature is on, default effort to medium (ultrathink bumps to high)
  if (isUltrathinkEnabled() && modelSupportsEffort(model)) {
    return 'medium'
  }

  // Atlas global default = medium (Atlas-level default, NOT the model's own
  // default — avoids models like Qwen whose own default is xhigh and
  // over-thinks). All models accept medium, so this is a safe send-as-is
  // value for any model / subagent in the pool.
  return 'medium'
}
