/**
 * 权限规则语法校验（E-4 S-4c2，§8.35）
 *
 * 旧仓来源（a8af45b）: src/utils/settings/permissionValidation.ts（262L）
 * **语法核心 5 检**（本文件落位面，引擎侧 filterInvalidPermissionRules
 * 接缝③ 回填消费）:
 *   1. 空规则
 *   2. 括号配平（unescaped 计数）
 *   3. 空括号 `()`（escape-aware）
 *   4. MCP 规则禁括号（mcpRuleNames.mcpInfoFromString）
 *   5. 工具名首字母大写（本地 capitalize，旧 stringUtils 语义逐字：
 *      仅首字母大写，余段不动）
 *
 * 裁出面登记（复审勿当遗漏重提）:
 *   - 语义支 3 块 → E-6（依赖面 = 工具注册表，新仓未落）：
 *     ① customValidation（旧 toolValidationConfig.getCustomValidation，
 *        按工具名查自定义校验器）② Bash `:*` 两检（`:*` 末尾 / 空前缀）
 *     ③ File 工具 `:*` 误用 + 通配位置启发。本切片 validatePermissionRule
 *     对这三类输入 = 语法核心通过即 valid（语义支落 E-6 时随消费点回填）。
 *   - PermissionRuleSchema（zod superRefine 包装）无消费点 → 不落
 *     （H6 死接缝禁；旧消费 = settings strict 校验面 / UI，均残留守）。
 *   - 返回型 examples 字段裁（旧返回型含；消费面 filter 仅组
 *     error + suggestion 进 warning message，提示面残留守同 S-3b 口径）。
 *
 * 消费点（H6 实挂）：engine/config/validation.ts filterInvalidPermissionRules
 * 接缝③ 语法过滤支（非字符串 OR 语法校验失败 → 滤 + warning）。
 */
import { permissionRuleValueFromString } from './permissionRuleParser'
import { mcpInfoFromString } from './mcpRuleNames'

/** 本地 capitalize（旧 stringUtils 逐字：仅首字母大写，不降余段）。 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Checks if a character at a given index is escaped (preceded by odd number
 * of backslashes)（旧仓逐字）。
 */
function isEscaped(str: string, index: number): boolean {
  let backslashCount = 0
  let j = index - 1
  while (j >= 0 && str[j] === '\\') {
    backslashCount++
    j--
  }
  return backslashCount % 2 !== 0
}

/**
 * Counts unescaped occurrences of a character in a string（旧仓逐字）。
 */
function countUnescapedChar(str: string, char: string): number {
  let count = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char && !isEscaped(str, i)) {
      count++
    }
  }
  return count
}

/**
 * Checks if a string contains unescaped empty parentheses "()"（旧仓逐字）。
 */
function hasUnescapedEmptyParens(str: string): boolean {
  for (let i = 0; i < str.length - 1; i++) {
    if (str[i] === '(' && str[i + 1] === ')') {
      // Check if the opening paren is unescaped
      if (!isEscaped(str, i)) {
        return true
      }
    }
  }
  return false
}

/**
 * Validates permission rule format and content（语法核心 5 检，语义支裁 E-6）。
 */
export function validatePermissionRule(rule: string): {
  valid: boolean
  error?: string
  suggestion?: string
} {
  // Empty rule check
  if (!rule || rule.trim() === '') {
    return { valid: false, error: 'Permission rule cannot be empty' }
  }

  // Check parentheses matching first (only count unescaped parens)
  const openCount = countUnescapedChar(rule, '(')
  const closeCount = countUnescapedChar(rule, ')')
  if (openCount !== closeCount) {
    return {
      valid: false,
      error: 'Mismatched parentheses',
      suggestion:
        'Ensure all opening parentheses have matching closing parentheses',
    }
  }

  // Check for empty parentheses (escape-aware)
  if (hasUnescapedEmptyParens(rule)) {
    const toolName = rule.substring(0, rule.indexOf('('))
    if (!toolName) {
      return {
        valid: false,
        error: 'Empty parentheses with no tool name',
        suggestion: 'Specify a tool name before the parentheses',
      }
    }
    return {
      valid: false,
      error: 'Empty parentheses',
      suggestion: `Either specify a pattern or use just "${toolName}" without parentheses`,
    }
  }

  // Parse the rule
  const parsed = permissionRuleValueFromString(rule)

  // MCP validation - must be done before general tool validation（旧仓逐字）
  const mcpInfo = mcpInfoFromString(parsed.toolName)
  if (mcpInfo) {
    // MCP rules support server-level, tool-level, and wildcard permissions:
    // mcp__server / mcp__server__* / mcp__server__tool
    // MCP rules cannot have any pattern/content (parentheses)
    if (parsed.ruleContent !== undefined || countUnescapedChar(rule, '(') > 0) {
      return {
        valid: false,
        error: 'MCP rules do not support patterns in parentheses',
        suggestion: `Use "${parsed.toolName}" without parentheses, or use "mcp__${mcpInfo.serverName}__*" for all tools`,
      }
    }
    return { valid: true } // Valid MCP rule
  }

  // Tool name validation (for non-MCP tools)
  if (!parsed.toolName || parsed.toolName.length === 0) {
    return { valid: false, error: 'Tool name cannot be empty' }
  }

  // Check tool name starts with uppercase (standard tools)
  if (parsed.toolName[0] !== parsed.toolName[0]?.toUpperCase()) {
    return {
      valid: false,
      error: 'Tool names must start with uppercase',
      suggestion: `Use "${capitalize(String(parsed.toolName))}"`,
    }
  }

  // 语义支（customValidation / Bash `:*` / File 通配位置）裁 E-6，见头注。
  return { valid: true }
}
