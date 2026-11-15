import { describe, expect, test } from 'bun:test'
import {
  evaluateFoundationReadiness,
  evaluateImplementationAdmission,
  IMPLEMENTATION_ADMISSION_EVIDENCE,
} from '../../scripts/atlas-family-foundation-readiness'

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

const G1_EVIDENCE = {
  userAuthorization: 'docs/products/atlasweb/2026-11-15-s0-agreement.md (user-approved)',
  ticketAuditPass: 'user-review/ticket-audit/s0-upstream-delivery.md',
  s3bProductionEvidence: 'user-e2e/reports/r-20261113-prodlane-106.md',
  isolationPlan: 'docs/products/atlasweb/isolation-plan.md',
  contractReview: 'docs/products/atlasweb/2026-11-15-s0-agreement.md#differences',
  upstreamDependencyPlan: 'docs/products/atlas-family-roadmap.md#protocol-version-and-package-versions',
} as const

describe('Atlas family foundation readiness (G2 release gate)', () => {
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

describe('implementation admission (G1 repository-creation gate)', () => {
  test('exposes exactly the six preregistered evidence keys', () => {
    expect([...IMPLEMENTATION_ADMISSION_EVIDENCE].sort()).toEqual([
      'contractReview',
      'isolationPlan',
      's3bProductionEvidence',
      'ticketAuditPass',
      'upstreamDependencyPlan',
      'userAuthorization',
    ])
  })

  test('admits when all six evidence references are present and non-empty', () => {
    expect(evaluateImplementationAdmission({ evidence: G1_EVIDENCE })).toEqual({
      implementationAdmitted: true,
      reasons: [],
      evidence: G1_EVIDENCE,
    })
  })

  test('rejects when any single evidence key is missing or empty', () => {
    for (const key of IMPLEMENTATION_ADMISSION_EVIDENCE) {
      const withoutKey = { ...G1_EVIDENCE } as Record<string, string>
      delete withoutKey[key]
      const missing = evaluateImplementationAdmission({ evidence: withoutKey as never })
      expect(missing.implementationAdmitted).toBe(false)
      expect(missing.reasons).toContain(`implementation admission evidence missing: ${key}`)

      const empty = evaluateImplementationAdmission({
        evidence: { ...G1_EVIDENCE, [key]: '' },
      })
      expect(empty.implementationAdmitted).toBe(false)
      expect(empty.reasons).toContain(`implementation admission evidence missing: ${key}`)
    }
  })

  test('G1 does not require read-only controller evidence (G2-only predicate)', () => {
    // G1=true with no controller evidence at all is a legal state: the
    // controller predicate belongs to the G2 release gate only.
    const result = evaluateImplementationAdmission({ evidence: G1_EVIDENCE })
    expect(result.implementationAdmitted).toBe(true)
  })

  test('G1=true / G2=false is a legal intermediate state (G0 != G1, gates are separate)', () => {
    const admission = evaluateImplementationAdmission({ evidence: G1_EVIDENCE })
    // G2 still refuses: controller evidence predicate is false in this scenario.
    const readiness = evaluateFoundationReadiness({
      ...READY,
      readonlyControllerEvidence: false,
    })
    expect(admission.implementationAdmitted).toBe(true)
    expect(readiness.releasable).toBe(false)
  })

  test('G1 rejects blank/whitespace-only evidence references (fail closed)', () => {
    const result = evaluateImplementationAdmission({
      evidence: { ...G1_EVIDENCE, userAuthorization: '   ' },
    })
    expect(result.implementationAdmitted).toBe(false)
    expect(result.reasons).toContain('implementation admission evidence missing: userAuthorization')
  })
})
