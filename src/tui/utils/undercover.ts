/**
 * Undercover mode — safety utilities for contributing to public/open-source
 * repos. This was an internal-only capability (active only for internal
 * users). The gate has been removed, so every function below now reduces to
 * its inactive fallback (always off / empty), matching the external-build
 * behavior.
 */

export function isUndercover(): boolean {
  return false
}

export function getUndercoverInstructions(): string {
  return ''
}

/**
 * One-time explainer dialog gate for auto-undercover. The underlying feature
 * is inactive, so this always returns false.
 */
export function shouldShowUndercoverAutoNotice(): boolean {
  return false
}
