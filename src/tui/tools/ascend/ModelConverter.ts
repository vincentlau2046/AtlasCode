import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { MODEL_CONVERTER_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendModelConverter — model → om via atc (the CANN compiler chokepoint).
 *
 * Wraps `atc` (CANN-installed binary at /usr/local/Ascend/.../atc/bin, source in
 * graphengine/ge/offline/atc/). atc is the single unified compiler step that
 * converts a source model (ONNX / TensorFlow pb / Caffe / MindSpore AIR) → the
 * Ascend offline .om model. It does NOT do pytorch→onnx or onnx→pb — those are
 * separate steps (torch.onnx.export / onnx-tf); atc only does the final →om.
 *
 * Official grounding: memory `ascend-deploy-cli-verified`.
 * Contract: returns EVIDENCE (compile result + om artifact path + atc log),
 * not a decision.
 */
const FW_CODES = ['0', '1', '3', '5'] as const
const FW_LABELS: Record<string, string> = {
  '0': 'Caffe',
  '1': 'AIR (MindSpore)',
  '3': 'TensorFlow (pb)',
  '5': 'ONNX',
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    model_path: z.string().describe('Path to the input model file (atc --model). For framework 0=Caffe: the .prototxt; 3=TF: the .pb; 5=ONNX: the .onnx; 1=AIR: the .air.'),
    framework: z
      .enum(FW_CODES)
      .describe('Source framework code (atc --framework): 0=Caffe, 1=AIR/MindSpore, 3=TensorFlow(pb), 5=ONNX.'),
    output: z.string().describe('Output .om model path WITHOUT the .om extension (atc --output appends .om). E.g. /out/model → /out/model.om.'),
    soc_version: z.string().describe('Target Ascend SoC version (atc --soc_version). Probe via AscendRealHWBridge info, or common values: Ascend910A / Ascend910B / Ascend310 / Ascend310P3.'),
    input_shape: z.string().optional().describe('Input shape string (atc --input_shape), e.g. "actual_input_1:1,3,224,224". Required for most dynamic-shape models.'),
    insert_op_conf: z.string().optional().describe('AIPP config file path (atc --insert_op_conf) for image pre-processing on chip.'),
    out_nodes: z.string().optional().describe('Output node names (atc --out_nodes), e.g. "out_node1:0".'),
    weight: z.string().optional().describe('Caffe weight file path (atc --weight), only for framework=0=Caffe.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when atc exited 0.'),
    exitCode: z.number().nullable().describe('atc exit code (null if it could not run).'),
    stdout: z.string().describe('atc stdout — compile progress log.'),
    stderr: z.string().describe('atc stderr — compile errors (unsupported op, shape mismatch, etc.).'),
    durationMs: z.number().describe('Wall-clock time of the conversion.'),
    mocked: z.boolean().describe('True when running in mock mode (no real CANN/atc) — a liveness signal, not a real conversion.'),
    om_path: z.string().optional().describe('Path to the compiled .om model on success (atc appends .om to --output).'),
    framework_label: z.string().describe('Human-readable source framework label.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ModelConverter = buildTool({
  name: MODEL_CONVERTER_TOOL_NAME,
  searchHint: 'convert a model (ONNX/pb/caffe/air) to Ascend .om via atc (CANN compiler)',
  maxResultSizeChars: 100_000,
  async description(input) {
    const m = (input as { model_path?: string }).model_path || 'the model'
    const fw = (input as { framework?: string }).framework
    return 'Convert ' + m.slice(0, 30) + ' (' + (FW_LABELS[fw || ''] || '?') + ') → .om via atc'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: ModelConverter.name + ' will run atc to compile the model to .om. Allow?',
    }
  },
  async prompt() {
    return 'Convert a source model to the Ascend offline .om format via `atc` (CANN-installed binary — the single unified →om compiler chokepoint; source in graphengine/). Provide the model path, framework code (0=Caffe, 1=AIR/MindSpore, 3=TensorFlow pb, 5=ONNX), output path (WITHOUT .om extension — atc appends it), soc_version (probe via AscendRealHWBridge info; common: Ascend910A/910B/310/310P3), and input_shape for dynamic-shape models. atc does NOT do pytorch→onnx or onnx→pb — convert pytorch→onnx first via torch.onnx.export (base coding), then atc --framework=5. Returns the .om artifact path + compile log. This tool returns EVIDENCE only. In mock mode returns a liveness signal — say so, do not claim a real .om.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader(`atc ${d.framework_label}`, d.success, d.exitCode, d.durationMs, d.mocked),
      d.om_path ? `om: ${d.om_path}` : '',
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
    // atc --model=<input> --framework=<N> --output=<out> --soc_version=<soc> [--input_shape="..."] ...
    const args = [
      `--model=${inp.model_path}`,
      `--framework=${inp.framework}`,
      `--output=${inp.output}`,
      `--soc_version=${inp.soc_version}`,
    ]
    if (inp.input_shape) args.push(`--input_shape=${inp.input_shape}`)
    if (inp.insert_op_conf) args.push(`--insert_op_conf=${inp.insert_op_conf}`)
    if (inp.out_nodes) args.push(`--out_nodes=${inp.out_nodes}`)
    if (inp.weight) args.push(`--weight=${inp.weight}`)

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('atc', args, {
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
        om_path: success ? `${inp.output}.om` : undefined,
        framework_label: FW_LABELS[inp.framework] || inp.framework,
      },
    }
  },
} as any)
