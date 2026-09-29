import type { ContentBlock, ContentBlockParam, Usage, ToolUseBlock, ToolResultBlockParam } from './atlas.js';

export interface Message { role?: string; content?: any; id?: string; uuid?: string; usage?: Usage; stop_reason?: string; timestamp?: number | string; metadata?: any; type?: string; message?: any;  [key: string]: any; }
export interface UserMessage extends Message { role?: 'user'; content?: any; isImage?: boolean; }
export interface AssistantMessage extends Message { role?: 'assistant'; content?: any; stop_reason?: string; usage?: Usage; }
export interface SystemMessage extends Message { role: 'system'; }
export type SystemAPIErrorMessage = SystemMessage & { error: string; };
export type AttachmentMessage<T = any> = UserMessage & { attachment?: T; };
export type AttachmentMessageType = AttachmentMessage;
export type NormalizedMessage = { role: string; content: string; id?: string;  [key: string]: any; }
export type NormalizedUserMessage = NormalizedMessage & { role: 'user'; };
export type NormalizedAssistantMessage<T = any> = NormalizedMessage & { role: 'assistant'; data?: T; };
export type StreamEvent = any;
export type { ContentBlock, ContentBlockParam, ToolUseBlock, ToolResultBlockParam, Usage };
export type ProgressMessage<T = any> = Message & { type: "progress"; role: "progress"; content: string; message: string; percent?: number; };
export type ProgressMessageType<T = any> = ProgressMessage<T>;
export type QueueOperationMessage = { type: 'queue_operation'; operation: string; };
export type GroupedToolUseMessage = { type: 'grouped_tool_use'; tool_uses?: any[]; toolName?: string; messages?: any; results?: any; displayMessage?: any; uuid?: string; timestamp?: any; messageId?: string; };
export type GroupedToolUseMessageType = GroupedToolUseMessage;
export type HookResultMessage = { type: 'hook_result'; hookName?: string; result?: unknown; [key: string]: any; };
export type SystemThinkingMessage = SystemMessage & { thinking: string; };
export type SystemInformationalMessage = SystemMessage & { info: string; };
export type SystemBridgeStatusMessage = SystemMessage & { status: string; };
export type SystemMemorySavedMessage = SystemMessage & { memory: string; };
export type SystemStopHookSummaryMessage = SystemMessage & { summary: string; };
export type SystemTurnDurationMessage = SystemMessage & { durationMs: number; };
export type CollapsedReadSearchGroup = { type: 'collapsed_read_search'; files: string[]; [key: string]: any; };
export type CollapsedReadSearchGroupType = CollapsedReadSearchGroup;
export type PartialCompactDirection = 'older' | 'newer' | 'up_to' | 'from';
export type RenderableMessage = Message;
export type ThinkingBlock = { type: 'thinking'; thinking: string; signature: string; };
export type { ToolUseBlock as BetaToolUseBlock, Usage as BetaUsage };

// Stub types needed by consumers
export type SystemLocalCommandMessage = any;
export type CompactMetadata = any;
export type SystemFileSnapshotMessage = any;
export type SystemMemoryPressureMessage = any;
export type ToolUseSummaryMessage = any;
export type TombstoneMessage = any;
export type SystemCompactBoundaryMessage = any;
export type StopHookInfo = any;
export type MessageOrigin = any;
export type NonNullableUsage = any;
export type NotebookContent = any;
export type RequestStartEvent = any;
export type CollapsibleMessage = any;
export type SystemAgentsKilledMessage = any;
export type SystemAwaySummaryMessage = any;
export type SystemPermissionRetryMessage = any;
export type SystemScheduledTaskFireMessage = any;
export type SystemApiMetricsMessage = any;
export type SystemMessageLevel = any;
export type SystemMicrocompactBoundaryMessage = any;
