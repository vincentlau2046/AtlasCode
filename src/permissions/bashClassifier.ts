/**
 * permissions 域 — bash 分类器桩（E-6 S-6c，§8.43；旧仓
 * src/utils/permissions/bashClassifier.ts 61L 逐字，零 import 纯叶）。
 *
 * 「stub 即外部构建形态」：本文件的 no-op 实现（enabled=false /
 * classify 恒 {matches:false} / descriptions 恒空 / extract 恒 null）是
 * 旧仓 external builds 的真实交付形态，非残留守空壳——行为面全部可测
 *（tests/unit/bash-classifier-stub.test.ts 判别：PROMPT_PREFIX 单一事实
 * 源 / createPromptRuleContent 拼接 + trim / enabled=false / classify
 * no-op 形状 / generateGenericDescription ?? null）。
 *
 * 零活消费者 → 前向登记（H6 前向声明，非静默遗漏）：auto-mode 纵切波
 * 分类器族 ~3030L（yoloClassifier / classifierShared / bashPermissions
 * L1378-1490 speculative 族，§8.31 裁定 ① 口径）消费本文件；matrix
 * missing 行「bash prompt 分类器消费」随之解锁。
 */

// Stub for external builds - classifier permissions feature is ANT-ONLY

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
