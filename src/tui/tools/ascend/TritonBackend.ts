/**
 * TritonBackend — RESERVED KernelBackend stub for Triton.
 *
 * Triton (github.com/triton-lang/triton, with Ascend support in
 * triton-ascend) is OpenAI's language for writing GPU/accelerator kernels at
 * a block level, with an Ascend backend. It is a future alternative kernel
 * language for the operator-dev path — NOT implemented this phase (MVP locks
 * to Ascend C; see vault 20 §1.4 / §3.1, plan Phase 3).
 *
 * This stub implements the KernelBackend interface so the AscendCodeGen
 * registry proves the backend is swappable (the extension point is real and
 * reachable), but emit() throws ReservedBackendError rather than faking a
 * Triton scaffold — a fake four-piece would violate the "structurally
 * faithful" emit() contract. When Triton support lands, replace the throw
 * with a real emit() that produces the Triton project layout (a .py Triton
 * kernel + its build/test harness, compiled via the triton-ascend toolchain
 * rather than bisheng).
 *
 * Official grounding: github.com/triton-lang/triton + triton-ascend (cloned in
 * ascend-official/). Memory `ascend-reference-source-authority`.
 */
import type {
  KernelArtifact,
  KernelBackend,
  OperatorSpec,
  TilingHint,
} from './KernelBackend.js'
import { ReservedBackendError } from './KernelBackend.js'

export class TritonBackend implements KernelBackend {
  readonly id = 'triton' as const

  emit(_spec: OperatorSpec, _tiling?: TilingHint): KernelArtifact {
    throw new ReservedBackendError('triton')
  }
}
