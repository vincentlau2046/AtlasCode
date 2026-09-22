/**
 * bootstrap 域门面（STR-1：外部消费者只 import 域根 index）。
 *
 * 真适配器面（§8.14）：state.ts 真子集（cwd 两状态 / session id /
 * interactive 标志 / cost state 累加器族）+ cwd.ts（ALS 并发覆盖层）。
 * executor 域的 BootstrapStatePort（src/executor/ports/bootstrapState.ts）
 * 由组合根以本域 state 实现适配注入（L3：两域互不 import）。
 */
export * from './state'
export * from './cwd'
