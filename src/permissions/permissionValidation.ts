/**
 * 权限规则校验（E-4 S-4c2 语法核心 5 检 §8.35 + E-6 S-6d 语义支 3 块 §8.43）
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
 * E-6 S-6d 语义支 3 块回填（§8.43；依赖面 = toolValidationConfig 纯数据
 * 103L，裁定 ⑥ 订正「工具注册表依赖」误判 → 全落）:
 *   ① customValidation（getCustomValidation 按工具名查自定义校验器：
 *      WebSearch 通配拒 / WebFetch URL 拒 + domain: 前缀必填）
 *   ② Bash `:*` 两检（中置 `:*` 拒 / 空前缀 `:*` 拒；通配任意位新语义
 *      `npm *` 合法）
 *   ③ File 工具 `:*` 误用拒 + 通配位置启发（非边界非 `**` 中置通配拒）
 *
 * 裁出面登记（复审勿当遗漏重提）:
 *   - 返回型 examples 字段裁（旧返回型含；消费面 filter 仅组
 *     error + suggestion 进 warning message，提示面残留守同 S-3b 口径；
 *     S-6d 3 块随裁仅 error + suggestion）。
 *   - PermissionRuleSchema（zod superRefine 包装）无消费点 → 不落
 *     （H6 死接缝禁；旧消费 = settings strict 校验面 / UI，均残留守；
 *     §8.34 裁定 ② 口径 S-6d 续不落）。
 *
 * 消费点（H6 实挂）：engine/config/validation.ts filterInvalidPermissionRules
 * 接缝③ 语法+语义过滤支（非字符串 OR 校验失败 → 滤 + warning）。
 */
import { permissionRuleValueFromString } from './permissionRuleParser'
import { mcpInfoFromString } from './mcpRuleNames'
import {
  getCustomValidation,
  isBashPrefixTool,
  isFilePatternTool,
} from './toolValidationConfig'

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
 * Validates permission rule format and content（语法核心 5 检 +
 * S-6d 语义支 3 块，顺序：customValidation → Bash `:*` → File 通配位）。
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

  // S-6d 语义支 3 块（旧仓逐字，examples 字段沿 S-4c2 裁）
  // Check for custom validation rules first
  const customValidation = getCustomValidation(parsed.toolName)
  if (customValidation && parsed.ruleContent !== undefined) {
    const customResult = customValidation(parsed.ruleContent)
    if (!customResult.valid) {
      return customResult
    }
  }

  // Bash-specific validation
  if (isBashPrefixTool(parsed.toolName) && parsed.ruleContent !== undefined) {
    const content = parsed.ruleContent

    // Check for common :* mistakes - :* must be at the end (legacy prefix syntax)
    if (content.includes(':*') && !content.endsWith(':*')) {
      return {
        valid: false,
        error: 'The :* pattern must be at the end',
        suggestion:
          'Move :* to the end for prefix matching, or use * for wildcard matching',
      }
    }

    // Check for :* without a prefix
    if (content === ':*') {
      return {
        valid: false,
        error: 'Prefix cannot be empty before :*',
        suggestion: 'Specify a command prefix before :*',
      }
    }

    // Note: We don't validate quote balancing because bash quoting rules are complex.
    // Wildcards are allowed at any position for flexible pattern matching
    // ("npm *" / "* install" / "git * main" 均合法)；legacy :* 前缀语法
    // 向后兼容。
  }

  // File tool validation
  if (isFilePatternTool(parsed.toolName) && parsed.ruleContent !== undefined) {
    const content = parsed.ruleContent

    // Check for :* in file patterns (common mistake from Bash patterns)
    if (content.includes(':*')) {
      return {
        valid: false,
        error: 'The ":*" syntax is only for Bash prefix rules',
        suggestion: 'Use glob patterns like "*" or "**" for file matching',
      }
    }

    // Warn about wildcards not at boundaries
    if (
      content.includes('*') &&
      !content.match(/^\*|\*$|\*\*|\/\*|\*\.|\*\)/) &&
      !content.includes('**')
    ) {
      // This is a loose check - wildcards in the middle might be valid in some cases
      // but often indicate confusion
      return {
        valid: false,
        error: 'Wildcard placement might be incorrect',
        suggestion: 'Wildcards are typically used at path boundaries',
      }
    }
  }

  return { valid: true }
}
