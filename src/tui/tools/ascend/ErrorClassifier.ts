import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { ERROR_CLASSIFIER_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendErrorClassifier — AICore error-code analysis.
 *
 * Wraps `msaicerr.py` (ascend-official/tools/msaicerr) which decodes AICore
 * error codes from a collected fault scene: error code + bit decoding, PC/CCE
 * line, input/output addr bounds check, op graph info, dump NaN/INF, single-op
 * test result. Consumes the tar.gz produced by AscendFaultCollector
 * (npucollector) — the canonical pairing in the open-source sources.
 *
 * Official grounding: memory `ascend-debug-cli-verified`.
 * Contract: returns EVIDENCE (error class + decoded info + report path), not a
 * decision. Complements AscendDiagnoser (log-keyword heuristic) with structured
 * AICore-error-code decoding.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    source: z
      .string()
      .describe('The collected fault scene: either a tar.gz path (from AscendFaultCollector, use -f mode) OR a decompressed report dir (use -p mode).'),
    mode: z
      .enum(['tar', 'report_dir'])
      .optional()
      .describe('How to interpret source: "tar" = feed the .tar.gz directly (msaicerr -f); "report_dir" = feed a decompressed dir (msaicerr -p). Default "tar".'),
    output_dir: z.string().optional().describe('Output directory for the analysis report (msaicerr -out).'),
    cwd: z.string().optional().describe('Working directory to run msaicerr.py in.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when msaicerr exited 0.'),
    exitCode: z.number().nullable().describe('msaicerr exit code (null if it could not run).'),
    stdout: z.string().describe('msaicerr stdout — decoded AICore error info.'),
    stderr: z.string().describe('msaicerr stderr.'),
    durationMs: z.number().describe('Wall-clock time of the analysis.'),
    mocked: z.boolean().describe('True when running in mock mode (no real scene) — a liveness signal, not a real decode.'),
    report_path: z.string().optional().describe('Path to the generated info.txt report on success.'),
    error_class: z.string().optional().describe('High-level error class derived from the decoded AICore code (compile/runtime/oom/alignment/aicore-hardware/unknown).'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/** Map msaicerr stdout keywords to a coarse error class (evidence hint, not a decision). */
function deriveErrorClass(stdout: string): string | undefined {
  const s = stdout.toLowerCase()
  if (/aicerror|aicore.*error|hardware.*error/.test(s)) return 'aicore-hardware'
  if (/out of memory|oom/.test(s)) return 'oom'
  if (/alignment|misalign|addr.*bound/.test(s)) return 'alignment'
  if (/nan|inf|overflow/.test(s)) return 'runtime'
  if (/compile|syntax|undefined/.test(s)) return 'compile'
  return undefined
}

export const ErrorClassifier = buildTool({
  name: ERROR_CLASSIFIER_TOOL_NAME,
  searchHint: 'decode Ascend AICore error codes from a collected fault scene via msaicerr',
  maxResultSizeChars: 100_000,
  async description(input) {
    const src = (input as { source?: string }).source || 'the fault scene'
    return 'Decode AICore errors from ' + src.slice(0, 40)
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return true },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: ErrorClassifier.name + ' will run msaicerr.py to decode AICore error codes. Allow?',
    }
  },
  async prompt() {
    return 'Decode Ascend AICore error codes from a collected fault scene via msaicerr.py (ascend-official/tools/msaicerr). Provide the source — a tar.gz from AscendFaultCollector (mode "tar", msaicerr -f) or a decompressed report dir (mode "report_dir", msaicerr -p) — and an optional output dir. msaicerr decodes the AICore error code + bits, PC/CCE line, addr bounds, op graph info, dump NaN/INF, and single-op test result. Returns the report path, decoded info, and a coarse error class. This tool returns EVIDENCE only. In mock mode it returns a liveness signal — say so.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('msaicerr', d.success, d.exitCode, d.durationMs, d.mocked),
      d.error_class ? `error_class: ${d.error_class}` : '',
      d.report_path ? `report: ${d.report_path}` : '',
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
    const mode = inp.mode || 'tar'
    // msaicerr.py -f <tar> | -p <dir>  [-out <out>]
    const args = ['-f', inp.source]
    if (mode === 'report_dir') { args[0] = '-p' }
    if (inp.output_dir) args.push('-out', inp.output_dir)

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('msaicerr.py', args, {
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
    return {
      data: {
        success,
        exitCode,
        stdout,
        stderr,
        durationMs,
        mocked: mock,
        report_path: success ? (inp.output_dir ? `${inp.output_dir}/info.txt` : undefined) : undefined,
        error_class: deriveErrorClass(stdout),
      },
    }
  },
} as any)
