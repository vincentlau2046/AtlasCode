/**
 * permissionRuleParser — 规则串 parse/serialize（E-4 S-4a，§8.31/§8.32 双落位裁定）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissionRuleParser.ts（183L）。
 * 双落位裁定（§8.32）：
 *   - 纯字符串函数（escape/unescape/parse/toString + 未转义字符查找）→ 本文件（permissions 域）；
 *   - LEGACY alias map 4 项（正规名 = 工具名表面，单一事实源 engine/tools/toolNames）
 *     → engine 侧 `engine/tools/legacyToolNameAliases.ts`（模块加载注册），
 *     经下方注入窗口进入本域（L3：permissions 纯叶域不向上 import engine；
 *     settingsPaths.ts S-3c 先例——未注入 = 空回落非 fail-fast：
 *     未注入 = 空 map → normalizeLegacyToolName = identity，安全降级）。
 *
 * 旧仓语义（逐字移植，单测逐支钉死）：
 *   - escape 序 = 先反斜杠后括号；unescape 逆序（先括号后反斜杠）
 *   - parse = 首个未转义 `(` + 末个未转义 `)`（奇偶反斜杠判转义）：
 *     裸工具名 / `Tool(content)` / `Tool()` 与 `Tool(*)` → tool-wide 规则（无 ruleContent）/
 *     无匹配右括号 / 右括号后有尾内容 / 空工具名（'(foo)'）→ 整体当工具名
 *   - parse 时 normalize（normalizeLegacyToolName）→ 规则匹配面永不见到 legacy 名
 */
import type { PermissionRuleValue } from '../shared'

/**
 * LEGACY alias 表注入窗口（engine 侧模块加载注册单一事实源；
 * 未注入 = 空 map → normalize = identity，getLegacyToolNames = []）。
 * 单进程多测文件连跑场景用 resetLegacyToolNameAliases() 隔离模块态。
 */
let legacyToolNameAliases: Record<string, string> = {}

export function setLegacyToolNameAliases(map: Record<string, string>): void {
  legacyToolNameAliases = map
}

export function getLegacyToolNameAliases(): Record<string, string> {
  return legacyToolNameAliases
}

export function resetLegacyToolNameAliases(): void {
  legacyToolNameAliases = {}
}

/**
 * 旧工具名 → 现正规名归一（空表 = identity）。
 * 工具改名时由 engine 侧在 alias 表加 old → new，使权限规则、hooks 与
 * 持久化 wire 名解析到正规名（旧仓 permissionRuleParser.ts 头注逐字）。
 */
export function normalizeLegacyToolName(name: string): string {
  return legacyToolNameAliases[name] ?? name
}

/** 某正规名对应的 legacy 名列表（Object.entries 插入序，旧仓逐字）。 */
export function getLegacyToolNames(canonicalName: string): string[] {
  const result: string[] = []
  for (const [legacy, canonical] of Object.entries(legacyToolNameAliases)) {
    if (canonical === canonicalName) result.push(legacy)
  }
  return result
}

/**
 * 转义规则内容中的特殊字符（供安全存入权限规则）。
 * 权限规则用 "Tool(content)" 形态，内容中的括号必须转义。
 *
 * 转义顺序：
 * 1. 先转义已有反斜杠（\ -> \\）
 * 2. 再转义括号（( -> \(，) -> \)）
 *
 * 例：
 * escapeRuleContent('psycopg2.connect()') // => 'psycopg2.connect\\(\\)'
 * escapeRuleContent('echo "test\\nvalue"') // => 'echo "test\\\\nvalue"'
 */
export function escapeRuleContent(content: string): string {
  return content
    .replace(/\\/g, '\\\\') // 先转义反斜杠
    .replace(/\(/g, '\\(') // 转义左括号
    .replace(/\)/g, '\\)') // 转义右括号
}

/**
 * 从权限规则解析后反转义规则内容中的特殊字符（escapeRuleContent 的逆操作）。
 *
 * 反转义顺序（与转义相反）：
 * 1. 先反转义括号（\( -> (，\) -> )）
 * 2. 再反转义反斜杠（\\ -> \）
 *
 * 例：
 * unescapeRuleContent('psycopg2.connect\\(\\)') // => 'psycopg2.connect()'
 * unescapeRuleContent('echo "test\\\\nvalue"') // => 'echo "test\\nvalue"'
 */
export function unescapeRuleContent(content: string): string {
  return content
    .replace(/\\\(/g, '(') // 反转义左括号
    .replace(/\\\)/g, ')') // 反转义右括号
    .replace(/\\\\/g, '\\') // 最后反转义反斜杠
}

/**
 * 把权限规则串解析为组件。内容部分可含转义括号。
 *
 * 形态："ToolName" 或 "ToolName(content)"
 * 内容可含转义括号：\( 与 \)
 *
 * 例：
 * permissionRuleValueFromString('Bash') // => { toolName: 'Bash' }
 * permissionRuleValueFromString('Bash(npm install)') // => { toolName: 'Bash', ruleContent: 'npm install' }
 * permissionRuleValueFromString('Bash(python -c "print\\(1\\)")') // => { toolName: 'Bash', ruleContent: 'python -c "print(1)"' }
 */
export function permissionRuleValueFromString(
  ruleString: string,
): PermissionRuleValue {
  // 找首个未转义的左括号
  const openParenIndex = findFirstUnescapedChar(ruleString, '(')
  if (openParenIndex === -1) {
    // 无括号——仅工具名
    return { toolName: normalizeLegacyToolName(ruleString) }
  }

  // 找末个未转义的右括号
  const closeParenIndex = findLastUnescapedChar(ruleString, ')')
  if (closeParenIndex === -1 || closeParenIndex <= openParenIndex) {
    // 无匹配右括号或畸形——整体当工具名
    return { toolName: normalizeLegacyToolName(ruleString) }
  }

  // 右括号必须在末尾
  if (closeParenIndex !== ruleString.length - 1) {
    // 右括号后有内容——整体当工具名
    return { toolName: normalizeLegacyToolName(ruleString) }
  }

  const toolName = ruleString.substring(0, openParenIndex)
  const rawContent = ruleString.substring(openParenIndex + 1, closeParenIndex)

  // 缺工具名（如 "(foo)"）畸形——整体当工具名
  if (!toolName) {
    return { toolName: normalizeLegacyToolName(ruleString) }
  }

  // 空内容（如 "Bash()"）或裸通配（如 "Bash(*)"）→ tool-wide 规则（仅工具名）
  if (rawContent === '' || rawContent === '*') {
    return { toolName: normalizeLegacyToolName(toolName) }
  }

  // 内容反转义
  const ruleContent = unescapeRuleContent(rawContent)
  return { toolName: normalizeLegacyToolName(toolName), ruleContent }
}

/**
 * 把权限规则值转回字符串形态（内容括号转义防解析歧义）。
 *
 * 例：
 * permissionRuleValueToString({ toolName: 'Bash' }) // => 'Bash'
 * permissionRuleValueToString({ toolName: 'Bash', ruleContent: 'npm install' }) // => 'Bash(npm install)'
 * permissionRuleValueToString({ toolName: 'Bash', ruleContent: 'python -c "print(1)"' }) // => 'Bash(python -c "print\\(1\\)")'
 */
export function permissionRuleValueToString(
  ruleValue: PermissionRuleValue,
): string {
  if (!ruleValue.ruleContent) {
    return ruleValue.toolName
  }
  const escapedContent = escapeRuleContent(ruleValue.ruleContent)
  return `${ruleValue.toolName}(${escapedContent})`
}

/**
 * 找字符首个未转义出现位置。转义 = 前面有奇数个反斜杠。
 */
function findFirstUnescapedChar(str: string, char: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      // 数前导反斜杠
      let backslashCount = 0
      let j = i - 1
      while (j >= 0 && str[j] === '\\') {
        backslashCount++
        j--
      }
      // 偶数个反斜杠 = 未转义
      if (backslashCount % 2 === 0) {
        return i
      }
    }
  }
  return -1
}

/**
 * 找字符末个未转义出现位置。转义 = 前面有奇数个反斜杠。
 */
function findLastUnescapedChar(str: string, char: string): number {
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === char) {
      let backslashCount = 0
      let j = i - 1
      while (j >= 0 && str[j] === '\\') {
        backslashCount++
        j--
      }
      if (backslashCount % 2 === 0) {
        return i
      }
    }
  }
  return -1
}
