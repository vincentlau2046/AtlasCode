/**
 * engine/context — autoCompact 触发判定（§8.23 E-1b T-4b，旧仓 autoCompact.ts 360L 裁剪版真核心）
 *
 * 链路：token 计数（deps.countTokens 注入，modelprovider 门面 countTokens 是天然提供方）
 *   → 阈值判定（有效窗口 − AUTOCOMPACT_BUFFER_TOKENS，有效窗口 = contextWindow −
 *     摘要输出预留 min(maxOutputTokens ?? 20k, 20k)，旧仓 getEffectiveContextWindowSize）
 *   → 触发时调 deps.compact
 *   → 失败熔断（连续 3 次失败停试，防不可恢复超限会话每轮 hammer  doomed 压缩）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧仓 shouldAutoCompact 的 feature 门（CONTEXT_COLLAPSE/REACTIVE_COMPACT）+ growthbook
 *     配置 + marble_origami 特判 → 残留守（collapse/reactive 归后续纵切；feature 门在新仓
 *     由 Port 8 FeatureConfigPort 承载，本版不预造）。
 *   - 旧仓 autoCompactIfNeeded 的 session memory 压缩实验分支（trySessionMemoryCompaction）
 *     + promptCacheBreakDetection + markPostCompaction + PostCompactCleanup → 残留守
 *     （sessionMemoryCompact 归后续纵切；cache 面归 modelprovider 域）。
 *   - env 覆写（ATLAS_AUTOCOMPACT_PCT_OVERRIDE / ATLAS_AUTO_COMPACT_WINDOW /
 *     DISABLE_COMPACT）→ S-3d config 面收拢（§8.29，残留守③ 核销）：读侧 =
 *     engine/config getAutoCompactEnvOverrides（解析 guard 旧仓逐字），本模块经
 *     deps.pctOverride / windowOverride / enabled 消费（H6 预声明消费接缝：无生产
 *     调用点，消费方 = E-wave-end 组合根 loop deps 装配，当前仅测试消费）。
 *   - 旧仓 DISABLE_AUTO_COMPACT（细粒度开关）+ ATLAS_BLOCKING_LIMIT_OVERRIDE
 *     （TUI warning 态面）W2-2-pre 缺面先迁①已收拢：config 面
 *     getAutoCompactEnvOverrides 扩面（autoCompactDisabled /
 *     blockingLimitOverride）+ isAutoCompactEnabled 纯函数面 +
 *     calculateTokenWarningState 参数面（H6 预声明消费接缝：消费方 = W3
 *     TUI 活链路装配 + E-wave-end 组合根，当前仅测试消费）。
 *   - token 计数/ contextWindow / compact 体均为注入 deps（port 之下全真，非 fake 自证）；
 *     未注入 countTokens 时 fail-safe 返回 false（不压缩，不误判）。
 *
 * tracking 语义（对齐旧仓 loop.ts:485-511，review 2026-09-23 订正）：
 *   - 压缩成功 → tracking 重置 { compacted: true, turnCounter: 0, turnId: randomUUID(),
 *     consecutiveFailures: 0 }（「反映最近一次 compact」，旧仓同语义）；
 *   - 压缩失败 → 仅回 consecutiveFailures（调用方 loop 负责回灌，旧仓 L504-511）；
 *   - turnCounter = 距上次 compact 的轮数，由 loop 在继续轮末自增（旧仓 L1458-1460，
 *     仅 tracking.compacted 会话、仅继续轮）。
 */
import { randomUUID } from 'crypto'
import type { Message } from '../../shared'
import { getProviderContextWindow } from '../../modelprovider'
import { getAutoCompactEnvOverrides } from '../config'
import { COMPACT_MAX_OUTPUT_TOKENS, type CompactionResult } from './compact'
import {
  resolveAutoCompactWindow,
  type AutoCompactWindowSetting,
} from './autoCompactWindow'

/**
 * 压缩预留缓冲（旧仓常量，p99.99 摘要输出 17387 token 之上取的安全边）。
 * 注意与「摘要输出预留」分工：阈值 = contextWindow − min(maxOutput, 20k) − 13_000，
 * 20k 预留（COMPACT_MAX_OUTPUT_TOKENS）在 getAutoCompactThreshold 内扣减（旧仓
 * getEffectiveContextWindowSize 语义），13k 是叠加其上的额外安全边。
 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000

/** 连续失败熔断阈值（旧仓常量：超限不可恢复会话停试，防每轮 doomed 压缩）。 */
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3

export interface AutoCompactTrackingState {
  compacted: boolean
  /** 距上次 compact 的轮数（compact 成功重置 0，loop 继续轮末自增；旧仓同语义）。 */
  turnCounter: number
  /** 最近一次 compact 的唯一 ID（成功时 randomUUID 重置；旧仓 deps.uuid() 同语义）。 */
  turnId: string
  /** 连续 autocompact 失败计数（成功清零；熔断判据）。 */
  consecutiveFailures?: number
}

export interface AutoCompactDeps {
  /** 模型 contextWindow（新仓 modelprovider 配置面 roles/capabilities 提供方）。 */
  contextWindow: number
  /**
   * 模型 maxOutputTokens（旧仓 getMaxOutputTokensForModel 的注入接缝，modelprovider
   * 配置面提供方）。阈值预留 = min(maxOutputTokens ?? COMPACT_MAX_OUTPUT_TOKENS,
   * COMPACT_MAX_OUTPUT_TOKENS)——未注入时按满额 20k 预留（旧仓对大输出模型的
   * min(maxOut, 20k) 行为等价，保守不晚触发）。
   */
  maxOutputTokens?: number
  /** token 计数（modelprovider 门面 countTokens 注入；未注入 = fail-safe 不压缩）。 */
  countTokens?: (messages: Message[]) => number | Promise<number>
  /** compact 体（compactConversation 裁剪版；deps.compact 注入解耦循环依赖）。 */
  compact: (messages: Message[]) => Promise<CompactionResult>
  /** 递归守卫：压缩 fork 自身（compact/session_memory）不触发再压缩（旧仓 querySource 语义）。 */
  querySource?: string
  /** 总开关（旧仓 isAutoCompactEnabled 裁剪；默认开）。config 面收拢（§8.29）：
   * DISABLE_COMPACT 经 getAutoCompactEnvOverrides().disabled 映射本字段。 */
  enabled?: boolean
  /**
   * ATLAS_AUTOCOMPACT_PCT_OVERRIDE（旧仓 autoCompact.ts:79 语义，有效域 (0,100]）：
   * 阈值 = min(floor(有效窗口 × pct/100), 基础阈值)。config 面读侧
   * getAutoCompactEnvOverrides（§8.29）。
   */
  pctOverride?: number
  /** ATLAS_AUTO_COMPACT_WINDOW（旧仓 autoCompact.ts:40 语义）：有效窗口 cap
   * （contextWindow = min(contextWindow, 本值)）。config 面读侧同上。 */
  windowOverride?: number
}

export interface AutoCompactOutcome {
  wasCompacted: boolean
  compactionResult?: CompactionResult
  /** 压缩后更新的 tracking（调用方回填，供下轮熔断/重压缩链判定）。 */
  tracking?: AutoCompactTrackingState
  consecutiveFailures?: number
  /** 压缩失败原因（熔断计数配套，供调用方 debug/遥测）。 */
  error?: string
}

// ───────────────────── D-2a S5（重裁范围 = 原 S7）：model-string 便捷形重载 ─────────────────────
// TUI 4 活消费面（calculateTokenWarningState / getEffectiveContextWindowSize /
// isAutoCompactEnabled / getAutoCompactThreshold——TokenWarning.tsx /
// analyzeContext.ts / attachments.ts / contextSuggestions.ts / inProcessRunner.ts
// 钉旧仓 model-string 形）切端零调用点改动：重载解析 model→contextWindow
// （modelprovider provider 注册表）+ env 覆写（getAutoCompactEnvOverrides 读侧）
// 后委托 DI 核（canonical 源不变）。
//
// 范围裁定登记（复审勿重提）：shouldAutoCompact / autoCompactIfNeeded 富
// model-string 形 TUI 零活消费（engineCompat 冲突块陈旧条目，grep 核验仅
// analyzeContext:1113 注释命中；TUI 活 auto-compact 走 engine query/loop.ts
// DI 裁剪面）→ 富体不迁（H6 防空洞：迁死体 = 引擎膨胀），S8 随冲突块裁净。
//
// delta 登记：
//   ① MODEL_CONTEXT_WINDOW_DEFAULT = 150k 对齐 tui 常量（provider 注册表
//      未声明 contextWindow 的回落值，P4 收口后单一来源 = provider 元数据）。
//   ② maxOut 不读 tui GB slot-cap（atlas_otk_slot_v1 = host/GB 域）→ 预留恒
//      min(maxOut ?? 20k, 20k) = 20k（GB cap 关〔3P 缺省〕行为等价；cap 开时
//      差 12k 归 host 域差异，随 W-opt 宿主注）。
//   ③ isAutoCompactEnabled() 0 参形 settings 读侧 = setAutoCompactSettingsSource
//      注入（宿主 settings.json autoCompactEnabled；未注 = 缺省 true，旧 config 缺省一致）。

/** provider 注册表未声明 contextWindow 的模型回落窗口（delta ①）。 */
const MODEL_CONTEXT_WINDOW_DEFAULT = 150_000

/** model→contextWindow 解析（provider 注册表优先，回落缺省值）。 */
function resolveModelContextWindow(model: string): number {
  return getProviderContextWindow(model) ?? MODEL_CONTEXT_WINDOW_DEFAULT
}

/** settings.autoCompactEnabled 读侧注入（delta ③；宿主 S8 接线，单测 teardown 传 null）。 */
type AutoCompactSettingsSource = () => boolean | undefined

let autoCompactSettingsSource: AutoCompactSettingsSource | null = null

export function setAutoCompactSettingsSource(
  next: AutoCompactSettingsSource | null,
): void {
  autoCompactSettingsSource = next
}

/**
 * settings.autoCompactWindow 档位读侧注入（#250 concern 2：/autocompact 命令
 * 持久化档位，宿主 contextHostWiring 接线 getInitialSettings 面；未注 = 无档位
 * 覆写。单测 teardown 传 null）。
 */
type AutoCompactWindowSettingsSource =
  | (() => AutoCompactWindowSetting | null | undefined)
  | null

let autoCompactWindowSettingsSource: AutoCompactWindowSettingsSource = null

export function setAutoCompactWindowSettingsSource(
  next: AutoCompactWindowSettingsSource,
): void {
  autoCompactWindowSettingsSource = next
}

/**
 * 合并覆写纯函数（#250 concern 2，单一事实源）：settings 档位
 * （resolveAutoCompactWindow 解析）⊕ env 覆写，**env 胜**（显式 CLI/env >
 * 持久化 settings；越界值两侧解析 guard 同纪律——忽略不生效）。禁用面三源
 * OR：env 总开关（DISABLE_COMPACT disabled）/ env 细粒度
 * （DISABLE_AUTO_COMPACT autoCompactDisabled）/ settings off 档。
 * 消费点 = 本模块各 model-string / 0 参便捷形（经 getMergedAutoCompact
 * Overrides 包装）+ 宿主 agentLoopDeps DI 注入（env ⊕ settings 单点合并，
 * 防 UI 阈值面与 loop 触发面两车道分裂）。
 */
export function mergeAutoCompactOverrides(
  env: ReturnType<typeof getAutoCompactEnvOverrides>,
  setting: AutoCompactWindowSetting | null | undefined,
): {
  pctOverride?: number
  windowOverride?: number
  autoCompactDisabled: boolean
} {
  const tier = resolveAutoCompactWindow(setting)
  return {
    pctOverride: env.pctOverride ?? tier.pctOverride,
    windowOverride: env.windowOverride ?? tier.windowOverride,
    autoCompactDisabled:
      env.disabled === true ||
      env.autoCompactDisabled === true ||
      tier.autoCompactDisabled === true,
  }
}

/** 合并覆写（settings 源接缝读侧包装；消费点 = model-string / 0 参便捷形）。 */
function getMergedAutoCompactOverrides(): {
  pctOverride?: number
  windowOverride?: number
  autoCompactDisabled: boolean
} {
  return mergeAutoCompactOverrides(
    getAutoCompactEnvOverrides(),
    autoCompactWindowSettingsSource?.() ?? null,
  )
}

/**
 * 有效窗口（旧仓 getEffectiveContextWindowSize 独立导出面，W2-2-pre 缺面先迁①）：
 * 窗口 cap（windowOverride >0 有效）− 摘要输出预留（min(maxOutputTokens ??
 * COMPACT_MAX_OUTPUT_TOKENS, COMPACT_MAX_OUTPUT_TOKENS)——未注入按满额 20k 预留，
 * 与旧仓大输出模型 min(maxOut, 20k) 行为等价）。TUI TokenWarning UI / blocking
 * limit 判定消费（旧仓 autoCompact.ts:33-49 语义逐字）。
 * S5 重载：model-string 形（旧仓 TUI 活链路签名）→ env 窗口 cap 后委托本核。
 */
function getEffectiveContextWindowSizeCore(
  contextWindow: number,
  maxOutputTokens?: number,
  windowOverride?: number,
): number {
  const window =
    windowOverride !== undefined && windowOverride > 0
      ? Math.min(contextWindow, windowOverride)
      : contextWindow
  const reservedForSummary = Math.min(
    maxOutputTokens ?? COMPACT_MAX_OUTPUT_TOKENS,
    COMPACT_MAX_OUTPUT_TOKENS,
  )
  return window - reservedForSummary
}

/**
 * 有效窗口导出面（S5 双形重载）：
 *  - DI 形（E-1b T-4b 真核心，engine 内部/判别单测消费）
 *  - model-string 形（旧仓 TUI 活链路签名，S5 切端零调用点改动）：
 *    provider 注册表窗口 + env 窗口 cap（ATLAS_AUTO_COMPACT_WINDOW）后委托 DI 核。
 */
export function getEffectiveContextWindowSize(
  contextWindow: number,
  maxOutputTokens?: number,
  windowOverride?: number,
): number
export function getEffectiveContextWindowSize(model: string): number
export function getEffectiveContextWindowSize(
  contextWindowOrModel: number | string,
  maxOutputTokens?: number,
  windowOverride?: number,
): number {
  if (typeof contextWindowOrModel === 'string') {
    // #250 concern 2：env 窗口 cap ⊕ settings 档位（getMergedAutoCompactOverrides，
    // env 胜；off 档不影响窗口面）。
    const { windowOverride } = getMergedAutoCompactOverrides()
    return getEffectiveContextWindowSizeCore(
      resolveModelContextWindow(contextWindowOrModel),
      undefined,
      windowOverride,
    )
  }
  return getEffectiveContextWindowSizeCore(
    contextWindowOrModel,
    maxOutputTokens,
    windowOverride,
  )
}

/**
 * 有效窗口 − 缓冲 = 触发阈值（旧仓 getAutoCompactThreshold + env 覆写面）。
 * 有效窗口 = getEffectiveContextWindowSize（独立导出面；行为不变重构）。
 *
 * 双覆写（S-3d config 面收拢 §8.29，旧仓解析 guard 逐字——越界值忽略不生效，
 * 既有 2 参调用向后兼容）：
 *   - windowOverride（ATLAS_AUTO_COMPACT_WINDOW，>0 有效）：窗口 cap，
 *     contextWindow = min(contextWindow, windowOverride)（旧仓 :40-46）。
 *   - pctOverride（ATLAS_AUTOCOMPACT_PCT_OVERRIDE，(0,100] 有效）：
 *     阈值 = min(floor(有效窗口 × pct/100)，基础阈值)（旧仓 :79-88）。
 */
function getAutoCompactThresholdCore(
  contextWindow: number,
  maxOutputTokens?: number,
  pctOverride?: number,
  windowOverride?: number,
): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(
    contextWindow,
    maxOutputTokens,
    windowOverride,
  )
  let threshold = effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS
  if (pctOverride !== undefined && pctOverride > 0 && pctOverride <= 100) {
    threshold = Math.min(
      Math.floor(effectiveContextWindow * (pctOverride / 100)),
      threshold,
    )
  }
  return threshold
}

/**
 * 压缩触发阈值导出面（S5 双形重载）：
 *  - DI 形（真核心）
 *  - model-string 形（旧仓 :72-91 语义）：provider 注册表窗口 + env 双覆写
 *    （ATLAS_AUTOCOMPACT_PCT_OVERRIDE / ATLAS_AUTO_COMPACT_WINDOW）后委托 DI 核。
 */
export function getAutoCompactThreshold(
  contextWindow: number,
  maxOutputTokens?: number,
  pctOverride?: number,
  windowOverride?: number,
): number
export function getAutoCompactThreshold(model: string): number
export function getAutoCompactThreshold(
  contextWindowOrModel: number | string,
  maxOutputTokens?: number,
  pctOverride?: number,
  windowOverride?: number,
): number {
  if (typeof contextWindowOrModel === 'string') {
    // #250 concern 2：env 双覆写 ⊕ settings 档位（env 胜）。
    const o = getMergedAutoCompactOverrides()
    return getAutoCompactThresholdCore(
      resolveModelContextWindow(contextWindowOrModel),
      undefined,
      o.pctOverride,
      o.windowOverride,
    )
  }
  return getAutoCompactThresholdCore(
    contextWindowOrModel,
    maxOutputTokens,
    pctOverride,
    windowOverride,
  )
}

// ── W2-2-pre 缺面先迁①（§8.74.2）：TUI warning 态面三常量（旧仓 :63-65 逐字）──

/** TUI TokenWarning 警告缓冲（旧仓 WARNING_THRESHOLD_BUFFER_TOKENS）。 */
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
/** TUI TokenWarning 错误缓冲（旧仓 ERROR_THRESHOLD_BUFFER_TOKENS）。 */
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
/** 手动 /compact 缓冲（旧仓 MANUAL_COMPACT_BUFFER_TOKENS；blocking limit 判据）。 */
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000

export interface TokenWarningState {
  percentLeft: number
  isAboveWarningThreshold: boolean
  isAboveErrorThreshold: boolean
  isAboveAutoCompactThreshold: boolean
  isAtBlockingLimit: boolean
}

export interface TokenWarningParams {
  /** 模型 contextWindow（modelprovider 配置面提供方；旧仓 getContextWindowForModel 注入接缝）。 */
  contextWindow: number
  /** 模型 maxOutputTokens（旧仓 getMaxOutputTokensForModel 注入接缝）。 */
  maxOutputTokens?: number
  /**
   * 旧仓 isAutoCompactEnabled 判定面（DISABLE_COMPACT / DISABLE_AUTO_COMPACT /
   * settings.autoCompactEnabled 缺省 true——caller 经 config 读侧 + settings 面
   * 映射；未注入按缺省开，与旧 config 缺省一致）。
   */
  autoCompactEnabled?: boolean
  pctOverride?: number
  windowOverride?: number
  /** ATLAS_BLOCKING_LIMIT_OVERRIDE（旧仓 :127 TUI warning 态面；>0 有效，config 读侧映射）。 */
  blockingLimitOverride?: number
}

/**
 * token 使用量 → TUI warning 态（旧仓 calculateTokenWarningState 语义逐字，
 * W2-2-pre 缺面先迁①：engine 原无此面 = TUI TokenWarning 组件 + engineCompat
 * 15 名冲突块消费方）。纯函数：env 读侧归 config 面（getAutoCompactEnvOverrides
 * 扩面 + settings 面），本函数零 I/O。
 */
export function calculateTokenWarningState(
  tokenUsage: number,
  params: TokenWarningParams,
): TokenWarningState
// S5：model-string 形（旧仓 TUI TokenWarning 组件签名）——provider 窗口 +
// env 覆写（pct/window/blockingLimit）+ isAutoCompactEnabled() 0 参形后委托 DI 核。
export function calculateTokenWarningState(
  tokenUsage: number,
  model: string,
): TokenWarningState
export function calculateTokenWarningState(
  tokenUsage: number,
  paramsOrModel: TokenWarningParams | string,
): TokenWarningState {
  if (typeof paramsOrModel === 'string') {
    const env = getAutoCompactEnvOverrides()
    const o = getMergedAutoCompactOverrides()
    return calculateTokenWarningStateCore(tokenUsage, {
      contextWindow: resolveModelContextWindow(paramsOrModel),
      autoCompactEnabled: isAutoCompactEnabled(),
      pctOverride: o.pctOverride,
      windowOverride: o.windowOverride,
      // blocking limit 只走 env（ATLAS_BLOCKING_LIMIT_OVERRIDE），档位面不覆写。
      blockingLimitOverride: env.blockingLimitOverride,
    })
  }
  return calculateTokenWarningStateCore(tokenUsage, paramsOrModel)
}

function calculateTokenWarningStateCore(
  tokenUsage: number,
  params: TokenWarningParams,
): TokenWarningState {
  const {
    contextWindow,
    maxOutputTokens,
    autoCompactEnabled,
    pctOverride,
    windowOverride,
    blockingLimitOverride,
  } = params
  const enabled = autoCompactEnabled !== false
  const autoCompactThreshold = getAutoCompactThreshold(
    contextWindow,
    maxOutputTokens,
    pctOverride,
    windowOverride,
  )
  const threshold = enabled
    ? autoCompactThreshold
    : getEffectiveContextWindowSize(contextWindow, maxOutputTokens, windowOverride)

  const percentLeft = Math.max(
    0,
    Math.round(((threshold - tokenUsage) / threshold) * 100),
  )

  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS

  const isAboveWarningThreshold = tokenUsage >= warningThreshold
  const isAboveErrorThreshold = tokenUsage >= errorThreshold
  const isAboveAutoCompactThreshold =
    enabled && tokenUsage >= autoCompactThreshold

  const actualContextWindow = getEffectiveContextWindowSize(
    contextWindow,
    maxOutputTokens,
    windowOverride,
  )
  const defaultBlockingLimit = actualContextWindow - MANUAL_COMPACT_BUFFER_TOKENS
  const blockingLimit =
    blockingLimitOverride !== undefined && blockingLimitOverride > 0
      ? blockingLimitOverride
      : defaultBlockingLimit
  const isAtBlockingLimit = tokenUsage >= blockingLimit

  return {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAtBlockingLimit,
  }
}

/**
 * isAutoCompactEnabled 导出面（S5 双形）：
 *  - DI flags 形（W2-2-pre 缺面先迁① 纯函数面）：DISABLE_COMPACT（disabled）→
 *    false；DISABLE_AUTO_COMPACT（autoCompactDisabled，细粒度开关，保留手动
 *    /compact）→ false；settings.autoCompactEnabled（缺省 true，旧 config 缺省
 *    :516）。
 *  - 0 参形（旧仓 :147-158 TUI 活链路签名）：env 读侧（getAutoCompactEnvOverrides
 *    收拢的 DISABLE_COMPACT / DISABLE_AUTO_COMPACT isEnvTruthy 语义）+ settings
 *    读侧（setAutoCompactSettingsSource 注入，delta ③；未注 = 缺省 true）。
 */
export function isAutoCompactEnabled(flags?: {
  disabled?: boolean
  autoCompactDisabled?: boolean
  settingsEnabled?: boolean
}): boolean {
  if (flags === undefined) {
    const o = getAutoCompactEnvOverrides()
    if (o.disabled) return false
    if (o.autoCompactDisabled) return false
    // #250 concern 2：off 档位（settings 持久化禁用，手动 /compact 保留）。
    if (getMergedAutoCompactOverrides().autoCompactDisabled) {
      return false
    }
    return autoCompactSettingsSource ? (autoCompactSettingsSource() ?? true) : true
  }
  if (flags.disabled) return false
  if (flags.autoCompactDisabled) return false
  return flags.settingsEnabled !== false
}


/**
 * token 计数超阈值判定（旧仓 shouldAutoCompact 裁剪真核心：NaN guard + 递归守卫 + 阈值比较）。
 * 未注入 countTokens 时 fail-safe 返回 false（不误压缩，残留守：计数回填 E-3/组合根）。
 */
export async function shouldAutoCompact(
  messages: Message[],
  deps: AutoCompactDeps,
): Promise<boolean> {
  if (deps.querySource === 'compact' || deps.querySource === 'session_memory') {
    return false
  }
  if (deps.enabled === false) {
    return false
  }
  if (!deps.countTokens) {
    return false
  }
  const tokenCount = await deps.countTokens(messages)
  // NaN guard（旧仓语义：usage 数据残缺产生 NaN 时比较恒 false → 静默禁用，不假压缩）。
  if (!Number.isFinite(tokenCount)) {
    return false
  }
  return tokenCount >= getAutoCompactThreshold(
    deps.contextWindow,
    deps.maxOutputTokens,
    deps.pctOverride,
    deps.windowOverride,
  )
}

/**
 * 压缩触发入口（旧仓 autoCompactIfNeeded 裁剪真核心：熔断 + 判定 + 压缩 + 失败计数）。
 * session memory 实验分支 / cache 面 / post-compact cleanup 归残留守（见头注）。
 */
export async function autoCompactIfNeeded(
  messages: Message[],
  tracking: AutoCompactTrackingState | undefined,
  deps: AutoCompactDeps,
): Promise<AutoCompactOutcome> {
  if (
    tracking?.consecutiveFailures !== undefined &&
    tracking.consecutiveFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
  ) {
    return { wasCompacted: false, consecutiveFailures: tracking.consecutiveFailures }
  }

  const shouldCompact = await shouldAutoCompact(messages, deps)
  if (!shouldCompact) {
    return { wasCompacted: false }
  }

  try {
    const compactionResult = await deps.compact(messages)
    return {
      wasCompacted: true,
      compactionResult,
      // 对齐旧仓 loop.ts:485-494：成功 = 重置（反映最近一次 compact；turnCounter 由
      // loop 继续轮末自增，非此处置）。
      tracking: {
        compacted: true,
        turnCounter: 0,
        turnId: randomUUID(),
        consecutiveFailures: 0,
      },
    }
  } catch (error) {
    const nextFailures = (tracking?.consecutiveFailures ?? 0) + 1
    return {
      wasCompacted: false,
      consecutiveFailures: nextFailures,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
