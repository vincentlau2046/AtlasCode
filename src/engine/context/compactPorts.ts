/**
 * engine/context — compact 富路径 DI 端口（D-2a S3，M5 切端）：
 * 富 compactConversation 体的 LLM-bound / tui 耦合叶端口——engine 本体
 * 零 tui 依赖（React-free 红线），宿主（tui）经 setCompactPorts 注真实现
 * （S8 切端接线：tui 侧富 helper 簇挂上本端口面）；未注册时富路径显式
 * 报错（不静默退化——S8 前 TUI 仍走 orchestrator 富体，engine 富路径
 * 仅在端口注册后可达）。
 *
 * 结构 duck（CompactContext / CacheSafeParams）= 旧仓 ToolUseContext /
 * CacheSafeParams 的 engine 等价最小面——只声明富体实际读到的字段；
 * tui 侧 ToolUseContext 结构可赋（S8 接线点零 cast 或单点 cast）。
 */
import type { Message } from '../../shared'
import type { AttachmentMessage, HookResultMessage } from './compact'

/** 压缩进度事件（旧 tui/Tool.ts CompactProgressEvent 逐字结构面）。 */
export type CompactProgressEvent =
  | { type: 'hooks_start'; hookType: 'pre_compact' | 'post_compact' | 'session_start' }
  | { type: 'compact_start' }
  | { type: 'compact_end' }

/** CompactContext.options 最小面（旧 ToolUseContext.options 消费子集）。 */
export interface CompactOptions {
  tools?: unknown
  mainLoopModel?: string
  mcpClients?: unknown
  isNonInteractiveSession?: boolean
  appendSystemPrompt?: string
  querySource?: string
  agentDefinitions?: { activeAgents?: unknown[]; allowedAgentTypes?: string[] }
}

/**
 * 富 compact 上下文 duck（旧 ToolUseContext 消费子集，富体 374-677 +
 * streamCompactSummary 995-1214 实际读面）；UI setter 全可选（engine
 * 无宿主时 no-op 语义 = 未注 = 不呼）。
 */
export interface CompactContext {
  agentId?: string
  abortController: AbortController
  /** FileStateCache 结构面（entries/clear；LRU 包装，非原生 Map）。 */
  readFileState: {
    clear(): void
    entries(): IterableIterator<[string, { content: string; timestamp: number }]>
  }
  loadedNestedMemoryPaths?: { clear(): void }
  options: CompactOptions
  getAppState: () => {
    toolPermissionContext?: unknown
    tasks?: Record<string, unknown>
    effortValue?: unknown
  }
  onCompactProgress?: (event: CompactProgressEvent) => void
  addNotification?: (notification: {
    key: string
    text: string
    priority?: string
    color?: string
  }) => void
  setSDKStatus?: (status: string | null) => void
  setStreamMode?: (mode: string) => void
  setResponseLength?: (f: (prev: number) => number) => void
}

/**
 * 缓存安全参数（旧 tui/utils/forkedAgent.ts:56 结构面）：fork 摘要路径
 * 复用主会话 prompt cache 的参数束；PTL 重试只改 forkContextMessages。
 */
export interface CacheSafeParams {
  systemPrompt: unknown
  userContext: Record<string, string>
  systemContext: Record<string, string>
  toolUseContext?: unknown
  forkContextMessages: Message[]
}

/**
 * 压缩诊断上下文（旧 tui orchestrator compact.ts RecompactionInfo 逐字
 * 结构面）：autoCompactIfNeeded → compactConversation 传参，atlas_compact
 * 事件同链/跨 agent 判别。
 */
export interface RecompactionInfo {
  isRecompactionInChain: boolean
  turnsSincePreviousCompact: number
  previousCompactTurnId?: string
  autoCompactThreshold: number
  querySource?: string
}

export interface PreCompactHookResult {
  newCustomInstructions?: string
  userDisplayMessage?: string
}

export interface PostCompactHookResult {
  userDisplayMessage?: string
}

/**
 * 富 compact 宿主端口面：
 *  - summarize = LLM 摘要（fork 支 + 流式兜底；返回完整 assistant 消息，
 *    PTL 判定经 getAssistantMessageText 文本前缀）
 *  - executePre/PostCompactHooks / processSessionStartHooks = hook 执行器
 *    （engine hooks 域 5 高频执行器不含 Pre/PostCompact = tui 宿主注）
 *  - buildPostCompactAttachments = 附件重建簇（file/plan/skill/
 *    deferred-tools/MCP 重宣告；文件 IO + 模块态，宿主注）
 *  - markPostCompaction / notifyCompaction = 宿主模块态重置缝（旧仓
 *    bootstrapState 在本 fork 为 stub，端口化后宿主按需注）
 */
export interface CompactPorts {
  summarize: (params: {
    messages: Message[]
    summaryRequest: Message
    preCompactTokenCount: number
    cacheSafeParams: CacheSafeParams
    signal: AbortSignal
    onProgress?: (event: CompactProgressEvent) => void
  }) => Promise<Message>
  executePreCompactHooks: (
    data: { trigger: 'manual' | 'auto'; customInstructions: string | null },
    signal?: AbortSignal,
  ) => Promise<PreCompactHookResult>
  executePostCompactHooks: (
    data: { trigger: 'manual' | 'auto'; compactSummary: string },
    signal?: AbortSignal,
  ) => Promise<PostCompactHookResult>
  processSessionStartHooks: (
    source: 'compact',
    opts?: { model?: string },
  ) => Promise<HookResultMessage[]>
  buildPostCompactAttachments: (
    preCompactReadFileState: Record<string, { content: string; timestamp: number }>,
    context: CompactContext,
  ) => Promise<AttachmentMessage[]>
  markPostCompaction?: () => void
  notifyCompaction?: (querySource: string, agentId?: string) => void
}

let ports: CompactPorts | null = null

/** 宿主注端口（S8 tui 接线）；传 null 复位（单测 teardown）。 */
export function setCompactPorts(next: CompactPorts | null): void {
  ports = next
}

export function getCompactPorts(): CompactPorts | null {
  return ports
}
