/**
 * engine/skill — frontmatter 辅助解析面（§8.67 D 波 S-E2a）。
 *
 * 旧仓 src/utils/frontmatterParser.ts 中 skill 面消费子集的本地落面：新仓
 * memory/frontmatterParser.ts 仅落 parseFrontmatter/FrontmatterData 核面，
 * 以下 4 辅助为新仓 0 命中 → 本域本地实现：
 *   - parseBooleanFrontmatter：'true'/'1'/true → true，其余 false
 *   - coerceDescriptionToString：description 归一（string 透传 / 对象取
 *     首行 / 其他 → null）
 *   - parseShellFrontmatter：shell 字段收窄 'bash'|'powershell'（非法值
 *     丢弃 + debug 日志）
 *   - splitPathInFrontmatter：paths 字段拆 pattern 数组（逗号/换行/数组
 *     + 花括号感知逗号切分 + 花括号展开——初版朴素切分丢失花括号面，
 *     S-E3 修波回填旧仓 expandBraces 逐字语义，审视 A 路 major-2 订正
 *     头注「逐字语义」笼统措辞）
 * 完整 frontmatter 解析（YAML 块）仍走 memory 域 parseFrontmatter（跨域
 * 消费共享叶子层 ✓）。
 */
import { logForDebugging } from '../../shared'

export type FrontmatterShell = 'bash' | 'powershell'

export function parseBooleanFrontmatter(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1'
  }
  return false
}

/**
 * description 归一为字符串。旧仓语义：字符串透传（去首尾空白，空串 →
 * null）；对象取 .description 字符串面（旧仓嵌套 description 对象形态）；
 * 其他类型 → null。
 */
export function coerceDescriptionToString(
  value: unknown,
  skillName: string,
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'object' && 'description' in value) {
    const nested = (value as { description?: unknown }).description
    if (typeof nested === 'string' && nested.trim().length > 0) {
      return nested.trim()
    }
    logForDebugging(
      `Skill '${skillName}' has a non-string description object; using fallback`,
    )
    return null
  }
  logForDebugging(
    `Skill '${skillName}' has an invalid description type; using fallback`,
  )
  return null
}

/**
 * shell frontmatter 收窄。旧仓语义：仅 'bash'/'powershell' 合法，
 * 其他值丢弃（undefined）+ debug 日志。
 */
export function parseShellFrontmatter(
  value: unknown,
  skillName: string,
): FrontmatterShell | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'bash' || value === 'powershell') return value
  logForDebugging(
    `Skill '${skillName}' has invalid shell '${String(
      value,
    )}'. Valid options: bash, powershell`,
  )
  return undefined
}

/**
 * paths frontmatter 拆 pattern。接受字符串（逗号/换行分隔，花括号深度
 * 感知逗号）或数组（旧仓 YAML list 语义：逐元素递归）。
 *
 * S-E3 修波回填（审视 A 路 major-2）：初版朴素 `split(/[\n,]/)` 丢失
 * 旧仓花括号感知逗号切分 + 花括号展开（旧 src/utils/frontmatterParser.
 * ts:189-266 splitPathInFrontmatter/expandBraces 逐字移植）——
 * "src/*.{ts,tsx}" 初版在内部逗号处误切且不展开 → 条件技能 paths
 * 激活面收窄。
 */
export function splitPathInFrontmatter(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) {
    // 旧仓 YAML list 语义（:190-192）：逐元素递归（切分 + 花括号展开）
    return value
      .filter((v): v is string => typeof v === 'string')
      .flatMap(v => splitPathInFrontmatter(v))
  }
  if (typeof value === 'string') {
    // 旧仓逐字（:196-220）：花括号深度感知切分（花括号内逗号不切）；
    // 换行切分 = 新仓初版扩展面保留（旧仓字符串仅逗号切分）
    const parts: string[] = []
    let current = ''
    let braceDepth = 0
    for (let i = 0; i < value.length; i++) {
      const char = value[i]!
      if (char === '{') {
        braceDepth++
        current += char
      } else if (char === '}') {
        braceDepth--
        current += char
      } else if ((char === ',' || char === '\n') && braceDepth === 0) {
        const trimmed = current.trim()
        if (trimmed) {
          parts.push(trimmed)
        }
        current = ''
      } else {
        current += char
      }
    }
    const trimmed = current.trim()
    if (trimmed) {
      parts.push(trimmed)
    }
    // 旧仓逐字（:228-231）：每 part 花括号展开（嵌套 {a,b}/{c,d} 递归）
    return parts
      .filter(p => p.length > 0)
      .flatMap(pattern => expandBraces(pattern))
  }
  return []
}

/**
 * 展开 glob 花括号 pattern（旧仓 frontmatterParser.expandBraces 逐字移植
 * :240-266）："src/*.{ts,tsx}" → ["src/*.ts","src/*.tsx"]；
 * "{a,b}/{c,d}" → 4 项（后缀递归展开）。
 */
function expandBraces(pattern: string): string[] {
  const braceMatch = pattern.match(/^([^{]*)\{([^}]+)\}(.*)$/)
  if (!braceMatch) {
    return [pattern]
  }
  const prefix = braceMatch[1] || ''
  const alternatives = braceMatch[2] || ''
  const suffix = braceMatch[3] || ''
  const parts = alternatives.split(',').map(alt => alt.trim())
  const expanded: string[] = []
  for (const part of parts) {
    const combined = prefix + part + suffix
    expanded.push(...expandBraces(combined))
  }
  return expanded
}
