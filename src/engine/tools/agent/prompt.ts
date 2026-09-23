/**
 * engine/tools/agent — AgentTool description/prompt（§8.25 E-2 T-5b 裁剪）
 *
 * 旧仓 tools/AgentTool/prompt.ts getPrompt(agents) 裁剪版：最小委托描述。旧仓会遍历
 * 全部内建 agent 生成「可用 agent 类型 + whenToUse」清单 → 残留守（T-5c 内建注册表
 * 落时补全清单，本函数签名保持 getPrompt(agents) 便于 T-5c 增强）。
 */
import { AGENT_TOOL_NAME } from './constants'
import type { AgentDefinition } from './agentDefinition'

/** Agent 工具描述（最小委托语义；agent 类型清单归 T-5c）。 */
export function getPrompt(agents: readonly AgentDefinition[]): string {
  const typeList =
    agents.length > 0
      ? agents.map((a) => a.agentType).join(', ')
      : 'general-purpose'
  return (
    'Launch a subagent to run a self-contained task in an isolated context. ' +
    'Provide a short description (3-5 words) and a fully self-contained prompt ' +
    '(the subagent cannot see this conversation). ' +
    `Available subagent_type: ${typeList}. ` +
    `The ${AGENT_TOOL_NAME} tool returns the subagent's final result when it completes.`
  )
}
