/**
 * AscendModelConverter — 模型 → om（atc，CANN 编译器咽喉）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/ModelConverter.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（编译结果 + om 产物路径 + atc log），不决策。delta（旧
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
import { MODEL_CONVERTER_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

const FW_CODES = ['0', '1', '3', '5'] as const
const FW_LABELS: Record<string, string> = {
  '0': 'Caffe',
  '1': 'AIR (MindSpore)',
  '3': 'TensorFlow (pb)',
  '5': 'ONNX',
}

export const MODEL_CONVERTER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    model_path: {
      type: 'string',
      description:
        'Path to the input model file (atc --model). For framework 0=Caffe: the .prototxt; 3=TF: the .pb; 5=ONNX: the .onnx; 1=AIR: the .air.',
    },
    framework: {
      type: 'string',
      enum: [...FW_CODES],
      description:
        'Source framework code (atc --framework): 0=Caffe, 1=AIR/MindSpore, 3=TensorFlow(pb), 5=ONNX.',
    },
    output: {
      type: 'string',
      description:
        'Output .om model path WITHOUT the .om extension (atc --output appends .om). E.g. /out/model → /out/model.om.',
    },
    soc_version: {
      type: 'string',
      description:
        'Target Ascend SoC version (atc --soc_version). Probe via AscendRealHWBridge info, or common values: Ascend910A / Ascend910B / Ascend310 / Ascend310P3.',
    },
    input_shape: {
      type: 'string',
      description:
        'Input shape string (atc --input_shape), e.g. "actual_input_1:1,3,224,224". Required for most dynamic-shape models.',
    },
    insert_op_conf: {
      type: 'string',
      description:
        'AIPP config file path (atc --insert_op_conf) for image pre-processing on chip.',
    },
    out_nodes: {
      type: 'string',
      description:
        'Output node names (atc --out_nodes), e.g. "out_node1:0".',
    },
    weight: {
      type: 'string',
      description:
        'Caffe weight file path (atc --weight), only for framework=0=Caffe.',
    },
  },
  required: ['model_path', 'framework', 'output', 'soc_version'],
}

export interface ModelConverterOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  om_path?: string
  framework_label: string
}

function getPrompt(): string {
  return (
    'Convert a source model to the Ascend offline .om format via `atc` ' +
    '(CANN-installed binary — the single unified →om compiler chokepoint; ' +
    'source in graphengine/). Provide the model path, framework code ' +
    '(0=Caffe, 1=AIR/MindSpore, 3=TensorFlow pb, 5=ONNX), output path ' +
    '(WITHOUT .om extension — atc appends it), soc_version (probe via ' +
    'AscendRealHWBridge info; common: Ascend910A/910B/310/310P3), and ' +
    'input_shape for dynamic-shape models. atc does NOT do pytorch→onnx or ' +
    'onnx→pb — convert pytorch→onnx first via torch.onnx.export (base ' +
    'coding), then atc --framework=5. Returns the .om artifact path + ' +
    'compile log. This tool returns EVIDENCE only. In mock mode returns a ' +
    'liveness signal — say so, do not claim a real .om.'
  )
}

function fold(d: ModelConverterOutput): string {
  return [
    foldHeader(`atc ${d.framework_label}`, d.success, d.exitCode, d.durationMs, d.mocked),
    d.om_path ? `om: ${d.om_path}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const ModelConverter: Tool = {
  name: MODEL_CONVERTER_TOOL_NAME,
  inputSchema: MODEL_CONVERTER_INPUT_SCHEMA,
  inputJSONSchema: MODEL_CONVERTER_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'convert a model (ONNX/pb/caffe/air) to Ascend .om via atc (CANN compiler)',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => MODEL_CONVERTER_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      MODEL_CONVERTER_TOOL_NAME +
      ' will run atc to compile the model to .om. Allow?',
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
      content: fold(content as ModelConverterOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<ModelConverterOutput>> {
    const inp = (args ?? {}) as {
      model_path: string
      framework: string
      output: string
      soc_version: string
      input_shape?: string
      insert_op_conf?: string
      out_nodes?: string
      weight?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // atc --model=<input> --framework=<N> --output=<out> --soc_version=<soc> ...
    const execArgs = [
      `--model=${inp.model_path}`,
      `--framework=${inp.framework}`,
      `--output=${inp.output}`,
      `--soc_version=${inp.soc_version}`,
    ]
    if (inp.input_shape) execArgs.push(`--input_shape=${inp.input_shape}`)
    if (inp.insert_op_conf)
      execArgs.push(`--insert_op_conf=${inp.insert_op_conf}`)
    if (inp.out_nodes) execArgs.push(`--out_nodes=${inp.out_nodes}`)
    if (inp.weight) execArgs.push(`--weight=${inp.weight}`)

    const r = await runCannExec('atc', execArgs, {
      signal: ctx?.signal,
      mock,
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
        om_path: success ? `${inp.output}.om` : undefined,
        framework_label: FW_LABELS[inp.framework] || inp.framework,
      },
    }
  },
}
