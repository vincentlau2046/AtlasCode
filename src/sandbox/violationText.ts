/**
 * Violation text contract — the display-side half of the
 * `<sandbox_violations>` stderr annotation（B 波 S1 迁入）。
 *
 * 旧仓来源（a8af45b）: src/core/sandbox/violationText.ts
 *
 * The tag format is produced by `BaseSandboxManager.annotateStderrWithSandboxFailures`
 * (runtime-types, exposed through the SandboxBackend interface) and consumed here
 * for display cleanup. Keeping producer/consumer in the same domain (sandbox/)
 * means a backend that changes the annotation format must update these helpers
 * in the same PR (P-1 "independently patchable" gate).
 *
 * 自治：零 import（纯 regex 文本处理）。
 */

const SANDBOX_VIOLATIONS_TAG = /<sandbox_violations>[\s\S]*?<\/sandbox_violations>/g
const SANDBOX_VIOLATIONS_BLOCK = /<sandbox_violations>([\s\S]*?)<\/sandbox_violations>/

/**
 * Remove <sandbox_violations> blocks from text.
 * Used to clean up error messages / stderr for display purposes.
 */
export function removeSandboxViolationTags(text: string): string {
  return text.replace(SANDBOX_VIOLATIONS_TAG, "")
}

/**
 * Extract the content inside a (first) <sandbox_violations> block, or null when
 * the text carries no such block. Callers use the boolean for branching
 * (e.g. "was this stderr sandbox-annotated?") and the captured group for display.
 */
export function extractSandboxViolationsBlock(
  text: string,
): { present: boolean; content: string | null } {
  const match = SANDBOX_VIOLATIONS_BLOCK.exec(text)
  return match ? { present: true, content: match[1] } : { present: false, content: null }
}
