import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { FAULT_COLLECTOR_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

/**
 * AscendFaultCollector — one-click fault-scene collection.
 *
 * Wraps `npucollect.sh` (ascend-official/tools/npucollector) which collects the
 * full fault scene: Host CANN logs, driver logs (root), coredump, Device black-box/
 * Stackcore (root), GE dump graphs, operator .o files, machine env info. Output is
 * a tar.gz consumed by AscendErrorClassifier (msaicerr) for AICore-error analysis.
 *
 * Official grounding: memory `ascend-debug-cli-verified`.
 * Contract: returns EVIDENCE (collection result + tar path + warnings), not a
 * decision. Some modules require root — surface that honestly.
 */
const inputSchema = lazySchema(() =>
  z.strictObject({
    task_command: z
      .string()
      .describe('The fault-time task command to run under collection, quoted with its original args (e.g. "sh app_run.sh"). npucollect.sh runs this and captures the scene on fault.'),
    output_path: z
      .string()
      .describe('Absolute path for the output tar.gz (MUST end with .tar.gz). This archive feeds AscendErrorClassifier.'),
    cwd: z.string().optional().describe('Working directory to run collection in (where npucollect.sh lives).'),
    modules: z
      .array(z.string())
      .optional()
      .describe('Module subset to collect (default all): core / ge / log / ops / environment.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean().describe('True when collection exited 0.'),
    exitCode: z.number().nullable().describe('Collection exit code (null if it could not run).'),
    stdout: z.string().describe('Collection stdout.'),
    stderr: z.string().describe('Collection stderr — permission warnings (root-only modules) appear here.'),
    durationMs: z.number().describe('Wall-clock time of the collection.'),
    mocked: z.boolean().describe('True when running in mock mode (no real NPU) — a liveness signal, not a real collection.'),
    archive: z.string().optional().describe('Path to the collected tar.gz on success (feeds AscendErrorClassifier).'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const FaultCollector = buildTool({
  name: FAULT_COLLECTOR_TOOL_NAME,
  searchHint: 'collect an Ascend NPU fault scene (CANN/driver logs, coredump, GE dump graphs, op .o) via npucollector',
  maxResultSizeChars: 100_000,
  async description(input) {
    const cmd = (input as { task_command?: string }).task_command || 'the task'
    return 'Collect the Ascend fault scene for ' + cmd.slice(0, 40)
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: FaultCollector.name + ' will run npucollect.sh to collect the fault scene (some modules need root). Allow?',
    }
  },
  async prompt() {
    return 'Collect an Ascend NPU fault scene in one shot via npucollect.sh (ascend-official/tools/npucollector). Provide the fault-time task command (quoted with original args), an output .tar.gz path, and optionally a working directory and module subset (core/ge/log/ops/environment). The collector runs the task, captures on fault: Host CANN logs, driver logs, coredump, Device black-box/Stackcore, GE dump graphs, operator .o files, machine env. Some modules require root — warnings surface in stderr. The output tar.gz feeds AscendErrorClassifier (msaicerr) for AICore-error analysis. In mock mode it returns a liveness signal only — say so, do not claim a real collection.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader('npucollect', d.success, d.exitCode, d.durationMs, d.mocked),
      d.archive ? `archive: ${d.archive}` : '',
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
    // npucollect.sh "<task_command>" <output.tar.gz>  (modules are a config in the script, not a CLI flag)
    const args = [inp.task_command, inp.output_path]

    let exitCode: number | null
    let stdout: string
    let stderr: string
    let durationMs: number

    try {
      const result = await ascendExecutor.exec('npucollect.sh', args, {
        signal: abortController?.signal,
        mock,
        ...(inp.cwd ? { cwd: inp.cwd } : {}),
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
        archive: success ? inp.output_path : undefined,
      },
    }
  },
} as any)
