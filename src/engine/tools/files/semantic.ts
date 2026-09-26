/**
 * engine/tools/files — semantic 输入容忍（C 桶 ① 子波 3 §8.55 S-C1）。
 *
 * 旧仓来源（a8af45b）：src/utils/semanticNumber.ts 36L +
 * src/utils/semanticBoolean.ts 29L（字符串字面量容忍语义逐字；delta 登记：
 * 旧 = zod `z.preprocess`（模型面 schema 仍 emit number/boolean，字符串容忍
 * = 不可见的客户端侧 coercion），新 shared Tool 契约 = 纯 JSON schema 无
 * zod 运行时 → 运行时转换函数，调用点（Read offset/limit、Grep
 * -B/-A/-C/context/head_limit/offset/multiline/-n/-i、Edit replace_all）
 * 在 call() 入口应用。z.coerce 族（Number()/JS 真值）被旧仓明确排除的
 * 理由（掩盖 "" / null 输入 bug）逐字保留 = 本文件不做 coerce。
 */

/**
 * Number that also accepts numeric string literals like "30", "-5", "3.14".
 *
 * Tool inputs arrive as model-generated JSON. The model occasionally quotes
 * numbers — `"head_limit":"30"` instead of `"head_limit":30` — and number
 * schemas reject that with a type error. z.coerce.number() is the wrong
 * fix: it accepts values like "" or null by converting them via JS Number(),
 * masking bugs rather than surfacing them.
 *
 * Only strings that are valid decimal number literals (matching /^-?\d+(\.\d+)?$/)
 * are coerced. Anything else passes through and is rejected downstream.
 */
export function semanticToNumber(value: unknown): unknown {
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}

/**
 * Boolean that also accepts the string literals "true"/"false".
 *
 * z.coerce.boolean() is the wrong fix: it uses JS truthiness, so
 * "false" → true.
 */
export function semanticToBoolean(value: unknown): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}
