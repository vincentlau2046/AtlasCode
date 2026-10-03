/**
 * loop-robustness 缺口②（#262，用户裁定最高优先）：loop 回合级有界恢复
 * （E-1b-full 错误恢复纵切核销）。
 *
 * 根因：queryOneRound / queryAgentLoop 对 modelProvider.chat() 无 try/catch。
 * provider 内部 maxRetriesPerModel（缺省 3）重试预算耗尽（5xx 风暴 / 网关
 * 持续抖动）仍抛「可重试模型错误」→ 抛错穿透 → 整个任务被回合级丢弃。击穿
 * 「coding agent 持续长时间不中断」基本要求（#262 用户点名最高优先）。
 *
 * 本模块提供回合级恢复的纯面（config 解析 + 指数退避 + signal 感知 sleep +
 * 通用有界重试原语 withTurnRecovery）。恢复循环消费 modelprovider 域
 * shouldRetryModelError 单一事实源判「可重试」——仅对仍可重试的瞬时故障
 * （5xx / 429 / 连接抖动）恢复；400 坏请求 / client-request-timeout（#260
 * fail-fast）/ abort 不空耗，直接穿透（不放大 #260 的超时快速失败语义）。
 *
 * 语义：有界（maxRetries 上限，超限穿透防死网无限重试）+ 指数退避（base×2^n
 * 封顶 cap，不 hammer 故障网关）+ signal 感知（aborted 立即止，长跑面用户
 * 中断不悬空）+ env 可调（生产可调小 maxRetries 快速失败；测试/活探针可置
 * 退避 0 加速）。
 *
 * React-free 引擎叶子（零 UI 依赖）；engine 消费 modelprovider（DEP-4 allow，
 * 值 import 纯谓词 shouldRetryModelError，同 engine 域 getModelProvider 族先例）。
 */
import { shouldRetryModelError } from '../../modelprovider'

export interface TurnRecoveryConfig {
  /** 总开关（ATLAS_TURN_RECOVER_ENABLED，缺省开；置 '0' 关恢复面 = 无恢复单发）。 */
  enabled: boolean
  /**
   * 回合级恢复上限（ATLAS_TURN_RECOVER_MAX，缺省 13）——provider 缺省 3 次内
   * 重试 × 14 回合（1 首发 + 13 恢复）= 42 次 LLM 调用，穿越 40 次 5xx 风暴窗
   * （peer loop-robustness turnrecover 门 proxyCalls≥40）。env 可调：调小 =
   * 快速失败（生产死网不空耗），调大 = 扛更长风暴。
   */
  maxRetries: number
  /** 指数退避基（毫秒，ATLAS_TURN_RECOVER_BACKOFF_MS，缺省 100）。 */
  backoffBaseMs: number
  /** 指数退避封顶（毫秒，ATLAS_TURN_RECOVER_BACKOFF_CAP_MS，缺省 1000）。 */
  backoffCapMs: number
}

const DEFAULT_MAX_RETRIES = 13
const DEFAULT_BACKOFF_BASE_MS = 100
const DEFAULT_BACKOFF_CAP_MS = 1000

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** 解析回合级恢复配置（读 env；测试可注入 env 面）。缺省 = 生产缺省值。 */
export function resolveTurnRecoveryConfig(
  env: Record<string, string | undefined> = process.env,
): TurnRecoveryConfig {
  return {
    enabled: env.ATLAS_TURN_RECOVER_ENABLED !== '0',
    maxRetries: parseNonNegativeInt(env.ATLAS_TURN_RECOVER_MAX, DEFAULT_MAX_RETRIES),
    backoffBaseMs: parseNonNegativeInt(
      env.ATLAS_TURN_RECOVER_BACKOFF_MS,
      DEFAULT_BACKOFF_BASE_MS,
    ),
    backoffCapMs: parseNonNegativeInt(
      env.ATLAS_TURN_RECOVER_BACKOFF_CAP_MS,
      DEFAULT_BACKOFF_CAP_MS,
    ),
  }
}

/**
 * 指数退避（base×2^attempt 封顶 cap；deterministic 无 jitter——测试可复现，
 * jitter 归后续波）。attempt=0 = 首发后首段退避 = base（封顶生效）。
 */
export function turnRecoveryBackoffMs(
  attempt: number,
  baseMs: number,
  capMs: number,
): number {
  const base = Math.max(0, baseMs)
  const cap = Math.max(base, capMs)
  if (attempt <= 0) return Math.min(base, cap)
  return Math.min(base * 2 ** attempt, cap)
}

/**
 * signal 感知 sleep：到期 resolve；signal 已/将 aborted → 立即 resolve（不睡满），
 * 使恢复退避中响应 abort（长跑面用户中断不悬空）。ms<=0 = 立即 resolve（无退避）。
 */
export function sleepSignalAware(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>(resolve => {
    if (signal?.aborted) {
      resolve()
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
}

export interface WithTurnRecoveryOptions {
  /** abort 信号（aborted → 恢复循环立即止，不空耗剩余重试）。 */
  signal?: AbortSignal
  /** 注入配置（测试面）；缺省 = resolveTurnRecoveryConfig()（读 process.env）。 */
  config?: TurnRecoveryConfig
}

/**
 * 通用回合级有界恢复原语：对 attempt 做「有界 + 指数退避 + signal 感知」重试，
 * 仅对「仍可重试模型错误」（modelprovider shouldRetryModelError 单一事实源）
 * 恢复；非可重试（400/401/404 等 / client-request-timeout fail-fast）或 abort
 * → 立即穿透（不放大、不空耗）；maxRetries 超限 → 穿透（有界，防死网无限重试）。
 *
 * 成功 = attempt 最终成功返回；失败 = 耗尽恢复预算（maxRetries+1 次调用）后
 * 抛末次错误。关恢复面（config.enabled=false）= 原样单发（行为回退 = 无恢复）。
 */
export async function withTurnRecovery<T>(
  attempt: () => Promise<T>,
  options: WithTurnRecoveryOptions = {},
): Promise<T> {
  const cfg = options.config ?? resolveTurnRecoveryConfig()
  if (!cfg.enabled) {
    return attempt()
  }
  let lastErr: unknown
  for (let i = 0; i <= cfg.maxRetries; i++) {
    // 首发（i=0）恒执行——保旧 loop 语义（loop 从不预检 abort，abort 由 provider
    // 内部 chat 判；本原语只对「重试」做 signal 门，不改变首发行为：R1 空响应面
    // engine-loop-empty-response ⑤「signal 已 abort → 仅 1 次调用」不变）。i>0 且
    // 已 abort（含退避期间 abort）→ 抛 abort reason，不追加挂起重试调用。
    if (i > 0 && options.signal?.aborted) {
      throw options.signal.reason ?? new Error('aborted')
    }
    try {
      return await attempt()
    } catch (err) {
      lastErr = err
      // 仅「仍可重试模型错误」且未达预算 → 退避后续试；否则（非可重试 / 末次
      // 预算耗尽 / signal 已 abort）穿透——不放大 #260 fail-fast，不空耗 400/死网。
      // shouldRetryModelError 内 signal.aborted 判 false（abort 不重试），双保险。
      if (i < cfg.maxRetries && shouldRetryModelError(err, options.signal)) {
        const backoff = turnRecoveryBackoffMs(i, cfg.backoffBaseMs, cfg.backoffCapMs)
        if (backoff > 0) {
          await sleepSignalAware(backoff, options.signal)
        }
        continue
      }
      throw err
    }
  }
  throw lastErr
}
