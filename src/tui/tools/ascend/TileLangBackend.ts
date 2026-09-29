/**
 * TileLangBackend — RESERVED KernelBackend stub for TileLang.
 *
 * TileLang (github.com/tile-ai/TileLang, with an Ascend backend in
 * tilelang-ascend) is a Python DSL for authoring high-performance kernels that
 * compiles to multiple backends (CUDA / HIP / Ascend). It is a future
 * alternative kernel language for the operator-dev path — NOT implemented this
 * phase (MVP locks to Ascend C; see vault 20 §1.4 / §3.1, plan Phase 3).
 *
 * This stub implements the KernelBackend interface so the AscendCodeGen
 * registry proves the backend is swappable (the extension point is real and
 * reachable), but emit() throws ReservedBackendError rather than faking a
 * TileLang scaffold — a fake four-piece would violate the "structurally
 * faithful" emit() contract. When TileLang support lands, replace the throw
 * with a real emit() that produces the TileLang project layout (a Python DSL
 * source + its build/test harness, compiled via the TileLang toolchain rather
 * than bisheng).
 *
 * Official grounding: github.com/tile-ai/TileLang + tilelang-ascend (cloned in
 * ascend-official/). Memory `ascend-reference-source-authority`.
 */
import type {
  KernelArtifact,
  KernelBackend,
  OperatorSpec,
  TilingHint,
} from './KernelBackend.js'
import { ReservedBackendError } from './KernelBackend.js'

export class TileLangBackend implements KernelBackend {
  readonly id = 'tilelang' as const

  emit(_spec: OperatorSpec, _tiling?: TilingHint): KernelArtifact {
    throw new ReservedBackendError('tilelang')
  }
}
