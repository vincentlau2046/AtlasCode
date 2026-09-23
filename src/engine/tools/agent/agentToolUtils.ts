/**
 * engine/tools/agent — AgentTool 工具解析 / spawn 深度 / 终态收集（§8.25 E-2 T-5b）
 *
 * 旧仓 tools/AgentTool/agentToolUtils.ts 裁剪版真核心：
 *   - computeChildSpawnDepth（spawn 深度门，纯函数可单测，旧仓逐字）
 *   - filterToolsForAgent / resolveAgentTools（工具面解析：通配 / 禁用 / mcp__ 透传 /
 *     Agent 工具 fan-out carve-out）
 *   - countToolUses / finalizeAgentTool（终态收集：末位 assistant 文本 + tool_use 计数）
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 工具名集（ALL_AGENT_DISALLOWED / CUSTOM）T-5e 起经 toolNames 单一事实源消费
 *     （完整 6 项 ALL 集；feature('WORKFLOW_SCRIPTS') 条件项 Workflow 不入静态集，
 *     登记于 toolNames 头注）。T-5b 的本地裁剪集（仅 {Agent}）已撤。
 *   - filterToolsForAgent 的 in-process teammate carve-out + ExitPlanModeV2 plan 门
 *     → E-4 S-4d 裁定（§8.36）：plan 门只重登记不硬填（新仓无 isAsync 机制 /
 *     teammate 状态窗口；IN_PROCESS_TEAMMATE_ALLOWED_TOOLS 已 toolNames 单一事实源，
 *     其 5 工具不在 ALL_AGENT_DISALLOWED 集 → carve-out 支在新仓集合下为空，
 *     teammate 面随 swarm 波；前向接缝头注重登记防「以为已全」）。
 *   - resolveAgentTools 的 spec / disallowedTools 解析 → E-4 S-4d 已落域
 *     permissionRuleValueFromString（旧仓逐字，替 S-2 split(':') 截断）；
 *     allowedAgentTypes 解析（Agent 工具 spec 携带 agent 类型元数据）仍残留守
 *     （swarm 面，Agent(agentTypes) 语法随 getDenyRuleForAgent 消费点落）。
 *   - ResolvedAgentTools.validTools / invalidTools 仅测试消费，src 无生产消费点
 *     （AgentTool.call 只读 .resolvedTools）→ 残留守（validateAgent 校验面，D 波；
 *     本版保留字段供测试断言，头注登记防「以为已全」）。
 *   - agentToolResultSchema（旧仓 zod）→ 此处用纯 TS 接口 AgentToolResult 替代（新仓工具面
 *     不引 zod；schema 校验面归 E-2 复合 schema 校验纵切）。
 *   - emitTaskProgress / classifyHandoffIfNeeded / runAsyncAgentLifecycle / extractPartialResult
 *     （异步 agent 生命周期 + transcript 分类器 handoff 门）→ 残留守（异步 agent + 遥测面）。
 *     finalizeAgentTool 的 metadata 随之仅保留消费字段（agentType/startTime）；旧仓
 *     prompt/isAsync 两 metadata 字段随异步生命周期切片回填（本版无消费点，不留死接缝）。
 */
import type { Message, Tool, Tools } from '../../../shared'

/** usage 数值字段（旧仓 ModelUsage 裁剪；避免跨域 import，字段与 provider 返回值兼容）。 */
type UsageFields = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}
import { AGENT_TOOL_NAME } from './constants'
import type { AgentDefinition } from './agentDefinition'
import {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
} from '../toolNames'
import { permissionRuleValueFromString } from '../../../permissions'

export interface ResolvedAgentTools {
  hasWildcard: boolean
  validTools: string[]
  invalidTools: string[]
  resolvedTools: Tools
}

/**
 * 按 agent 定义过滤可用工具面（旧仓 filterToolsForAgent 裁剪）。
 *   - mcp__ 工具对所有 agent 放行（一等注册 Tool，见 engine/tools/mcp）。
 *   - Agent 工具仅当 allowFanOut（coordinator + 深度门）放行（fan-out carve-out）。
 *   - 否则命中禁用集（内建/自定义 / 异步白名单外）→ 剔除。
 */
export function filterToolsForAgent({
  tools,
  isBuiltIn,
  allowFanOut = false,
}: {
  tools: Tools
  isBuiltIn: boolean
  allowFanOut?: boolean
}): Tools {
  return tools.filter((tool) => {
    if (tool.name.startsWith('mcp__')) return true
    if (tool.name === AGENT_TOOL_NAME && allowFanOut) return true
    if (ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false
    if (!isBuiltIn && CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) return false
    // 异步白名单门裁剪：本版核心跑同步 agent（异步路径残留守）；isAsync 白名单集
    // （ASYNC_AGENT_ALLOWED_TOOLS，T-5e 已落 toolNames 单一事实源）随 isAsync 分支机制
    // 回填时消费（本版不声明 isAsync 接缝，防死接缝）。
    return true
  })
}

/**
 * 纯：Agent 工具调用将创建的子 agent 的 spawn 深度（旧仓 computeChildSpawnDepth 逐字）。
 * 主线程（coordinator）options 无 spawnDepth → 0，其首个 worker 深度 1。
 */
export function computeChildSpawnDepth(
  parentOptions: { spawnDepth?: number } | undefined,
): number {
  return (parentOptions?.spawnDepth ?? 0) + 1
}

/**
 * 解析 + 校验 agent 工具面（旧仓 resolveAgentTools 裁剪）：通配 / 按名解析 / 禁用集剔除。
 * isMainThread=true 跳过 filterToolsForAgent（主线程工具面已由组合根装配，子 agent 禁用集不适用）。
 */
export function resolveAgentTools(
  agentDefinition: Pick<
    AgentDefinition,
    'tools' | 'disallowedTools' | 'source'
  >,
  availableTools: Tools,
  allowFanOut = false,
): ResolvedAgentTools {
  const { tools: agentTools, disallowedTools, source } = agentDefinition
  const filtered = filterToolsForAgent({
    tools: availableTools,
    isBuiltIn: source === 'built-in',
    allowFanOut,
  })

  // E-4 S-4d：disallowedTools spec 经 S-4a parser 取 toolName（旧仓 verbatim——
  // spec `Bash(*)` 剔除整个 Bash 工具，非字面名匹配）
  const disallowed = new Set(
    (disallowedTools ?? []).map(spec => permissionRuleValueFromString(spec).toolName),
  )
  const allowed = filtered.filter((tool) => !disallowed.has(tool.name))

  // 通配（undefined 或 ['*']）→ 全量（剔禁用后）
  const hasWildcard =
    agentTools === undefined ||
    (agentTools.length === 1 && agentTools[0] === '*')
  if (hasWildcard) {
    return { hasWildcard: true, validTools: [], invalidTools: [], resolvedTools: allowed }
  }

  const byName = new Map<string, Tool>()
  for (const tool of allowed) byName.set(tool.name, tool)

  const validTools: string[] = []
  const invalidTools: string[] = []
  const resolved: Tool[] = []
  const seen = new Set<Tool>()
  for (const spec of agentTools) {
    // E-4 S-4d：spec 经 S-4a parser 解析（旧仓 verbatim）——`Bash(npm install)`
    // → toolName 'Bash'（ruleContent 保留在 validTools spec 串中）；替 S-2
    // split(':') 截断（固有误判：带括号 spec 整体查表落 invalidTools）
    const { toolName } = permissionRuleValueFromString(spec)
    const tool = byName.get(toolName)
    if (tool) {
      validTools.push(spec)
      if (!seen.has(tool)) {
        resolved.push(tool)
        seen.add(tool)
      }
    } else {
      invalidTools.push(spec)
    }
  }

  return { hasWildcard: false, validTools, invalidTools, resolvedTools: resolved }
}

/** 统计消息序列中的 tool_use 块总数（旧仓 countToolUses 语义）。 */
export function countToolUses(messages: readonly Message[]): number {
  let count = 0
  for (const m of messages) {
    if (m.type !== 'assistant') continue
    const content = messageBlocks(m)
    for (const b of content) {
      if (b.type === 'tool_use') count++
    }
  }
  return count
}

/** agent 终态结果（旧仓 agentToolResultSchema 裁剪为纯 TS 接口）。 */
export interface AgentToolResult {
  agentId: string
  agentType?: string
  /** 末位 assistant 文本块（纯 tool_use 终态时回退到最近含文本的 assistant 消息）。 */
  content: Array<{ type: 'text'; text: string }>
  totalTokens: number
  totalToolUseCount: number
  totalDurationMs: number
  usage?: UsageFields
}

/** 取消息的 content 块数组（新仓 assistant/user 消息块在 `message.content`；兜底顶层 `content`）。 */
function messageBlocks(m: Message): Array<{ type: string; text?: unknown; [k: string]: unknown }> {
  const raw = (m.message as { content?: unknown } | undefined)?.content ?? m.content
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (b): b is { type: string; text?: unknown; [k: string]: unknown } =>
      !!b && typeof (b as { type?: unknown }).type === 'string',
  )
}

/** 末位 assistant 的文本块（纯 tool_use 时回退到最近含文本的 assistant 消息，旧仓同义）。 */
function extractFinalText(
  messages: readonly Message[],
): Array<{ type: 'text'; text: string }> {
  const lastAssistant = [...messages].reverse().find((m) => m.type === 'assistant')
  if (!lastAssistant) return []
  const textBlocks = messageBlocks(lastAssistant).filter(
    (b): b is { type: string; text: string } =>
      b.type === 'text' && typeof b.text === 'string',
  )
  if (textBlocks.length > 0) return textBlocks.map((b) => ({ type: 'text', text: b.text }))
  // 回退：最近的含文本 assistant 消息（旧仓 finalizeAgentTool 同逻辑）
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.type !== 'assistant') continue
    const blocks = messageBlocks(m).filter(
      (b): b is { type: string; text: string } =>
        b.type === 'text' && typeof b.text === 'string',
    )
    if (blocks.length > 0) return blocks.map((b) => ({ type: 'text', text: b.text }))
  }
  return []
}

/** usage 求和（旧仓 getTokenCountFromUsage 语义：四数值字段求和，缺省 0）。 */
function sumUsage(usage: unknown): number {
  const u = usage as Partial<UsageFields> | undefined
  if (!u) return 0
  return (
    (u.input_tokens ?? 0) +
    (u.output_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0)
  )
}

/** 从 agent 消息序列收集终态（旧仓 finalizeAgentTool 裁剪：文本 + tool_use 计数 + token）。 */
export function finalizeAgentTool(
  agentMessages: readonly Message[],
  agentId: string,
  metadata: {
    agentType?: string
    startTime: number
  },
): AgentToolResult {
  const { agentType, startTime } = metadata
  const lastAssistant = [...agentMessages].reverse().find((m) => m.type === 'assistant')
  const usage = (lastAssistant?.message as { usage?: unknown } | undefined)?.usage
  return {
    agentId,
    ...(agentType ? { agentType } : {}),
    content: extractFinalText(agentMessages),
    totalTokens: sumUsage(usage),
    totalToolUseCount: countToolUses(agentMessages),
    totalDurationMs: Date.now() - startTime,
    ...(usage ? { usage: usage as UsageFields } : {}),
  }
}
