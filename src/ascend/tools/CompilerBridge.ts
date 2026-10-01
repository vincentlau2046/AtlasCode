/**
 * AscendCompilerBridge — bisheng 编译四件套算子工程（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/CompilerBridge.ts 移植（call 函数体逐字）。
 * delta（旧 buildTool(zod) → 新 shared Tool 契约，taskCreate/Bash 先例）：
 *  ① ② ③ ④ ⑤ checkPermissions = fail-closed ask ⑥ renderToolUseMessage → null
 *  + mapToolResult = 旧 foldResult 折叠摘要 ⑦ call 5 参 → 2 参 ⑧ import 重指
 *    本域 AscendExecutor（经 instance 注入点）+ runCannExec 共享包裹 + foldUtils。
 *  mock 决策 = AscendExecutor.shouldMock()（env 驱动；旧仓 options.
 *  isNonInteractiveSession 不在 engine 最小 context，forward seam）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { COMPILER_BRIDGE_TOOL_NAME } from './constants'
import { AscendExecutor } from '../executor/AscendExecutor'
import { runCannExec, type AscendToolUseContext } from './execUtil'
import {
  extractErrorLines,
  foldHeader,
  truncateStdout,
} from './foldUtils'

export const COMPILER_BRIDGE_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    project_dir: {
      type: 'string',
      description:
        'Absolute path to the four-piece operator project (produced by AscendCodeGen). Must contain setup.py + csrc/*.asc.',
    },
    op_name: {
      type: 'string',
      description:
        'Operator name (for artifact path resolution and reporting).',
    },
    extra_args: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Extra args appended to `python3 setup.py build_ext` (e.g. ["--inplace"]).',
    },
  },
  required: ['project_dir'],
}

export interface CompilerBridgeOutput {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs: number
  mocked: boolean
  artifact?: string
}

function getPrompt(): string {
  return (
    'Compile an Ascend C operator project using bisheng. The build entrypoint ' +
    'is `python3 setup.py build_ext` (setup.py owns the bisheng -x asc ' +
    'invocation, npu-smi arch probe, torch ABI detection, and include/lib ' +
    'path resolution — the faithful form per op-examples). Provide the ' +
    'project_dir (from AscendCodeGen output) and optional op_name. Returns ' +
    'exit code, stdout/stderr, and the compiled .so artifact path on success. ' +
    'This is the compile step. In mock mode it returns a liveness signal only ' +
    '— say so, do not claim a real build.'
  )
}

function fold(d: CompilerBridgeOutput): string {
  return [
    foldHeader('bisheng compile', d.success, d.exitCode, d.durationMs, d.mocked),
    d.artifact ? `artifact: ${d.artifact}` : '',
    ...extractErrorLines(d.stderr).map(e => `  - ${e.trim()}`),
    d.stdout ? `stdout: ${truncateStdout(d.stdout)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const CompilerBridge: Tool = {
  name: COMPILER_BRIDGE_TOOL_NAME,
  inputSchema: COMPILER_BRIDGE_INPUT_SCHEMA,
  inputJSONSchema: COMPILER_BRIDGE_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'compile an Ascend C operator project via bisheng (python3 setup.py build_ext)',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => COMPILER_BRIDGE_TOOL_NAME,
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      COMPILER_BRIDGE_TOOL_NAME +
      ' will run `python3 setup.py build_ext` (bisheng compiles csrc/*.asc → .so). Allow?',
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
      content: fold(content as CompilerBridgeOutput),
    }
  },
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<CompilerBridgeOutput>> {
    const inp = (args ?? {}) as {
      project_dir?: string
      op_name?: string
      extra_args?: string[]
    }
    const ctx = (context ?? {}) as AscendToolUseContext
    const mock = AscendExecutor.shouldMock()
    // setup.py owns the bisheng invocation (arch probe + ABI + dep paths).
    // The exec entrypoint is python3; the compiler identity is bisheng
    // (AscendExecutor.commands.compile, used for availability probes/prompt).
    const args2 = ['setup.py', 'build_ext']
    if (Array.isArray(inp.extra_args)) args2.push(...inp.extra_args)

    const r = await runCannExec('python3', args2, {
      signal: ctx?.signal,
      mock,
      cwd: inp.project_dir,
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
        artifact: success
          ? mock
            ? 'custom_ops_lib.so'
            : 'build/lib/op_extension/custom_ops_lib.so'
          : undefined,
      },
    }
  },
}
