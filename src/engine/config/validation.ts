/**
 * engine/config — settings 校验面（§8.27 E-3 S-3b，旧仓 utils/settings/validation.ts 裁剪）
 *
 * 真核心（旧仓逐字语义）：
 *   - formatZodError：ZodError.issues → ValidationError[]（invalid_type/
 *     invalid_value/too_small/custom 四类 issue 呈现）
 *   - filterInvalidPermissionRules：permissions.allow/deny/ask 非字符串项
 *     过滤 + 警告（防单条坏规则毒化整个 settings 文件）
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - validatePermissionRule 规则**语法**校验（旧仓 permissionValidation.ts
 *     262L + permissionRuleParser 依赖链）→ E-4 权限规则树波次落（届时
 *     filterInvalidPermissionRules 补语法过滤支）。新仓 schema
 *     permissions=z.any() 透传，E-4 消费面自带规则校验，本切片仅做
 *     非字符串项兜底过滤（数据面防御，不做决策）。
 *   - getValidationTip 提示面（旧仓 validationTips.ts，UI 修复建议/文档链接）
 *     不随迁 → suggestion/docLink 恒 undefined（提示面残留守）。
 *   - unrecognized_keys issue 分支不随迁：新仓 SettingsSchema 为
 *     .passthrough()（S-3a 裁定），永不产该 issue；strict() 编辑校验面
 *     （旧仓 validateSettingsFileContent，EditTool 配置校验）残留守。
 *   - mcpErrorMetadata（ValidationError 上的 MCP 配置错误聚合字段）：
 *     S-3a 类型面已裁（新仓 MCP 配置面 E-2 已闭环，错误聚合面未落）。
 */
import type { ZodError, ZodIssue } from 'zod'
import type { ValidationError } from './types'

/**
 * Helper type guards for specific Zod v4 issue types
 * （旧仓逐字：v4 issue 形状与 v3 不同，按 code 判别）
 */
function isInvalidTypeIssue(issue: ZodIssue): issue is ZodIssue & {
  code: 'invalid_type'
  expected: string
  input: unknown
} {
  return issue.code === 'invalid_type'
}

function isInvalidValueIssue(issue: ZodIssue): issue is ZodIssue & {
  code: 'invalid_value'
  values: unknown[]
  input: unknown
} {
  return issue.code === 'invalid_value'
}

function isTooSmallIssue(issue: ZodIssue): issue is ZodIssue & {
  code: 'too_small'
  minimum: number | bigint
  origin: string
} {
  return issue.code === 'too_small'
}

/** Get the type string for an unknown value (for error messages) */
function getReceivedType(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function extractReceivedFromMessage(msg: string): string | undefined {
  const match = msg.match(/received (\w+)/)
  return match ? match[1] : undefined
}

/**
 * Format a Zod validation error into human-readable validation errors.
 * 裁剪：unrecognized_keys 分支（passthrough schema 不产）+ tip 提示面。
 */
export function formatZodError(
  error: ZodError,
  filePath: string,
): ValidationError[] {
  return error.issues.map((issue): ValidationError => {
    const path = issue.path.map(String).join('.')
    let message = issue.message
    let expected: string | undefined

    let enumValues: string[] | undefined
    let invalidValue: unknown

    if (isInvalidValueIssue(issue)) {
      enumValues = issue.values.map(v => String(v))
      invalidValue = undefined
    } else if (isInvalidTypeIssue(issue)) {
      const receivedType = extractReceivedFromMessage(issue.message)
      invalidValue = receivedType ?? getReceivedType(issue.input)
    } else if (issue.code === 'custom' && 'params' in issue) {
      invalidValue = (issue.params as { received?: unknown }).received
    }

    if (isInvalidValueIssue(issue)) {
      expected = enumValues?.map(v => `"${v}"`).join(', ')
      message = `Invalid value. Expected one of: ${expected}`
    } else if (isInvalidTypeIssue(issue)) {
      const receivedType =
        extractReceivedFromMessage(issue.message) ??
        getReceivedType(issue.input)
      if (
        issue.expected === 'object' &&
        receivedType === 'null' &&
        path === ''
      ) {
        message = 'Invalid or malformed JSON'
      } else {
        message = `Expected ${issue.expected}, but received ${receivedType}`
      }
    } else if (isTooSmallIssue(issue)) {
      message = `Number must be greater than or equal to ${issue.minimum}`
      expected = String(issue.minimum)
    }

    return {
      file: filePath,
      path,
      message,
      expected,
      invalidValue,
      // 提示面残留守（见头注）：suggestion/docLink 恒 undefined
      suggestion: undefined,
      docLink: undefined,
    }
  })
}

/**
 * Filters invalid permission rules from raw parsed JSON data before schema
 * validation. This prevents one bad entry from poisoning the entire
 * settings file. Returns warnings for each filtered entry.
 *
 * 裁剪：仅非字符串项过滤（数据面兜底）；规则语法校验残留守 E-4（见头注）。
 * 注意：mutate 入参 data 的 permissions 数组（旧仓同语义——过滤后的
 * 数组被后续 schema 解析消费）。
 */
export function filterInvalidPermissionRules(
  data: unknown,
  filePath: string,
): ValidationError[] {
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  if (!obj.permissions || typeof obj.permissions !== 'object') return []
  const perms = obj.permissions as Record<string, unknown>

  const warnings: ValidationError[] = []
  for (const key of ['allow', 'deny', 'ask']) {
    const rules = perms[key]
    if (!Array.isArray(rules)) continue

    perms[key] = rules.filter(rule => {
      if (typeof rule !== 'string') {
        warnings.push({
          file: filePath,
          path: `permissions.${key}`,
          message: `Non-string value in ${key} array was removed`,
          invalidValue: rule,
        })
        return false
      }
      return true
    })
  }
  return warnings
}
