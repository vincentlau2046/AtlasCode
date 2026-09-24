/**
 * session 域 — JSONL 解析/序列化域内小工具（E-7 S-7d d1，§8.49 详案 item 6
 * 「域内小工具 parseJSONL / jsonParse / jsonStringify」独立小文件承载）
 *
 * 旧仓来源：src/utils/json.ts parseJSONL 族（L94-215 逐字）+ src/utils/
 * slowOperations.ts jsonParse/jsonStringify（语义逐字，**计时面裁**——旧
 * slowLogging 包裹归 telemetry 已删的 879 点同族，纯 JSON.parse/stringify
 * 语义保留）。
 *
 * 裁面登记（审视 B-1，E-7 d1 独立审视 NIT）：旧 readJSONLFile（json.ts
 * L201，100MB 尾读）未随迁——全仓唯一消费者 = stats.ts:177（CLI 会话
 * 统计面，d1 域外），归 CLI stats 波。
 */

/**
 * Bun.JSONL.parseChunk if available, false otherwise.
 * Supports both strings and Buffers, minimizing memory usage and copies.
 * Also handles BOM stripping internally.
 */
type BunJSONLParseChunk = (
  data: string | Buffer,
  offset?: number,
) => { values: unknown[]; error: null | Error; read: number; done: boolean }

const bunJSONLParse: BunJSONLParseChunk | false = (() => {
  if (typeof Bun === 'undefined') return false
  const b = Bun as Record<string, unknown>
  const jsonl = b.JSONL as Record<string, unknown> | undefined
  if (!jsonl?.parseChunk) return false
  return jsonl.parseChunk as BunJSONLParseChunk
})()

function parseJSONLBun<T>(data: string | Buffer): T[] {
  const parse = bunJSONLParse as BunJSONLParseChunk
  const len = data.length
  const result = parse(data)
  if (!result.error || result.done || result.read >= len) {
    return result.values as T[]
  }
  // Had an error mid-stream — collect what we got and keep going
  let values = result.values as T[]
  let offset = result.read
  while (offset < len) {
    const newlineIndex =
      typeof data === 'string'
        ? data.indexOf('\n', offset)
        : data.indexOf(0x0a, offset)
    if (newlineIndex === -1) break
    offset = newlineIndex + 1
    const next = parse(data, offset)
    if (next.values.length > 0) {
      values = values.concat(next.values as T[])
    }
    if (!next.error || next.done || next.read >= len) break
    offset = next.read
  }
  return values
}

function parseJSONLBuffer<T>(buf: Buffer): T[] {
  const bufLen = buf.length
  let start = 0

  // Strip UTF-8 BOM (EF BB BF)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    start = 3
  }

  const results: T[] = []
  while (start < bufLen) {
    let end = buf.indexOf(0x0a, start)
    if (end === -1) end = bufLen

    const line = buf.toString('utf8', start, end).trim()
    start = end + 1
    if (!line) continue
    try {
      results.push(JSON.parse(line) as T)
    } catch {
      // Skip malformed lines
    }
  }
  return results
}

function parseJSONLString<T>(data: string): T[] {
  // Strip UTF-8 BOM (PowerShell 5.x adds BOM to UTF-8 files)
  const stripped = data.startsWith('﻿') ? data.slice(1) : data
  const len = stripped.length
  let start = 0

  const results: T[] = []
  while (start < len) {
    let end = stripped.indexOf('\n', start)
    if (end === -1) end = len

    const line = stripped.substring(start, end).trim()
    start = end + 1
    if (!line) continue
    try {
      results.push(JSON.parse(line) as T)
    } catch {
      // Skip malformed lines
    }
  }
  return results
}

/**
 * Parses JSONL data from a string or Buffer, skipping malformed lines.
 * Uses Bun.JSONL.parseChunk when available for better performance,
 * falls back to indexOf-based scanning otherwise.
 */
export function parseJSONL<T>(data: string | Buffer): T[] {
  if (bunJSONLParse) {
    return parseJSONLBun<T>(data)
  }
  if (typeof data === 'string') {
    return parseJSONLString<T>(data)
  }
  return parseJSONLBuffer<T>(data)
}

/**
 * 旧 slowOperations.jsonParse 语义逐字（计时包裹裁）：V8 de-opts JSON.parse
 * when a second argument is passed, even if undefined — branch explicitly so
 * the common (no-reviver) path stays on the fast path.
 */
export const jsonParse: typeof JSON.parse = (text, reviver) => {
  return typeof reviver === 'undefined'
    ? JSON.parse(text)
    : JSON.parse(text, reviver)
}

/** 旧 slowOperations.jsonStringify 语义逐字（计时包裹裁）。 */
export function jsonStringify(
  data: unknown,
  space?: number,
): string {
  return JSON.stringify(data, undefined, space)
}
