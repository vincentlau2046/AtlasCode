/**
 * engine/query 门面（§8.21 E-1 窄 spine T-1 + §8.23 E-1b T-4a 多轮）。
 *
 * 旧仓 core/orchestrator/query/（loop 主循环 / transitions / config / deps /
 * stopHooks / tokenBudget）+ QueryEngine ask() 的最小纵切落此。
 * E-1b T-4a：queryAgentLoop 多轮（pre-turn autoCompact + maxTurns + terminal）已落。
 * 残留守（后续纵切）：流式 chatStream / 错误恢复 + stop hooks / tokenBudget continuation
 * （max_tokens 截断续跑）/ MCP 路由（E-2）/ 附件注入（E-5）。
 */
export {
  queryOneRound,
  queryAgentLoop,
  DEFAULT_AGENT_LOOP_MAX_TURNS,
  type AgentLoopDeps,
  type AgentRoundResult,
  type AgentLoopContextConfig,
  type AgentLoopArgs,
  type AgentLoopResult,
} from './loop'
export { ask, type AskArgs } from './QueryEngine'
