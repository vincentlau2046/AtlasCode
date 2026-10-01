export interface ContentBlock { type: string; [key: string]: any; }
export interface ContentBlockParam { type: string; [key: string]: any; }
export interface Usage { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; [key: string]: any; }
export interface ToolUseBlock extends ContentBlock { type: 'tool_use'; id: string; name: string; input: any; }
export interface ToolResultBlockParam extends ContentBlockParam { type: 'tool_result'; tool_use_id: string; content?: string | ContentBlockParam[]; is_error?: boolean; }
export type TextBlock = ContentBlock & { type: 'text'; text: string; };
export type ImageBlock = ContentBlock & { type: 'image'; source: any; };
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature: string; };
export type RedactedThinkingBlock = { type: 'redacted_thinking'; data: string; };
export type MessageParam = { role: string; content: string | ContentBlockParam[]; };
export type MessageCreateParams = { model: string; messages: MessageParam[]; max_tokens: number; system?: string | any[]; tools?: any[]; temperature?: number; stream?: boolean; metadata?: any; stop_sequences?: string[]; thinking?: any; };
export class APIError extends Error {
  status?: number;
  code?: string;
  headers?: any;
  [k: string]: any;
  constructor(message?: string, opts?: any) {
    super(message ?? 'API error');
    this.name = 'APIError';
    if (opts) {
      this.status = opts.status;
      this.code = opts.code;
      this.headers = opts.headers;
    }
  }
}
export class RateLimitError extends APIError {
  retryAfter?: number;
  constructor(message?: string, opts?: any) {
    super(message, opts);
    this.name = 'RateLimitError';
    if (opts) this.retryAfter = opts.retryAfter;
  }
}
export class AuthenticationError extends APIError {
  constructor(message?: string, opts?: any) {
    super(message, opts);
    this.name = 'AuthenticationError';
  }
}


export type Stream<T = any> = any;

// ── P1.1 residual: additional Anthropic-compat exports ──
export type Base64ImageSource = any;
export type BetaImageBlockParam = any;
export type BetaJSONOutputFormat = any;
export type BetaMessage = any;
export type BetaMessageDeltaUsage = Usage;
export type BetaMessageStreamParams = any;
export type BetaOutputConfig = any;
export type BetaRawMessageStreamEvent = any;
export type BetaRequestDocumentBlock = any;
export type BetaStopReason = any;
export type BetaTool = any;
export type BetaToolChoiceAuto = any;
export type BetaToolChoiceTool = any;
export type BetaToolUnion = any;
export type BetaUsage = Usage;
export type BetaWebSearchTool20250305 = any;
export type ClientOptions = any;
export class NotFoundError extends APIError { }
export class APIConnectionError extends APIError { }
export class APIConnectionTimeoutError extends APIError { }
export class APIUserAbortError extends APIError { }
/**
 * De-Anthropic-ification (P1): abstract client interface. Provider
 * SDK clients (now the OpenAI-protocol gateway client) are cast to
 * this interface. Callers type against `AtlasClient`.
 */
export interface AtlasClient {
  messages: any;
  beta: any;
  models: any;
}



// P1.1 residual: content-block / beta param stubs
export type TextBlockParam = any;
export type ImageBlockParam = any;
export type ToolUseBlockParam = any;
export type ThinkingBlockParam = any;
export type RedactedThinkingBlockParam = any;
export type BetaContentBlock = any;
export type BetaContentBlockParam = any;
export type BetaToolUseBlock = any;
export type BetaToolResultBlockParam = any;
export type BetaThinkingBlock = any;
export type BetaRedactedThinkingBlock = any;
export type BetaMessageParam = any;
export type ToolChoice = any;
export type ToolInputSchema = any;
export type BetaToolUseBlockParam = any;
export type BetaThinkingConfigParam = any;
