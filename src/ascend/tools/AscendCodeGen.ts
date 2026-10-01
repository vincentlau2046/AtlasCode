/**
 * AscendCodeGen — scaffold a four-piece Ascend C operator project（M3-S3，
 * D-3 Ascend 独立实施波）。
 *
 * 从 AtlasHarness src/tools/ascend/AscendCodeGen.ts 移植（函数体逐字；后端
 * registry 消费本域 KernelBackend 3 后端）。delta（旧 buildTool(zod) → 新
 * shared Tool 契约，taskCreate/Bash 先例）：① ② ③ ④ ⑤ checkPermissions =
 * fail-closed ask（写盘前确认）⑥ renderToolUseMessage → null + mapToolResult
 * JSON 化 ⑦ call 5 参 → 2 参 ⑧ import 重指 node:fs / node:path + 本域
 * KernelBackend / AscendCBackend / TileLangBackend / TritonBackend。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from 'src/shared'
import { ASCEND_CODEGEN_TOOL_NAME } from './constants'
import {
  ReservedBackendError,
  type KernelArtifact,
  type KernelBackend,
  type OperatorSpec,
  type TilingHint,
} from './KernelBackend'
import { AscendCBackend } from './AscendCBackend'
import { TileLangBackend } from './TileLangBackend'
import { TritonBackend } from './TritonBackend'

export const ASCEND_CODEGEN_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    op_spec: {
      type: 'string',
      description:
        'Parsed operator spec (JSON or text) from AscendSpecParser.',
    },
    tiling_plan: {
      type: 'string',
      description:
        'JSON tiling plan from AscendTilingPlanner (tileNum/blockDim used to size the scaffold).',
    },
    target: {
      type: 'string',
      description:
        'Kernel backend: "ascend-c" (default, MVP — bisheng-compiled four-piece). "tilelang"/"triton" are reserved stubs (not implemented — returns a not-implemented hint pointing back to ascend-c). Unknown values fall back to ascend-c.',
    },
    output_dir: {
      type: 'string',
      description:
        'Directory to write the four-piece project (csrc/*.asc + setup.py + test_*.py). If omitted, returns the file manifest in-memory only.',
    },
  },
  required: ['op_spec'],
}

export interface CodeGenOutput {
  op_name: string
  target: string
  files: { path: string; lines: number }[]
  project_dir: string | null
  entry_kernel: string
  module_name: string
  tiling_applied: boolean
  mocked: boolean
  hints?: string[]
}

// Backend registry — Ascend C is the MVP; TileLang/Triton are reserved stubs
// (interface-conforming, emit() throws ReservedBackendError). Registering them
// proves the kernel language is swappable (the pluggable-backend extension
// point is real and reachable, not theoretical). See plan Phase 3.
const BACKENDS: Record<string, KernelBackend> = {
  'ascend-c': new AscendCBackend(),
  tilelang: new TileLangBackend(),
  triton: new TritonBackend(),
}

function getPrompt(): string {
  return (
    'Scaffold a four-piece Ascend C operator project (structurally derived ' +
    'from op-examples/GELU): csrc/<op>.asc (kernel class + __global__ ' +
    '__vector__ entry + host launcher), csrc/pybind11.asc (binding), setup.py ' +
    '(bisheng -x asc build driver with npu-smi arch probe), test_<op>.py ' +
    '(numpy golden test). The kernel compute body and numpy reference formula ' +
    'are PLACEHOLDERS — fill them via Read/Edit/Write before compiling with ' +
    'AscendCompilerBridge (python3 setup.py build_ext). Provide the spec (from ' +
    'AscendSpecParser), an optional tiling plan, and an output_dir to write ' +
    'the project. Returns the file manifest, entry kernel name, and module ' +
    'name.'
  )
}

export const AscendCodeGen: Tool = {
  name: ASCEND_CODEGEN_TOOL_NAME,
  inputSchema: ASCEND_CODEGEN_INPUT_SCHEMA,
  inputJSONSchema: ASCEND_CODEGEN_INPUT_SCHEMA,
  maxResultSizeChars: 100_000,
  searchHint:
    'scaffold an Ascend C operator project (four-piece: kernel .asc + pybind + setup.py + golden test)',
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => ASCEND_CODEGEN_TOOL_NAME,
  // delta ⑤：旧 fail-closed ask（写盘前确认）
  checkPermissions: async () => ({
    behavior: 'ask',
    message:
      ASCEND_CODEGEN_TOOL_NAME +
      ' will write the four-piece operator project to disk. Allow?',
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
      content: JSON.stringify(content, null, 2),
    }
  },
  async call(
    args: unknown,
    _context: unknown,
  ): Promise<ToolResult<CodeGenOutput>> {
    const inp = (args ?? {}) as {
      op_spec: string
      tiling_plan?: string
      target?: string
      output_dir?: string
    }
    const targetId = (inp.target || 'ascend-c').toLowerCase()
    // Unknown targets fall back to the MVP ascend-c backend. The target field
    // in the result reports backend.id (the actual backend used), so an
    // unknown-target fallback is honestly reflected as 'ascend-c'.
    const backend = BACKENDS[targetId] || BACKENDS['ascend-c']

    // Parse spec → OperatorSpec
    let spec: OperatorSpec = { op_name: 'unnamed_op' }
    try {
      const parsed = JSON.parse(inp.op_spec)
      spec = {
        op_name: parsed.op_name || 'unnamed_op',
        op_type: parsed.op_type || parsed.type,
        data_types: parsed.data_types,
        shapes: parsed.shapes,
      }
    } catch {
      spec = { op_name: String(inp.op_spec).slice(0, 60) }
    }

    // Parse tiling hint
    let tiling: TilingHint | undefined
    let tilingApplied = false
    try {
      if (inp.tiling_plan) {
        const tp = JSON.parse(inp.tiling_plan)
        tiling = {
          blockDim: tp.blockDim,
          gridDim: tp.gridDim,
          tileNum: tp.tileNum,
        }
        tilingApplied = true
      }
    } catch {
      /* invalid tiling JSON */
    }

    // Emit the four-piece project. Reserved backends (TileLang/Triton) throw
    // ReservedBackendError — caught here and returned as a structured
    // not-implemented result (honest: no fake scaffold; the hint points the
    // agent at the MVP ascend-c backend).
    let artifact: KernelArtifact
    try {
      artifact = backend.emit(spec, tiling)
    } catch (e) {
      if (e instanceof ReservedBackendError) {
        return {
          data: {
            op_name: spec.op_name,
            target: backend.id,
            files: [],
            project_dir: null,
            entry_kernel: '',
            module_name: '',
            tiling_applied: tilingApplied,
            mocked: true,
            hints: [e.message],
          },
        }
      }
      throw e
    }

    // Write to disk if output_dir provided; else in-memory manifest
    // delta ⑨：旧同步 mkdirSync/writeFileSync → 异步 fs/promises（call 已 async，
    // 写盘顺序经 await 逐文件保序；no-sync-fs 规则 + 行为零改动）
    let projectDir: string | null = null
    if (inp.output_dir) {
      projectDir = inp.output_dir
      for (const f of artifact.files) {
        const full = join(projectDir, f.path)
        await mkdir(dirname(full), { recursive: true })
        await writeFile(full, f.content)
      }
    }

    const hints = [
      `Fill the Compute() body in csrc/${artifact.op_name}_custom.asc (op-specific math)`,
      `Fill the ${artifact.op_name}_ref() numpy formula in test_${artifact.op_name}.py`,
      'Compile with AscendCompilerBridge (python3 setup.py build_ext)',
      ...(tilingApplied
        ? [
            `Tiling hint applied (tileNum=${tiling?.tileNum ?? 8}, blockDim=${tiling?.blockDim ?? 8}) — verify against L1/L2 cache`,
          ]
        : ['No tiling plan provided; default tileNum=8/blockDim=8 used']),
    ]

    return {
      data: {
        op_name: artifact.op_name,
        target: backend.id,
        files: artifact.files.map(f => ({
          path: f.path,
          lines: f.content.split('\n').length,
        })),
        project_dir: projectDir,
        entry_kernel: artifact.entry_kernel,
        module_name: artifact.module_name,
        tiling_applied: tilingApplied,
        mocked: true,
        hints,
      },
    }
  },
}
