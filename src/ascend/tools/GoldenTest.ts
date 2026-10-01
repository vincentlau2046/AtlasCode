/**
 * AscendGoldenTest — 正确性门（numpy 参考 vs NPU 输出）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/GoldenTest.ts 移植（call 函数体逐字）。
 * 替代旧 AscendSimulatorBridge（simulator-cycles 验真无官方依据；规范形态
 * 是 numpy 参考 golden test）。工具只返 EVIDENCE（pass/fail + mismatch diff），
 * 不决策。delta（旧 buildTool(zod) → 新 shared Tool 契约）：① ② ③ ④ ⑤
 * checkPermissions = fail-closed ask ⑥ mapToolResult = 旧 foldResult ⑦ call
 * 5 参 → 2 参 ⑧ import 重指本域 AscendExecutor + runCannExec + foldUtils。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { GOLDEN_TEST_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const GOLDEN_TEST_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    test_file: {
      type: 'string',
      description:
        'Path to the Python golden-test script (e.g. test_gelu.py). The script computes a numpy reference implementation, runs the operator on NPU, and asserts np.allclose(rtol, atol).',
    },
    op_name: {
      type: 'string',
      description: 'Optional operator name override.',
    },
    cwd: {
      type: 'string',
      description:
        'Working directory to run the test in (where the compiled .so and test script live).',
    },
    tolerance: {
      type: 'string',
      description:
        'Tolerance hint passed to the script, e.g. "rtol=1e-3,atol=1e-4".',
    },
  },
  required: ['test_file'],
}

export interface GoldenTestOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  diff?: string
}

function getPrompt(): string {
  return (
    'Run a golden-test script for an Ascend operator: a Python script that ' +
    'computes a numpy reference implementation and compares it against the NPU ' +
    'operator output via np.allclose(rtol, atol). Provide the test script path ' +
    'and optionally a working directory and tolerance. Returns exit code, ' +
    'stdout/stderr, and extracted mismatch evidence on failure. This is the ' +
    'correctness gate (replaces simulator dry-run). In mock mode it returns a ' +
    'liveness signal only — say so, do not claim correctness.'
  )
}

/** Extract the first assertion/mismatch line from stderr as diff evidence。 */
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

function fold(d: GoldenTestOutput): string {
  return [
    foldHeader('golden test', d.success, d.exitCode, d.durationMs, d.mocked),
    d.diff ? `diff: ${d.diff}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const GoldenTest: Tool = {
  name: GOLDEN_TEST_TOOL_NAME,
  inputSchema: GOLDEN_TEST_INPUT_SCHEMA,
  inputJSONSchema: GOLDEN_TEST_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'run a golden test: numpy reference vs NPU operator output',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => GOLDEN_TEST_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      GOLDEN_TEST_TOOL_NAME +
      ' will run a Python golden-test script (numpy reference vs NPU output). Allow?',
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
      content: fold(content as GoldenTestOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<GoldenTestOutput>> {
    const inp = (args ?? {}) as {
      test_file: string
      cwd?: string
      tolerance?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const cwd = inp.cwd
    const mock = AscendExecutor.shouldMock()
    const execArgs = [inp.test_file]
    if (inp.tolerance) execArgs.push('--tolerance', inp.tolerance)

    const r = await runCannExec('python3', execArgs, {
      signal: ctx?.signal,
      mock,
      ...(cwd ? { cwd } : {}),
    })
    const success = (r.exitCode ?? 1) === 0
    const data: GoldenTestOutput = {
      success,
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      durationMs: r.durationMs,
      mocked: mock,
    }
    if (!success) {
      data.diff = extractDiff(r.stderr)
    }
    return { data }
  },
}
