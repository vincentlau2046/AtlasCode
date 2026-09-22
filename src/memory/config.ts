/**
 * 自治三柱③: memory 配置 — 实现（B 波 S2）
 *
 * charter L3 memory 自治：growthbook 直连 → Port 8（FeatureConfigPort）注入；
 * memdir/paths 收进域内；config.ts 读 env → MemoryConfig。
 *
 * env 来源：env-defaults-decision.md
 *   • ATLAS_DISABLE_AUTO_MEMORY（③ 保持关 = 自动记忆默认开）
 *   • ATLAS_IDLE_THRESHOLD_MINUTES（② preset 75）
 *   • ATLAS_IDLE_TOKEN_THRESHOLD（② preset 100_000）
 *
 * AUT-2 优先级链：企业策略(MDM) > env > settings.json > 代码默认。
 * 本函数读 env 层 + 代码默认层（链底）。settings/MDM 层待对应 port 接线。
 * growthbook 远程实验配置经 Port 8 注入（isExtractModeActive 等不在此）。
 */
import { isAutoMemoryEnabled } from './paths'
import { isEnvDefinedFalsy, isEnvTruthy } from '../shared'

/** memory 域从 env 读取的配置（growthbook 实验配置走 Port 8 注入，不在此） */
export interface MemoryConfig {
  /** ATLAS_DISABLE_AUTO_MEMORY（③ 保持关 = 自动记忆默认开） */
  readonly autoMemoryEnabled: boolean
  /** ATLAS_IDLE_THRESHOLD_MINUTES（② preset 75） */
  readonly idleThresholdMinutes: number
  /** ATLAS_IDLE_TOKEN_THRESHOLD（② preset 100_000） */
  readonly idleTokenThreshold: number
}

const DEFAULT_IDLE_THRESHOLD_MINUTES = 75
const DEFAULT_IDLE_TOKEN_THRESHOLD = 100_000

/**
 * 解析非负整数 env 值；无效/缺失返回 undefined。
 */
function parseNonNegInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return undefined
  return n
}

/**
 * 读 env 生成 MemoryConfig。
 *
 * growthbook 远程实验配置经 FeatureConfigPort 注入（Port 8），不在此直连。
 * autoMemoryEnabled 委托 paths.isAutoMemoryEnabled() 的完整优先级链
 * （DISABLE_AUTO_MEMORY / SIMPLE / REMOTE / settings / 默认 ON）。
 *
 * @returns memory 域 env 配置
 */
export function createMemoryConfig(): MemoryConfig {
  return {
    autoMemoryEnabled: isAutoMemoryEnabled(),
    idleThresholdMinutes:
      parseNonNegInt(process.env.ATLAS_IDLE_THRESHOLD_MINUTES) ??
      DEFAULT_IDLE_THRESHOLD_MINUTES,
    idleTokenThreshold:
      parseNonNegInt(process.env.ATLAS_IDLE_TOKEN_THRESHOLD) ??
      DEFAULT_IDLE_TOKEN_THRESHOLD,
  }
}

/**
 * 仅从 ATLAS_DISABLE_AUTO_MEMORY 单变量判定（不经完整链）。
 * 测试辅助 + config 层细粒度断言用。
 */
export function autoMemoryEnabledFromEnv(): boolean {
  const envVal = process.env.ATLAS_DISABLE_AUTO_MEMORY
  if (isEnvTruthy(envVal)) return false
  if (isEnvDefinedFalsy(envVal)) return true
  return true
}
