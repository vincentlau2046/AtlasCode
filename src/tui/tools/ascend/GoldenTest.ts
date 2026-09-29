import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { GOLDEN_TEST_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendGoldenTest — the correctness gate.
 *
 * Replaces the former AscendSimulatorBridge (which faked per-iteration cycle
 * metrics even on the "real HW" path — an officially-unsupported form: msdebug
 * is zero-hit across the 22 Ascend official repos, and the canonical operator
 * validation is a Python golden test, numpy reference vs NPU output, asserted
 * via np.allclose(rtol, atol); see op-examples/test_gelu.py).
 *
 * Contract: returns EVIDENCE (pass/fail + mismatch diff), never a decision.
 * In mock mode (no NPU) it returns an honest liveness signal (mocked: true),
 * NOT a correctness proof — the agent must say so.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    test_file: z
      .string()
      .describe('Path to the Python golden-test script (e.g. test_gelu.py). The script computes a numpy reference implementation, runs the operator on NPU, and asserts np.allclose(rtol, atol).'),
    op_name: z.string().optional().describe('Optional operator name override.'),
    cwd: z.string().optional().describe('Working directory to run the test in (where the compiled .so and test script live).'),
    tolerance: z.string().optional().describe('Tolerance hint passed to the script, e.g. "rtol=1e-3,atol=1e-4".'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when the golden test exited 0 (numpy reference matched NPU output within tolerance).'),
    exitCode: z.number().nullable().describe('Test exit code (null if it could not run).'),
    stdout: z.string().describe('Test stdout.'),
    stderr: z.string().describe('Test stderr — assertion diffs appear here on failure.'),
    durationMs: z.number().describe('Wall-clock time of the test run.'),
    mocked: z.boolean().describe('True when running in mock mode (no real NPU) — a liveness signal, not a correctness proof.'),
    diff: z.string().optional().describe('Extracted mismatch evidence (assertion line / max abs diff) when the test fails.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const GoldenTest = buildTool({
  name: GOLDEN_TEST_TOOL_NAME,
  searchHint: 'run a golden test: numpy reference vs NPU operator output',
  maxResultSizeChars: 100_000,
  async description(input) {
    const name = (input as { op_name?: string }).op_name || 'operator'
    return 'Run golden test for ' + name + ' (numpy reference vs NPU output)'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isReadOnly() {
    return false
  },
  isDestructive() {
    return false
  },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    // Fail-closed: confirm before shelling out to run a Python test script.
    return {
      behavior: 'ask',
      message: GoldenTest.name + ' will run a Python golden-test script (numpy reference vs NPU output). Allow?',
    }
  },
  async prompt() {
    return 'Run a golden-test script for an Ascend operator: a Python script that computes a numpy reference implementation and compares it against the NPU operator output via np.allclose(rtol, atol). Provide the test script path and optionally a working directory and tolerance. Returns exit code, stdout/stderr, and extracted mismatch evidence on failure. This is the correctness gate (replaces simulator dry-run). In mock mode it returns a liveness signal only — say so, do not claim correctness.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('golden test', d.success, d.exitCode, d.durationMs, d.mocked),
      d.diff ? `diff: ${d.diff}` : '',
      ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
      d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
    ].filter(Boolean).join('\n')
  },
  async call(
    input,
    {
      abortController,
      options,
    }: {
      abortController?: AbortController
      options?: { isNonInteractiveSession?: boolean }
    },
  ) {
    const inp: any = input as any
    const cwd = inp.cwd
    const mock = AscendExecutor.shouldMock(options)
    const ascendExecutor = getCoreDependencies().ascendExecutor
    const args = [inp.test_file]
    if (inp.tolerance) args.push('--tolerance', inp.tolerance)

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('python3', args, {
        signal: abortController?.signal,
        mock,
        ...(cwd ? { cwd } : {}),
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
    const data: any = {
      success,
      exitCode,
      stdout,
      stderr,
      durationMs,
      mocked: mock,
    }
    if (!success) {
      data.diff = extractDiff(stderr)
    }
    return { data }
  },
} as any)

/**
 * Extract the first assertion/mismatch line from stderr as diff evidence.
 * Matches np.allclose / assert / mismatch / max abs diff patterns.
 */
function extractDiff(stderr: string): string | undefined {
  const lines = stderr.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (/assert|allclose|mismatch|not close|max abs|MaxAbsDiff/i.test(t)) {
      return t.slice(0, 200)
    }
  }
  return undefined
}
