/**
 * AscendErrorClassifier — AICore 错误码解析（msaicerr）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/ErrorClassifier.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（错误类 + 解码信息 + 报告路径），不决策。delta（旧
 * buildTool(zod) → 新 shared Tool 契约）：① ② ③ ④ ⑤ checkPermissions =
 * fail-closed ask ⑥ mapToolResult = 旧 foldResult ⑦ call 5 参 → 2 参 ⑧
 * import 重指本域 AscendExecutor + runCannExec + foldUtils。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { ERROR_CLASSIFIER_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const ERROR_CLASSIFIER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description:
        'The collected fault scene: either a tar.gz path (from AscendFaultCollector, use -f mode) OR a decompressed report dir (use -p mode).',
    },
    mode: {
      type: 'string',
      enum: ['tar', 'report_dir'],
      description:
        'How to interpret source: "tar" = feed the .tar.gz directly (msaicerr -f); "report_dir" = feed a decompressed dir (msaicerr -p). Default "tar".',
    },
    output_dir: {
      type: 'string',
      description: 'Output directory for the analysis report (msaicerr -out).',
    },
    cwd: {
      type: 'string',
      description: 'Working directory to run msaicerr.py in.',
    },
  },
  required: ['source'],
}

export interface ErrorClassifierOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  report_path?: string
  error_class?: string
}

/** Map msaicerr stdout keywords to a coarse error class（evidence hint）。 */
function deriveErrorClass(stdout: string): string | undefined {
  const s = stdout.toLowerCase()
  if (/aicerror|aicore.*error|hardware.*error/.test(s)) return 'aicore-hardware'
  if (/out of memory|oom/.test(s)) return 'oom'
  if (/alignment|misalign|addr.*bound/.test(s)) return 'alignment'
  if (/nan|inf|overflow/.test(s)) return 'runtime'
  if (/compile|syntax|undefined/.test(s)) return 'compile'
  return undefined
}

function getPrompt(): string {
  return (
    'Decode Ascend AICore error codes from a collected fault scene via ' +
    'msaicerr.py (ascend-official/tools/msaicerr). Provide the source — a ' +
    'tar.gz from AscendFaultCollector (mode "tar", msaicerr -f) or a ' +
    'decompressed report dir (mode "report_dir", msaicerr -p) — and an ' +
    'optional output dir. msaicerr decodes the AICore error code + bits, ' +
    'PC/CCE line, addr bounds, op graph info, dump NaN/INF, and single-op ' +
    'test result. Returns the report path, decoded info, and a coarse error ' +
    'class. This tool returns EVIDENCE only. In mock mode it returns a ' +
    'liveness signal — say so.'
  )
}

function fold(d: ErrorClassifierOutput): string {
  return [
    foldHeader('msaicerr', d.success, d.exitCode, d.durationMs, d.mocked),
    d.error_class ? `error_class: ${d.error_class}` : '',
    d.report_path ? `report: ${d.report_path}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const ErrorClassifier: Tool = {
  name: ERROR_CLASSIFIER_TOOL_NAME,
  inputSchema: ERROR_CLASSIFIER_INPUT_SCHEMA,
  inputJSONSchema: ERROR_CLASSIFIER_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'decode Ascend AICore error codes from a collected fault scene via msaicerr',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => ERROR_CLASSIFIER_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      ERROR_CLASSIFIER_TOOL_NAME +
      ' will run msaicerr.py to decode AICore error codes. Allow?',
  }),
  description: async () => getPrompt(),
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: fold(content as ErrorClassifierOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<ErrorClassifierOutput>> {
    const inp = (args ?? {}) as {
      source: string
      mode?: string
      output_dir?: string
      cwd?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    const mode = inp.mode || 'tar'
    // msaicerr.py -f <tar> | -p <dir>  [-out <out>]
    const execArgs = ['-f', inp.source]
    if (mode === 'report_dir') {
      execArgs[0] = '-p'
    }
    if (inp.output_dir) execArgs.push('-out', inp.output_dir)

    const r = await runCannExec('msaicerr.py', execArgs, {
      signal: ctx?.signal,
      mock,
      ...(inp.cwd ? { cwd: inp.cwd } : {}),
    })
    const success = (r.exitCode ?? 1) === 0
    return {
      data: {
        success,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        durationMs: r.durationMs,
        mocked: mock,
        report_path: success
          ? (inp.output_dir ? `${inp.output_dir}/info.txt` : undefined)
          : undefined,
        error_class: deriveErrorClass(r.stdout),
      },
    }
  },
}
