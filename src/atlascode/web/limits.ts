/**
 * AtlasWeb S0-R web 域单一资源常量表（工单 §4.4 冻结值；呈批书 §7.4
 * "常量单源 src/atlascode/web/limits.ts"）。
 *
 * 每参数 DEFAULT 可配（不得越 HARD 硬上限，host 不可调高）；R-1 先落
 * runtime/adapter 首车需要的界，R-2 补齐全表（pending/lease/cursor 族）。
 */

import { WebSessionError } from './errors'

export const MIB = 1024 * 1024

// ── 单 transcript 原始字节（读前/增长中超界 resourceLimit，零隐式截断）───────
export const DEFAULT_MAX_TRANSCRIPT_BYTES = 64 * MIB
export const HARD_MAX_TRANSCRIPT_BYTES = 256 * MIB

// ── 每 scope 最多扫描 session（上限+1 即 resourceLimit，不伪完整）────────────
export const DEFAULT_MAX_SCAN_SESSIONS = 4096
export const HARD_MAX_SCAN_SESSIONS = 16384

// ── 每 runtime scopes（start 拒不合法配置）───────────────────────────────────
export const DEFAULT_MAX_SCOPES_PER_RUNTIME = 32
export const HARD_MAX_SCOPES_PER_RUNTIME = 128

// ── 读取/解析批次 ─────────────────────────────────────────────────────────────
export const READ_CHUNK_SIZE = 64 * 1024
export const PARSE_BATCH_SIZE = 256

/**
 * 有界整数校验（工单 §4.4：禁 NaN/Infinity/小数/负值；>硬上限拒）。
 * value === undefined → 缺省值；不合法 → invalidRequest。
 */
export function validateBoundedInt(
  name: string,
  value: number | undefined,
  defaultValue: number,
  hardMax: number,
  hardMin = 1,
): number {
  if (value === undefined) return defaultValue
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < hardMin ||
    value > hardMax
  ) {
    throw new WebSessionError(
      'invalidRequest',
      `limit ${name} must be an integer in [${hardMin}, ${hardMax}]`,
    )
  }
  return value
}
