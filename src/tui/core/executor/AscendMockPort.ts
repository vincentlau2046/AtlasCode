/**
 * AscendMockPort — env-reading port for AscendExecutor mock decision.
 *
 * Extracted from AscendExecutor.shouldMock() so that the mock logic
 * can be replaced at the composition root (factory.ts) without
 * touching the core executor module.
 *
 * Design: docs/05-Executor模块设计.md §11.3 P3-2
 * Pattern: follows core/modelprovider/MockEnvPort.ts (06 文档 B2)
 */

/** Port interface — isolate process.env reads for the Ascend mock decision. */
export interface AscendMockPort {
  /** Read ATLAS_ASCEND_MOCK — '1' to force mock mode. */
  getAscendMockFlag(): string | undefined

  /** Read ATLAS_MOCK_ON_NONINTERACTIVE — non-'0' to auto-mock in non-interactive sessions. */
  getMockOnNonInteractiveFlag(): string | undefined

  /**
   * Read ATLAS_ASCEND_MOCK_SCENARIO — selects which fixture replay scenario
   * mockExec returns (e.g. 'happy', 'oom', 'mismatch'). Default 'happy'.
   * Used by L2 fixture-driven correctness tests to exercise error paths
   * non-tautologically (mock no longer always returns exit 0).
   */
  getMockScenario(): string
}

/** Default adapter — delegates to process.env. */
export class DefaultAscendMockPort implements AscendMockPort {
  getAscendMockFlag(): string | undefined {
    return process.env.ATLAS_ASCEND_MOCK
  }

  getMockOnNonInteractiveFlag(): string | undefined {
    return process.env.ATLAS_MOCK_ON_NONINTERACTIVE
  }

  getMockScenario(): string {
    return process.env.ATLAS_ASCEND_MOCK_SCENARIO || 'happy'
  }
}
