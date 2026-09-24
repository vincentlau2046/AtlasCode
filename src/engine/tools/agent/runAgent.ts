/**
 * engine/tools/agent — runAgent 子代理执行（§8.25 E-2 T-5b 裁剪版真核心）
 *
 * 旧仓 tools/AgentTool/runAgent.ts（880L 生成器）裁剪到最小可运行核心：
 *   子代理上下文构建（system prompt 前置消息 + prompt + 可选 fork 上下文）
 *   → 复用 engine/query 的 queryAgentLoop（E-1b 多轮循环，非重造 LLM 循环）
 *   → 终态收集（finalizeAgentTool）。
 *
 * 模型 override 映射（旧仓 getAgentModel 的 ModelAlias 链 → 新仓 ModelRole）：
 *   precedence = overrideRole（AgentTool input.model）> agentDefinition.model > parentRole。
 *   旧仓 aliasMatchesParentTier（同 tier 继承父 exact model）随「role 取代 model 字符串」
 *   语义消失 → 残留守（不迁移）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧仓 runAgent 生成器 yield 逐消息（transcript 记录 / sidechain 持久化 / perfetto
 *     trace / pushApiMetrics TTFT）→ 裁剪（本版 queryAgentLoop 返回完整序列，一次性收集；
 *     transcript / 遥测归后续纵切）。
 *   - initializeAgentMcpServers（agent frontmatter MCP 服务器连接 + 清理）→ 残留守
 *     （连接层 T-5a port 已落，agent frontmatter MCP 面归后续纵切）。
 *   - executeSubagentStartHooks / registerFrontmatterHooks（agent 生命周期钩子）
 *     → 残留守（未来 hooks-runner 全量波 / 插件面——§8.41 R6 重登记口径：E-5 整波
 *     范围（§8.38/§8.41）不含子代理生命周期钩子，§8.42 审视归属双源订正）。
 *   - skills 预载（agent frontmatter skills → 内建命令内容）→ 残留守（skill 面）。
 *   - createSubagentContext（读文件状态缓存克隆 / 会话作用域 AppState 写）→ 裁剪
 *     （新仓子代理共享组合根 modelProvider，无独立文件状态缓存面）。
 *   - 异步 agent 生命周期（runAsyncAgentLifecycle / enqueueAgentNotification / 后台摘要
 *     summarization / teammate 共享任务面）→ 残留守（异步 agent + 遥测面）。
 *   - 子代理 pre-turn autoCompact / tokenBudget continuation → 残留守
 *     （queryAgentLoop 未注入 context = 不压缩）。
 *   - per-agent maxTurns：T-5b 不暴露该字段（queryAgentLoop 的 maxTurns 只能经
 *     AgentLoopContextConfig 注入，而该配置捆绑 autoCompact 依赖——子代理压缩面未落；
 *     故本版走默认 DEFAULT_AGENT_LOOP_MAX_TURNS，maxTurns 随子代理 context/压缩面
 *     纵切一并接线，避免「声明了却不消费」的死接缝）。
 *   - 系统提示词前置为 `type:'system'` 消息，但 modelprovider `toOpenAIMessages` 目前把
 *     系统消息序列化为 `role:'user'`（既有行为，非 T-5b 引入）→ 子代理 system prompt
 *     实际以 user 角色进 API；正解需 modelprovider 支持 `role:'system'`（E-wave-end /
 *     modelprovider 面），登记为已知残留守。
 *   - filterIncompleteToolCalls（fork 上下文孤儿 tool_use 过滤）→ 残留守（fork 纵切 T-5c）。
 *   - 权限门透传（E-4 S-4d 后审视 F1，§8.37）：runAgent 的 queryAgentLoop 调用点
 *     不带 checkPermission / ToolPermissionContext——旧仓子代理经
 *     checkRuleBasedPermissions 的全局 appState.toolPermissionContext 天然共享
 *     同一规则树，新仓门为组合根注入（createPermissionGate）→ 子代理门 /
 *     上下文透传归 E-wave-end compose 装配（前向接缝登记；当前 pipeline 面
 *     ctx.tools 为空暂无活洞，属行为回归开口——deny/ask 规则经 spawn 绕过
 *     子代理执行）。
 */
import type { Message, Tools } from '../../../shared'
import type { ModelProvider, ModelRole } from '../../../modelprovider'
import { queryAgentLoop, type AgentLoopResult } from '../../query'
import type { AgentDefinition } from './agentDefinition'
import { finalizeAgentTool, type AgentToolResult } from './agentToolUtils'

export interface RunAgentArgs {
  agentDefinition: AgentDefinition
  /** 子代理任务 prompt（自包含，子代理看不到父会话）。 */
  prompt: string
  /** 子代理工具池（AgentTool.call 经 resolveAgentTools 预解析）。 */
  tools: Tools
  modelProvider: ModelProvider
  /** 父线程 role（'inherit' 语义：子代理未指定模型时回落此）。 */
  parentRole: ModelRole
  /** AgentTool input.model override（优先级最高）。 */
  overrideRole?: ModelRole
  /** 由 AgentTool.call 生成的 agent 标识（终态收集用）。 */
  agentId: string
  /** coordinator spawn 深度（透传 getSystemPrompt 条件渲染 fan-out 子句）。 */
  spawnDepth?: number
  signal?: AbortSignal
  /** fork 子代理上下文（T-5c fork 路径；本版保留参数，孤儿 tool_use 过滤残留守）。 */
  forkContextMessages?: Message[]
}

export interface RunAgentResult {
  result: AgentToolResult
  /** 完整消息序列（system + prompt + 各轮 assistant / tool_result）。 */
  messages: Message[]
  /** 是否自然终止（false = 被 maxTurns 截断）。 */
  terminated: boolean
  turns: number
}

/** 模型 role 解析（旧仓 getAgentModel 优先级裁剪：override > agentDef > parent）。 */
function resolveRole(
  overrideRole: ModelRole | undefined,
  agentDef: AgentDefinition,
  parentRole: ModelRole,
): ModelRole {
  return overrideRole ?? agentDef.model ?? parentRole
}

/**
 * 跑一个子代理到终态（复用 queryAgentLoop）。system prompt 前置为系统消息（新仓
 * queryAgentLoop 无 systemPrompt 参，见残留守），prompt + 可选 fork 上下文入消息序列。
 */
export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
  const {
    agentDefinition,
    prompt,
    tools,
    modelProvider,
    parentRole,
    overrideRole,
    agentId,
    spawnDepth,
    signal,
    forkContextMessages,
  } = args

  const role = resolveRole(overrideRole, agentDefinition, parentRole)
  const startTime = Date.now()

  // 子代理上下文：system 前置 + fork 上下文（T-5c）+ 用户 prompt。
  const systemText = await agentDefinition.getSystemPrompt({ spawnDepth })
  const messages: Message[] = [
    { type: 'system', role: 'system', content: systemText },
    ...(forkContextMessages ?? []),
    { type: 'user', role: 'user', content: prompt },
  ]

  const loopResult: AgentLoopResult = await queryAgentLoop(
    { modelProvider, role, signal },
    { messages, tools },
  )

  const result = finalizeAgentTool(loopResult.messages, agentId, {
    agentType: agentDefinition.agentType,
    startTime,
  })

  return {
    result,
    messages: loopResult.messages,
    terminated: loopResult.terminated,
    turns: loopResult.turns,
  }
}
