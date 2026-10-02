/**
 * Session file access analytics hooks.
 * Tracks access to session memory and transcript files via Read, Grep, Glob tools.
 * Also tracks memdir file access via Read, Grep, Glob, Edit, and Write tools.
 */
import { feature } from 'src/shared'
import { registerHookCallbacks } from 'src/tui/bootstrapState.js'
import type { HookInput, HookJSONOutput } from '../entrypoints/agentSdkTypes.js'
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js'
import { inputSchema as editInputSchema } from '../tools/FileEditTool/types.js'
import { FileReadTool } from '../tools/FileReadTool/FileReadTool.js'
import { FILE_READ_TOOL_NAME } from '../tools/FileReadTool/prompt.js'
import { FileWriteTool } from '../tools/FileWriteTool/FileWriteTool.js'
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js'
import { GlobTool } from '../tools/GlobTool/GlobTool.js'
import { GLOB_TOOL_NAME } from '../tools/GlobTool/prompt.js'
import { GrepTool } from '../tools/GrepTool/GrepTool.js'
import { GREP_TOOL_NAME } from '../tools/GrepTool/prompt.js'
import type { HookCallback } from '../types/hooks.js'
import {
  detectSessionFileType,
  detectSessionPatternType,
  isAutoMemFile,
} from './memoryFileDetection.js'

const teamMemPaths = feature('TEAMMEM')
  ? (require('../memdir/teamMemPaths.js') as typeof import('../memdir/teamMemPaths.js'))
  : null

/**
 * Extract the file path from a tool input for memdir detection.
 * Covers Read (file_path), Edit (file_path), and Write (file_path).
 */
function getFilePathFromInput(
  toolName: string,
  toolInput: unknown,
): string | null {
  switch (toolName) {
    case FILE_READ_TOOL_NAME: {
      const parsed = FileReadTool.inputSchema.safeParse(toolInput)
      return parsed.success ? parsed.data.file_path : null
    }
    case FILE_EDIT_TOOL_NAME: {
      const parsed = editInputSchema().safeParse(toolInput)
      return parsed.success ? parsed.data.file_path : null
    }
    case FILE_WRITE_TOOL_NAME: {
      const parsed = FileWriteTool.inputSchema.safeParse(toolInput)
      return parsed.success ? parsed.data.file_path : null
    }
    default:
      return null
  }
}

/**
 * Extract file type from tool input.
 * Returns the detected session file type or null.
 */
function getSessionFileTypeFromInput(
  toolName: string,
  toolInput: unknown,
): 'session_memory' | 'session_transcript' | null {
  switch (toolName) {
    case FILE_READ_TOOL_NAME: {
      const parsed = FileReadTool.inputSchema.safeParse(toolInput)
      if (!parsed.success) return null
      return detectSessionFileType(parsed.data.file_path)
    }
    case GREP_TOOL_NAME: {
      const parsed = GrepTool.inputSchema.safeParse(toolInput)
      if (!parsed.success) return null
      // Check path if provided
      if (parsed.data.path) {
        const pathType = detectSessionFileType(parsed.data.path)
        if (pathType) return pathType
      }
      // Check glob pattern
      if (parsed.data.glob) {
        const globType = detectSessionPatternType(parsed.data.glob)
        if (globType) return globType
      }
      return null
    }
    case GLOB_TOOL_NAME: {
      const parsed = GlobTool.inputSchema.safeParse(toolInput)
      if (!parsed.success) return null
      // Check path if provided
      if (parsed.data.path) {
        const pathType = detectSessionFileType(parsed.data.path)
        if (pathType) return pathType
      }
      // Check pattern
      const patternType = detectSessionPatternType(parsed.data.pattern)
      if (patternType) return patternType
      return null
    }
    default:
      return null
  }
}

/**
 * Check if a tool use constitutes a memory file access.
 * Detects session memory (via Read/Grep/Glob) and memdir access (via Read/Edit/Write).
 * Uses the same conditions as the PostToolUse session file access hooks.
 */
export function isMemoryFileAccess(
  toolName: string,
  toolInput: unknown,
): boolean {
  if (getSessionFileTypeFromInput(toolName, toolInput) === 'session_memory') {
    return true
  }

  const filePath = getFilePathFromInput(toolName, toolInput)
  if (
    filePath &&
    (isAutoMemFile(filePath) ||
      (feature('TEAMMEM') && teamMemPaths!.isTeamMemFile(filePath)))
  ) {
    return true
  }

  return false
}

/**
 * PostToolUse callback — formerly logged session file access events; the
 * telemetry sink was removed and tracking is now done via isMemoryFileAccess
 * (consumed by attribution.ts). Retained as a registered no-op hook so the
 * registration surface in setup.ts stays stable for future re-instrumentation.
 */
async function handleSessionFileAccess(
  input: HookInput,
  _toolUseID: string | null,
  _signal: AbortSignal | undefined,
): Promise<HookJSONOutput> {
  if (input.hook_event_name !== 'PostToolUse') return {}
  return {}
}

/**
 * Register session file access tracking hooks.
 * Called during CLI initialization.
 */
export function registerSessionFileAccessHooks(): void {
  const hook: HookCallback = {
    type: 'callback',
    callback: handleSessionFileAccess,
    timeout: 1, // Very short timeout - just logging
    internal: true,
  }

  registerHookCallbacks({
    PostToolUse: [
      { matcher: FILE_READ_TOOL_NAME, hooks: [hook] },
      { matcher: GREP_TOOL_NAME, hooks: [hook] },
      { matcher: GLOB_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_EDIT_TOOL_NAME, hooks: [hook] },
      { matcher: FILE_WRITE_TOOL_NAME, hooks: [hook] },
    ],
  })
}
