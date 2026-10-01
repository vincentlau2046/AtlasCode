/**
 * AscendBenchmarkRunner — IEEE 2937 标准推理基准（ais-bench）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/BenchmarkRunner.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（原始 timing + summary 路径 + 派生 throughput），不决策。
 * delta（旧 buildTool(zod) → 新 shared Tool 契约）：① ② ③ ④ ⑤
 * checkPermissions = fail-closed ask ⑥ mapToolResult = 旧 foldResult ⑦ call
 * 5 参 → 2 参 ⑧ import 重指本域 AscendExecutor + runCannExec + foldUtils。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { BENCHMARK_RUNNER_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const BENCHMARK_RUNNER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    model_path: {
      type: 'string',
      description:
        'Absolute path to the compiled OM model to benchmark (ais_bench --model, required).',
    },
    output_dir: {
      type: 'string',
      description:
        'Output directory for the *_summary.json + result files (ais_bench --output). Defaults to ./.',
    },
    loop: {
      type: 'number',
      description:
        'Number of inference iterations to run (ais_bench --loop). Default 5.',
    },
    warmup_count: {
      type: 'number',
      description:
        'Warmup iterations before timing (ais_bench --warmup_count).',
    },
    batchsize: {
      type: 'number',
      description:
        'Batch size (ais_bench --batchsize). If omitted, inferred from the model.',
    },
    device_id: {
      type: 'number',
      description: 'NPU device id (ais_bench --device). Default 0.',
    },
    outfmt: {
      type: 'string',
      enum: ['BIN', 'NPY', 'npy', 'bin'],
      description:
        'Output format for inference results (ais_bench --outfmt). Default BIN.',
    },
    display_all_summary: {
      type: 'boolean',
      description:
        'Whether to print the full per-iteration summary (ais_bench --display_all_summary).',
    },
  },
  required: ['model_path'],
}

export interface BenchmarkRunnerOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  summary_path?: string
  throughput?: string
}

/** Parse the throughput + NPU_compute_time lines from ais_bench stdout. */
function deriveThroughput(stdout: string): string | undefined {
  const lines = stdout.split('\n')
  const picked: string[] = []
  for (const l of lines) {
    const s = l.trim()
    if (/throughput|NPU_compute_time|H2D_latency|D2H_latency/i.test(s))
      picked.push(s)
  }
  return picked.length ? picked.join(' | ') : undefined
}

function getPrompt(): string {
  return (
    'Benchmark an Ascend OM model via ais-bench (ascend-official/tools/' +
    'ais-bench_workload, the ais_bench Python package — IEEE 2937 / T/CESA ' +
    '1169-2021 standardized AI-server performance test). Provide the OM model ' +
    'path (required), and optionally output dir, loop count, warmup count, ' +
    'batchsize, device id, output format. Returns NPU_compute_time ' +
    '(min/max/mean/median/p99), H2D/D2H latency, throughput, and a ' +
    '*_summary.json artifact path. The model MUST be a compiled .om (convert ' +
    'via atc/msame first if it is .onnx/.pb). This tool returns EVIDENCE ' +
    '(timing), not a decision. In mock mode it returns a liveness signal — ' +
    'say so, do not claim real throughput.'
  )
}

function fold(d: BenchmarkRunnerOutput): string {
  return [
    foldHeader('ais-bench', d.success, d.exitCode, d.durationMs, d.mocked),
    d.throughput ? d.throughput : '',
    d.summary_path ? `summary: ${d.summary_path}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const BenchmarkRunner: Tool = {
  name: BENCHMARK_RUNNER_TOOL_NAME,
  inputSchema: BENCHMARK_RUNNER_INPUT_SCHEMA,
  inputJSONSchema: BENCHMARK_RUNNER_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'benchmark an Ascend OM model for throughput/latency via ais-bench (IEEE 2937)',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => BENCHMARK_RUNNER_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      BENCHMARK_RUNNER_TOOL_NAME +
      ' will run ais-bench inference on the NPU. Allow?',
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
      content: fold(content as BenchmarkRunnerOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<BenchmarkRunnerOutput>> {
    const inp = (args ?? {}) as {
      model_path: string
      output_dir?: string
      loop?: number
      warmup_count?: number
      batchsize?: number
      device_id?: number
      outfmt?: string
      display_all_summary?: boolean
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // python3 -m ais_bench --model <om> [--output <dir>] [--loop N] ...
    const outDir = inp.output_dir || '.'
    const execArgs = [
      '-m',
      'ais_bench',
      '--model',
      inp.model_path,
      '--output',
      outDir,
      '--loop',
      String(inp.loop ?? 5),
    ]
    if (inp.warmup_count !== undefined)
      execArgs.push('--warmup_count', String(inp.warmup_count))
    if (inp.batchsize !== undefined)
      execArgs.push('--batchsize', String(inp.batchsize))
    if (inp.device_id !== undefined)
      execArgs.push('--device', String(inp.device_id))
    if (inp.outfmt) execArgs.push('--outfmt', inp.outfmt)
    if (inp.display_all_summary)
      execArgs.push('--display_all_summary', 'true')

    const r = await runCannExec('python3', execArgs, {
      signal: ctx?.signal,
      mock,
    })
    const success = (r.exitCode ?? 1) === 0
    const modelBase = ((inp.model_path || 'model').split('/').pop() as string).replace(
      /\.[^.]+$/,
      '',
    )
    return {
      data: {
        success,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        durationMs: r.durationMs,
        mocked: mock,
        summary_path: success ? `${outDir}/${modelBase}_summary.json` : undefined,
        throughput: deriveThroughput(r.stdout),
      },
    }
  },
}
