/**
 * AscendProfileReportParser — msprof dump → 瓶颈分析（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/ProfileReportParser.ts 移植（call 函数体逐字）。
 * 工具只返 EVIDENCE（op_summary 路径 + 派生 top-op 提示），不决策。delta（旧
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
import { PROFILE_REPORT_PARSER_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const PROFILE_REPORT_PARSER_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    profiling_dir: {
      type: 'string',
      description:
        'Path to the msprof profiling dump directory (the PROF_* dir captured by AscendRealHWBridge profile, or its parent). This is the msprof --output arg.',
    },
    mode: {
      type: 'string',
      enum: ['export', 'analyze'],
      description:
        'msprof mode: "export" (default, produces op_summary_*.csv + trace.json from the raw dump) or "analyze" (produces a db). Use "export" to get the per-op CSV for bottleneck analysis.',
    },
    output_dir: {
      type: 'string',
      description:
        'Output directory for parsed artifacts (defaults to profiling_dir).',
    },
  },
  required: ['profiling_dir'],
}

export interface ProfileReportParserOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  op_summary_path?: string
  top_ops?: string
}

/** Coarse top-op extraction from msprof op_summary-like stdout（evidence hint）。 */
function deriveTopOps(stdout: string): string | undefined {
  const lines = stdout
    .split('\n')
    .filter(l => /ratio|_time|ops\b/i.test(l) && /[a-z_]+,?\s*[\d.]+/i.test(l))
  if (!lines.length) return undefined
  return 'top ops: ' + lines.slice(0, 4).map(l => l.trim()).join('; ')
}

function getPrompt(): string {
  return (
    'Parse an Ascend msprof profiling dump into bottleneck evidence via ' +
    '`msprof --export=on` (CANN binary — the canonical parser for msprof ' +
    'binary dumps, NOT a GitHub repo). Provide the profiling dump directory ' +
    '(the PROF_* dir from AscendRealHWBridge profile). mode "export" (default) ' +
    'produces op_summary_*.csv (per-op time + pipeline-utilization ratios: ' +
    'aiv_vec_ratio, aiv_mte2_ratio, etc.) + trace.json; mode "analyze" ' +
    'produces a db. Returns the op_summary path + coarse top-op hints. Read ' +
    'the op_summary_*.csv (Glob op_summary_*.csv in the dump dir for the ' +
    'exact file) for the full pipeline breakdown — the bottleneck-analysis ' +
    'methodology is in triton-ascend profiling.md "Locating Bottlenecks". ' +
    'This tool returns EVIDENCE only. For a GE *text* profiling dump ' +
    '(GE_PROFILING_TO_STD_OUT=1) use AscendProfileAnalyzer (ada-pa) instead ' +
    '— different input format. In mock mode returns a liveness signal — say so.'
  )
}

function fold(d: ProfileReportParserOutput): string {
  return [
    foldHeader('msprof analyze', d.success, d.exitCode, d.durationMs, d.mocked),
    d.top_ops ? d.top_ops : '',
    d.op_summary_path ? `op_summary: ${d.op_summary_path}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const ProfileReportParser: Tool = {
  name: PROFILE_REPORT_PARSER_TOOL_NAME,
  inputSchema: PROFILE_REPORT_PARSER_INPUT_SCHEMA,
  inputJSONSchema: PROFILE_REPORT_PARSER_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'parse an Ascend msprof profiling dump into op_summary / bottleneck evidence via msprof --export',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => PROFILE_REPORT_PARSER_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      PROFILE_REPORT_PARSER_TOOL_NAME +
      ' will run msprof --export/--analyze on the profiling dump. Allow?',
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
      content: fold(content as ProfileReportParserOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<ProfileReportParserOutput>> {
    const inp = (args ?? {}) as {
      profiling_dir: string
      mode?: string
      output_dir?: string
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    const mode = inp.mode || 'export'
    const outDir = inp.output_dir || inp.profiling_dir
    // msprof --export=on --output <dir>  |  msprof --analyze=on --output <dir>
    const execArgs = [`--${mode}=on`, '--output', inp.profiling_dir]

    const r = await runCannExec('msprof', execArgs, {
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
        op_summary_path: success ? `${outDir}/op_summary.csv` : undefined,
        top_ops: deriveTopOps(r.stdout),
      },
    }
  },
}
