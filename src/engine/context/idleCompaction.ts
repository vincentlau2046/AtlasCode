/**
 * 空闲压缩引擎（0.1.80 V3-1 K1-A，上游 2.1.299 语义）
 *
 * 问题面：200K+ 上下文闲置 ~54min 后，服务端 prompt cache（TTL 1h）大概率
 * 已过期——下次请求是 cache-cold 全量重写；此时先压缩再请求 = 效益等价
 * （cache 已冷，压缩不牺牲任何缓存命中）且省 token。
 *
 * 形态裁定：查询期惰性判定（先例 microCompact evaluateTimeBasedTrigger），
 * 非后台 timer——不引入 TUI 后台生命周期。消费点裁定 = shouldAutoCompact
 * OR 臂（autoCompact.ts）：token 阈值未达时评估 idle 触发，复用整条既有
 * autoCompactIfNeeded 路径（熔断/tracking/transcript/buildPostCompactMessages
 * 全复用，零 loop.ts 改动）；上游守卫自动抑制空闲臂（deps.enabled false /
 * querySource 递归守卫 / 小窗结构性不可用）。
 *
 * 配置面（默认开，§5 裁定）：settings `idleCompaction: false` 关；
 * env `ATLAS_IDLE_COMPACT_MIN_TOKENS` 覆写 token 下限（有效 int ≥1，
 * 无效值 guard 忽略——autoCompactWindow 同纪律）。
 *
 * token 单源裁定：消费点用 deps.countTokens 的真 tokenCount（非
 * estimateMessageTokens 双估算）——本模块不自带估算面。
 */

/** 服务端 prompt cache TTL 参照（1h）。 */
export const PROMPT_CACHE_TTL_MS = 3_600_000
/** 闲置触发线（54min = 90% TTL：临近过期即压）。 */
export const IDLE_COMPACT_TRIGGER_MS = 3_240_000
/** 默认 token 下限：仅 200K+ 大上下文值得 idle 压缩。 */
export const IDLE_COMPACT_MIN_TOKENS = 200_000

export type IdleCompactionConfig = {
  enabled: boolean
  minTokens: number
}

export const IDLE_COMPACTION_CONFIG_DEFAULTS: IdleCompactionConfig = {
  enabled: true,
  minTokens: IDLE_COMPACT_MIN_TOKENS,
}

/**
 * settings ⊕ env 合并（纯件，测试直调）。
 * - settingsRaw === false → disabled（唯一关闭口）；null/undefined → 默认开。
 * - envRaw 有效 int ≥1 → 覆写 minTokens；无效（非数字/0/负/小数）→ 忽略。
 * - env 只管下限，不开关 enabled。
 */
export function resolveIdleCompactionConfig(
  settingsRaw?: boolean | null,
  envRaw?: string,
): IdleCompactionConfig {
  const enabled = settingsRaw !== false
  let minTokens = IDLE_COMPACT_MIN_TOKENS
  if (envRaw !== undefined) {
    // 严格整数：Number('1.5')=1.5 / Number('abc')=NaN / Number('')=0 全忽略
    const parsed = Number(envRaw)
    if (Number.isInteger(parsed) && parsed >= 1) minTokens = parsed
  }
  return { enabled, minTokens }
}

/**
 * 触发纯谓词。保守方向：idleMs / totalTokens 非 finite → 不触发
 * （压缩不可逆，缺判定依据不压；对齐 microCompact 保守语义）。
 */
export function shouldIdleCompact(
  config: IdleCompactionConfig,
  idleMs: number,
  totalTokens: number,
): boolean {
  return (
    config.enabled &&
    Number.isFinite(idleMs) &&
    idleMs >= IDLE_COMPACT_TRIGGER_MS &&
    Number.isFinite(totalTokens) &&
    totalTokens >= config.minTokens
  )
}

/**
 * 末条 assistant 时间戳 gap（now − timestamp）。
 * 无 assistant / 时间戳缺失 / NaN / epoch-0 → NaN（无法证明闲置 → 不压缩，
 * shouldIdleCompact 的 isFinite 门拦截）。
 */
export function getIdleMs(messages: readonly unknown[], now: number = Date.now()): number {
  let lastAssistant: { timestamp?: unknown } | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { type?: unknown; timestamp?: unknown }
    if (m && m.type === 'assistant') {
      lastAssistant = m
      break
    }
  }
  if (!lastAssistant) return Number.NaN
  const raw = lastAssistant.timestamp
  if (raw === undefined || raw === null) return Number.NaN
  // 数值时间戳直用（new Date(String(0)) 会把 '0' 解析成 2000 年，epoch-0
  // 守卫漏过——microCompact 字符串面同 quirk，此处直用数值修复）；字符串走
  // Date 解析。
  const ts = typeof raw === 'number' ? raw : new Date(String(raw)).getTime()
  if (!Number.isFinite(ts) || ts <= 0) return Number.NaN
  return now - ts
}

// ── 活态源缝（宿主接线；对齐 autoCompactSettingsSource 模式） ──────────────

let idleCompactionSettingsSource: (() => boolean | null | undefined) | null = null

/** 宿主（TUI contextHostWiring）注入 settings 活态读取缝。 */
export function setIdleCompactionSettingsSource(
  next: (() => boolean | null | undefined) | null,
): void {
  idleCompactionSettingsSource = next
}

/** 消费点活态读（settings 源缝 ⊕ env）。 */
export function getIdleCompactionConfig(): IdleCompactionConfig {
  return resolveIdleCompactionConfig(
    idleCompactionSettingsSource?.(),
    process.env.ATLAS_IDLE_COMPACT_MIN_TOKENS,
  )
}

/** 测试隔离：清源缝（bun mock.module 全局泄漏纪律的进程内对应面）。 */
export function resetIdleCompactionForTesting(): void {
  idleCompactionSettingsSource = null
}
