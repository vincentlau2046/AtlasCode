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
 * E-5 S-5b（§8.40）落：流式执行核心 re-export 面（runHooksStream）——执行循环落
 * 域叶 src/hooks/streaming.ts（与 runHooks 共享单一事实源；L3 仅 re-export 不
 * 重复实现，C-1 细化）。
 *
 * 前向接缝登记（H6，复审勿当遗漏）：
 *  - post-hook / stop-hook additionalContext + stopReason 上下文回灌 +
 *    stop-hooks blockingErrors 回灌 → 消息/REPL 波（新仓无消息面，见 toolHooks.ts 头注）
 *  - 流式 runner 消费面 = loop 流式 chatStream（E-1b-full，loop.ts 头注登记）；
 *    5 事件键流式包装器随消费面同建（不预造，H6）
 *  - attachment 渲染（钩子输出 → AttachmentMessage）→ 消息/REPL 波（C-3，§8.40）
 */
export {
  createLoopHooks,
  createToolHooks,
  type LoopHooks,
  type ToolHooksAdapterOptions,
} from './toolHooks'
// E-5 S-5b（§8.40）：流式执行核心 re-export 面（执行循环在域叶，与 runHooks 共享单一事实源）
export { runHooksStream, type HookStreamYield } from '../../hooks'
