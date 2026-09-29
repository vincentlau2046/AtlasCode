/* eslint-disable custom-rules/no-process-env-top-level -- W4 全量 lint 复原（§8.74.21）：模块加载期捕获常量（含刻意捕获语义站点），惰性读改写违行为零改动纪律（W-opt 波再议） */
/**
 * engine/tools/agent — AgentDefinition 类型 + 兜底 general-purpose（§8.25 E-2 T-5b 起，T-5c 升级）
 *
 * 旧仓 tools/AgentTool/loadAgentsDir.ts 的 AgentDefinition 裁剪版真核心：保留
 * AgentTool 核心 + 注册表（T-5c）消费字段。T-5c 补 whenToUse + 拓宽 source 到三态 +
 * isCustomAgent 判定 + GENERAL_PURPOSE_AGENT 真提示词（旧仓 generalPurposeAgent.ts 逐字）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 旧 BaseAgentDefinition 的 mcpServers / hooks / skills / effort / permissionMode /
 *     omitClaudeMd / criticalSystemReminder / callback / baseDir / filename /
 *     requiredMcpServers / background / initialPrompt / memory / isolation / color /
 *     pendingSnapshotUpdate 字段 → 残留守（T-5c 目录面 + 各消费面落时补）。
 *   - maxTurns 字段 → 残留守（随子代理 context/压缩面纵切接线，避免死接缝）。
 *   - source 三态（built-in / user / plugin）：旧仓 user 侧细分 userSettings/projectSettings/
 *     policySettings/flagSettings（admin-trusted 门控）→ 残留守（E-4 权限层）。
 */
import type { ModelRole } from '../../../modelprovider'
import { isEnvDefinedFalsy } from '../../../shared'

export interface AgentDefinition {
  agentType: string
  source: 'built-in' | 'user' | 'plugin'
  /** 用途描述（AgentTool 描述 / 内建注册表清单消费）。 */
  whenToUse: string
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

/** 自定义判定（旧仓 isCustomAgent：非 built-in 且非 plugin）。 */
export function isCustomAgent(a: AgentDefinition): boolean {
  return a.source !== 'built-in' && a.source !== 'plugin'
}

// general-purpose 系统提示词（旧仓 built-in/generalPurposeAgent.ts 逐字）。
// ascend 定制子句随 ATLAS_ASCEND_PROMPT env（默认开；ATLAS_ASCEND_PROMPT=0 关），
// 国产算力差异化（Ascend NPU 模型适配 / 算子开发）。
const ASCEND_CLAUSE = !isEnvDefinedFalsy(process.env.ATLAS_ASCEND_PROMPT)
  ? ', deeply customized for domestic computing power — especially model adaptation and operator development on the Ascend NPU'
  : ''
const SHARED_PREFIX = `You are a professional coding agent for Atlas${ASCEND_CLAUSE}. Given the user's message, you should use the tools available to complete the task. Complete the task fully—don't gold-plate, but don't leave it half-done.`
const SHARED_GUIDELINES = `Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: search broadly when you don't know where something lives. Use Read when you know the specific file path.
- For analysis: Start broad and narrow down. Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions, look for related files.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested.`

/** 兜底 general-purpose agent（旧仓 built-in/generalPurposeAgent.ts 逐字提示词）。 */
export const GENERAL_PURPOSE_AGENT: AgentDefinition = {
  agentType: 'general-purpose',
  whenToUse:
    'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.',
  tools: ['*'],
  source: 'built-in',
  // model 刻意省略 → 继承父线程 role（旧仓 getDefaultSubagentModel 同义）。
  getSystemPrompt: () =>
    `${SHARED_PREFIX} When you complete the task, respond with a concise report covering what was done and any key findings — the caller will relay this to the user, so it only needs the essentials.

${SHARED_GUIDELINES}`,
}
