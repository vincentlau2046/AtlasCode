import { describe, expect, test } from 'bun:test'
import { evaluateFoundationReadiness } from '../../scripts/atlas-family-foundation-readiness'

const READY = {
  worktreeClean: true,
  s3bProductionPass: true,
  tuiEscapeCount: 0,
  kernelBoundaryAllowed: true,
  codeNeutralProtocolReview: true,
  readonlyControllerEvidence: true,
  evidence: {
    foundationCommit: '0a0f8a67',
    s3bReport: 'user-e2e/reports/r-20261113-gate-106.md',
    boundaryScan: 'result:allowed',
    protocolReview: 'protocol-v0-inventory.md',
    controllerEvidence: 'session-follow-proof.json',
    rollback: 'v0.1.105',
  },
} as const

describe('Atlas family foundation readiness', () => {
  test('fails closed when any foundation predicate is missing or negative', () => {
    const result = evaluateFoundationReadiness({
      ...READY,
      worktreeClean: false,
      s3bProductionPass: false,
      tuiEscapeCount: 2,
      kernelBoundaryAllowed: false,
      codeNeutralProtocolReview: false,
      readonlyControllerEvidence: false,
    })

    expect(result.releasable).toBe(false)
    expect(result.reasons).toEqual([
      'shared checkout is dirty',
      '0.1.106 S3b production lane is not PASS',
      'TUI escape count is 2, expected 0',
      'AtlasWeb kernel boundary scan is not allowed',
      'Code-neutral protocol review is missing or failed',
      'read-only session controller evidence is missing or failed',
    ])
  })

  test('returns releasable only when all evidence is present and positive', () => {
    expect(evaluateFoundationReadiness(READY)).toEqual({
      releasable: true,
      reasons: [],
      evidence: READY.evidence,
    })
  })
})
