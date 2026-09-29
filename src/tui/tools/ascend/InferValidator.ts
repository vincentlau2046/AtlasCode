import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { INFER_VALIDATOR_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendInferValidator — OM inference validation (two modes, two official CLIs).
 *
 * mode "run": wraps `msame` (ascend-official/tools/msame, C++ binary) — runs an
 *   offline .om model on .bin input data and writes inference output (TXT/BIN).
 *   Proves the om executes and produces output. `msame --model=x.om --input=y.bin
 *   --output=out/ --outfmt TXT --loop 1 [--profiler true] [--dump true]`.
 *
 * mode "compare": wraps `msquickcmp` (ascend-official/tools/msquickcmp,
 *   `python3 main.py`) — one-click full-network accuracy comparison between the
 *   original model (ONNX/pb) and the atc-converted .om. Proves the om preserves
 *   accuracy after conversion. `main.py -m model.onnx -om model.om -i input.bin
 *   -c CANN_PATH -o ./out`.
 *
 * Official grounding: memory `ascend-deploy-cli-verified`.
 * Contract: returns EVIDENCE (inference output / accuracy result + log), not a
 * decision. msame = "does it run?", msquickcmp = "is it accurate?".
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    mode: z
      .enum(['run', 'compare'])
      .describe('Validation mode: "run" = execute the .om on input data via msame (proves it runs + produces output); "compare" = compare original-model vs om accuracy via msquickcmp (proves accuracy after conversion).'),
    // shared
    om_path: z.string().describe('Path to the compiled .om model (msame --model / msquickcmp -om).'),
    input_path: z.string().describe('Input data: .bin file/dir for msame (--input), or .bin for msquickcmp (-i).'),
    output_dir: z.string().describe('Output directory (msame --output / msquickcmp -o).'),
    // msame-only
    outfmt: z
      .enum(['TXT', 'BIN'])
      .optional()
      .describe('msame output format (msame --outfmt). Default TXT. mode=run only.'),
    loop: z.number().int().optional().describe('msame inference loop count (msame --loop). Default 1. mode=run only.'),
    device: z.number().int().optional().describe('NPU device id (msame --device / msquickcmp uses default). Default 0.'),
    // msquickcmp-only
    original_model: z
      .string()
      .optional()
      .describe('Path to the ORIGINAL pre-conversion model (msquickcmp -m: .onnx or .pb). mode=compare only.'),
    cann_path: z
      .string()
      .optional()
      .describe('CANN toolkit install path (msquickcmp -c). mode=compare only. Defaults to /usr/local/Ascend/ascend-toolkit/latest.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when the CLI exited 0.'),
    exitCode: z.number().nullable().describe('CLI exit code (null if it could not run).'),
    stdout: z.string().describe('CLI stdout — inference output summary or accuracy comparison result.'),
    stderr: z.string().describe('CLI stderr.'),
    durationMs: z.number().describe('Wall-clock time of the validation.'),
    mocked: z.boolean().describe('True when running in mock mode (no real CANN/CLI) — a liveness signal, not a real validation.'),
    mode: z.string().describe('The validation mode used (run / compare).'),
    output_dir: z.string().optional().describe('Output directory holding inference results (msame) or the accuracy report (msquickcmp) on success.'),
    accuracy_result: z.string().optional().describe('Derived accuracy evidence from msquickcmp stdout (pass/fail + max diff). mode=compare only.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/** Parse the accuracy verdict from msquickcmp stdout (evidence hint). */
function deriveAccuracyResult(stdout: string): string | undefined {
  const s = stdout.toLowerCase()
  const lines = stdout.split('\n').filter(l => /accuracy|max.*diff|compare|pass|fail|cosine|mse/i.test(l))
  const verdict = /accuracy.*pass|compare.*pass|all.*pass/i.test(s) ? 'PASS'
    : /accuracy.*fail|compare.*fail|mismatch/i.test(s) ? 'FAIL'
    : undefined
  if (verdict || lines.length) {
    return [verdict ? `accuracy: ${verdict}` : '', lines.slice(0, 3).map(l => l.trim()).join('; ')].filter(Boolean).join(' | ')
  }
  return undefined
}

export const InferValidator = buildTool({
  name: INFER_VALIDATOR_TOOL_NAME,
  searchHint: 'validate an Ascend .om model: run inference (msame) or compare accuracy vs original (msquickcmp)',
  maxResultSizeChars: 100_000,
  async description(input) {
    const m = (input as { mode?: string }).mode || 'run'
    const om = (input as { om_path?: string }).om_path || 'the om'
    return (m === 'compare' ? 'Compare accuracy of ' : 'Run inference on ') + om.slice(0, 30)
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: InferValidator.name + ' will run msame/msquickcmp to validate the .om model. Allow?',
    }
  },
  async prompt() {
    return 'Validate an Ascend .om model. mode "run": execute the om on .bin input via `msame` (ascend-official/tools/msame, C++ binary) — proves it runs and produces output (TXT/BIN); provide om_path, input_path, output_dir, outfmt, loop, device. mode "compare": compare original-model vs om accuracy via `msquickcmp` (ascend-official/tools/msquickcmp, `python3 main.py -m original -om om -i input -c CANN_PATH -o out`) — proves accuracy is preserved after atc conversion; provide original_model, om_path, input_path, output_dir, cann_path. Use "run" to check the om executes; use "compare" to check accuracy after conversion. Returns inference output / accuracy verdict. This tool returns EVIDENCE only. In mock mode returns a liveness signal — say so, do not claim real validation.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader(`msame/${d.mode}`, d.success, d.exitCode, d.durationMs, d.mocked),
      d.accuracy_result ? d.accuracy_result : '',
      d.output_dir ? `output: ${d.output_dir}` : '',
      ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
      d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
    ].filter(Boolean).join('\n')
  },
  async call(
    input,
    { abortController, options }: { abortController?: AbortController; options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    const mode = inp.mode || 'run'
    const mock = AscendExecutor.shouldMock(options)
    const ascendExecutor = getCoreDependencies().ascendExecutor

    let command: string
    let args: string[]
    if (mode === 'compare') {
      // python3 main.py -m <original> -om <om> -i <input> -c <cann> -o <out>
      command = 'python3'
      args = ['main.py', '-m', inp.original_model || '', '-om', inp.om_path, '-i', inp.input_path, '-o', inp.output_dir]
      const cannPath = inp.cann_path || '/usr/local/Ascend/ascend-toolkit/latest'
      args.push('-c', cannPath)
    } else {
      // msame --model=<om> --input=<input> --output=<out> --outfmt TXT --loop 1 [--device 0]
      command = 'msame'
      args = [
        `--model=${inp.om_path}`,
        `--input=${inp.input_path}`,
        `--output=${inp.output_dir}`,
        `--outfmt=${inp.outfmt || 'TXT'}`,
        `--loop=${String(inp.loop ?? 1)}`,
      ]
      if (inp.device !== undefined) args.push(`--device=${String(inp.device)}`)
    }

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec(command, args, {
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
        mode,
        output_dir: success ? inp.output_dir : undefined,
        accuracy_result: mode === 'compare' ? deriveAccuracyResult(stdout) : undefined,
      },
    }
  },
} as any)
