/**
 * modelprovider — 水平回退最近一次记录（P0b 门禁① 信任线「已从 X 回退到 Y」信号源）
 *
 * queryWithRoleFallback 每次调用成功后写入：primary 成功 → 清除（无活跃回退）；
 * fallback 成功 → 记录 { from: 首选 role, to: 实际应答 role }。信任线 segment
 * 只读 getLastRoleFallback() 投影最近一次回退（谁实际在答）。
 *
 * 纯模块（零 I/O / 零 React，engine 红线不破）；module-level 状态 = settings
 * 源注入缝先例（autoCompact.ts autoCompactWindowSettingsSource 同形）。
 * 单测 teardown 调 clearRoleFallback() 复位。
 */

import type { ModelRole } from './roles'

export interface RoleFallbackRecord {
  /** 首选 role（回退前）。 */
  from: ModelRole
  /** 实际应答 role（回退后）。 */
  to: ModelRole
}

let lastRoleFallback: RoleFallbackRecord | null = null

/** primary 成功 → 清除活跃回退记录（最近一次调用未走回退）。 */
export function clearRoleFallback(): void {
  lastRoleFallback = null
}

/** fallback 成功 → 记录最近一次水平回退（from → to）。 */
export function recordRoleFallback(from: ModelRole, to: ModelRole): void {
  lastRoleFallback = { from, to }
}

/** 最近一次回退记录（无 = null）。信任线只读消费。 */
export function getLastRoleFallback(): RoleFallbackRecord | null {
  return lastRoleFallback
}
