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
 *   - env 覆写（ATLAS_AUTOCOMPACT_PCT_OVERRIDE / ATLAS_AUTO_COMPACT_WINDOW / DISABLE_COMPACT）
 *     → 残留守（config 面 E-3 settings 回填时统一收拢）。
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
import { COMPACT_MAX_OUTPUT_TOKENS, type CompactionResult } from './compact'

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
  /** 总开关（旧仓 isAutoCompactEnabled 裁剪；默认开）。 */
  enabled?: boolean
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

/**
 * 有效窗口 − 缓冲 = 触发阈值（旧仓 getAutoCompactThreshold 裁剪，去 env 覆写残留守）。
 * 有效窗口 = contextWindow − 摘要输出预留（旧仓 getEffectiveContextWindowSize 语义：
 * min(getMaxOutputTokensForModel, COMPACT_MAX_OUTPUT_TOKENS)——新仓经 deps.maxOutputTokens
 * 注入接缝；未注入按满额 20k 预留，与旧仓大输出模型 min(maxOut, 20k) 行为等价）。
 */
export function getAutoCompactThreshold(
  contextWindow: number,
  maxOutputTokens?: number,
): number {
  const reservedForSummary = Math.min(
    maxOutputTokens ?? COMPACT_MAX_OUTPUT_TOKENS,
    COMPACT_MAX_OUTPUT_TOKENS,
  )
  return contextWindow - reservedForSummary - AUTOCOMPACT_BUFFER_TOKENS
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
  return tokenCount >= getAutoCompactThreshold(deps.contextWindow, deps.maxOutputTokens)
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
