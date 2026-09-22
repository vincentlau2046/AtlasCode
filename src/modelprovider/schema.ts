/**
 * Zod → JSON Schema 转换 — 从旧仓 modelprovider/schema.ts 迁入
 *
 * 仅依赖 zod/v4，自包含。toolToAPISchema() 每次请求跑 ~60-250 次，
 * WeakMap 按 schema 引缓存。
 */

import { toJSONSchema, type ZodTypeAny } from 'zod/v4'

export type JsonSchema7Type = Record<string, unknown>

const cache = new WeakMap<ZodTypeAny, JsonSchema7Type>()

/** Converts a Zod v4 schema to JSON Schema format. */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema7Type {
  const hit = cache.get(schema)
  if (hit) return hit
  const result = toJSONSchema(schema) as JsonSchema7Type
  cache.set(schema, result)
  return result
}
