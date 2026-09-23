/**
 * engine 模块唯一公共出口（STR-1 门面规则）。
 *
 * E-1 窄 spine（§8.21）落 query 纵切后首块 re-export。ports/state/pipeline/
 * context/coordinator/tools 随各自纵切（E-1b/E-2/E-3…）落地后在此追加 re-export。
 */
export { queryOneRound, ask, type AgentLoopDeps, type AgentRoundResult, type AskArgs } from './query'
