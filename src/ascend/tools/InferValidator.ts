/**
 * AscendInferValidator — OM 推理验证（msame run / msquickcmp compare 双态）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/InferValidator.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（推理输出 / 精度结果 + log），不决策。delta（旧
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
import { INFER_VALIDATOR_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const INFER_VALIDATOR_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['run', 'compare'],
      description:
        'Validation mode: "run" = execute the .om on input data via msame (proves it runs + produces output); "compare" = compare original-model vs om accuracy via msquickcmp (proves accuracy after conversion).',
    },
    om_path: {
      type: 'string',
      description:
        'Path to the compiled .om model (msame --model / msquickcmp -om).',
    },
    input_path: {
      type: 'string',
      description:
        'Input data: .bin file/dir for msame (--input), or .bin for msquickcmp (-i).',
    },
    output_dir: {
      type: 'string',
      description:
        'Output directory (msame --output / msquickcmp -o).',
    },
    outfmt: {
      type: 'string',
      enum: ['TXT', 'BIN'],
      description:
        'msame output format (msame --outfmt). Default TXT. mode=run only.',
    },
    loop: {
      type: 'number',
      description:
        'msame inference loop count (msame --loop). Default 1. mode=run only.',
    },
    device: {
      type: 'number',
      description:
        'NPU device id (msame --device / msquickcmp uses default). Default 0.',
    },
    original_model: {
      type: 'string',
      description:
        'Path to the ORIGINAL pre-conversion model (msquickcmp -m: .onnx or .pb). mode=compare only.',
    },
    cann_path: {
      type: 'string',
      description:
        'CANN toolkit install path (msquickcmp -c). mode=compare only. Defaults to /usr/local/Ascend/ascend-toolkit/latest.',
    },
  },
  required: ['mode', 'om_path', 'input_path', 'output_dir'],
}

export interface InferValidatorOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  mode: string
  output_dir?: string
  accuracy_result?: string
}

/** Parse the accuracy verdict from msquickcmp stdout（evidence hint）。 */
function deriveAccuracyResult(stdout: string): string | undefined {
  const s = stdout.toLowerCase()
  const lines = stdout
    .split('\n')
    .filter(l => /accuracy|max.*diff|compare|pass|fail|cosine|mse/i.test(l))
  const verdict = /accuracy.*pass|compare.*pass|all.*pass/i.test(s)
    ? 'PASS'
    : /accuracy.*fail|compare.*fail|mismatch/i.test(s)
      ? 'FAIL'
      : undefined
  if (verdict || lines.length) {
    return [
      verdict ? `accuracy: ${verdict}` : '',
      lines.slice(0, 3).map(l => l.trim()).join('; '),
    ]
      .filter(Boolean)
      .join(' | ')
  }
  return undefined
}

function getPrompt(): string {
  return (
    'Validate an Ascend .om model. mode "run": execute the om on .bin input ' +
    'via `msame` (ascend-official/tools/msame, C++ binary) — proves it runs ' +
    'and produces output (TXT/BIN); provide om_path, input_path, output_dir, ' +
    'outfmt, loop, device. mode "compare": compare original-model vs om ' +
    'accuracy via `msquickcmp` (ascend-official/tools/msquickcmp, `python3 ' +
    'main.py -m original -om om -i input -c CANN_PATH -o out`) — proves ' +
    'accuracy is preserved after atc conversion; provide original_model, ' +
    'om_path, input_path, output_dir, cann_path. Use "run" to check the om ' +
    'executes; use "compare" to check accuracy after conversion. Returns ' +
    'inference output / accuracy verdict. This tool returns EVIDENCE only. ' +
    'In mock mode returns a liveness signal — say so, do not claim real ' +
    'validation.'
  )
}

function fold(d: InferValidatorOutput): string {
  return [
    foldHeader(`msame/${d.mode}`, d.success, d.exitCode, d.durationMs, d.mocked),
    d.accuracy_result ? d.accuracy_result : '',
    d.output_dir ? `output: ${d.output_dir}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const InferValidator: Tool = {
  name: INFER_VALIDATOR_TOOL_NAME,
  inputSchema: INFER_VALIDATOR_INPUT_SCHEMA,
  inputJSONSchema: INFER_VALIDATOR_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'validate an Ascend .om model: run inference (msame) or compare accuracy vs original (msquickcmp)',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => INFER_VALIDATOR_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      INFER_VALIDATOR_TOOL_NAME +
      ' will run msame/msquickcmp to validate the .om model. Allow?',
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
      content: fold(content as InferValidatorOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<InferValidatorOutput>> {
    const inp = (args ?? {}) as {
      mode?: string
      om_path: string
      input_path: string
      output_dir: string
      outfmt?: string
      loop?: number
      device?: number
      original_model?: string
      cann_path?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mode = inp.mode || 'run'
    const mock = AscendExecutor.shouldMock()

    let command: string
    let execArgs: string[]
    if (mode === 'compare') {
      // python3 main.py -m <original> -om <om> -i <input> -c <cann> -o <out>
      command = 'python3'
      execArgs = [
        'main.py',
        '-m',
        inp.original_model || '',
        '-om',
        inp.om_path,
        '-i',
        inp.input_path,
        '-o',
        inp.output_dir,
      ]
      const cannPath = inp.cann_path || '/usr/local/Ascend/ascend-toolkit/latest'
      execArgs.push('-c', cannPath)
    } else {
      // msame --model=<om> --input=<input> --output=<out> --outfmt TXT --loop 1 [--device 0]
      command = 'msame'
      execArgs = [
        `--model=${inp.om_path}`,
        `--input=${inp.input_path}`,
        `--output=${inp.output_dir}`,
        `--outfmt=${inp.outfmt || 'TXT'}`,
        `--loop=${String(inp.loop ?? 1)}`,
      ]
      if (inp.device !== undefined) execArgs.push(`--device=${String(inp.device)}`)
    }

    const r = await runCannExec(command, execArgs, {
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
        mode,
        output_dir: success ? inp.output_dir : undefined,
        accuracy_result: mode === 'compare' ? deriveAccuracyResult(r.stdout) : undefined,
      },
    }
  },
}
