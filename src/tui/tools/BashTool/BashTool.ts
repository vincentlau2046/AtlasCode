import { spawn } from 'child_process'
import { z } from 'zod/v4'
import type { ToolResult } from '../../Tool.js'
import { buildTool } from '../../Tool.js'
import { logForDebugging } from '../../utils/debug.js'
import { getAtlasTempDir } from '../../utils/permissions/filesystem.js'
import { getSimplePrompt, getDefaultTimeoutMs, getMaxTimeoutMs } from './prompt.js'
import { renderToolUseMessage } from './UI.js'
import { BASH_TOOL_NAME } from './toolName.js'
import path from 'path'
import fs from 'fs'

const inputSchema = z.object({
  command: z
    .string()
    .describe('The bash command to execute.'),
  description: z
    .string()
    .optional()
    .describe('Clear, concise description of what this command does (shown in the UI).'),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry.'),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Timeout in milliseconds (alias accepted by the shared tool-execution layer).'),
  _simulatedSedEdit: z
    .object({
      filePath: z.string(),
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
  run_in_background: z
    .boolean()
    .optional()
    .describe('Run in the background and return a task id immediately (collect with TaskOutput, stop with TaskStop).'),
  dangerouslyDisableSandbox: z
    .boolean()
    .optional()
    .describe('Run the command outside the sandbox (use only when sandbox restrictions caused the failure).'),
})

export type BashToolInput = z.infer<typeof inputSchema>

export type BashProgress = any

export type Out = {
  stdout: string
  stderr: string
  exitCode: number | null
  interrupted: boolean
  isImage?: boolean
  returnCodeInterpretation?: string | null
  noOutputExpected?: boolean
  backgroundTaskId?: string | null
}

type BgTask = {
  id: string
  pid: number | null
  command: string
  outputFile: string
  done: boolean
  exitCode: number | null
}

const backgroundTasks = new Map<string, BgTask>()

export function getBackgroundTask(taskId: string): BgTask | undefined {
  return backgroundTasks.get(taskId)
}

export function listBackgroundTasks(): BgTask[] {
  return [...backgroundTasks.values()]
}

const READ_ONLY_PREFIXES = [
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'wc', 'pwd', 'which',
  'git status', 'git log', 'git diff', 'git branch', 'git show', 'echo',
  'file', 'stat', 'du', 'df', 'whoami', 'env', 'printenv', 'type',
]

// Shell chaining / substitution operators can hide a write command behind a
// read-only prefix (e.g. `ls && rm -rf /`, `find . -exec rm {} ;`,
// `echo $(rm x)`). If any of these appear, treat the command as non-read-only.
function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim()
  if (
    trimmed.includes('&&') ||
    trimmed.includes('||') ||
    trimmed.includes(';') ||
    trimmed.includes('|') ||
    trimmed.includes('`') ||
    trimmed.includes('$(')
  ) {
    return false
  }
  return READ_ONLY_PREFIXES.some(p => trimmed === p || trimmed.startsWith(p + ' '))
}

export const BashTool: any = buildTool({
  name: BASH_TOOL_NAME,
  searchHint: 'run shell commands via bash',
  maxResultSizeChars: 20_000,
  inputSchema: inputSchema,
  isEnabled: () => true,
  isReadOnly: (input: BashToolInput) => isReadOnlyCommand(input.command),
  isDestructive: (_input: BashToolInput) => false,
  async description(_input: BashToolInput): Promise<string> {
    return getSimplePrompt()
  },
  async prompt(): Promise<string> {
    return getSimplePrompt()
  },
  renderToolUseMessage,
  mapToolResultToToolResultBlockParam(content: unknown, toolUseID: string) {
    const c = content as unknown as Out
    const parts: string[] = []
    if (c) {
      const codeText = c.exitCode === null || c.exitCode === undefined ? 'n/a' : String(c.exitCode)
      parts.push('[exit code: ' + codeText + ']')
      if (c.stdout) parts.push(c.stdout)
      if (c.stderr && c.stderr.trim() !== '') parts.push(c.stderr)
      if (c.backgroundTaskId) parts.push('[running in background, task id: ' + c.backgroundTaskId + ']')
      if (c.interrupted) parts.push('[command was interrupted or timed out]')
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: parts.filter(x => x !== '').join(String.fromCharCode(10)),
    } as any
  },
  async call(
    args: BashToolInput,
    context: any,
    canUseTool: any,
    _parentMessage: any,
    onProgress?: (progress: any) => void,
  ): Promise<ToolResult<Out>> {
    logForDebugging('[BASH] executing: ' + args.command)
    const cwd = (context && context.options && context.options.cwd) || process.cwd()
    const timeoutMs = Math.min(
      args.timeout_ms ?? args.timeout ?? getDefaultTimeoutMs(),
      getMaxTimeoutMs(),
    )

    if (args.run_in_background) {
      const id = 'task-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const outputFile = path.join(getAtlasTempDir(), 'bash-' + id + '.log')
      try { fs.mkdirSync(path.dirname(outputFile), { recursive: true }) } catch {}
      const outFd = fs.openSync(outputFile, 'w')
      const child = spawn('bash', ['-c', args.command], {
        cwd: cwd,
        detached: true,
        stdio: ['ignore', outFd, outFd],
        env: process.env,
      })
      const task: BgTask = {
        id: id,
        pid: child.pid ?? null,
        command: args.command,
        outputFile: outputFile,
        done: false,
        exitCode: null,
      }
      backgroundTasks.set(id, task)
      child.on('close', (code: number | null, signal: string | null) => {
        task.done = true
        task.exitCode = code !== null ? code : (signal ? 1 : 0)
        try { fs.closeSync(outFd) } catch {}
        logForDebugging('[BASH] background task ' + id + ' finished, exit=' + task.exitCode)
      })
      child.on('error', (err: Error) => {
        task.done = true
        task.exitCode = 127
        try { fs.closeSync(outFd) } catch {}
        logForDebugging('[BASH] background task ' + id + ' error: ' + err.message)
      })
      child.unref()
      return {
        data: {
          stdout: '',
          stderr: '',
          exitCode: null,
          interrupted: false,
          backgroundTaskId: id,
        },
      }
    }

    return await new Promise<ToolResult<Out>>((resolve) => {
      const child = spawn('bash', ['-c', args.command], {
        cwd: cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let settled = false

      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
      }, timeoutMs)

      child.on('close', (code: number | null, signal: string | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const interrupted = signal !== null || (code !== null && code !== 0)
        logForDebugging('[BASH] finished, exit=' + (code !== null ? String(code) : 'signal'))
        resolve({
          data: {
            stdout: stdout,
            stderr: stderr,
            exitCode: code !== null ? code : (signal ? 1 : 0),
            interrupted: interrupted,
            noOutputExpected: false,
          },
        })
      })
      child.on('error', (err: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        logForDebugging('[BASH] spawn error: ' + err.message)
        resolve({
          data: {
            stdout: '',
            stderr: 'Error: ' + err.message,
            exitCode: 127,
            interrupted: false,
          },
        })
      })
    })
  },
})
