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

// LLM 请求超时（#260 P0，2026-10-03 斗兽棋 "Request timed out" 修波）

/**
 * LLM 请求缺省超时 120s→600s（#260）→ **0.1.67 用户裁 900s（15min）基线**：
 * 国产慢模型基线——用户 profile 实测 27B 模型 xhigh effort 长生成超 120s
 * （斗兽棋回合死，"Worked for 4m5s" = 3×120s 重试放大器）；用户 2026-10-14
 * 裁定 600s→15min（0.1.67 用户 bug 修插入波，用户两 PR 之一「模型超时设 15min」）。
 * env ATLAS_LLM_TIMEOUT / settings llmTimeoutMs 覆写（单位恒=毫秒）；消费点 =
 * OpenAIProvider 构造（index.ts resolveLlmTimeoutMs）+ clients.ts 客户端缺省
 * （per-request timeout 仍逐请求胜）。
 */
export const LLM_TIMEOUT_DEFAULT_MS = 900_000
/** 超时上限 30min（沿用旧语义）：防挂死/排队网关把整个 session 拖挂。 */
export const LLM_TIMEOUT_CAP_MS = 1_800_000
/**
 * 0.1.67 A-2：单位误配提示阈值——有效 LLM 超时 < 60s（60000ms）时给一次性
 * 单位提示（单位=毫秒，若按秒填写请 ×1000），不阻断（仅 stderr/debug + 错误行面）。
 */
export const LLM_TIMEOUT_UNIT_WARN_THRESHOLD_MS = 60_000

/**
 * 0.1.80 K1-E（@299 流超时件）：流空闲（stall）超时——两次 chunk 之间的最大
 * 间隔，非整请求上限（整请求上限 = LLM_TIMEOUT_DEFAULT_MS）。自定义 base URL
 * 网关流 180s 无数据即断（上游 2.1.299 → 300s 放宽）；修前本仓无流空闲看门
 * 狗（仅整请求 timeout），挂起流要等满 15min 请求超时才回收。消费点 =
 * streamOneAttempt chunk 循环（withStreamIdleWatchdog 包装）。
 */
export const STREAM_IDLE_TIMEOUT_MS = 300_000

/**
 * 0.1.81 V3-2 K2 #18（P-804s）：watchdog teardown 宽限上限——finally 释放
 * 底层迭代器时 return() 与本上限竞速。挂起型 async generator（suspended
 * mid-await）的 return() 按规范排在当前 await 之后，await 永不结算则
 * return() 永不结算——无界 await 会把超时 throw 吞成消费方无限挂死（绕过
 * 整请求 timeout 兜底，比不装看门狗更糟）。良好行为迭代器 return() 结算
 * 快于本上限 → teardown 保序不变（零回归面）。
 */
export const STREAM_IDLE_RETURN_GRACE_MS = 1_000

// ════════════════════════════════════════════════════════════════
// Beta Headers（旧仓 constants/betas.ts）
// ════════════════════════════════════════════════════════════════

// de-ant（0.1.73 C-3c）：品牌串中性化（原 1P 品牌 beta 头值 → atlas 品牌，与
// tui/constants/betas.ts 活副本值一致）。本副本 = 旧仓死面（零 import，随迁登记）。
export const ATLAS_20250219_BETA_HEADER = 'atlas-code-20250219'
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
