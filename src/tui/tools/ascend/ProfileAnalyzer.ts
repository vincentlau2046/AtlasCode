import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { PROFILE_ANALYZER_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendProfileAnalyzer — GE profiling-dump analysis.
 *
 * Wraps `ada-pa` (ascend-official/tools/ada pip package, the `ada-pa`
 * console_script — NOT `ada`, which downloads CANN packages from CI).
 * Parses a GE profiling stdout dump (captured with GE_PROFILING_TO_STD_OUT=1
 * + torch.npu.profile or msame --profiler true) into trace.json (chrome://tracing)
 * + summary CSVs + op-stat rankings.
 *
 * Official grounding: memory `ascend-debug-cli-verified`.
 * Contract: returns EVIDENCE (analysis result + output artifacts + op rankings),
 * not a decision.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    profiling_file: z
      .string()
      .describe('Path to the GE profiling stdout dump file (captured with GE_PROFILING_TO_STD_OUT=1 + torch.npu.profile / msame --profiler true). This is the input_file positional arg to ada-pa.'),
    reporter: z
      .enum(['single-op'])
      .optional()
      .describe('Reporter mode: "single-op" adds PyTorch single-op analysis. Omit for generic analysis.'),
    output_dir: z.string().optional().describe('Output directory for trace.json + summary CSVs (ada-pa -o).'),
    cwd: z.string().optional().describe('Working directory to run ada-pa in.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when ada-pa exited 0.'),
    exitCode: z.number().nullable().describe('ada-pa exit code (null if it could not run).'),
    stdout: z.string().describe('ada-pa stdout — op-stat summary / rankings.'),
    stderr: z.string().describe('ada-pa stderr.'),
    durationMs: z.number().describe('Wall-clock time of the analysis.'),
    mocked: z.boolean().describe('True when running in mock mode (no real profiling dump) — a liveness signal, not a real analysis.'),
    trace_path: z.string().optional().describe('Path to the generated chrome://tracing trace.json on success.'),
    summary_path: z.string().optional().describe('Path to the generated summary CSV on success.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ProfileAnalyzer = buildTool({
  name: PROFILE_ANALYZER_TOOL_NAME,
  searchHint: 'analyze an Ascend GE profiling dump (op rankings, bottleneck stage) via ada-pa',
  maxResultSizeChars: 100_000,
  async description(input) {
    const f = (input as { profiling_file?: string }).profiling_file || 'the profiling dump'
    return 'Analyze GE profiling from ' + f.slice(0, 40)
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return true },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: ProfileAnalyzer.name + ' will run ada-pa to analyze the GE profiling dump. Allow?',
    }
  },
  async prompt() {
    return 'Analyze an Ascend GE profiling dump via ada-pa (ascend-official/tools/ada pip package, the ada-pa console_script — NOT ada, which downloads CANN packages). Provide the profiling stdout dump file (captured with GE_PROFILING_TO_STD_OUT=1 + torch.npu.profile or msame --profiler true), an optional "single-op" reporter, and an optional output dir. ada-pa produces a chrome://tracing trace.json + summary CSVs + op-stat rankings. Returns the artifact paths and the op-stat summary. This tool returns EVIDENCE (which ops/stages are the bottleneck), not a decision. In mock mode it returns a liveness signal — say so.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('ada-pa', d.success, d.exitCode, d.durationMs, d.mocked),
      d.trace_path ? `trace: ${d.trace_path}` : '',
      d.summary_path ? `summary: ${d.summary_path}` : '',
      ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
      d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
    ].filter(Boolean).join('\n')
  },
  async call(
    input,
    { abortController, options }: { abortController?: AbortController; options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    const mock = AscendExecutor.shouldMock(options)
    const ascendExecutor = getCoreDependencies().ascendExecutor
    // ada-pa <input_file> [--reporter=single-op] [-o <out_dir>]
    const args = [inp.profiling_file]
    if (inp.reporter) args.push('--reporter=' + inp.reporter)
    if (inp.output_dir) args.push('-o', inp.output_dir)

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('ada-pa', args, {
        signal: abortController?.signal,
        mock,
        ...(inp.cwd ? { cwd: inp.cwd } : {}),
      })
      exitCode = result.exitCode
      stdout = result.stdout
      stderr = result.stderr
      durationMs = result.durationMs
    } catch (e) {
      if (e instanceof ExecError) {
        exitCode = e.result.exitCode
        stdout = e.result.stdout
        stderr = e.result.stderr
        durationMs = e.result.durationMs
      } else {
        throw e
      }
    }
    const success = (exitCode ?? 1) === 0
    const outDir = inp.output_dir || '.'
    return {
      data: {
        success,
        exitCode,
        stdout,
        stderr,
        durationMs,
        mocked: mock,
        trace_path: success ? `${outDir}/trace.json` : undefined,
        summary_path: success ? `${outDir}/summary.csv` : undefined,
      },
    }
  },
} as any)
