/**
 * memory 域 — markdown frontmatter 解析器（§8.55 S-C2，旧仓
 * src/utils/frontmatterParser.ts 370L 裁面随迁）。
 *
 * 随迁面（memory 域消费闭包）：YAML_SPECIAL_CHARS / quoteProblematicValues /
 * FRONTMATTER_REGEX / parseFrontmatter + FrontmatterData / ParsedMarkdown 型。
 * validateMemoryFrontmatter（同域）为第一真消费者。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓 FrontmatterData 15 字段中的 skill/command 专属字段（allowed-tools /
 *    argument-hint / when_to_use / version / hide-from-slash-command-tool /
 *    model / skills / user-invocable / hooks / effort / context / agent /
 *    paths / shell）裁——memory 域消费面仅 description / type（name 经索引
 *    签名取）；索引签名保留，未来 skill/command 域波迁移 parser 时按域重建
 *    字段（HooksSettings 型随之归 skill 域，不在此引入 settings 域依赖）。
 *  - parseYaml：旧仓 15L 包装（Bun.YAML + 非 Bun 运行时 `yaml` npm
 *    lazy-require 回退）裁为纯 Bun 面——新仓无 yaml 依赖（package.json 无
 *    该键），运行时 = Bun；非 Bun 构建回退归 A 波构建配置波按需重建。
 *  - 旧仓其余导出（splitPathInFrontmatter / expandBraces /
 *    parsePositiveIntFromFrontmatter / coerceDescriptionToString /
 *    parseBooleanFrontmatter / parseShellFrontmatter = skill/command 面
 *    解析族）不随迁（新仓 skill/command 域未物化，消费点不存在；H6 裁面）。
 */

import { logForDebugging } from '../shared'

/**
 * Frontmatter data shape for markdown files（memory 域裁面，见头注）。
 * 未知键经索引签名透传（parseFrontmatter 返回整体 YAML 解析对象）。
 */
export type FrontmatterData = {
  // YAML can return null for keys with no value (e.g., "key:" with nothing after)
  description?: string | null
  // Memory type: 'user', 'feedback', 'project', or 'reference'
  // Only applicable to memory files; narrowed via parseMemoryType() in memoryTypes.ts
  type?: string | null
  [key: string]: unknown
}

export type ParsedMarkdown = {
  frontmatter: FrontmatterData
  content: string
}

// Characters that require quoting in YAML values (when unquoted)
// - { } are flow mapping indicators
// - * is anchor/alias indicator
// - [ ] are flow sequence indicators
// - ': ' (colon followed by space) is key indicator — causes 'Nested mappings
//   are not allowed in compact mappings' when it appears mid-value. Match the
//   pattern rather than bare ':' so '12:34' times and 'https://' URLs stay unquoted.
// - # is comment indicator
// - & is anchor indicator
// - ! is tag indicator
// - | > are block scalar indicators (only at start)
// - % is directive indicator (only at start)
// - @ ` are reserved
const YAML_SPECIAL_CHARS = /[{}[\]*&#!|>%@`]|: /

/**
 * Pre-processes frontmatter text to quote values that contain special YAML characters.
 * This allows glob patterns like **\/*.{ts,tsx} to be parsed correctly.
 */
function quoteProblematicValues(frontmatterText: string): string {
  const lines = frontmatterText.split('\n')
  const result: string[] = []

  for (const line of lines) {
    // Match simple key: value lines (not indented, not list items, not block scalars)
    const match = line.match(/^([a-zA-Z_-]+):\s+(.+)$/)
    if (match) {
      const [, key, value] = match
      if (!key || !value) {
        result.push(line)
        continue
      }

      // Skip if already quoted
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        result.push(line)
        continue
      }

      // Quote if contains special YAML characters
      if (YAML_SPECIAL_CHARS.test(value)) {
        // Use double quotes and escape any existing double quotes
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        result.push(`${key}: "${escaped}"`)
        continue
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)---\s*\n?/

/**
 * YAML 解析（delta：旧仓非 Bun `yaml` npm 回退裁，见头注；Bun.YAML
 * 内建零成本）。
 */
function parseYaml(input: string): unknown {
  return Bun.YAML.parse(input)
}

/**
 * Parses markdown content to extract frontmatter and content
 * @param markdown The raw markdown content
 * @returns Object containing parsed frontmatter and content without frontmatter
 */
export function parseFrontmatter(
  markdown: string,
  sourcePath?: string,
): ParsedMarkdown {
  const match = markdown.match(FRONTMATTER_REGEX)

  if (!match) {
    // No frontmatter found
    return {
      frontmatter: {},
      content: markdown,
    }
  }

  const frontmatterText = match[1] || ''
  const content = markdown.slice(match[0].length)

  let frontmatter: FrontmatterData = {}
  try {
    const parsed = parseYaml(frontmatterText) as FrontmatterData | null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed
    }
  } catch {
    // YAML parsing failed - try again after quoting problematic values
    try {
      const quotedText = quoteProblematicValues(frontmatterText)
      const parsed = parseYaml(quotedText) as FrontmatterData | null
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed
      }
    } catch (retryError) {
      // Still failed - log for debugging so users can diagnose broken frontmatter
      const location = sourcePath ? ` in ${sourcePath}` : ''
      logForDebugging(
        `Failed to parse YAML frontmatter${location}: ${retryError instanceof Error ? retryError.message : retryError}`,
        { level: 'warn' },
      )
    }
  }

  return {
    frontmatter,
    content,
  }
}
