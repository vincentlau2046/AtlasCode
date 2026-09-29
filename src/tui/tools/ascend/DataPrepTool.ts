import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { DATA_PREP_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendDataPrepTool — inference data preparation (image → bin) via img2bin.
 *
 * Wraps `img2bin.py` (ascend-official/tools/img2bin). Preprocesses images
 * (resize, mean subtraction, normalization, color/format conversion) into the
 * .bin binary format that msame / ais_bench expect as inference input. Supports
 * BGR/RGB/YUV/GRAY color formats, NCHW/NHWC layout, float32/uint8/int32 types.
 * Also accepts a text file of image paths.
 *
 * Official grounding: memory `ascend-deploy-cli-verified`.
 * Contract: returns EVIDENCE (output dir + file count + log), not a decision.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    input_path: z
      .string()
      .describe('Input path (img2bin -i): a directory of images, a single image file, or a text file listing image paths.'),
    output_dir: z
      .string()
      .describe('Output directory for the .bin files (img2bin -o).'),
    width: z.number().int().optional().describe('Target width in pixels (img2bin -w). Required for image input.'),
    height: z.number().int().optional().describe('Target height in pixels (img2bin -h). Required for image input.'),
    color_format: z
      .enum(['BGR', 'RGB', 'YUV', 'GRAY'])
      .optional()
      .describe('Color format (img2bin -f). Default BGR.'),
    layout: z
      .enum(['NCHW', 'NHWC'])
      .optional()
      .describe('Tensor layout (img2bin -a). Default NHWC.'),
    data_type: z
      .enum(['float32', 'uint8', 'int32', 'uint32'])
      .optional()
      .describe('Output data type (img2bin -t). Default uint8.'),
    mean: z
      .array(z.number())
      .optional()
      .describe('Mean subtraction per channel (img2bin -m), e.g. [104,117,123].'),
    std: z
      .array(z.number())
      .optional()
      .describe('Normalization scale per channel (img2bin -c), e.g. [1,1,1].'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when img2bin exited 0.'),
    exitCode: z.number().nullable().describe('img2bin exit code (null if it could not run).'),
    stdout: z.string().describe('img2bin stdout — file conversion progress.'),
    stderr: z.string().describe('img2bin stderr.'),
    durationMs: z.number().describe('Wall-clock time of the data prep.'),
    mocked: z.boolean().describe('True when running in mock mode (no real img2bin) — a liveness signal, not real data prep.'),
    output_dir: z.string().optional().describe('The output directory holding the .bin files on success.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const DataPrepTool = buildTool({
  name: DATA_PREP_TOOL_NAME,
  searchHint: 'prepare Ascend inference input data (image → bin) via img2bin',
  maxResultSizeChars: 100_000,
  async description(input) {
    const p = (input as { input_path?: string }).input_path || 'the input'
    return 'Prep inference data from ' + p.slice(0, 30) + ' via img2bin'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: DataPrepTool.name + ' will run img2bin.py to preprocess images into .bin. Allow?',
    }
  },
  async prompt() {
    return 'Prepare Ascend inference input data via `img2bin.py` (ascend-official/tools/img2bin). Provide an input path (image dir, single image, or text file of paths), output dir, and image params: width, height, color format (BGR/RGB/YUV/GRAY), layout (NCHW/NHWC), data type (float32/uint8/int32), mean, std. Produces .bin files that msame / AscendBenchmarkRunner consume as inference input. Returns the output dir + conversion log. This tool returns EVIDENCE only. In mock mode returns a liveness signal — say so.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('img2bin', d.success, d.exitCode, d.durationMs, d.mocked),
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
    const mock = AscendExecutor.shouldMock(options)
    const ascendExecutor = getCoreDependencies().ascendExecutor
    // python3 img2bin.py -i <input> -o <out> [-w W -h H -f BGR -a NHWC -t uint8 -m [...] -c [...]]
    const args = ['img2bin.py', '-i', inp.input_path, '-o', inp.output_dir]
    if (inp.width !== undefined) args.push('-w', String(inp.width))
    if (inp.height !== undefined) args.push('-h', String(inp.height))
    if (inp.color_format) args.push('-f', inp.color_format)
    if (inp.layout) args.push('-a', inp.layout)
    if (inp.data_type) args.push('-t', inp.data_type)
    if (inp.mean && inp.mean.length) args.push('-m', `[${inp.mean.join(',')}]`)
    if (inp.std && inp.std.length) args.push('-c', `[${inp.std.join(',')}]`)

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
    return {
      data: {
        success,
        exitCode,
        stdout,
        stderr,
        durationMs,
        mocked: mock,
        output_dir: success ? inp.output_dir : undefined,
      },
    }
  },
} as any)
