import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { PROFILE_REPORT_PARSER_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendProfileReportParser — msprof dump → bottleneck analysis.
 *
 * Wraps `msprof --export=on` / `--analyze=on` (CANN-installed binary at
 * $ASCEND_TOOLKIT_HOME/toolkit/tools/profiler/bin/msprof — NOT a GitHub repo).
 * This is the canonical path to parse a CANN/msprof binary profiling dump
 * (a PROF_* directory captured by AscendRealHWBridge's `profile` command) into
 * parseable artifacts: op_summary_*.csv (per-op time + pipeline-utilization
 * ratios like aiv_vec_ratio/aiv_mte2_ratio), trace.json, optional db.
 *
 * Complements AscendProfileAnalyzer (ada-pa), which parses the GE *text*
 * profiling dump (GE_PROFILING_TO_STD_OUT=1) — a different input format. Use
 * this tool for msprof binary dumps; use AscendProfileAnalyzer for GE text dumps.
 *
 * The bottleneck-analysis methodology (read op_summary_*.csv pipeline ratios →
 * locate the bottleneck stage) is documented in
 * triton-ascend/docs/en/debug_guide/profiling.md "Locating Bottlenecks".
 *
 * Official grounding: memory `ascend-perf-cli-verified`.
 * Contract: returns EVIDENCE (op_summary path + derived top-op hints), not a
 * decision. The agent inspects the op_summary_*.csv (via Read) for the full
 * pipeline-utilization breakdown.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    profiling_dir: z
      .string()
      .describe('Path to the msprof profiling dump directory (the PROF_* dir captured by AscendRealHWBridge profile, or its parent). This is the msprof --output arg.'),
    mode: z
      .enum(['export', 'analyze'])
      .optional()
      .describe('msprof mode: "export" (default, produces op_summary_*.csv + trace.json from the raw dump) or "analyze" (produces a db). Use "export" to get the per-op CSV for bottleneck analysis.'),
    output_dir: z
      .string()
      .optional()
      .describe('Output directory for parsed artifacts (defaults to profiling_dir).'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when msprof exited 0.'),
    exitCode: z.number().nullable().describe('msprof exit code (null if it could not run).'),
    stdout: z.string().describe('msprof stdout — export/analyze progress log.'),
    stderr: z.string().describe('msprof stderr.'),
    durationMs: z.number().describe('Wall-clock time of the parse.'),
    mocked: z.boolean().describe('True when running in mock mode (no real profiling dump) — a liveness signal, not a real parse.'),
    op_summary_path: z.string().optional().describe('Representative path to the op_summary_*.csv on success. Glob this dir (op_summary_*.csv) for the exact file — msprof names it with a timestamp/device suffix.'),
    top_ops: z.string().optional().describe('Derived top-op hints parsed from the op_summary (coarse evidence — Read the CSV for the full pipeline-utilization breakdown).'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/** Coarse top-op extraction from msprof op_summary-like stdout (evidence hint, not a decision). */
function deriveTopOps(stdout: string): string | undefined {
  const lines = stdout.split('\n').filter(l => /ratio|_time|ops\b/i.test(l) && /[a-z_]+,?\s*[\d.]+/i.test(l))
  if (!lines.length) return undefined
  return 'top ops: ' + lines.slice(0, 4).map(l => l.trim()).join('; ')
}

export const ProfileReportParser = buildTool({
  name: PROFILE_REPORT_PARSER_TOOL_NAME,
  searchHint: 'parse an Ascend msprof profiling dump into op_summary / bottleneck evidence via msprof --export',
  maxResultSizeChars: 100_000,
  async description(input) {
    const d = (input as { profiling_dir?: string }).profiling_dir || 'the profiling dump'
    return 'Parse msprof dump from ' + d.slice(0, 40)
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return true },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: ProfileReportParser.name + ' will run msprof --export/--analyze on the profiling dump. Allow?',
    }
  },
  async prompt() {
    return 'Parse an Ascend msprof profiling dump into bottleneck evidence via `msprof --export=on` (CANN binary — the canonical parser for msprof binary dumps, NOT a GitHub repo). Provide the profiling dump directory (the PROF_* dir from AscendRealHWBridge profile). mode "export" (default) produces op_summary_*.csv (per-op time + pipeline-utilization ratios: aiv_vec_ratio, aiv_mte2_ratio, etc.) + trace.json; mode "analyze" produces a db. Returns the op_summary path + coarse top-op hints. Read the op_summary_*.csv (Glob op_summary_*.csv in the dump dir for the exact file) for the full pipeline breakdown — the bottleneck-analysis methodology is in triton-ascend profiling.md "Locating Bottlenecks". This tool returns EVIDENCE only. For a GE *text* profiling dump (GE_PROFILING_TO_STD_OUT=1) use AscendProfileAnalyzer (ada-pa) instead — different input format. In mock mode returns a liveness signal — say so.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('msprof analyze', d.success, d.exitCode, d.durationMs, d.mocked),
      d.top_ops ? d.top_ops : '',
      d.op_summary_path ? `op_summary: ${d.op_summary_path}` : '',
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
    const mode = inp.mode || 'export'
    const outDir = inp.output_dir || inp.profiling_dir
    // msprof --export=on --output <dir>  |  msprof --analyze=on --output <dir>
    const args = [`--${mode}=on`, '--output', inp.profiling_dir]

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('msprof', args, {
        signal: abortController?.signal,
        mock,
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
    return {
      data: {
        success,
        exitCode,
        stdout,
        stderr,
        durationMs,
        mocked: mock,
        op_summary_path: success ? `${outDir}/op_summary.csv` : undefined,
        top_ops: deriveTopOps(stdout),
      },
    }
  },
} as any)
