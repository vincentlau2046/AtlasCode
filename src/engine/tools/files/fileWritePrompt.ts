/**
 * engine/tools/files — Write 工具 prompt 面（§8.55 S-C6，Write+Edit 本体）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileWriteTool/prompt.ts 18L 逐字随迁。
 * import 重指：FILE_READ_TOOL_NAME 旧 '../FileReadTool/prompt.js' → 新
 * ../toolNames（工具名单一事实源，S-C1 先例）。
 *
 * delta 登记：旧 FILE_WRITE_TOOL_NAME/DESCRIPTION 本文件定义 → 新仓
 * FILE_WRITE_TOOL_NAME 归 toolNames（同 S-C1 先例）；DESCRIPTION 常量
 * 保留（旧 UI 消费面已裁，本体保真）。
 */
import { FILE_READ_TOOL_NAME } from '../toolNames'

export const DESCRIPTION = 'Write a file to the local filesystem.'

function getPreReadInstruction(): string {
  return `\n- If this is an existing file, you MUST use the ${FILE_READ_TOOL_NAME} tool first to read the file's contents. This tool will fail if you did not read the file first.`
}

export function getWriteToolDescription(): string {
  return `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.${getPreReadInstruction()}
- Prefer the Edit tool for modifying existing files \u2014 it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`
}
