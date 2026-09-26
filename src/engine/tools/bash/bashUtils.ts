/**
 * engine/tools/bash — Bash 输出/结果工具面（Bash 本体纵切子波 §8.54 S-B2 纯叶子本体）。
 *
 * 旧仓来源（a8af45b）: src/tools/BashTool/utils.ts 221L 逐字随迁
 * （stripEmptyLines / isImageOutput / parseDataUri / buildImageToolResult /
 * resizeShellImageOutput / formatOutput / stdErrAppendShellResetMessage /
 * resetCwdIfOutsideProject / createContentSummary）。消费方 = S-B5
 * bashTool.ts call()（formatOutput 截断 + isImage 面 + stdout 空行剥 +
 * stderr reset 附言 + bg-task 输出面）+ 双门面归集。
 *
 * delta 登记（import 替换 + 1 重链裁 + 1 类型面收窄，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 types/atlas.js 窄类型族 → 新仓 shared 宽骨架（ContentBlockParam /
 *    ToolResultBlockParam = `[key: string]: unknown` 鸭子，S-7b 最小形先例）；
 *    Base64ImageSource 窄型未下沉 → buildImageToolResult 零 cast 构造 +
 *    createContentSummary text 块 `block.text as string` 收窄（宽骨架 cast
 *    收窄登记，类型弱化 = shared 宽骨架面）。
 *  ② **D-3 重链裁**（§8.54 ⑥ 登记）：旧 `maybeResizeAndDownsampleImageBuffer`
 *    （utils/imageResizer.js 重链，← FileReadTool/imageProcessor，归属 =
 *    图像面波）未随迁 → resizeShellImageOutput 的 resize 调用裁掉，改回原
 *    data-URI 未缩放重编码（行为 delta = 无 DPI/尺寸 cap；overflow-file
 *    重读 + 20MB cap 语义逐字保留）。
 *  ③ 旧 src/bootstrap/state.js getOriginalCwd + src/utils/cwd.js getCwd →
 *    新仓 bootstrap 域门面 `../../../bootstrap`（boundaries 唯一合法出口）。
 *  ④ 旧 src/Tool.js ToolPermissionContext 类型 → 新仓 shared 单一事实源。
 *  ⑤ 旧 utils/permissions/filesystem.js pathInAllowedWorkingPath →
 *    新仓 permissions 域门面 `../../../permissions`（S-T 波同裁定）。
 *  ⑥ 旧 utils/Shell.js setCwd → 新仓 executor 域门面 `../../../executor`
 *    （executor/shell/Shell.ts 落 bootstrap setCwdState，经 bootstrap port）。
 *  ⑦ 旧 utils/shell/outputLimits.js getMaxOutputLength → 新仓 task 域门面
 *    `../../../task`（C-Deep 切片 3 T2 outputLimits 归 task 域裁定）。
 *  ⑧ 旧 utils/stringUtils.js countCharInString + plural → 新仓
 *    `../../../shared`（C1 统一裁定字符串工具单一事实源）。
 *  ⑨ 旧 utils/envUtils.js shouldMaintainProjectWorkingDir → 同域
 *    S-B1 `./bashHelpers` 归集落点。
 */
import type {
  ContentBlockParam,
  ToolPermissionContext,
  ToolResultBlockParam,
} from '../../../shared'
import { countCharInString, plural } from '../../../shared'
import { getCwd, getOriginalCwd } from '../../../bootstrap'
import { pathInAllowedWorkingPath } from '../../../permissions'
import { setCwd } from '../../../executor'
import { getMaxOutputLength } from '../../../task'
import { shouldMaintainProjectWorkingDir } from './bashHelpers'
import { readFile, stat } from 'fs/promises'

/**
 * Strips leading and trailing lines that contain only whitespace/newlines.
 * Unlike trim(), this preserves whitespace within content lines and only removes
 * completely empty lines from the beginning and end.
 */
export function stripEmptyLines(content: string): string {
  const lines = content.split('\n')

  // Find the first non-empty line
  let startIndex = 0
  while (startIndex < lines.length && lines[startIndex]?.trim() === '') {
    startIndex++
  }

  // Find the last non-empty line
  let endIndex = lines.length - 1
  while (endIndex >= 0 && lines[endIndex]?.trim() === '') {
    endIndex--
  }

  // If all lines are empty, return empty string
  if (startIndex > endIndex) {
    return ''
  }

  // Return the slice with non-empty lines
  return lines.slice(startIndex, endIndex + 1).join('\n')
}

/**
 * Check if content is a base64 encoded image data URL
 */
export function isImageOutput(content: string): boolean {
  return /^data:image\/[a-z0-9.+_-]+;base64,/i.test(content)
}

const DATA_URI_RE = /^data:([^;]+);base64,(.+)$/

/**
 * Parse a data-URI string into its media type and base64 payload.
 * Input is trimmed before matching.
 */
export function parseDataUri(
  s: string,
): { mediaType: string; data: string } | null {
  const match = s.trim().match(DATA_URI_RE)
  if (!match || !match[1] || !match[2]) return null
  return { mediaType: match[1], data: match[2] }
}

/**
 * Build an image tool_result block from shell stdout containing a data URI.
 * Returns null if parse fails so callers can fall through to text handling.
 */
export function buildImageToolResult(
  stdout: string,
  toolUseID: string,
): ToolResultBlockParam | null {
  const parsed = parseDataUri(stdout)
  if (!parsed) return null
  // 宽骨架零 cast（delta ①）：shared ContentBlockParam = [key: string]: unknown
  return {
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mediaType,
          data: parsed.data,
        },
      },
    ],
  }
}

// Cap file reads to 20 MB — any image data URI larger than this is
// well beyond what the API accepts (5 MB base64) and would OOM if read
// into memory.
const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024

/**
 * Resize image output from a shell tool. stdout is capped at
 * getMaxOutputLength() when read back from the shell output file — if the
 * full output spilled to disk, re-read it from there, since truncated base64
 * would decode to a corrupt image that either throws here or gets rejected by
 * the API. Caps dimensions too: compressImageBuffer only checks byte size, so
 * a small-but-high-DPI PNG (e.g. matplotlib at dpi=300) sails through at full
 * resolution and poisons many-image requests (CC-304).
 *
 * Returns the re-encoded data URI on success, or null if the source didn't
 * parse as a data URI (caller decides whether to flip isImage).
 */
export async function resizeShellImageOutput(
  stdout: string,
  outputFilePath: string | undefined,
  outputFileSize: number | undefined,
): Promise<string | null> {
  let source = stdout
  if (outputFilePath) {
    const size = outputFileSize ?? (await stat(outputFilePath)).size
    if (size > MAX_IMAGE_FILE_SIZE) return null
    source = await readFile(outputFilePath, 'utf8')
  }
  const parsed = parseDataUri(source)
  if (!parsed) return null
  const buf = Buffer.from(parsed.data, 'base64')
  const ext = parsed.mediaType.split('/')[1] || 'png'
  // D-3（delta ②，复审勿当遗漏重提）：旧 maybeResizeAndDownsampleImageBuffer
  // 重链裁出 → 原 buffer 未缩放重编码（mediaType 回显 = 解析值）
  return `data:image/${ext};base64,${buf.toString('base64')}`
}

export function formatOutput(content: string): {
  totalLines: number
  truncatedContent: string
  isImage?: boolean
} {
  const isImage = isImageOutput(content)
  if (isImage) {
    return {
      totalLines: 1,
      truncatedContent: content,
      isImage,
    }
  }

  const maxOutputLength = getMaxOutputLength()
  if (content.length <= maxOutputLength) {
    return {
      totalLines: countCharInString(content, '\n') + 1,
      truncatedContent: content,
      isImage,
    }
  }

  const truncatedPart = content.slice(0, maxOutputLength)
  const remainingLines = countCharInString(content, '\n', maxOutputLength) + 1
  const truncated = `${truncatedPart}\n\n... [${remainingLines} lines truncated] ...`

  return {
    totalLines: countCharInString(content, '\n') + 1,
    truncatedContent: truncated,
    isImage,
  }
}

export const stdErrAppendShellResetMessage = (stderr: string): string =>
  `${stderr.trim()}\nShell cwd was reset to ${getOriginalCwd()}`

export function resetCwdIfOutsideProject(
  toolPermissionContext: ToolPermissionContext,
): boolean {
  const cwd = getCwd()
  const originalCwd = getOriginalCwd()
  const shouldMaintain = shouldMaintainProjectWorkingDir()
  if (
    shouldMaintain ||
    // Fast path: originalCwd is unconditionally in allWorkingDirectories
    // (filesystem.ts), so when cwd hasn't moved, pathInAllowedWorkingPath is
    // trivially true — skip its syscalls for the no-cd common case.
    (cwd !== originalCwd &&
      !pathInAllowedWorkingPath(cwd, toolPermissionContext))
  ) {
    // Reset to original directory if maintaining project dir OR outside allowed working directory
    setCwd(originalCwd)
    if (!shouldMaintain) {
      return true
    }
  }
  return false
}

/**
 * Creates a human-readable summary of structured content blocks.
 * Used to display MCP results with images and text in the UI.
 */
export function createContentSummary(content: ContentBlockParam[]): string {
  const parts: string[] = []
  let textCount = 0
  let imageCount = 0

  for (const block of content) {
    if (block.type === 'image') {
      imageCount++
    } else if (block.type === 'text' && 'text' in block) {
      textCount++
      // Include first 200 chars of text blocks for context（宽骨架 cast 收窄，delta ①）
      const text = block.text as string
      const preview = text.slice(0, 200)
      parts.push(preview + (text.length > 200 ? '...' : ''))
    }
  }

  const summary: string[] = []
  if (imageCount > 0) {
    summary.push(`[${imageCount} ${plural(imageCount, 'image')}]`)
  }
  if (textCount > 0) {
    summary.push(`[${textCount} text ${plural(textCount, 'block')}]`)
  }

  return `MCP Result: ${summary.join(', ')}${parts.length > 0 ? '\n\n' + parts.join('\n\n') : ''}`
}
