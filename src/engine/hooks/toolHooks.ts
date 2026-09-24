/**
 * engine/hooks — ToolHooks 适配器 + loop stop hooks（E-5 S-5a，§8.38 C-1/C-4/C-6）
 *
 * L3 定位（镜像 engine/permissions 先例 §8.36）：本层 = 跨域连接器（import
 * shared 类型 / hooks 域 / engine·pipeline 类型）；hooks 纯叶域约束不变（叶域
 * 不 import engine）；测试直 import engine 根门面。
 *
 * 职责（三层断补齐的「让 settings.hooks 生产路径真生效」面，§8.38 C-5）：
 * ① createToolHooks：hooks 域 runPreToolUseHooks/runPostToolUseHooks → pipeline
 *    ToolHooks 适配器，消费 AggregatedHookResult（C-6 非 fire-and-forget）：
 *    pre → { blockingError, updatedInput, hookBehavior, preventContinuation,
 *    stopReason }（pipeline executeToolUse 消费：blockingError 短路 /
 *    preventContinuation 短路（§8.42 MAJOR-1）/ updatedInput 回写 / hookBehavior 经
 *    mergeHookPermission 合 E-4 权限门——hook 'allow' 不绕过 settings deny/ask 不变量）
 *    post → { additionalContext }（上下文回灌 = 消息/REPL 波前向接缝，pipeline 头注登记）
 * ② createLoopHooks：toolHooks 之上加 stopHooks = runStopHooks（loop terminal
 *    消费点，C-4：preventContinuation=true → 阻止停止续跑；maxTurns 守卫仍生效）
 *
 * 前向接缝登记（H6 防空洞，复审勿当遗漏）：
 *  - post-hook / stop-hook additionalContext + stopReason 上下文回灌 → 消息/REPL 波
 *    （新仓无消息面；本版只执行钩子 + 捕获结果，回灌消费点归消息/REPL 波）
 *  - stop-hooks blockingErrors 回灌（追加消息序列）→ 消息/REPL 波
 *  - 流式执行核心已落 S-5b（§8.40）：执行循环 = 域叶 src/hooks/streaming.ts
 *    runHooksStream（旧仓 executeHooks 执行循环移植，解耦 message/attachment；
 *    L3 re-export 面 = 本子门面 + engine 根门面）；消费面 = loop 流式 chatStream
 *    （E-1b-full 前向接缝，loop.ts 头注登记）+ attachment 渲染（消息/REPL 波）
 *
 * L3 桥接 cast（登记，同 E-4 §8.36 先例）：pipeline ToolHooks 入参契约 = unknown
 * （shared Tool.call args 面），hooks 域执行器入参 = Record<string, unknown>——
 * 适配器边界 cast，不扩散到两域契约。
 */
import {
  runPostToolUseHooks,
  runPreToolUseHooks,
  runStopHooks,
  type HookRunOptions,
} from '../../hooks'
import type {
  PostToolUseHookOutcome,
  PreToolUseHookOutcome,
  ToolHooks,
} from '../pipeline'

/**
 * loop 钩子消费面（AgentLoopDeps.hooks 成员，engine/query/loop.ts 消费）：
 * toolHooks → queryOneRound 透传 runToolBatch（唯一点，同 checkPermission 透传位）；
 * stopHooks → queryAgentLoop terminal 支（无 tool_use 轮，preventContinuation 续跑）。
 */
export interface LoopHooks {
  /** 工具钩子（pipeline ToolHooks，createToolHooks 产物）。 */
  toolHooks?: ToolHooks
  /**
   * 停止钩子（runStopHooks 消费点）：preventContinuation=true → 阻止停止续跑
   * （maxTurns 守卫仍生效，防不可终止会话）。
   */
  stopHooks?: (signal?: AbortSignal) => Promise<{ preventContinuation?: boolean }>
}

/** ToolHooks 适配器注入面（HookRunOptions 透传：signal/timeoutMs/permissionMode/sessionId/agentInfo/env）。 */
export interface ToolHooksAdapterOptions {
  options?: HookRunOptions
}

/**
 * createToolHooks（C-6）：hooks 域执行器 → pipeline ToolHooks。
 * 返回值 = AggregatedHookResult 的 pipeline 可见子集（类型化，非 fire-and-forget）；
 * 执行器内部信任门 / 匹配 / shell 端口执行链全真（hooks 域 runHooks 核心）。
 */
export function createToolHooks(opts: ToolHooksAdapterOptions = {}): ToolHooks {
  const base = opts.options
  return {
    preToolUse: async (tool, input, toolUseId) => {
      const r = await runPreToolUseHooks(
        tool.name,
        input as Record<string, unknown>,
        toolUseId,
        { ...base, toolUseID: toolUseId },
      )
      const outcome: PreToolUseHookOutcome = {
        blockingError: r.blockingError?.blockingError,
        updatedInput: r.updatedInput,
        hookBehavior: r.permissionBehavior,
        // §8.42 整波审视 MAJOR-1：turn 终止意图透传（域聚合面已算出，此前
        // 适配器静默丢弃——旧仓 toolHooks.ts:438-446 pre 支消费面补齐）
        preventContinuation: r.preventContinuation,
        stopReason: r.stopReason,
      }
      return outcome
    },
    postToolUse: async (tool, input, block, toolUseId) => {
      const r = await runPostToolUseHooks(
        tool.name,
        input as Record<string, unknown>,
        block,
        toolUseId,
        { ...base, toolUseID: toolUseId },
      )
      const outcome: PostToolUseHookOutcome = {
        additionalContext: r.additionalContext,
      }
      return outcome
    },
  }
}

/**
 * createLoopHooks（C-4）：ToolHooks 适配器 + stop hooks 消费面（loop AgentLoopDeps.hooks）。
 * stop-hooks blockingErrors/additionalContext 回灌 = 消息/REPL 波前向接缝（见头注登记）。
 */
export function createLoopHooks(opts: ToolHooksAdapterOptions = {}): LoopHooks {
  return {
    toolHooks: createToolHooks(opts),
    stopHooks: async (signal) => {
      const r = await runStopHooks({ ...opts.options, signal })
      return { preventContinuation: r.preventContinuation }
    },
  }
}
