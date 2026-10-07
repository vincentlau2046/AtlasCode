/**
 * engine/query 门面（§8.21 E-1 窄 spine T-1 + §8.23 E-1b T-4a 多轮）。
 *
 * 旧仓 core/orchestrator/query/（loop 主循环 / transitions / config / deps /
 * stopHooks / tokenBudget）+ QueryEngine ask() 的最小纵切落此。
 * E-1b T-4a：queryAgentLoop 多轮（pre-turn autoCompact + maxTurns + terminal）已落。
 * E-5 S-5a：stop hooks 已落（loop terminal 消费点，C-4 归属订正，见 loop.ts 头注）。
 * 残留守（后续纵切）：流式 chatStream + 流式 hooks runner 消费面（E-1b-full）/
 * 错误恢复（E-1b-full）：回合级有界恢复已落 #262（turnRecovery withTurnRecovery，
 * queryOneRound 经有界+退避+signal 感知续试穿越 5xx 风暴窗）；余 = tokenBudget
 * continuation（max_tokens 截断续跑）/ MCP 连接生命周期（连接层纵切，见 mcp.ts
 * 头注；MCP 工具路由本身已按 E-2 闭环）/
 * 附件渲染 + 钩子 additionalContext 回灌（message/REPL 波，§8.40 C-3 前向接缝登记）。
 */
export {
  queryOneRound,
  queryAgentLoop,
  DEFAULT_AGENT_LOOP_MAX_TURNS,
  type AgentLoopDeps,
  type AgentLoopEvent,
  type AgentRoundResult,
  type AgentLoopContextConfig,
  type AgentLoopArgs,
  type AgentLoopResult,
} from './loop'
export {
  withTurnRecovery,
  resolveTurnRecoveryConfig,
  turnRecoveryBackoffMs,
  sleepSignalAware,
  type TurnRecoveryConfig,
  type WithTurnRecoveryOptions,
} from './turnRecovery'
export { ask, type AskArgs } from './QueryEngine'
// D1（0.1.37 ③，P2 恢复层 C3 缺口）：413/PTL 类 provider 错误形判别
// （throw 形态，modelprovider classifyAPIError 单源；CC 谓词层 Message 形态
// 两谓词 = context 门面 isWithheldPromptTooLong/isWithheldMediaSizeError 不变）
export { isReactiveCompactRecoverableError } from './reactiveCompactError'
