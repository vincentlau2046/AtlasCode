/**
 * W3-3c-2（§8.74.19）：LlmQueryOptions 从 orchestrator llm/query.ts（(a) 类
 * 删集）迁出——唯一消费方 = services/api/metadata.ts（`taskBudget:
 * LlmQueryOptions['taskBudget']` 索引面）。旧仓 12号§11.5.2 改名裁定
 * （泛名 Options 防污染根 API）随迁保留。
 */
import type {
  BetaJSONOutputFormat,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
  ClientOptions,
} from 'src/tui/types/atlas.js'
import type { QuerySource } from 'src/tui/constants/querySource.js'
import type { AgentDefinition } from 'src/tui/tools/AgentTool/loadAgentsDir.js'
import type {
  QueryChainTracking,
  ToolPermissionContext,
  Tools,
} from 'src/tui/Tool.js'
import type { AgentId } from 'src/tui/types/ids.js'
import type { Notification } from 'src/tui/context/notifications.js'
import type { EffortValue } from 'src/tui/utils/effort.js'

export type LlmQueryOptions = {
  getToolPermissionContext: () => Promise<ToolPermissionContext>
  model: string
  toolChoice?: BetaToolChoiceTool | BetaToolChoiceAuto | undefined
  isNonInteractiveSession: boolean
  extraToolSchemas?: BetaToolUnion[]
  maxOutputTokensOverride?: number
  fallbackModel?: string
  onStreamingFallback?: () => void
  querySource: QuerySource
  agents: AgentDefinition[]
  allowedAgentTypes?: string[]
  hasAppendSystemPrompt: boolean
  fetchOverride?: ClientOptions['fetch']
  enablePromptCaching?: boolean
  skipCacheWrite?: boolean
  temperatureOverride?: number
  effortValue?: EffortValue
  mcpTools: Tools
  hasPendingMcpServers?: boolean
  queryTracking?: QueryChainTracking
  agentId?: AgentId // Only set for subagents
  outputFormat?: BetaJSONOutputFormat
  advisorModel?: string
  addNotification?: (notif: Notification) => void
  // API-side task budget (output_config.task_budget). Distinct from the
  // tokenBudget.ts +500k auto-continue feature — this one is sent to the API
  // so the model can pace itself. `remaining` is computed by the caller
  // (query.ts decrements across the agentic loop).
  taskBudget?: { total: number; remaining?: number }
}
