import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { COMPILER_BRIDGE_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    project_dir: z
      .string()
      .describe('Absolute path to the four-piece operator project (produced by AscendCodeGen). Must contain setup.py + csrc/*.asc.'),
    op_name: z.string().optional().describe('Operator name (for artifact path resolution and reporting).'),
    extra_args: z
      .array(z.string())
      .optional()
      .describe('Extra args appended to `python3 setup.py build_ext` (e.g. ["--inplace"]).'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when the build exited 0 (bisheng compiled csrc/*.asc → .so).'),
    exitCode: z.number().nullable().describe('Build exit code (null if it could not run).'),
    stdout: z.string().describe('Build stdout (bisheng compile progress).'),
    stderr: z.string().describe('Build stderr — compiler errors appear here.'),
    durationMs: z.number().describe('Wall-clock time of the build.'),
    mocked: z.boolean().describe('True when running in mock mode (no real NPU/CANN) — a liveness signal, not a build proof.'),
    artifact: z.string().optional().describe('Path to the compiled .so module on success.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const CompilerBridge = buildTool({
  name: COMPILER_BRIDGE_TOOL_NAME,
  searchHint: 'compile an Ascend C operator project via bisheng (python3 setup.py build_ext)',
  maxResultSizeChars: 100_000,
  async description(input) {
    const name = (input as { op_name?: string }).op_name || 'this operator'
    return 'Compile ' + name + ' with bisheng (python3 setup.py build_ext)'
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
    // Fail-closed: confirm before shelling out to the bisheng compiler.
    return {
      behavior: 'ask',
      message: CompilerBridge.name + ' will run `python3 setup.py build_ext` (bisheng compiles csrc/*.asc → .so). Allow?',
    }
  },
  async prompt() {
    return 'Compile an Ascend C operator project using bisheng. The build entrypoint is `python3 setup.py build_ext` (setup.py owns the bisheng -x asc invocation, npu-smi arch probe, torch ABI detection, and include/lib path resolution — the faithful form per op-examples). Provide the project_dir (from AscendCodeGen output) and optional op_name. Returns exit code, stdout/stderr, and the compiled .so artifact path on success. This is the compile step. In mock mode it returns a liveness signal only — say so, do not claim a real build.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('bisheng compile', d.success, d.exitCode, d.durationMs, d.mocked),
      d.artifact ? `artifact: ${d.artifact}` : '',
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
    const mock = AscendExecutor.shouldMock(options)
    const ascendExecutor = getCoreDependencies().ascendExecutor
    // setup.py owns the bisheng invocation (arch probe + ABI + dep paths).
    // The exec entrypoint is python3; the compiler identity is bisheng
    // (AscendExecutor.commands.compile, used for availability probes/prompt).
    const args = ['setup.py', 'build_ext']
    if (Array.isArray(inp.extra_args)) args.push(...inp.extra_args)

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('python3', args, {
        signal: abortController?.signal,
        mock,
        cwd: inp.project_dir,
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
        artifact: success ? (mock ? 'custom_ops_lib.so' : `build/lib/op_extension/custom_ops_lib.so`) : undefined,
      },
    }
  },
} as any)
