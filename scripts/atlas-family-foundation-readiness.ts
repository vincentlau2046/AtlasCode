export interface FoundationReadinessInput {
  worktreeClean: boolean
  s3bProductionPass: boolean
  tuiEscapeCount: number
  kernelBoundaryAllowed: boolean
  codeNeutralProtocolReview: boolean
  readonlyControllerEvidence: boolean
  evidence: Readonly<Record<string, string>>
}

export interface FoundationReadinessResult {
  releasable: boolean
  reasons: string[]
  evidence: Readonly<Record<string, string>>
}

const REQUIRED_EVIDENCE = [
  'foundationCommit',
  's3bReport',
  'boundaryScan',
  'protocolReview',
  'controllerEvidence',
  'rollback',
] as const

/**
 * Evaluate the AtlasWeb foundation gate (G2, release) without writing product
 * data or inferring a positive result from absent evidence.
 */
export function evaluateFoundationReadiness(
  input: FoundationReadinessInput,
): FoundationReadinessResult {
  const reasons: string[] = []
  if (!input.worktreeClean) reasons.push('shared checkout is dirty')
  if (!input.s3bProductionPass) reasons.push('0.1.106 S3b production lane is not PASS')
  if (input.tuiEscapeCount !== 0) reasons.push(`TUI escape count is ${input.tuiEscapeCount}, expected 0`)
  if (!input.kernelBoundaryAllowed) reasons.push('AtlasWeb kernel boundary scan is not allowed')
  if (!input.codeNeutralProtocolReview) reasons.push('Code-neutral protocol review is missing or failed')
  if (!input.readonlyControllerEvidence) reasons.push('read-only session controller evidence is missing or failed')
  for (const key of REQUIRED_EVIDENCE) {
    if (input.evidence[key] === undefined || input.evidence[key].length === 0) {
      reasons.push(`evidence reference missing: ${key}`)
    }
  }
  return {
    releasable: reasons.length === 0,
    reasons,
    evidence: input.evidence,
  }
}

/**
 * G1 — implementation admission (repository creation / parallel development
 * start). Separate output and separate gate from the G2 release predicate
 * above (S0 agreement §6/§8): G1=true / G2=false is a legal intermediate
 * state. G1 never requires read-only controller evidence — that predicate
 * belongs to G2 only. Fails closed: every evidence key must be a non-blank
 * reference; missing, empty, or blank means refused.
 */
export const IMPLEMENTATION_ADMISSION_EVIDENCE = [
  'userAuthorization',
  'ticketAuditPass',
  's3bProductionEvidence',
  'isolationPlan',
  'contractReview',
  'upstreamDependencyPlan',
] as const

export type ImplementationAdmissionKey = (typeof IMPLEMENTATION_ADMISSION_EVIDENCE)[number]

export interface ImplementationAdmissionInput {
  evidence: Readonly<Record<ImplementationAdmissionKey, string>>
}

export interface ImplementationAdmissionResult {
  implementationAdmitted: boolean
  reasons: string[]
  evidence: Readonly<Record<string, string>>
}

export function evaluateImplementationAdmission(
  input: ImplementationAdmissionInput,
): ImplementationAdmissionResult {
  const reasons: string[] = []
  for (const key of IMPLEMENTATION_ADMISSION_EVIDENCE) {
    const reference = input.evidence[key]
    if (reference === undefined || reference.trim().length === 0) {
      reasons.push(`implementation admission evidence missing: ${key}`)
    }
  }
  return {
    implementationAdmitted: reasons.length === 0,
    reasons,
    evidence: input.evidence,
  }
}
