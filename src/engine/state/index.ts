/**
 * engine/state 门面（§8.21 E-1 窄 spine T-3，charter L4.7 裁定 #3）。
 *
 * EngineState（R3a 并发模型转正，set(f) 串行 apply 队列原语）先落。
 *
 * S-E4（2026-09-25，M-3 门盲区收口裁定）：fileHistory / attribution 2 子模块
 * 的 8 个零消费者占位（各 4 文件 `export {}`）已删——C 波未填实（原头注
 * 「随 C 波填实后追加 re-export」承诺未兑现即收口），后续波按需重建且须
 * 实质实现（§8.52 B18）；重建时在此追加 re-export。
 */
export { EngineState, type StateUpdater } from './EngineState'
