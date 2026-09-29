/**
 * W3-3c-2（§8.74.19）：orchestrator (a) 类删净后本文件死链切除——
 * normalizeMessage / handleOrphanedPermission / isResultSuccessful /
 * PermissionPromptTool 唯一消费方 = 已删 QueryEngine（(a) 类），逐段删除；
 * 存活面 = extractReadFilesFromMessages / extractBashToolsFromMessages
 * （REPL + PromptSuggestion 活消费）。runTools 依赖随 toolOrchestration
 * (a) 删净移除。
 */
import { BASH_TOOL_NAME } from '../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import type { Input as FileReadInput } from '../tools/FileReadTool/FileReadTool.js'
import {
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
} from '../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import type { Message } from '../types/message.js'
import { isFsInaccessible } from './errors.js'
import { getFileModificationTime, stripLineNumberPrefix } from './file.js'
import { readFileSyncWithMetadata } from './fileRead.js'
import {
  createFileStateCacheWithSizeLimit,
  type FileStateCache,
} from './fileStateCache.js'
import { expandPath } from './path.js'

// Small cache size for ask operations which typically access few files
// during permission prompts or limited tool operations
const ASK_READ_FILE_STATE_CACHE_SIZE = 10

// Create a function to extract read files from messages
export function extractReadFilesFromMessages(
  messages: Message[],
  cwd: string,
  maxSize: number = ASK_READ_FILE_STATE_CACHE_SIZE,
): FileStateCache {
  const cache = createFileStateCacheWithSizeLimit(maxSize)

  // First pass: find all FileReadTool/FileWriteTool/FileEditTool uses in assistant messages
  const fileReadToolUseIds = new Map<string, string>() // toolUseId -> filePath
  const fileWriteToolUseIds = new Map<
    string,
    { filePath: string; content: string }
  >() // toolUseId -> { filePath, content }
  const fileEditToolUseIds = new Map<string, string>() // toolUseId -> filePath

  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message.content)
    ) {
      for (const content of message.message.content) {
        if (
          content.type === 'tool_use' &&
          content.name === FILE_READ_TOOL_NAME
        ) {
          // Extract file_path from the tool use input
          const input = content.input as FileReadInput | undefined
          // Ranged reads are not added to the cache.
          if (
            input?.file_path &&
            input?.offset === undefined &&
            input?.limit === undefined
          ) {
            // Normalize to absolute path for consistent cache lookups
            const absolutePath = expandPath(input.file_path, cwd)
            fileReadToolUseIds.set(content.id, absolutePath)
          }
        } else if (
          content.type === 'tool_use' &&
          content.name === FILE_WRITE_TOOL_NAME
        ) {
          // Extract file_path and content from the Write tool use input
          const input = content.input as
            | { file_path?: string; content?: string }
            | undefined
          if (input?.file_path && input?.content) {
            // Normalize to absolute path for consistent cache lookups
            const absolutePath = expandPath(input.file_path, cwd)
            fileWriteToolUseIds.set(content.id, {
              filePath: absolutePath,
              content: input.content,
            })
          }
        } else if (
          content.type === 'tool_use' &&
          content.name === FILE_EDIT_TOOL_NAME
        ) {
          // Edit's input has old_string/new_string, not the resulting content.
          // Track the path so the second pass can read current disk state.
          const input = content.input as { file_path?: string } | undefined
          if (input?.file_path) {
            // Normalize to absolute path for consistent cache lookups
            const absolutePath = expandPath(input.file_path, cwd)
            fileEditToolUseIds.set(content.id, absolutePath)
          }
        }
      }
    }
  }

  // Second pass: find corresponding tool results and extract content
  for (const message of messages) {
    if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const content of message.message.content) {
        if (content.type === 'tool_result' && content.tool_use_id) {
          // Handle Read tool results
          const readFilePath = fileReadToolUseIds.get(content.tool_use_id)
          if (
            readFilePath &&
            typeof content.content === 'string' &&
            // Dedup stubs contain no file content — the earlier real Read
            // already cached it. Chronological last-wins would otherwise
            // overwrite the real entry with stub text.
            !content.content.startsWith(FILE_UNCHANGED_STUB)
          ) {
            // Remove system-reminder blocks from the content
            const processedContent = content.content.replace(
              /<system-reminder>[\s\S]*?<\/system-reminder>/g,
              '',
            )

            // Extract the actual file content from the tool result
            // Tool results for text files contain line numbers, we need to strip those
            const fileContent = processedContent
              .split('\n')
              .map(stripLineNumberPrefix)
              .join('\n')
              .trim()

            // Cache the file content with the message timestamp
            if (message.timestamp) {
              const timestamp = new Date(message.timestamp).getTime()
              cache.set(readFilePath, {
                content: fileContent,
                timestamp,
                offset: undefined,
                limit: undefined,
              })
            }
          }

          // Handle Write tool results - use content from the tool use input
          const writeToolData = fileWriteToolUseIds.get(content.tool_use_id)
          if (writeToolData && message.timestamp) {
            const timestamp = new Date(message.timestamp).getTime()
            cache.set(writeToolData.filePath, {
              content: writeToolData.content,
              timestamp,
              offset: undefined,
              limit: undefined,
            })
          }

          // Handle Edit tool results — post-edit content isn't in the
          // tool_use input (only old_string/new_string) nor fully in the
          // result (only a snippet). Read from disk now, using actual mtime
          // so getChangedFiles's mtime check passes on the next turn.
          //
          // Callers seed the cache once at process start (print.ts --resume,
          // Cowork cold-restart per turn), so disk content at extraction time
          // IS the post-edit state. No dedup: processing every Edit preserves
          // last-wins semantics when Read/Write interleave (Edit→Read→Edit).
          const editFilePath = fileEditToolUseIds.get(content.tool_use_id)
          if (editFilePath && content.is_error !== true) {
            try {
              const { content: diskContent } =
                readFileSyncWithMetadata(editFilePath)
              cache.set(editFilePath, {
                content: diskContent,
                timestamp: getFileModificationTime(editFilePath),
                offset: undefined,
                limit: undefined,
              })
            } catch (e: unknown) {
              if (!isFsInaccessible(e)) {
                throw e
              }
              // File deleted or inaccessible since the Edit — skip
            }
          }
        }
      }
    }
  }

  return cache
}

/**
 * Extract the top-level CLI tools used in BashTool calls from message history.
 * Returns a deduplicated set of command names (e.g. 'vercel', 'aws', 'git').
 */
export function extractBashToolsFromMessages(messages: Message[]): Set<string> {
  const tools = new Set<string>()
  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message.content)
    ) {
      for (const content of message.message.content) {
        if (content.type === 'tool_use' && content.name === BASH_TOOL_NAME) {
          const { input } = content
          if (
            typeof input !== 'object' ||
            input === null ||
            !('command' in input)
          )
            continue
          const cmd = extractCliName(
            typeof input.command === 'string' ? input.command : undefined,
          )
          if (cmd) {
            tools.add(cmd)
          }
        }
      }
    }
  }
  return tools
}

const STRIPPED_COMMANDS = new Set(['sudo'])

/**
 * Extract the actual CLI name from a bash command string, skipping
 * env var assignments (e.g. `FOO=bar vercel` → `vercel`) and prefixes
 * in STRIPPED_COMMANDS.
 */
function extractCliName(command: string | undefined): string | undefined {
  if (!command) return undefined
  const tokens = command.trim().split(/\s+/)
  for (const token of tokens) {
    if (/^[A-Za-z_]\w*=/.test(token)) continue
    if (STRIPPED_COMMANDS.has(token)) continue
    return token
  }
  return undefined
}
