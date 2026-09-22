/**
 * 自治三柱③: memory 配置 — 契约冻结（B 波分叉前锁死）
 *
 * charter L3 memory 自治：growthbook 直连 → Port 8（FeatureConfigPort）注入；
 * memdir/paths 收进域内；config.ts 读 env → MemoryConfig。
 *
 * env 来源：env-defaults-decision.md（ATLAS_DISABLE_AUTO_MEMORY / IDLE_* 两项）。
 */

/** memory 域从 env 读取的配置（growthbook 实验配置走 Port 8 注入，不在此） */
export interface MemoryConfig {
  /** ATLAS_DISABLE_AUTO_MEMORY（③ 保持关 = 自动记忆默认开） */
  readonly autoMemoryEnabled: boolean
  /** ATLAS_IDLE_THRESHOLD_MINUTES（② preset 75） */
  readonly idleThresholdMinutes: number
  /** ATLAS_IDLE_TOKEN_THRESHOLD（② preset 100_000） */
  readonly idleTokenThreshold: number
}

/**
 * 读 env 生成 MemoryConfig。B 波 S2 实现。
 * growthbook 远程实验配置经 FeatureConfigPort 注入（Port 8），不在此直连。
 * @returns memory 域 env 配置
 */
export function createMemoryConfig(): MemoryConfig {
  // B 波 S2 实现：读 process.env + env-defaults-decision fallback
  throw new Error("B 波 S2 实现：createMemoryConfig()")
}
