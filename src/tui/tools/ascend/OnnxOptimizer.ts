import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { ONNX_OPTIMIZER_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendOnnxOptimizer — ONNX graph optimization via auto_optimizer.
 *
 * Wraps `auto_optimizer optimize` (github.com/Ascend/msadvisor/auto-optimizer —
 * migrated from the gitee auto-optimizer; the local tools/auto-optimizer is a
 * stub). A pip-installed CLI that rewrites an ONNX graph via "knowledge bases"
 * (op fusion/split/rewrite rules: Conv1d2Conv2d, MergeConsecutiveSlice,
 * TypeCast, TransposeLargeInputConv, etc.) to adapt it to the NPU support set.
 * With --infer-test it validates optimizations by comparing inference speed
 * before/after on real NPU hardware.
 *
 * Run BEFORE AscendModelConverter (atc) — optimize the ONNX, then compile →om.
 *
 * Official grounding: memory `ascend-deploy-cli-verified`.
 * Contract: returns EVIDENCE (optimized onnx path + applied knowledges + log),
 * not a decision.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    input_onnx: z.string().describe('Path to the input ONNX model to optimize (auto_optimizer optimize <input>).'),
    output_onnx: z.string().describe('Path for the optimized ONNX output (auto_optimizer optimize <output>).'),
    knowledges: z
      .array(z.string())
      .optional()
      .describe('Knowledge bases to apply (auto_optimizer -k). Omit to let auto_optimizer pick all applicable. List available via `auto_optimizer list`.'),
    infer_test: z
      .boolean()
      .optional()
      .describe('Whether to validate optimizations by comparing inference speed before/after on real NPU (auto_optimizer -t/--infer-test). Requires CANN installed.'),
    soc: z.string().optional().describe('Target SoC for infer-test (auto_optimizer -s/--soc). E.g. Ascend310P3.'),
    device: z.number().int().optional().describe('Device id for infer-test (auto_optimizer -d/--device). Default 0.'),
    loop: z.number().int().optional().describe('Inference loop count for infer-test (auto_optimizer -l/--loop). Default 100.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when auto_optimizer exited 0.'),
    exitCode: z.number().nullable().describe('auto_optimizer exit code (null if it could not run).'),
    stdout: z.string().describe('auto_optimizer stdout — applied knowledges + optimization summary.'),
    stderr: z.string().describe('auto_optimizer stderr.'),
    durationMs: z.number().describe('Wall-clock time of the optimization.'),
    mocked: z.boolean().describe('True when running in mock mode (no real auto_optimizer) — a liveness signal, not a real optimization.'),
    optimized_onnx: z.string().optional().describe('Path to the optimized ONNX on success.'),
    applied_knowledges: z.string().optional().describe('Derived list of applied knowledge bases parsed from stdout (evidence hint).'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

/** Parse the applied-knowledge lines from auto_optimizer stdout (evidence hint). */
function deriveAppliedKnowledges(stdout: string): string | undefined {
  const lines = stdout.split('\n').filter(l => /knowledge|apply|fuse|split|rewrite/i.test(l) && /[A-Z][a-z]/.test(l))
  if (!lines.length) return undefined
  return 'applied: ' + lines.slice(0, 5).map(l => l.trim()).join('; ')
}

export const OnnxOptimizer = buildTool({
  name: ONNX_OPTIMIZER_TOOL_NAME,
  searchHint: 'optimize an ONNX graph for Ascend NPU (op fusion/split/rewrite) via auto_optimizer',
  maxResultSizeChars: 100_000,
  async description(input) {
    const m = (input as { input_onnx?: string }).input_onnx || 'the onnx'
    return 'Optimize ONNX ' + m.slice(0, 30) + ' via auto_optimizer'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: OnnxOptimizer.name + ' will run auto_optimizer to rewrite the ONNX graph. Allow?',
    }
  },
  async prompt() {
    return 'Optimize an ONNX graph for the Ascend NPU support set via `auto_optimizer optimize` (github.com/Ascend/msadvisor/auto-optimizer — pip CLI; migrated from gitee, the local tools/auto-optimizer is a stub). Provide input ONNX, output ONNX path, and optionally specific knowledge bases (-k; list via `auto_optimizer list`), infer-test flag (-t, validates speed before/after on real NPU), soc, device, loop. Applies op fusion/split/rewrite knowledge bases (Conv1d2Conv2d, MergeConsecutiveSlice, TypeCast, etc.). Run BEFORE AscendModelConverter (atc) — optimize ONNX, then compile →om. Returns the optimized ONNX path + applied knowledges. This tool returns EVIDENCE only. In mock mode returns a liveness signal — say so.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('auto_optimizer', d.success, d.exitCode, d.durationMs, d.mocked),
      d.applied_knowledges ? d.applied_knowledges : '',
      d.optimized_onnx ? `optimized: ${d.optimized_onnx}` : '',
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
    // auto_optimizer optimize <input> <output> [-k knowledges] [-t] [-s soc] [-d device] [-l loop]
    const args = ['optimize', inp.input_onnx, inp.output_onnx]
    if (inp.knowledges && inp.knowledges.length) args.push('-k', inp.knowledges.join(','))
    if (inp.infer_test) args.push('-t')
    if (inp.soc) args.push('-s', inp.soc)
    if (inp.device !== undefined) args.push('-d', String(inp.device))
    if (inp.loop !== undefined) args.push('-l', String(inp.loop))

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('auto_optimizer', args, {
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
        optimized_onnx: success ? inp.output_onnx : undefined,
        applied_knowledges: deriveAppliedKnowledges(stdout),
      },
    }
  },
} as any)
