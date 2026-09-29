import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { BENCHMARK_RUNNER_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendBenchmarkRunner — IEEE 2937 standard inference benchmark.
 *
 * Wraps `python3 -m ais_bench` (ascend-official/tools/ais-bench_workload, the
 * `ais_bench` Python package — NOT a separate Ascend/ais-bench repo). ais-bench
 * is the standardized AI-server performance-test software per IEEE 2937 /
 * T/CESA 1169-2021; the locally-usable CLI is the `ais_bench` module
 * (`python3 -m ais_bench`, entry point ais_bench/infer/__main__.py).
 *
 * Runs an OM model on NPU and returns throughput / latency evidence:
 * NPU_compute_time (min/max/mean/median/p99), H2D/D2H latency, throughput
 * (1000*batchsize.mean/NPU_compute_time.mean), plus a *_summary.json artifact.
 *
 * Official grounding: memory `ascend-perf-cli-verified`.
 * Contract: returns EVIDENCE (raw timing + summary path + derived throughput),
 * not a decision.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    model_path: z
      .string()
      .describe('Absolute path to the compiled OM model to benchmark (ais_bench --model, required).'),
    output_dir: z
      .string()
      .optional()
      .describe('Output directory for the *_summary.json + result files (ais_bench --output). Defaults to ./.'),
    loop: z
      .number()
      .int()
      .optional()
      .describe('Number of inference iterations to run (ais_bench --loop). Default 5.'),
    warmup_count: z.number().int().optional().describe('Warmup iterations before timing (ais_bench --warmup_count).'),
    batchsize: z.number().int().optional().describe('Batch size (ais_bench --batchsize). If omitted, inferred from the model.'),
    device_id: z
      .number()
      .int()
      .optional()
      .describe('NPU device id (ais_bench --device). Default 0.'),
    outfmt: z
      .enum(['BIN', 'NPY', 'npy', 'bin'])
      .optional()
      .describe('Output format for inference results (ais_bench --outfmt). Default BIN.'),
    display_all_summary: z
      .boolean()
      .optional()
      .describe('Whether to print the full per-iteration summary (ais_bench --display_all_summary).'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when ais_bench exited 0.'),
    exitCode: z.number().nullable().describe('ais_bench exit code (null if it could not run).'),
    stdout: z.string().describe('ais_bench stdout — the timing summary (NPU_compute_time, throughput).'),
    stderr: z.string().describe('ais_bench stderr.'),
    durationMs: z.number().describe('Wall-clock time of the benchmark run.'),
    mocked: z.boolean().describe('True when running in mock mode (no real NPU/model) — a liveness signal, not a real benchmark.'),
    summary_path: z.string().optional().describe('Path to the *_summary.json artifact on success.'),
    throughput: z.string().optional().describe('Derived throughput evidence parsed from stdout (e.g. "throughput: 1234.5 infs, NPU_compute_time mean: 0.81ms").'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/** Parse the throughput + NPU_compute_time lines from ais_bench stdout (evidence, not a decision). */
function deriveThroughput(stdout: string): string | undefined {
  const lines = stdout.split('\n')
  const picked: string[] = []
  for (const l of lines) {
    const s = l.trim()
    if (/throughput|NPU_compute_time|H2D_latency|D2H_latency/i.test(s)) picked.push(s)
  }
  return picked.length ? picked.join(' | ') : undefined
}

export const BenchmarkRunner = buildTool({
  name: BENCHMARK_RUNNER_TOOL_NAME,
  searchHint: 'benchmark an Ascend OM model for throughput/latency via ais-bench (IEEE 2937)',
  maxResultSizeChars: 100_000,
  async description(input) {
    const m = (input as { model_path?: string }).model_path || 'the model'
    return 'Benchmark ' + m.slice(0, 40) + ' on NPU via ais-bench'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: BenchmarkRunner.name + ' will run ais-bench inference on the NPU. Allow?',
    }
  },
  async prompt() {
    return 'Benchmark an Ascend OM model via ais-bench (ascend-official/tools/ais-bench_workload, the ais_bench Python package — IEEE 2937 / T/CESA 1169-2021 standardized AI-server performance test). Provide the OM model path (required), and optionally output dir, loop count, warmup count, batchsize, device id, output format. Returns NPU_compute_time (min/max/mean/median/p99), H2D/D2H latency, throughput, and a *_summary.json artifact path. The model MUST be a compiled .om (convert via atc/msame first if it is .onnx/.pb). This tool returns EVIDENCE (timing), not a decision. In mock mode it returns a liveness signal — say so, do not claim real throughput.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('ais-bench', d.success, d.exitCode, d.durationMs, d.mocked),
      d.throughput ? d.throughput : '',
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
    // python3 -m ais_bench --model <om> [--output <dir>] [--loop N] [--warmup_count N] [--batchsize N] [--device N] [--outfmt BIN] [--display_all_summary]
    const outDir = inp.output_dir || '.'
    const args = ['-m', 'ais_bench', '--model', inp.model_path, '--output', outDir, '--loop', String(inp.loop ?? 5)]
    if (inp.warmup_count !== undefined) args.push('--warmup_count', String(inp.warmup_count))
    if (inp.batchsize !== undefined) args.push('--batchsize', String(inp.batchsize))
    if (inp.device_id !== undefined) args.push('--device', String(inp.device_id))
    if (inp.outfmt) args.push('--outfmt', inp.outfmt)
    if (inp.display_all_summary) args.push('--display_all_summary', 'true')

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('python3', args, {
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
    const modelBase = ((inp.model_path || 'model').split('/').pop() as string).replace(/\.[^.]+$/, '')
    return {
      data: {
        success,
        exitCode,
        stdout,
        stderr,
        durationMs,
        mocked: mock,
        summary_path: success ? `${outDir}/${modelBase}_summary.json` : undefined,
        throughput: deriveThroughput(stdout),
      },
    }
  },
} as any)
