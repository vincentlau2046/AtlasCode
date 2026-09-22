/**
 * hooks 域 — createBaseHookInput（C-Deep 切片 3 T6）
 *
 * 旧仓来源（a8af45b）: src/utils/hooks.ts createBaseHookInput（L297）。
 * 跨域依赖（getSessionId / getCwd / getTranscriptPathForSession /
 * getMainThreadAgentType）经 bootstrap-env 注入窗口斩断（L3）。
 * agentInfo 窄参（agentId/agentType）结构性透传，不依赖 Tool.ts（同旧仓注）。
 */
import { getHooksBootstrapEnv } from './bootstrap-env'
import type { BaseHookInput } from './types'

/**
 * 造某钩子的公共基础输入（session/transcript/cwd/permission/agent）。
 * 返回 BaseHookInput（不含 hook_event_name；各事件执行器叠加事件字段成 HookInput）。
 * @param permissionMode - 可选权限模式
 * @param sessionId - 可选会话 id（缺省取 bootstrap getSessionId）
 * @param agentInfo - 窄 agent 信息（agentId/agentType），透传不引 Tool 域
 */
export function createBaseHookInput(
  permissionMode?: string,
  sessionId?: string,
  agentInfo?: { agentId?: string; agentType?: string },
): BaseHookInput {
  const b = getHooksBootstrapEnv()
  const resolvedSessionId = sessionId ?? b.getSessionId()
  // agent_type：子代理类型（来自 toolUseContext）优先于会话 --agent 标志
  const resolvedAgentType = agentInfo?.agentType ?? b.getMainThreadAgentType()
  return {
    session_id: resolvedSessionId,
    transcript_path: b.getTranscriptPath(resolvedSessionId),
    cwd: b.getCwd(),
    permission_mode: permissionMode,
    agent_id: agentInfo?.agentId,
    agent_type: resolvedAgentType,
  }
}
