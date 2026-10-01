/**
 * AscendDataPrepTool — 推理数据预处理（image → bin，img2bin）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/DataPrepTool.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（输出目录 + 文件数 + log），不决策。delta（旧
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
import { DATA_PREP_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const DATA_PREP_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    input_path: {
      type: 'string',
      description:
        'Input path (img2bin -i): a directory of images, a single image file, or a text file listing image paths.',
    },
    output_dir: {
      type: 'string',
      description: 'Output directory for the .bin files (img2bin -o).',
    },
    width: {
      type: 'number',
      description: 'Target width in pixels (img2bin -w). Required for image input.',
    },
    height: {
      type: 'number',
      description:
        'Target height in pixels (img2bin -h). Required for image input.',
    },
    color_format: {
      type: 'string',
      enum: ['BGR', 'RGB', 'YUV', 'GRAY'],
      description: 'Color format (img2bin -f). Default BGR.',
    },
    layout: {
      type: 'string',
      enum: ['NCHW', 'NHWC'],
      description: 'Tensor layout (img2bin -a). Default NHWC.',
    },
    data_type: {
      type: 'string',
      enum: ['float32', 'uint8', 'int32', 'uint32'],
      description: 'Output data type (img2bin -t). Default uint8.',
    },
    mean: {
      type: 'array',
      items: { type: 'number' },
      description:
        'Mean subtraction per channel (img2bin -m), e.g. [104,117,123].',
    },
    std: {
      type: 'array',
      items: { type: 'number' },
      description:
        'Normalization scale per channel (img2bin -c), e.g. [1,1,1].',
    },
  },
  required: ['input_path', 'output_dir'],
}

export interface DataPrepToolOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  output_dir?: string
}

function getPrompt(): string {
  return (
    'Prepare Ascend inference input data via `img2bin.py` ' +
    '(ascend-official/tools/img2bin). Provide an input path (image dir, ' +
    'single image, or text file of paths), output dir, and image params: ' +
    'width, height, color format (BGR/RGB/YUV/GRAY), layout (NCHW/NHWC), ' +
    'data type (float32/uint8/int32), mean, std. Produces .bin files that ' +
    'msame / AscendBenchmarkRunner consume as inference input. Returns the ' +
    'output dir + conversion log. This tool returns EVIDENCE only. In mock ' +
    'mode returns a liveness signal — say so.'
  )
}

function fold(d: DataPrepToolOutput): string {
  return [
    foldHeader('img2bin', d.success, d.exitCode, d.durationMs, d.mocked),
    d.output_dir ? `output: ${d.output_dir}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const DataPrepTool: Tool = {
  name: DATA_PREP_TOOL_NAME,
  inputSchema: DATA_PREP_TOOL_INPUT_SCHEMA,
  inputJSONSchema: DATA_PREP_TOOL_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'prepare Ascend inference input data (image → bin) via img2bin',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => DATA_PREP_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      DATA_PREP_TOOL_NAME +
      ' will run img2bin.py to preprocess images into .bin. Allow?',
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
      content: fold(content as DataPrepToolOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<DataPrepToolOutput>> {
    const inp = (args ?? {}) as {
      input_path: string
      output_dir: string
      width?: number
      height?: number
      color_format?: string
      layout?: string
      data_type?: string
      mean?: number[]
      std?: number[]
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // python3 img2bin.py -i <input> -o <out> [-w W -h H -f BGR -a NHWC -t uint8 -m [...] -c [...]]
    const execArgs = ['img2bin.py', '-i', inp.input_path, '-o', inp.output_dir]
    if (inp.width !== undefined) execArgs.push('-w', String(inp.width))
    if (inp.height !== undefined) execArgs.push('-h', String(inp.height))
    if (inp.color_format) execArgs.push('-f', inp.color_format)
    if (inp.layout) execArgs.push('-a', inp.layout)
    if (inp.data_type) execArgs.push('-t', inp.data_type)
    if (inp.mean && inp.mean.length)
      execArgs.push('-m', `[${inp.mean.join(',')}]`)
    if (inp.std && inp.std.length) execArgs.push('-c', `[${inp.std.join(',')}]`)

    const r = await runCannExec('python3', execArgs, {
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
        output_dir: success ? inp.output_dir : undefined,
      },
    }
  },
}
