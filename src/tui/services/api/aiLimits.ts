/**
 * Atlas usage tracking — tracks iff gateway token consumption.
 * Replaces claude-code's ClaudeAiLimits (Anthropic subscriber limits).
 */
export interface UsageInfo {
  tokensUsed: number;
  tokensLimit: number;
  costEstimate: number;
}

let currentUsage: UsageInfo = { tokensUsed: 0, tokensLimit: 100_000, costEstimate: 0 };

export function trackUsage(tokens: number): void {
  currentUsage.tokensUsed += tokens;
}

export function getUsage(): UsageInfo {
  return { ...currentUsage };
}

export function resetUsage(): void {
  currentUsage = { tokensUsed: 0, tokensLimit: 100_000, costEstimate: 0 };
}

// Stub: React hook compatibility
export const currentLimits = { tokensUsed: 0, tokensLimit: 100_000 };
export const statusListeners = new Set<() => void>();
