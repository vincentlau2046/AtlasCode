export type SDKMessage = any;
export type SDKResultMessage = any;
export type SDKUserMessage = any;
export type SDKResultSuccess = any;
export type SDKResultError = any;
export type SDKThinkingMessage = any;
export type SDKThinkingBlock = any;
export type SDKContentBlock = any;
export type SDKSessionInfo = any;
export type SDKCompactBoundaryMessage = any;
export type SDKRateLimitInfo = any;
export type SDKStatus = any;
export type SDKPermissionDenial = any;
export type SDKToolUseBlock = any;
export type SDKToolResultBlock = any;
export type SDKTextBlock = any;
export type SDKImageBlock = any;
export type SDKAssistantMessage = any;

// Value exports for Bun runtime (type exports are erased during transpilation)
export const SDKMessage: any = null
export const SDKResultMessage: any = null
export const SDKUserMessage: any = null
export const SDKResultSuccess: any = null
export const SDKResultError: any = null
export const SDKThinkingMessage: any = null
export const SDKThinkingBlock: any = null
export const SDKContentBlock: any = null
export const SDKSessionInfo: any = null
export const SDKCompactBoundaryMessage: any = null
export const SDKRateLimitInfo: any = null
export const SDKStatus: any = null
export const SDKPermissionDenial: any = null
export const SDKToolUseBlock: any = null
export const SDKToolResultBlock: any = null
export const SDKTextBlock: any = null
export const SDKImageBlock: any = null
export const SDKAssistantMessage: any = null

// HOOK_EVENTS is re-exported from coreSchemas (the single source of truth for
// the full event list) — the old 7-event inline copy here missed events the
// runtime emits (SubagentStop/Setup/SubagentStart/...), which made the hook
// zod schemas (z.enum(HOOK_EVENTS)) reject valid plugin hooks.json files.
export { HOOK_EVENTS } from './coreSchemas.js';
