/**
 * AscendOnnxOptimizer — ONNX 图优化（auto_optimizer）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/OnnxOptimizer.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（优化后 onnx 路径 + 应用 knowledges + log），不决策。
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
import { ONNX_OPTIMIZER_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const ONNX_OPTIMIZER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    input_onnx: {
      type: 'string',
      description:
        'Path to the input ONNX model to optimize (auto_optimizer optimize <input>).',
    },
    output_onnx: {
      type: 'string',
      description:
        'Path for the optimized ONNX output (auto_optimizer optimize <output>).',
    },
    knowledges: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Knowledge bases to apply (auto_optimizer -k). Omit to let auto_optimizer pick all applicable. List available via `auto_optimizer list`.',
    },
    infer_test: {
      type: 'boolean',
      description:
        'Whether to validate optimizations by comparing inference speed before/after on real NPU (auto_optimizer -t/--infer-test). Requires CANN installed.',
    },
    soc: {
      type: 'string',
      description:
        'Target SoC for infer-test (auto_optimizer -s/--soc). E.g. Ascend310P3.',
    },
    device: {
      type: 'number',
      description:
        'Device id for infer-test (auto_optimizer -d/--device). Default 0.',
    },
    loop: {
      type: 'number',
      description:
        'Inference loop count for infer-test (auto_optimizer -l/--loop). Default 100.',
    },
  },
  required: ['input_onnx', 'output_onnx'],
}

export interface OnnxOptimizerOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  optimized_onnx?: string
  applied_knowledges?: string
}

/** Parse the applied-knowledge lines from auto_optimizer stdout. */
function deriveAppliedKnowledges(stdout: string): string | undefined {
  const lines = stdout
    .split('\n')
    .filter(
      l => /knowledge|apply|fuse|split|rewrite/i.test(l) && /[A-Z][a-z]/.test(l),
    )
  if (!lines.length) return undefined
  return 'applied: ' + lines.slice(0, 5).map(l => l.trim()).join('; ')
}

function getPrompt(): string {
  return (
    'Optimize an ONNX graph for the Ascend NPU support set via ' +
    '`auto_optimizer optimize` (github.com/Ascend/msadvisor/auto-optimizer — ' +
    'pip CLI; migrated from gitee, the local tools/auto-optimizer is a stub). ' +
    'Provide input ONNX, output ONNX path, and optionally specific knowledge ' +
    'bases (-k; list via `auto_optimizer list`), infer-test flag (-t, ' +
    'validates speed before/after on real NPU), soc, device, loop. Applies op ' +
    'fusion/split/rewrite knowledge bases (Conv1d2Conv2d, ' +
    'MergeConsecutiveSlice, TypeCast, etc.). Run BEFORE AscendModelConverter ' +
    '(atc) — optimize ONNX, then compile →om. Returns the optimized ONNX path ' +
    '+ applied knowledges. This tool returns EVIDENCE only. In mock mode ' +
    'returns a liveness signal — say so.'
  )
}

function fold(d: OnnxOptimizerOutput): string {
  return [
    foldHeader('auto_optimizer', d.success, d.exitCode, d.durationMs, d.mocked),
    d.applied_knowledges ? d.applied_knowledges : '',
    d.optimized_onnx ? `optimized: ${d.optimized_onnx}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const OnnxOptimizer: Tool = {
  name: ONNX_OPTIMIZER_TOOL_NAME,
  inputSchema: ONNX_OPTIMIZER_INPUT_SCHEMA,
  inputJSONSchema: ONNX_OPTIMIZER_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'optimize an ONNX graph for Ascend NPU (op fusion/split/rewrite) via auto_optimizer',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => ONNX_OPTIMIZER_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      ONNX_OPTIMIZER_TOOL_NAME +
      ' will run auto_optimizer to rewrite the ONNX graph. Allow?',
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
      content: fold(content as OnnxOptimizerOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<OnnxOptimizerOutput>> {
    const inp = (args ?? {}) as {
      input_onnx: string
      output_onnx: string
      knowledges?: string[]
      infer_test?: boolean
      soc?: string
      device?: number
      loop?: number
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // auto_optimizer optimize <input> <output> [-k knowledges] [-t] ...
    const execArgs = ['optimize', inp.input_onnx, inp.output_onnx]
    if (inp.knowledges && inp.knowledges.length)
      execArgs.push('-k', inp.knowledges.join(','))
    if (inp.infer_test) execArgs.push('-t')
    if (inp.soc) execArgs.push('-s', inp.soc)
    if (inp.device !== undefined) execArgs.push('-d', String(inp.device))
    if (inp.loop !== undefined) execArgs.push('-l', String(inp.loop))

    const r = await runCannExec('auto_optimizer', execArgs, {
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
        optimized_onnx: success ? inp.output_onnx : undefined,
        applied_knowledges: deriveAppliedKnowledges(r.stdout),
      },
    }
  },
}
