/**
 * KernelBackend — pluggable operator-kernel emission backend.
 *
 * The operator-dev surface (AscendCodeGen) delegates project emission to a
 * backend so the kernel language is swappable. Ascend C is the MVP backend
 * (bisheng-compiled per op-examples); TileLang / Triton are reserved
 * (interface + empty impl, not implemented this phase).
 *
 * Design baseline: vault 20 §3.1 后端抽象 / plan Phase 3.
 * Official grounding: op-examples/ (GELU 四件套) — see memory
 * `ascend-bisheng-compile-form`.
 *
 * Contract: emit() returns a STRUCTURALLY-FAITHFUL project scaffold (correct
 * includes, kernel entry signature, host launcher, build script, golden-test
 * harness — derived from op-examples). The kernel COMPUTE BODY is a placeholder
 * the agent fills via the coding base (Read/Edit/Write); the backend does not
 * synthesize a correct kernel. mocked:true on the CodeGen result reflects this.
 */

// ── input types (loose — parsed spec / tiling hint from upstream tools) ──────

export interface OperatorSpec {
  op_name: string
  op_type?: string
  data_types?: string[]
  shapes?: number[][]
  [k: string]: unknown
}

export interface TilingHint {
  blockDim?: number
  gridDim?: number
  tileNum?: number
  [k: string]: unknown
}

// ── output types ─────────────────────────────────────────────────────────────

export interface ProjectFile {
  /** Path relative to the project root, e.g. 'csrc/gelu_custom.asc'. */
  path: string
  content: string
}

export interface KernelArtifact {
  /** The four-piece set: csrc/<op>.asc (kernel), csrc/pybind11.asc (binding),
   *  setup.py (bisheng build), test_<op>.py (golden test). */
  files: ProjectFile[]
  /** Kernel entry function name, e.g. 'gelu_custom'. */
  entry_kernel: string
  /** Operator name (sanitized). */
  op_name: string
  /** Python import module name, e.g. 'custom_ops_lib'. */
  module_name: string
}

// ── backend interface ────────────────────────────────────────────────────────

export interface KernelBackend {
  /** Backend identifier. */
  readonly id: 'ascend-c' | 'tilelang' | 'triton'

  /** Emit the four-piece project scaffold for the given spec + tiling hint. */
  emit(spec: OperatorSpec, tiling?: TilingHint): KernelArtifact
}

/**
 * Thrown by a reserved backend (TileLang/Triton) when emit() is called.
 *
 * These backends are interface-conforming stubs — they exist so the
 * AscendCodeGen backend registry proves the kernel language is swappable
 * (the pluggable-backend extension point is real and reachable), but their
 * emit() refuses rather than faking a scaffold (honesty: a fake TileLang
 * four-piece would violate the "structurally faithful" contract). AscendCodeGen
 * catches this and returns a structured not-implemented result pointing the
 * agent at the MVP "ascend-c" backend.
 *
 * Design baseline: vault 20 §3.1 后端抽象 / plan Phase 3.
 * Official grounding: github.com/tile-ai/TileLang (tilelang-ascend) +
 * github.com/triton-lang/triton (triton-ascend) — reserved, not implemented.
 */
export class ReservedBackendError extends Error {
  readonly backendId: 'tilelang' | 'triton'
  constructor(backendId: 'tilelang' | 'triton') {
    super(
      backendId + ' backend is reserved (not yet implemented). Use "ascend-c" ' +
        '(the MVP backend, bisheng-compiled four-piece) for a real scaffold. ' +
        'See vault 20 §3.1 / plan Phase 3.',
    )
    this.name = 'ReservedBackendError'
    this.backendId = backendId
  }
}
