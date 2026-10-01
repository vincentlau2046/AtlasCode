/**
 * AscendProfileAnalyzer — GE profiling dump 分析（ada-pa）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/ProfileAnalyzer.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（分析结果 + 输出产物 + 算子排名），不决策。delta（旧
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
import { PROFILE_ANALYZER_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const PROFILE_ANALYZER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    profiling_file: {
      type: 'string',
      description:
        'Path to the GE profiling stdout dump file (captured with GE_PROFILING_TO_STD_OUT=1 + torch.npu.profile / msame --profiler true). This is the input_file positional arg to ada-pa.',
    },
    reporter: {
      type: 'string',
      enum: ['single-op'],
      description:
        'Reporter mode: "single-op" adds PyTorch single-op analysis. Omit for generic analysis.',
    },
    output_dir: {
      type: 'string',
      description:
        'Output directory for trace.json + summary CSVs (ada-pa -o).',
    },
    cwd: {
      type: 'string',
      description: 'Working directory to run ada-pa in.',
    },
  },
  required: ['profiling_file'],
}

export interface ProfileAnalyzerOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  trace_path?: string
  summary_path?: string
}

function getPrompt(): string {
  return (
    'Analyze an Ascend GE profiling dump via ada-pa (ascend-official/tools/ada ' +
    'pip package, the ada-pa console_script — NOT ada, which downloads CANN ' +
    'packages). Provide the profiling stdout dump file (captured with ' +
    'GE_PROFILING_TO_STD_OUT=1 + torch.npu.profile or msame --profiler true), ' +
    'an optional "single-op" reporter, and an optional output dir. ada-pa ' +
    'produces a chrome://tracing trace.json + summary CSVs + op-stat ' +
    'rankings. Returns the artifact paths and the op-stat summary. This tool ' +
    'returns EVIDENCE (which ops/stages are the bottleneck), not a decision. ' +
    'In mock mode it returns a liveness signal — say so.'
  )
}

function fold(d: ProfileAnalyzerOutput): string {
  return [
    foldHeader('ada-pa', d.success, d.exitCode, d.durationMs, d.mocked),
    d.trace_path ? `trace: ${d.trace_path}` : '',
    d.summary_path ? `summary: ${d.summary_path}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const ProfileAnalyzer: Tool = {
  name: PROFILE_ANALYZER_TOOL_NAME,
  inputSchema: PROFILE_ANALYZER_INPUT_SCHEMA,
  inputJSONSchema: PROFILE_ANALYZER_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'analyze an Ascend GE profiling dump (op rankings, bottleneck stage) via ada-pa',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => PROFILE_ANALYZER_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      PROFILE_ANALYZER_TOOL_NAME +
      ' will run ada-pa to analyze the GE profiling dump. Allow?',
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
      content: fold(content as ProfileAnalyzerOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<ProfileAnalyzerOutput>> {
    const inp = (args ?? {}) as {
      profiling_file: string
      reporter?: string
      output_dir?: string
      cwd?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // ada-pa <input_file> [--reporter=single-op] [-o <out_dir>]
    const execArgs = [inp.profiling_file]
    if (inp.reporter) execArgs.push('--reporter=' + inp.reporter)
    if (inp.output_dir) execArgs.push('-o', inp.output_dir)

    const r = await runCannExec('ada-pa', execArgs, {
      signal: ctx?.signal,
      mock,
      ...(inp.cwd ? { cwd: inp.cwd } : {}),
    })
    const success = (r.exitCode ?? 1) === 0
    const outDir = inp.output_dir || '.'
    return {
      data: {
        success,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        durationMs: r.durationMs,
        mocked: mock,
        trace_path: success ? `${outDir}/trace.json` : undefined,
        summary_path: success ? `${outDir}/summary.csv` : undefined,
      },
    }
  },
}
