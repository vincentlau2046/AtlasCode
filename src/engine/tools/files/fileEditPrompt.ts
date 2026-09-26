/**
 * engine/tools/files — Edit 工具 prompt 面（§8.55 S-C6，Write+Edit 本体）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileEditTool/prompt.ts 26L 逐字随迁。
 * import 重指：isCompactLinePrefixEnabled 旧 '../../utils/file.js' → 域内
 * ./fileUtils（S-C1 已落）；FILE_READ_TOOL_NAME 旧 '../FileReadTool/
 * prompt.js' → 新 ../toolNames（工具名单一事实源，S-C1 先例）。
 */
import { FILE_READ_TOOL_NAME } from '../toolNames'
import { isCompactLinePrefixEnabled } from './fileUtils'

function getPreReadInstruction(): string {
  return `\n- You must use your \`${FILE_READ_TOOL_NAME}\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. `
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? 'line number + tab'
    : 'spaces + line number + arrow'
  // de-ANT: the ant-only minimal-uniqueness prompt hint was removed.
  const minimalUniquenessHint = ''
  return `Performs exact string replacements in files.

Usage:${getPreReadInstruction()}
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: ${prefixFormat}. Everything after that is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.${minimalUniquenessHint}
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`
}
