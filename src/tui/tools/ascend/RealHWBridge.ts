import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { REAL_HW_BRIDGE_TOOL_NAME } from './constants.js'
import { AscendExecutor } from '../../core/executor/AscendExecutor.js'
import { ExecError } from '../../core/executor/types.js'
import { getCoreDependencies } from 'src/tui/factory'
import { foldHeader, extractErrorLines, truncateStdout } from './foldUtils.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    command: z.string().describe('NPU command to run: info (npu-smi device info), profile (msprof profiling), or query (npu-smi query).'),
    device_id: z.number().int().optional().describe('NPU device id (default 0).'),
    prof_args: z.string().optional().describe('Additional msprof arguments (e.g. -o /tmp/prof --duration 5).'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const deviceInfoSchema = z.object({
  device_id: z.number().describe('Device ID.'),
  name: z.string().describe('Device name (e.g. Ascend 910B).'),
  memory_total_mb: z.number().describe('Total memory in MB.'),
  memory_used_mb: z.number().describe('Used memory in MB.'),
  temperature_c: z.number().describe('Die temperature in Celsius.'),
  power_w: z.number().describe('Power draw in Watts.'),
  utilization_pct: z.number().describe('Compute utilization percentage.'),
  driver_version: z.string().describe('Driver version string.'),
})

const profMetricsSchema = z.object({
  avg_cycles: z.number().optional(),
  max_cycles: z.number().optional(),
  bottleneck_stages: z.array(z.string()).optional(),
  bandwidth_gbps: z.number().optional(),
  flops: z.number().optional(),
  prof_output_path: z.string().optional(),
})

const outputSchema = lazySchema(() =>
  z.object({
    command: z.string().describe('Executed command.'),
    success: z.boolean().describe('True when the CANN command exited 0.'),
    exitCode: z.number().nullable(),
    stdout: z.string(),
    stderr: z.string(),
    durationMs: z.number(),
    mocked: z.boolean().describe('True when running in mock mode (no real NPU).'),
    device_info: deviceInfoSchema.optional().describe('Device info from npu-smi (info/query commands).'),
    prof_metrics: profMetricsSchema.optional().describe('Profiling metrics from msprof (profile command).'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

const MOCK_DEVICE = {
  device_id: 0,
  name: 'Ascend 910B (mock)',
  memory_total_mb: 32768,
  memory_used_mb: 8192,
  temperature_c: 45,
  power_w: 150,
  utilization_pct: 65,
  driver_version: 'CANN 8.0.0 (mock)',
}

const MOCK_PROF = {
  avg_cycles: 1520,
  max_cycles: 2100,
  bottleneck_stages: ['gemm', 'copy_in'],
  bandwidth_gbps: 480,
  flops: 312e12,
  prof_output_path: '/tmp/mock_prof_out',
}

export const RealHWBridge = buildTool({
  name: REAL_HW_BRIDGE_TOOL_NAME,
  searchHint: 'interact with real Ascend NPU hardware via npu-smi and msprof',
  maxResultSizeChars: 80_000,
  async description(input) {
    const cmd = (input as { command?: string }).command || 'info'
    return 'Run NPU ' + cmd + ' on real Ascend hardware'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: RealHWBridge.name + ' will run npu-smi / msprof on real NPU hardware. Allow?',
    }
  },
  async prompt() {
    return 'Interact with real Ascend NPU hardware. Supported commands: info (npu-smi device info), profile (msprof profiling), query (npu-smi query). Provide a command, an optional device id, and optional msprof args. In mock mode it returns precomputed device/profiling data; on real HW it shells out to npu-smi and msprof (CANN 8.x). Use this for hardware-aware profiling and diagnosis.'
  },
  foldResult(data) {
    const d = data as Output
    return [
      foldHeader(`${d.command} real-HW`, d.success, d.exitCode, d.durationMs, d.mocked),
      ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
      d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
    ].filter(Boolean).join('\n')
  },
  async call(
    input,
    { abortController, options }: { abortController?: AbortController; options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    const cmd = (inp.command || 'info') as string
    const devId = inp.device_id ?? 0
    const mock = AscendExecutor.shouldMock(options)
    const ascendExecutor = getCoreDependencies().ascendExecutor

    // P3-1 inline helper: exec() throws ExecError → catch and map to result tuple
    const doExec = async (command: string, args: string[]) => {
      try {
        const r = await ascendExecutor.exec(command, args, {
          signal: abortController?.signal,
          mock,
        })
        return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, durationMs: r.durationMs }
      } catch (e) {
        if (e instanceof ExecError) {
          return { exitCode: e.result.exitCode, stdout: e.result.stdout, stderr: e.result.stderr, durationMs: e.result.durationMs }
        }
        throw e
      }
    }

    let result: { exitCode: number | null; stdout: string; stderr: string; durationMs: number }
    if (cmd === 'info') {
      result = await doExec('npu-smi', ['info', '-i', String(devId)])
    } else if (cmd === 'profile') {
      const profArgs = inp.prof_args ? inp.prof_args.split(/\s+/) : ['-o', '/tmp/prof_out', '--duration', '5']
      result = await doExec('msprof', profArgs)
    } else {
      result = await doExec('npu-smi', ['--query', '-i', String(devId)])
    }
    const success = (result.exitCode ?? 1) === 0
    const data: any = {
      command: cmd,
      success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      mocked: mock,
    }
    if (mock && cmd === 'info') data.device_info = MOCK_DEVICE
    if (mock && cmd === 'profile') data.prof_metrics = MOCK_PROF
    return { data }
  },
} as any)