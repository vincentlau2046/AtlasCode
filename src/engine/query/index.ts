/**
 * engine/query 门面（§8.21 E-1 窄 spine T-1，charter C 波 engine 纵切）。
 *
 * 旧仓 core/orchestrator/query/（loop 主循环 / transitions / config / deps /
 * stopHooks / tokenBudget）+ QueryEngine ask() 的最小纵切落此。
 * 残留守：多轮 while(true) / 压缩编排 / stop hooks / tokenBudget 归 E-1b（§8.21）。
 */
export { queryOneRound, type AgentLoopDeps, type AgentRoundResult } from './loop'
export { ask, type AskArgs } from './QueryEngine'
