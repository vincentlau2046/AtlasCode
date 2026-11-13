// Stub for external builds - classifier permissions feature is ANT-ONLY
//
// #278 白盒 no-op 根因（2026-10-05，f4/e2e 同步）：本 stub 使 BASH_CLASSIFIER flag
// 在 TUI 车道对「分类」零作用——isClassifierPermissionsEnabled() 恒 false →
// buildPendingClassifierCheck（bashPermissions.ts）首步即 return undefined →
// result.pendingClassifierCheck 恒 undefined → interactiveHandler 的
// feature('BASH_CLASSIFIER') 异步分类器检永不跑 → classifierAutoApproved 永不 true。
// ∴ 「BASH_CLASSIFIER 默认开」是 no-op（只翻 dialog 死 UI，零分类结果）。真正能产的
// 分类器 = auto-mode yolo 分类器（TRANSCRIPT_CLASSIFIER 已 ON_BY_DEFAULT + mode=auto +
// live 模型，permissions.ts classifyYoloAction）；A4 classifier 2 句 PTY 不可强制
// （live-model 依赖，记产品局限 INCONCLUSIVE）。

export const PROMPT_PREFIX = 'prompt:'

export type ClassifierResult = {
  matches: boolean
  matchedDescription?: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export type ClassifierBehavior = 'deny' | 'ask' | 'allow'

export function extractPromptDescription(
  _ruleContent: string | undefined,
): string | null {
  return null
}

export function createPromptRuleContent(description: string): string {
  return `${PROMPT_PREFIX} ${description.trim()}`
}

export function isClassifierPermissionsEnabled(): boolean {
  return false
}

export function getBashPromptDenyDescriptions(_context: unknown): string[] {
  return []
}

export function getBashPromptAskDescriptions(_context: unknown): string[] {
  return []
}

export function getBashPromptAllowDescriptions(_context: unknown): string[] {
  return []
}

export async function classifyBashCommand(
  _command: string,
  _cwd: string,
  _descriptions: string[],
  _behavior: ClassifierBehavior,
  _signal: AbortSignal,
  _isNonInteractiveSession: boolean,
): Promise<ClassifierResult> {
  return {
    matches: false,
    confidence: 'high',
    reason: 'This feature is disabled',
  }
}

export async function generateGenericDescription(
  _command: string,
  specificDescription: string | undefined,
  _signal: AbortSignal,
): Promise<string | null> {
  return specificDescription || null
}
