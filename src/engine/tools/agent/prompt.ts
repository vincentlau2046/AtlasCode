/**
 * engine/tools/agent — AgentTool description/prompt（§8.25 E-2 T-5b 裁剪，T-5c 补全清单）
 *
 * 旧仓 tools/AgentTool/prompt.ts getPrompt 裁剪版：保留 agent 类型清单渲染
 * （formatAgentLine = `- type: whenToUse (Tools: ...)`，旧仓 prompt.ts:42-45 逐字语义）+
 * getToolsDescription（旧仓 prompt.ts:14-36 逐字语义）。T-5c 起 whenToUse / tools /
 * disallowedTools 经此清单面获得描述消费（resolveAgentTools 为执行面消费）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧仓 getPrompt 的 fork 章节（When to fork + fork 示例 + isForkSubagentEnabled 门）
 *     + 附件注入门（shouldInjectAgentListInMessages / ATLAS_AGENT_LIST_IN_MESSAGES，
 *     agent 清单改经 attachment 消息以降低 cache_creation）+ When NOT to use 章节 +
 *     usage notes（run_in_background / SendMessage 续接 / isolation:worktree）+
 *     allowedAgentTypes 过滤（Agent(x,y) 限选）+ isCoordinator slim 分支 → 残留守
 *     （fork 路径接线 / 附件面 / 异步 agent / E-4 权限面未落；本版仅核心委托语义 + 清单）。
 */
import { AGENT_TOOL_NAME } from './constants'
import type { AgentDefinition } from './agentDefinition'

/** 渲染 agent 的工具面描述（旧仓 getToolsDescription 逐字语义）。 */
function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0
  if (hasAllowlist && hasDenylist) {
    // 两者皆定：allowlist 按 denylist 过滤（对齐运行时 resolveAgentTools 行为）。
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter((t) => !denySet.has(t))
    if (effectiveTools.length === 0) return 'None'
    return effectiveTools.join(', ')
  }
  if (hasAllowlist) return tools.join(', ')
  if (hasDenylist) return `All tools except ${disallowedTools.join(', ')}`
  return 'All tools'
}

/** 单行 agent 描述（旧仓 formatAgentLine 逐字：`- type: whenToUse (Tools: ...)`）。 */
export function formatAgentLine(agent: AgentDefinition): string {
  return `- ${agent.agentType}: ${agent.whenToUse} (Tools: ${getToolsDescription(agent)})`
}

/** Agent 工具描述（核心委托语义 + agent 类型清单，T-5c 补全 whenToUse/tools 消费）。 */
export function getPrompt(agents: readonly AgentDefinition[]): string {
  const list =
    agents.length > 0
      ? agents.map(formatAgentLine).join('\n')
      : '- general-purpose: General-purpose agent for researching and executing multi-step tasks.'
  return (
    'Launch a subagent to run a self-contained task in an isolated context. ' +
    'Provide a short description (3-5 words) and a fully self-contained prompt ' +
    '(the subagent cannot see this conversation). ' +
    `Available agent types and the tools they have access to:\n${list}\n` +
    `The ${AGENT_TOOL_NAME} tool returns the subagent's final result when it completes.`
  )
}
