/**
 * AscendRealHWBridge — 真机 NPU 交互（npu-smi / msprof）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/RealHWBridge.ts 移植（call 函数体逐字；
 * 旧 doExec 闭包 → 共享 runCannExec 包裹）。delta（旧 buildTool(zod) → 新
 * shared Tool 契约）：① ② ③ ④ ⑤ checkPermissions = fail-closed ask ⑥
 * mapToolResult = 旧 foldResult ⑦ call 5 参 → 2 参 ⑧ import 重指本域
 * AscendExecutor + runCannExec + foldUtils。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { REAL_HW_BRIDGE_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const REAL_HW_BRIDGE_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description:
        'NPU command to run: info (npu-smi device info), profile (msprof profiling), or query (npu-smi query).',
    },
    device_id: {
      type: 'number',
      description: 'NPU device id (default 0).',
    },
    prof_args: {
      type: 'string',
      description:
        'Additional msprof arguments (e.g. -o /tmp/prof --duration 5).',
    },
  },
  required: ['command'],
}

export interface RealHWBridgeOutput {
  command: string
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  device_info?: {
    device_id: number
    name: string
    memory_total_mb: number
    memory_used_mb: number
    temperature_c: number
    power_w: number
    utilization_pct: number
    driver_version: string
  }
  prof_metrics?: {
    avg_cycles?: number
    max_cycles?: number
    bottleneck_stages?: string[]
    bandwidth_gbps?: number
    flops?: number
    prof_output_path?: string
  }
}

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

function getPrompt(): string {
  return (
    'Interact with real Ascend NPU hardware. Supported commands: info ' +
    '(npu-smi device info), profile (msprof profiling), query (npu-smi ' +
    'query). Provide a command, an optional device id, and optional msprof ' +
    'args. In mock mode it returns precomputed device/profiling data; on real ' +
    'HW it shells out to npu-smi and msprof (CANN 8.x). Use this for ' +
    'hardware-aware profiling and diagnosis.'
  )
}

function fold(d: RealHWBridgeOutput): string {
  return [
    foldHeader(`${d.command} real-HW`, d.success, d.exitCode, d.durationMs, d.mocked),
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const RealHWBridge: Tool = {
  name: REAL_HW_BRIDGE_TOOL_NAME,
  inputSchema: REAL_HW_BRIDGE_INPUT_SCHEMA,
  inputJSONSchema: REAL_HW_BRIDGE_INPUT_SCHEMA,
  maxResultSizeChars: 80_000,
  searchHint:
    'interact with real Ascend NPU hardware via npu-smi and msprof',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => REAL_HW_BRIDGE_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      REAL_HW_BRIDGE_TOOL_NAME +
      ' will run npu-smi / msprof on real NPU hardware. Allow?',
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
      content: fold(content as RealHWBridgeOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<RealHWBridgeOutput>> {
    const inp = (args ?? {}) as {
      command?: string
      device_id?: number
      prof_args?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const cmd = inp.command || 'info'
    const devId = inp.device_id ?? 0
    const mock = AscendExecutor.shouldMock()

    // exec() throws ExecError → runCannExec 已解包四元组
    const doExec = (command: string, execArgs: string[]) =>
      runCannExec(command, execArgs, { signal: ctx?.signal, mock })

    let result: {
      exitCode: number | null
      stdout: string
      stderr: string
      durationMs: number
    }
    if (cmd === 'info') {
      result = await doExec('npu-smi', ['info', '-i', String(devId)])
    } else if (cmd === 'profile') {
      const profArgs = inp.prof_args
        ? inp.prof_args.split(/\s+/)
        : ['-o', '/tmp/prof_out', '--duration', '5']
      result = await doExec('msprof', profArgs)
    } else {
      result = await doExec('npu-smi', ['--query', '-i', String(devId)])
    }
    const success = (result.exitCode ?? 1) === 0
    const data: RealHWBridgeOutput = {
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
}
