/**
 * modelprovider 域常量 — 从旧仓 constants/apiLimits.ts + constants/betas.ts 迁入
 *
 * charter L3 modelprovider 自治：apiLimits/betas 常量自管（不再依赖域外 constants/）。
 * betas 中 feature() 门控项经 shared/feature.ts（已迁移，非 bun:bundle）。
 */

import { feature } from '../shared'

// ════════════════════════════════════════════════════════════════
// API Limits（旧仓 constants/apiLimits.ts）
// ════════════════════════════════════════════════════════════════

export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024 // 5 MB
export const IMAGE_TARGET_RAW_SIZE = (API_IMAGE_MAX_BASE64_SIZE * 3) / 4 // 3.75 MB
export const PDF_TARGET_RAW_SIZE = 20 * 1024 * 1024 // 20 MB
export const API_PDF_MAX_PAGES = 100

// ════════════════════════════════════════════════════════════════
// Beta Headers（旧仓 constants/betas.ts）
// ════════════════════════════════════════════════════════════════

export const ATLAS_20250219_BETA_HEADER = 'claude-code-20250219'
export const INTERLEAVED_THINKING_BETA_HEADER = 'interleaved-thinking-2025-05-14'
export const CONTEXT_MANAGEMENT_BETA_HEADER = 'context-management-2026-06-27'
export const STRUCTURED_OUTPUTS_BETA_HEADER = 'structured-outputs-2025-12-15'
export const WEB_SEARCH_BETA_HEADER = 'web-search-2025-03-05'
export const TOOL_SEARCH_BETA_HEADER_1P = 'advanced-tool-use-2025-11-20'
export const TOOL_SEARCH_BETA_HEADER_3P = 'tool-search-tool-2025-10-19'
export const EFFORT_BETA_HEADER = 'effort-2025-11-24'
export const TASK_BUDGETS_BETA_HEADER = 'task-budgets-2026-03-13'
export const PROMPT_CACHING_SCOPE_BETA_HEADER = 'prompt-caching-scope-2026-01-05'
export const REDACT_THINKING_BETA_HEADER = 'redact-thinking-2026-02-12'
export const TOKEN_EFFICIENT_TOOLS_BETA_HEADER = 'token-efficient-tools-2026-03-28'
export const ADVISOR_BETA_HEADER = 'advisor-tool-2026-03-01'
export const CLI_INTERNAL_BETA_HEADER = ''

export const SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER = feature('CONNECTOR_TEXT')
  ? 'summarize-connector-text-2026-03-13'
  : ''

export const AFK_MODE_BETA_HEADER = feature('TRANSCRIPT_CLASSIFIER')
  ? 'afk-mode-2026-01-31'
  : ''

// 旧仓 = any stub（({}) as any），保留形态
export const CACHE_EDITING_BETA_HEADER: any = (() => ({})) as any
