/**
 * session 域 — 首条有效用户消息提取（E-7 S-7d d1，§8.49 详案；旧
 * sessionStorage.ts L1730-1832 extractFirstPrompt +
 * getFirstMeaningfulUserMessageTextContent 逐字随迁 + 域内小工具族
 * escapeRegExp（旧 stringUtils.ts:9）/ extractTag（旧 messages.ts L644-697）
 * / COMMAND_NAME_TAG（旧 constants/xml.ts）/ SKIP_FIRST_PROMPT_PATTERN
 * （旧 sessionStoragePortable.ts L128）独立承载，供 project 写面
 * （insertMessageChain lastPrompt 缓存）与 load 读面（convertToLogOption
 * firstPrompt）共享，避免 record↔load 环依赖）
 *
 * 适配登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - builtInCommandNames：旧仓 = 内建命令注册表动态集合（`/model`、
 *    `/compact` 等）→ 新仓本域无内建命令注册表（命令面归 CLI 波），缺省
 *    收敛为**空 Set**——未注入时行为 delta：任何 `<command-name>` 提取
 *    不再走「内建跳过」支，落入 custom 支（仅当有 command-args 才保留）。
 *    **S-C4 回填（§8.71.1.4 firstPrompt builtInCommandNames 注入口回填）**：
 *    注入窗 setBuiltinCommandNamesSource 落盘——CLI 域 cli/commands.ts
 *    registerBuiltinCommandNames() 注入 engine/skill 域 builtInCommandNames
 *    读面（engine/skill BUILT_IN_COMMANDS 占位空集，TUI 波 #152 回填后
 *    集合自动生效，本注入面无需再动）。
 *   - 旧文 `msg.message.content` 强类型数组 → 域 Message.message.content
 *    为 unknown，块迭代经 `ContentBlock[]` 收敛 cast（语义逐字不变）。
 */
import type { ContentBlock } from '../../shared'
import type { Message, TranscriptMessage } from './types'

/** 旧 constants/xml.ts 逐字。 */
export const COMMAND_NAME_TAG = 'command-name'

/** 旧 portable L128 逐字。 */
const SKIP_FIRST_PROMPT_PATTERN =
  /^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/

/** 旧 stringUtils.ts:9 逐字（域内小工具，新仓无 lodash 面）。 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 旧 messages.ts L644-697 逐字（嵌套同名 tag 深度计数语义）。 */
function extractTag(html: string, tagName: string): string | null {
  if (!html.trim() || !tagName.trim()) {
    return null
  }

  const escapedTag = escapeRegExp(tagName)

  // Create regex pattern that handles:
  // 1. Self-closing tags
  // 2. Tags with attributes
  // 3. Nested tags of the same type
  // 4. Multiline content
  const pattern = new RegExp(
    `<${escapedTag}(?:\\s+[^>]*)?>` + // Opening tag with optional attributes
      '([\\s\\S]*?)' + // Content (non-greedy match)
      `<\\/${escapedTag}>`, // Closing tag
    'gi',
  )

  let match
  let depth = 0
  let lastIndex = 0
  const openingTag = new RegExp(`<${escapedTag}(?:\\s+[^>]*?)?>`, 'gi')
  const closingTag = new RegExp(`<\\/${escapedTag}>`, 'gi')

  while ((match = pattern.exec(html)) !== null) {
    // Check for nested tags
    const content = match[1]
    const beforeMatch = html.slice(lastIndex, match.index)

    // Reset depth counter
    depth = 0

    // Count opening tags before this match
    openingTag.lastIndex = 0
    while (openingTag.exec(beforeMatch) !== null) {
      depth++
    }

    // Count closing tags before this match
    closingTag.lastIndex = 0
    while (closingTag.exec(beforeMatch) !== null) {
      depth--
    }

    // Only include content if we're at the correct nesting level
    if (depth === 0 && content) {
      return content
    }

    lastIndex = match.index + match[0].length
  }

  return null
}

// ── 内建命令名集合注入窗（S-C4 CLI 波注入口回填，头注登记）────────────
type BuiltinCommandNamesSource = () => Set<string>
let builtinCommandNamesSource: BuiltinCommandNamesSource = () => new Set()

/**
 * 内建命令名集合注入窗（S-C4 注入口回填，§8.71.1.4）：CLI 域
 * cli/commands.ts registerBuiltinCommandNames() 注入 engine/skill 域
 * builtInCommandNames 读面（调用一次即持久；缺省空 Set = 未注入态行为）。
 */
export function setBuiltinCommandNamesSource(
  src: BuiltinCommandNamesSource,
): void {
  builtinCommandNamesSource = src
}

/** 测试复位面（缺省空 Set 态）。 */
export function resetBuiltinCommandNamesSourceForTesting(): void {
  builtinCommandNamesSource = () => new Set()
}

/** 内建命令名集合（注入窗读；缺省空 Set，头注适配登记）。 */
function builtInCommandNames(): Set<string> {
  return builtinCommandNamesSource()
}

function extractFirstPrompt(transcript: TranscriptMessage[]): string {
  const textContent = getFirstMeaningfulUserMessageTextContent(transcript)
  if (textContent) {
    let result = textContent.replace(/\n/g, ' ').trim()

    // Store a reasonably long version for display-time truncation
    // The actual truncation will be applied at display time based on terminal width
    if (result.length > 200) {
      result = result.slice(0, 200).trim() + '…'
    }

    return result
  }

  return 'No prompt'
}

/**
 * Gets the last user message that was processed (i.e., before any non-user
 * message appears). Used to determine if a session has valid user
 * interaction.（旧 L1757 逐字）
 */
export function getFirstMeaningfulUserMessageTextContent<T extends Message>(
  transcript: T[],
): string | undefined {
  for (const msg of transcript) {
    if (msg.type !== 'user' || msg.isMeta) continue
    // Skip compact summary messages - they should not be treated as the first prompt
    if ('isCompactSummary' in msg && msg.isCompactSummary) continue

    const content = msg.message?.content
    if (!content) continue

    // Collect all text values. For array content (common in VS Code where
    // IDE metadata tags come before the user's actual prompt), iterate all
    // text blocks so we don't miss the real prompt hidden behind
    // <ide_selection>/<ide_opened_file> blocks.
    const texts: string[] = []
    if (typeof content === 'string') {
      texts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content as ContentBlock[]) {
        if (block.type === 'text' && block.text) {
          texts.push(block.text as string)
        }
      }
    }

    for (const textContent of texts) {
      if (!textContent) continue

      const commandNameTag = extractTag(textContent, COMMAND_NAME_TAG)
      if (commandNameTag) {
        const commandName = commandNameTag.replace(/^\//, '')

        // If it's a built-in command, then it's unlikely to provide
        // meaningful context (e.g. `/model sonnet`)
        if (builtInCommandNames().has(commandName)) {
          continue
        } else {
          // Otherwise, for custom commands, then keep it only if it has
          // arguments (e.g. `/review reticulate splines`)
          const commandArgs = extractTag(textContent, 'command-args')?.trim()
          if (!commandArgs) {
            continue
          }
          // Return clean formatted command instead of raw XML
          return `${commandNameTag} ${commandArgs}`
        }
      }

      // Format bash input with ! prefix (as user typed it). Checked before
      // the generic XML skip so bash-mode sessions get a meaningful title.
      const bashInput = extractTag(textContent, 'bash-input')
      if (bashInput) {
        return `! ${bashInput}`
      }

      // Skip non-meaningful messages (local command output, hook output,
      // autonomous tick prompts, task notifications, pure IDE metadata tags)
      if (SKIP_FIRST_PROMPT_PATTERN.test(textContent)) {
        continue
      }

      return textContent
    }
  }
  return undefined
}

/** 旧 L1736 逐字（convertToLogOption 消费；load 读面经本文件导入）。 */
export { extractFirstPrompt }
