import { z } from 'zod/v4'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { ASCEND_CODEGEN_TOOL_NAME } from './constants.js'
import { ReservedBackendError, type KernelArtifact, type KernelBackend, type OperatorSpec, type TilingHint } from './KernelBackend.js'
import { AscendCBackend } from './AscendCBackend.js'
import { TileLangBackend } from './TileLangBackend.js'
import { TritonBackend } from './TritonBackend.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    op_spec: z.string().describe('Parsed operator spec (JSON or text) from AscendSpecParser.'),
    tiling_plan: z.string().optional().describe('JSON tiling plan from AscendTilingPlanner (tileNum/blockDim used to size the scaffold).'),
    target: z.string().optional().describe('Kernel backend: "ascend-c" (default, MVP — bisheng-compiled four-piece). "tilelang"/"triton" are reserved stubs (not implemented — returns a not-implemented hint pointing back to ascend-c). Unknown values fall back to ascend-c.'),
    output_dir: z.string().optional().describe('Directory to write the four-piece project (csrc/*.asc + setup.py + test_*.py). If omitted, returns the file manifest in-memory only.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    op_name: z.string().describe('Operator name (sanitized identifier stem).'),
    target: z.string().describe('Kernel backend id used.'),
    files: z.array(z.object({
      path: z.string().describe('Path relative to project root.'),
      lines: z.number().describe('Line count of the file.'),
    })).describe('The four-piece project manifest: csrc/<op>.asc (kernel), csrc/pybind11.asc (binding), setup.py (bisheng build), test_<op>.py (golden test).'),
    project_dir: z.string().nullable().describe('Absolute path the project was written to, or null when output_dir was not provided (in-memory manifest).'),
    entry_kernel: z.string().describe('Kernel entry function name (e.g. gelu_custom).'),
    module_name: z.string().describe('Python import module name (custom_ops_lib).'),
    tiling_applied: z.boolean().describe('True when a tiling hint was applied to the scaffold.'),
    mocked: z.boolean().describe('True — the scaffold is a structurally-faithful template with a placeholder compute body, NOT a correct kernel. The agent fills the body via Read/Edit/Write.'),
    hints: z.array(z.string()).optional().describe('Notes on what the agent must fill in before compiling.'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// Backend registry — Ascend C is the MVP; TileLang/Triton are reserved stubs
// (interface-conforming, emit() throws ReservedBackendError). Registering them
// proves the kernel language is swappable (the pluggable-backend extension
// point is real and reachable, not theoretical). See plan Phase 3.
const BACKENDS: Record<string, KernelBackend> = {
  'ascend-c': new AscendCBackend(),
  'tilelang': new TileLangBackend(),
  'triton': new TritonBackend(),
}

export const AscendCodeGen = buildTool({
  name: ASCEND_CODEGEN_TOOL_NAME,
  searchHint: 'scaffold an Ascend C operator project (four-piece: kernel .asc + pybind + setup.py + golden test)',
  maxResultSizeChars: 100_000,
  async description(input) {
    const name = (input as { op_spec?: string }).op_spec || 'this operator'
    return 'Scaffold the four-piece Ascend C project for ' + name
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isReadOnly() { return false },
  isDestructive() { return false },
  async checkPermissions(_input, _ctx): Promise<PermissionDecision> {
    return {
      behavior: 'ask',
      message: AscendCodeGen.name + ' will write the four-piece operator project to disk. Allow?',
    }
  },
  async prompt() {
    return 'Scaffold a four-piece Ascend C operator project (structurally derived from op-examples/GELU): csrc/<op>.asc (kernel class + __global__ __vector__ entry + host launcher), csrc/pybind11.asc (binding), setup.py (bisheng -x asc build driver with npu-smi arch probe), test_<op>.py (numpy golden test). The kernel compute body and numpy reference formula are PLACEHOLDERS — fill them via Read/Edit/Write before compiling with AscendCompilerBridge (python3 setup.py build_ext). Provide the spec (from AscendSpecParser), an optional tiling plan, and an output_dir to write the project. Returns the file manifest, entry kernel name, and module name.'
  },
  async call(
    input,
    { options }: { options?: { isNonInteractiveSession?: boolean } },
  ) {
    const inp: any = input as any
    const targetId = (inp.target || 'ascend-c').toLowerCase()
    // Unknown targets fall back to the MVP ascend-c backend. The target field
    // in the result reports backend.id (the actual backend used), so an
    // unknown-target fallback is honestly reflected as 'ascend-c'.
    const backend = BACKENDS[targetId] || BACKENDS['ascend-c']

    // Parse spec → OperatorSpec
    let spec: OperatorSpec = { op_name: 'unnamed_op' }
    try {
      const parsed = JSON.parse(inp.op_spec)
      spec = { op_name: parsed.op_name || 'unnamed_op', op_type: parsed.op_type || parsed.type, data_types: parsed.data_types, shapes: parsed.shapes }
    } catch (_e) {
      spec = { op_name: String(inp.op_spec).slice(0, 60) }
    }

    // Parse tiling hint
    let tiling: TilingHint | undefined
    let tilingApplied = false
    try {
      if (inp.tiling_plan) {
        const tp = JSON.parse(inp.tiling_plan)
        tiling = { blockDim: tp.blockDim, gridDim: tp.gridDim, tileNum: tp.tileNum }
        tilingApplied = true
      }
    } catch (_e) { /* invalid tiling JSON */ }

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
    let projectDir: string | null = null
    if (inp.output_dir) {
      projectDir = inp.output_dir
      for (const f of artifact.files) {
        const full = join(projectDir, f.path)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, f.content)
      }
    }

    const hints = [
      `Fill the Compute() body in csrc/${artifact.op_name}_custom.asc (op-specific math)`,
      `Fill the ${artifact.op_name}_ref() numpy formula in test_${artifact.op_name}.py`,
      `Compile with AscendCompilerBridge (python3 setup.py build_ext)`,
      ...(tilingApplied ? [`Tiling hint applied (tileNum=${tiling?.tileNum ?? 8}, blockDim=${tiling?.blockDim ?? 8}) — verify against L1/L2 cache`] : ['No tiling plan provided; default tileNum=8/blockDim=8 used']),
    ]

    return {
      data: {
        op_name: artifact.op_name,
        target: backend.id,
        files: artifact.files.map(f => ({ path: f.path, lines: f.content.split('\n').length })),
        project_dir: projectDir,
        entry_kernel: artifact.entry_kernel,
        module_name: artifact.module_name,
        tiling_applied: tilingApplied,
        mocked: true,
        hints,
      },
    }
  },
} as any)
