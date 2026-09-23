/**
 * engine/hooks 子门面（E-5 S-5a，§8.38 C-1：L3 连接器层，镜像 engine/permissions 先例 §8.36）
 *
 * STR-1：外部消费者经 engine 根 index 消费；本子门面 = L3 连接器层组织 +
 * 测试直 import 位。
 *
 * L3 定位：本层 = 跨域连接器（import shared 类型 / hooks 域 / engine·pipeline
 * 类型）；hooks 纯叶域约束不变（叶域不 import engine）；测试只 import 域根 /
 * engine 根门面（口径不变）。
 *
 * E-5 S-5a（§8.39）落：ToolHooks 适配器（createToolHooks，C-6 返回值消费支）+
 * loop stop hooks 消费面（createLoopHooks，C-4 归属订正：stop hooks = E-5 非 E-1b）。
 *
 * 前向接缝登记（H6，复审勿当遗漏）：
 *  - post-hook / stop-hook additionalContext + stopReason 上下文回灌 +
 *    stop-hooks blockingErrors 回灌 → 消息/REPL 波（新仓无消息面，见 toolHooks.ts 头注）
 *  - 流式 hooks-runner（AsyncGenerator，旧仓 executeHooks 执行循环 +
 *    processHookJSONOutput 字段映射，解耦 message/attachment）→ S-5b
 *  - loop 流式 chatStream 消费面 → E-1b-full
 */
export {
  createLoopHooks,
  createToolHooks,
  type LoopHooks,
  type ToolHooksAdapterOptions,
} from './toolHooks'
