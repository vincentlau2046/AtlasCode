/**
 * engine/tools/agent — AgentDefinition 最小类型 + 兜底 general-purpose（§8.25 E-2 T-5b）
 *
 * 旧仓 tools/AgentTool/loadAgentsDir.ts 的 AgentDefinition 裁剪版真核心：只保留
 * AgentTool 核心（T-5b）消费字段。T-5c（loadAgentsDir + builtInAgents + forkSubagent）
 * 在此类型上补齐目录扫描 / frontmatter 解析 / 内建注册表，产出同一类型（strangler）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧 AgentDefinition 的 mcpServers / hooks / skills / permissionMode / effort /
 *     omitClaudeMd / criticalSystemReminder / callback / baseDir / whenToUse /
 *     allowedAgentTypes / maxTurns 字段 → 残留守（T-5c 目录面 + 各消费面落时补；
 *     maxTurns 随子代理 context/压缩面纵切接线，避免死接缝）。
 *   - GENERAL_PURPOSE_AGENT 的完整 getSystemPrompt（旧仓 generalPurposeAgent.ts 全文
 *     + whenToUse）→ 残留守（T-5c 补内建提示词全文）；本版仅最小兜底身份。
 *   - source 收窄为 'built-in' | 'user'（旧仓含 'plugin' / 'policySettings' admin-trusted
 *     细分）→ 残留守（admin-trusted 门控归 E-4 权限层）。
 */
import type { ModelRole } from '../../../modelprovider'

export interface AgentDefinition {
  agentType: string
  source: 'built-in' | 'user'
  /** 该 agent 的模型 override（缺省 = 继承父线程 role）。 */
  model?: ModelRole
  /** 工具 spec 列表（'*' = 通配全量；否则按名解析）。 */
  tools?: string[]
  /** 禁用的工具名（从解析结果中剔除）。 */
  disallowedTools?: string[]
  /** spawnDepth 感知系统提示词（coordinator worker fan-out 条件渲染消费）。 */
  getSystemPrompt: (o: { spawnDepth?: number }) => string | Promise<string>
}

/** 内建判定（旧仓 loadAgentsDir isBuiltInAgent 同义）。 */
export function isBuiltInAgent(a: AgentDefinition): boolean {
  return a.source === 'built-in'
}

/**
 * 兜底 general-purpose agent（旧仓 built-in/generalPurposeAgent.ts 最小化）。
 * 无 subagent_type 或未知 type 时 resolveAgentDefinition 回落此。完整提示词全文
 * 归 T-5c 内建注册表（残留守，见头注）。
 */
export const GENERAL_PURPOSE_AGENT: AgentDefinition = {
  agentType: 'general-purpose',
  source: 'built-in',
  getSystemPrompt: () =>
    'You are a general-purpose agent. Complete the task with focused, thorough work and report concrete results (file paths, line numbers, evidence).',
}
