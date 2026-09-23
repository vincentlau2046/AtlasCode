/**
 * engine/state 门面（§8.21 E-1 窄 spine T-3，charter L4.7 裁定 #3）。
 *
 * EngineState（R3a 并发模型转正，set(f) 串行 apply 队列原语）先落；
 * fileHistory / attribution 子模块骨架随 C 波填实后在此追加 re-export。
 */
export { EngineState, type StateUpdater } from './EngineState'
