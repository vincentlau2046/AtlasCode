/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * engine/tools/lsp — LSPTool 符号提取面（§8.67 D 波 S-E2c；旧仓
 * src/tools/LSPTool/symbolContext.ts 91L 逐字转写）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 utils/format truncate（stringWidth/grapheme 宽感知，ink 依赖
 *    3-dep 违规面）→ 本地 truncateSymbol（符号 = 代码标识符〔词字符 /
 *    $ / ' / ! / 运算符族，全单宽字符〕，length 即显示宽，slice + '…'
 *    尾缀语义逐字，ASCII 输入下行为等价）。
 *  ② 旧 expandPath 1 参（utils/cwd 模块态）→ 新 shared 2 参
 *    expandPath(path, getCwd())（S-C1 签名适配先例）；getCwd →
 *    bootstrap 门面。
 *  ③ 消费面 = LSPTool.renderToolUseMessage 位置 4 操作
 *    （goToDefinition/findReferences/hover/goToImplementation）的
 *    symbol 上下文面（旧 UI.tsx 模板逐字）；同步 I/O 面逐字保留
 *    （call 路径同步渲染面，64KB 首窗 + 满窗末行守卫）。
 */
import { expandPath, getFsImplementation, logForDebugging } from '../../../shared'
import { getCwd } from '../../../bootstrap'

const MAX_READ_BYTES = 64 * 1024

/**
 * 旧 utils/format truncate 本地转写（delta ①；符号全单宽字符，
 * slice + '…' 尾缀 = 旧宽感知面 ASCII 等价语义）。
 */
function truncateSymbol(symbol: string, maxWidth: number): string {
  if (symbol.length <= maxWidth) {
    return symbol
  }
  return `${symbol.slice(0, maxWidth - 1)}…`
}

/**
 * Extracts the symbol/word at a specific position in a file.
 * Used to show context in tool use messages.
 *
 * @param filePath - The file path (absolute or relative)
 * @param line - 0-indexed line number
 * @param character - 0-indexed character position on the line
 *
 * Note: This uses synchronous file I/O because it is called from
 * renderToolUseMessage (a synchronous React render function). The read is
 * wrapped in try/catch so ENOENT and other errors fall back gracefully.
 * @returns The symbol at that position, or null if extraction fails
 */
export function getSymbolAtPosition(
  filePath: string,
  line: number,
  character: number,
): string | null {
  try {
    const fs = getFsImplementation()
    const absolutePath = expandPath(filePath, getCwd())

    // Read only the first 64KB instead of the whole file. Most LSP hover/goto
    // targets are near recent edits; 64KB covers ~1000 lines of typical code.
    // If the target line is past this window we fall back to null (the UI
    // already handles that by showing `position: line:char`).
    const { buffer, bytesRead } = fs.readSync(absolutePath, {
      length: MAX_READ_BYTES,
    })
    const content = buffer.toString('utf-8', 0, bytesRead)
    const lines = content.split('\n')

    if (line < 0 || line >= lines.length) {
      return null
    }
    // If we filled the full buffer the file continues past our window,
    // so the last split element may be truncated mid-line.
    if (bytesRead === MAX_READ_BYTES && line === lines.length - 1) {
      return null
    }

    const lineContent = lines[line]
    if (!lineContent || character < 0 || character >= lineContent.length) {
      return null
    }

    // Extract the word/symbol at the character position
    // Pattern matches:
    // - Standard identifiers: alphanumeric + underscore + dollar
    // - Rust lifetimes: 'a, 'static
    // - Rust macros: macro_name!
    // - Operators and special symbols: +, -, *, etc.
    // This is more inclusive to handle various programming languages
    const symbolPattern = /[\w$'!]+|[+\-*/%&|^~<>=]+/g
    let match: RegExpExecArray | null

    while ((match = symbolPattern.exec(lineContent)) !== null) {
      const start = match.index
      const end = start + match[0].length

      // Check if the character position falls within this match
      if (character >= start && character < end) {
        const symbol = match[0]
        // Limit length to 30 characters to avoid overly long symbols
        return truncateSymbol(symbol, 30)
      }
    }

    return null
  } catch (error) {
    // Log unexpected errors for debugging (permission issues, encoding problems, etc.)
    // Use logForDebugging since this is a display enhancement, not a critical error
    if (error instanceof Error) {
      logForDebugging(
        `Symbol extraction failed for ${filePath}:${line}:${character}: ${error.message}`,
        { level: 'warn' },
      )
    }
    // Still return null for graceful fallback to position display
    return null
  }
}
