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
 * Evaluate the AtlasWeb foundation gate without writing product data or
 * inferring a positive result from absent evidence.
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
