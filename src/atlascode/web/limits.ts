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

// ── 分页（result 按稳定 snapshot 分页）────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 50
export const HARD_MAX_PAGE_SIZE = 200

// ── search query（Unicode code points；literal 无 regex）──────────────────────
export const SEARCH_QUERY_MIN_CODE_POINTS = 1
export const SEARCH_QUERY_MAX_CODE_POINTS = 256

// ── 单 JSONL 记录字节（流式边界检测超界 resourceLimit）─────────────────────────
export const DEFAULT_MAX_RECORD_BYTES = MIB
export const HARD_MAX_RECORD_BYTES = 8 * MIB

// ── 每 transcript 解析记录（条）───────────────────────────────────────────────
export const DEFAULT_MAX_PARSE_RECORDS = 100_000
export const HARD_MAX_PARSE_RECORDS = 500_000

// ── 单完整 projection/事件序列化字节（明确不返回半投影）───────────────────────
export const DEFAULT_MAX_PROJECTION_BYTES = 4 * MIB
export const HARD_MAX_PROJECTION_BYTES = 16 * MIB

// ── list 面 title 头读界（G-D，2026-11-20）：单会话头读字节窗。窗内可容
//    custom-title/summary/首 user 行 → 提取 title；文件 ≤ 窗 = 全读尽 →
//    messageCount 精确；超界 → null（诚实不精确面）。常量非 knob：
//    提取失败降级 null，不构成资源面攻点。
export const TITLE_HEAD_BYTES = 64 * 1024
/** wire 契约 title ≤512 code points（SessionSummarySchema）——钳制上限。 */
export const TITLE_MAX_CODE_POINTS = 512
/** 首条 user 消息派生标题的展示截断点（≤契约 512）。 */
export const TITLE_USER_MESSAGE_CODE_POINTS = 120

// ── 每 runtime subscriptions / 并发读操作 ─────────────────────────────────────
export const DEFAULT_MAX_SUBSCRIPTIONS = 16
export const HARD_MAX_SUBSCRIPTIONS = 64
export const DEFAULT_MAX_CONCURRENT_READS = 4
export const HARD_MAX_CONCURRENT_READS = 16

// ── 每 subscription pending 事件 / 序列化字节（终态控制槽独立保留 1 条）───────
export const DEFAULT_MAX_PENDING_EVENTS = 8
export const HARD_MAX_PENDING_EVENTS = 32
export const DEFAULT_MAX_PENDING_BYTES = 8 * MIB
export const HARD_MAX_PENDING_BYTES = 32 * MIB

// ── 时序类 ────────────────────────────────────────────────────────────────────
export const DEFAULT_POLLING_INTERVAL_MS = 1000
export const HARD_MIN_POLLING_INTERVAL_MS = 100
export const HARD_MAX_POLLING_INTERVAL_MS = 60_000
export const DEFAULT_REQUEST_DEADLINE_MS = 10_000
export const HARD_MIN_REQUEST_DEADLINE_MS = 1
export const HARD_MAX_REQUEST_DEADLINE_MS = 60_000
export const DEFAULT_IDLE_LEASE_MS = 120_000
export const HARD_MIN_IDLE_LEASE_MS = 1000
export const HARD_MAX_IDLE_LEASE_MS = 600_000
export const DEFAULT_CURSOR_TTL_MS = 600_000
export const HARD_MIN_CURSOR_TTL_MS = 1000
export const HARD_MAX_CURSOR_TTL_MS = 3_600_000
export const DEFAULT_CLOSE_DEADLINE_MS = 2000
export const HARD_MIN_CLOSE_DEADLINE_MS = 1
export const HARD_MAX_CLOSE_DEADLINE_MS = 10_000

// ── cursor/result snapshot ledger ─────────────────────────────────────────────
export const DEFAULT_LEDGER_CAPACITY = 128
export const HARD_MAX_LEDGER_CAPACITY = 1024
export const DEFAULT_LEDGER_PAYLOAD_BYTES = 16 * MIB
export const HARD_MAX_LEDGER_PAYLOAD_BYTES = 64 * MIB

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
