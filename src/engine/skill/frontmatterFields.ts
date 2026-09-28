/**
 * engine/skill — frontmatter 辅助解析面（§8.67 D 波 S-E2a）。
 *
 * 旧仓 src/utils/frontmatterParser.ts 中 skill 面消费子集的本地落面：新仓
 * memory/frontmatterParser.ts 仅落 parseFrontmatter/FrontmatterData 核面，
 * 以下 4 辅助为新仓 0 命中 → 本域本地实现（逐字语义）：
 *   - parseBooleanFrontmatter：'true'/'1'/true → true，其余 false
 *   - coerceDescriptionToString：description 归一（string 透传 / 对象取
 *     首行 / 其他 → null）
 *   - parseShellFrontmatter：shell 字段收窄 'bash'|'powershell'（非法值
 *     丢弃 + debug 日志）
 *   - splitPathInFrontmatter：paths 字段拆 pattern 数组（逗号/换行/数组）
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
 * paths frontmatter 拆 pattern。接受字符串（逗号/换行分隔）或数组。
 */
export function splitPathInFrontmatter(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map(v => v.trim())
      .filter(v => v.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(v => v.trim())
      .filter(v => v.length > 0)
  }
  return []
}
