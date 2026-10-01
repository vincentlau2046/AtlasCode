/**
 * AscendFaultCollector — 一键故障现场采集（npucollect.sh）（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/FaultCollector.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（采集结果 + tar 路径 + 告警），不决策。delta（旧
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
import { FAULT_COLLECTOR_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const FAULT_COLLECTOR_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    task_command: {
      type: 'string',
      description:
        'The fault-time task command to run under collection, quoted with its original args (e.g. "sh app_run.sh"). npucollect.sh runs this and captures the scene on fault.',
    },
    output_path: {
      type: 'string',
      description:
        'Absolute path for the output tar.gz (MUST end with .tar.gz). This archive feeds AscendErrorClassifier.',
    },
    cwd: {
      type: 'string',
      description:
        'Working directory to run collection in (where npucollect.sh lives).',
    },
    modules: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Module subset to collect (default all): core / ge / log / ops / environment.',
    },
  },
  required: ['task_command', 'output_path'],
}

export interface FaultCollectorOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  archive?: string
}

function getPrompt(): string {
  return (
    'Collect an Ascend NPU fault scene in one shot via npucollect.sh ' +
    '(ascend-official/tools/npucollector). Provide the fault-time task command ' +
    '(quoted with original args), an output .tar.gz path, and optionally a ' +
    'working directory and module subset (core/ge/log/ops/environment). The ' +
    'collector runs the task, captures on fault: Host CANN logs, driver logs, ' +
    'coredump, Device black-box/Stackcore, GE dump graphs, operator .o files, ' +
    'machine env. Some modules require root — warnings surface in stderr. The ' +
    'output tar.gz feeds AscendErrorClassifier (msaicerr) for AICore-error ' +
    'analysis. In mock mode it returns a liveness signal only — say so, do not ' +
    'claim a real collection.'
  )
}

function fold(d: FaultCollectorOutput): string {
  return [
    foldHeader('npucollect', d.success, d.exitCode, d.durationMs, d.mocked),
    d.archive ? `archive: ${d.archive}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const FaultCollector: Tool = {
  name: FAULT_COLLECTOR_TOOL_NAME,
  inputSchema: FAULT_COLLECTOR_INPUT_SCHEMA,
  inputJSONSchema: FAULT_COLLECTOR_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'collect an Ascend NPU fault scene (CANN/driver logs, coredump, GE dump graphs, op .o) via npucollector',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => FAULT_COLLECTOR_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      FAULT_COLLECTOR_TOOL_NAME +
      ' will run npucollect.sh to collect the fault scene (some modules need root). Allow?',
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
      content: fold(content as FaultCollectorOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<FaultCollectorOutput>> {
    const inp = (args ?? {}) as {
      task_command: string
      output_path: string
      cwd?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // npucollect.sh "<task_command>" <output.tar.gz>
    // (modules are a config in the script, not a CLI flag)
    const execArgs = [inp.task_command, inp.output_path]

    const r = await runCannExec('npucollect.sh', execArgs, {
      signal: ctx?.signal,
      mock,
      ...(inp.cwd ? { cwd: inp.cwd } : {}),
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
        archive: success ? inp.output_path : undefined,
      },
    }
  },
}
