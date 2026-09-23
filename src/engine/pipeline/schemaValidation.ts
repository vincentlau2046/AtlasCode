/**
 * engine/pipeline — 输入 schema 校验（§8.23 E-1b T-4c，旧仓 zod safeParse 的 JSON-schema 浅校验替身）
 *
 * 新仓 `Tool.inputSchema` 是 plain JSON schema object（`ToolInputJSONSchema`，非 zod，无外部依赖），
 * 旧仓 `tool.inputSchema.safeParse`（zod）在此裁成浅校验：required + properties 基础类型。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 浅校验只覆盖基础类型（string/number/integer/boolean/array/object/null）+ required；
 *     复合类型（anyOf/oneOf/allOf、嵌套 object 递归、enum、pattern、minLength/maxLength、
 *     数值区间）→ 残留守（复杂 schema 校验归工具面 E-2/纵切；本版对 unknown 类型跳过不假拒）。
 *   - 旧仓 zod error 的逐字段 path 格式（formatZodValidationError）→ 裁成扁平 message
 *     （`field "X": expected T, got S` 列表），够用非逐 path。
 */
import type { Tool, ToolInputJSONSchema } from '../../shared'

export type SchemaValidationResult = { valid: true } | { valid: false; message: string }

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/** 单值基础类型检查（返回错误串；通过 = null）。unknown/联合类型跳过（残留守，不假拒）。 */
function checkBasicType(value: unknown, type: string): string | null {
  switch (type) {
    case 'string':
      return typeof value === 'string' ? null : `expected string, got ${typeName(value)}`
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `expected number, got ${typeName(value)}`
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
        ? null
        : `expected integer, got ${typeName(value)}`
    case 'boolean':
      return typeof value === 'boolean' ? null : `expected boolean, got ${typeName(value)}`
    case 'array':
      return Array.isArray(value) ? null : `expected array, got ${typeName(value)}`
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? null
        : `expected object, got ${typeName(value)}`
    case 'null':
      return value === null ? null : `expected null, got ${typeName(value)}`
    default:
      // unknown / anyOf / oneOf / allOf 等复合类型 → 残留守，跳过不假拒（见头注）。
      return null
  }
}

/**
 * 浅 JSON-schema 校验（T-4c）：input 须为 object + required 存在 + 各 property 基础类型匹配。
 * schema 为 undefined = 无约束（直接通过）。仅检 input 中实际出现的 key（未声明 key 不拒）。
 */
export function validateInputBySchema(
  input: unknown,
  schema: ToolInputJSONSchema | undefined,
): SchemaValidationResult {
  if (!schema) {
    return { valid: true }
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, message: 'expected object input' }
  }
  const record = input as Record<string, unknown>
  const errors: string[] = []

  const required = (schema as { required?: unknown }).required
  if (Array.isArray(required)) {
    for (const rawKey of required) {
      const key = String(rawKey)
      if (!(key in record) || record[key] === undefined) {
        errors.push(`missing required field "${key}"`)
      }
    }
  }

  const properties = schema.properties
  if (properties) {
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) continue
      const propSchema = properties[key]
      if (!propSchema || typeof propSchema !== 'object') continue
      const type = (propSchema as { type?: unknown }).type
      if (typeof type !== 'string') continue
      const err = checkBasicType(value, type)
      if (err) errors.push(`field "${key}": ${err}`)
    }
  }

  return errors.length > 0 ? { valid: false, message: errors.join('; ') } : { valid: true }
}

/**
 * schema-not-sent 提示（T-4c，旧仓 buildSchemaNotSentHint 纯函数化）：
 * 入参 = discovered 集合（schema 实际下发给模型的工具名）+ tool.shouldDefer。
 * 不依赖旧仓 ToolSearch 特性族 feature gate（isToolSearchEnabledOptimistic /
 * isToolSearchToolAvailable 未移植，现搬会造假依赖）。
 *
 * 语义：deferred 工具且其 name 不在 discovered 集 = schema 未随 prompt 下发 →
 * 模型易把 typed 参数（数组/数字/布尔）发成字符串，客户端解析拒绝 → 回提示让模型重发正确类型。
 * 非 deferred 工具（schema 恒下发）或 name 已在 discovered 集 → null（不误报）。
 *
 * 残留守：旧仓提示里的「先调 ToolSearch 加载工具」纠正动作（TOOL_SEARCH_TOOL_NAME）未移植，
 * 本版纠正动作退化为「重发正确类型参数」；ToolSearch/deferred-tools 落地时回填加载动作。
 */
export function buildSchemaNotSentHint(
  tool: Pick<Tool, 'name' | 'shouldDefer'>,
  discoveredToolNames: ReadonlySet<string>,
): string | null {
  if (!tool.shouldDefer) return null
  if (discoveredToolNames.has(tool.name)) return null
  return (
    `\n\nThis tool's schema was not sent to the API — it was not in the discovered-tool set derived from message history. ` +
    `Without the schema in your prompt, typed parameters (arrays, numbers, booleans) get emitted as strings and the client-side parser rejects them. ` +
    `Re-issue the call with correctly-typed parameters (arrays/numbers/booleans, not their string forms).`
  )
}
