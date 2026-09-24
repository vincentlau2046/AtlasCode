/**
 * hooks 域 — 流式执行核心（E-5 S-5b，§8.40；旧仓 executeHooks 执行循环移植，解耦 message/attachment）
 *
 * 旧仓来源（a8af45b）：src/utils/hooks.ts executeHooks（L1953，`async function*`）
 * = 守卫族 → 逐钩子 progress yield（执行前）→ all(hookPromises) 并行 merge
 * （generators.ts L32，completion-order yield）→ 逐结果字段映射 yield
 * （processHookJSONOutput L485 映射面）。
 *
 * 移植裁定（§8.40）：
 *  - **执行循环落域叶**（计划文「加 src/engine/hooks/」的细化）：守卫/匹配/shell
 *    端口/解释/聚合全部复用 runHooks 单一事实源（runOneHook/interpretHookOutput/
 *    mergeAggregated/buildHookEnv，域内面）；engine/hooks L3 仅 re-export 面 +
 *    前向接缝登记（同 engine/permissions 分层：域逻辑在域，L3 = 连接器/re-export）。
 *  - **yield 序 = 确定性 match 序**（旧仓 all() completion-order 的订正）：消费端
 *    推理 + 测试稳定；**并发语义不变**（全钩子并行、per-hook 超时，总墙钟 = max 非 sum）。
 *  - **聚合 = 生成器返回值**（旧仓 executeHooks 无 final aggregate yield；新仓以
 *    return 值 = 单一消费面）。for-await 不暴露生成器返回值（JS 语义）→ 消费端
 *    须手动 .next() 循环（测试 drain 助手）。
 *  - 守卫族 = 与 runHooks 一致（trust skip + 无匹配）：旧仓 disableAll/ATLAS_SIMPLE
 *    守卫属 config 域（shouldDisableAllHooksIncludingManaged = engine/config L3），
 *    叶域不 import L3（STR-1）→ 与 runHooks 对齐（守卫单一事实源）。
 *  - **message/attachment 解耦**：旧仓 progress/system message yield
 *    （createAttachmentMessage）不迁 —— attachment 渲染 = message/REPL 波残留守
 *    （C-3 前向接缝，新仓无 message 基建）。
 *
 * 前向接缝登记（H6 防空洞，复审勿当遗漏）：
 *  - 流式 runner 消费面 = loop 流式 chatStream（E-1b-full，loop.ts 头注登记）；
 *    5 事件键流式包装器（runStopHooksStream 等）随消费面落地同建（不预造，H6）。
 *  - 钩子输出 → AttachmentMessage 渲染（旧仓 attachments.ts createAttachmentMessage
 *    + messages.ts normalizeAttachmentForAPI 6 case）→ message/REPL 波。
 */
import { getMatchingHooks } from './getMatchingHooks'
import { getHookShellPort } from './shell-port'
import { shouldSkipHookDueToTrust } from './shouldSkipHookDueToTrust'
import type { HookEvent } from './hookEvents'
import type {
  AggregatedHookResult,
  HookInput,
  HookResult,
} from './types'
import {
  buildHookEnv,
  mergeAggregated,
  runOneHook,
  type HookRunOptions,
} from './runHooks'

/** 流式 yield（解耦 message/attachment：域事件，非消息对象）。 */
export type HookStreamYield =
  /** 逐钩子进度（执行前；旧仓 L2083-2101 progress message 解耦面）。 */
  | { kind: 'hook_progress'; hookEvent: HookEvent; command: string; toolUseID?: string }
  /** 逐钩子执行结果（确定性 match 序；旧仓逐结果字段映射 yield 解耦面）。 */
  | { kind: 'hook_result'; result: HookResult }

/**
 * 流式执行核心（参数化，旧仓 18 execute* 流式版折叠点）。
 *
 * 协议：守卫（trust skip / 无匹配 → 立即空聚合）→ progress yield（逐钩子，执行前）
 * → 全钩子并行（per-hook 超时，旧仓 all() 语义）→ 逐钩子 hook_result yield（match 序）
 * + mergeAggregated → **return 值 = AggregatedHookResult**。
 *
 * 消费：for-await 只取 yield（JS 语义不暴露生成器返回值）；取聚合须手动 .next()
 * 循环（末次 done=true，value = 聚合）。
 */
export async function* runHooksStream(
  hookEvent: HookEvent,
  hookInput: HookInput,
  options: HookRunOptions = {},
): AsyncGenerator<HookStreamYield, AggregatedHookResult, void> {
  if (shouldSkipHookDueToTrust()) {
    return { results: [] }
  }
  const matched = await getMatchingHooks(hookEvent, hookInput)
  const results: HookResult[] = []
  const aggregated: AggregatedHookResult = { results }
  if (matched.length === 0) return aggregated

  const port = getHookShellPort()
  const env = buildHookEnv(options.env)
  const signal = options.signal ?? new AbortController().signal

  // progress yield（逐钩子，执行前；旧仓 L2083-2101，解耦 message 对象）
  for (const m of matched) {
    yield {
      kind: 'hook_progress',
      hookEvent,
      command: m.hook.command,
      toolUseID: options.toolUseID,
    }
  }

  // 全钩子并行（旧仓 all()：per-hook 超时，总墙钟 = max 非 sum）；
  // yield 取确定性 match 序（§8.40 裁定 4 订正，非旧仓 completion-order）。
  const started = matched.map((m) => runOneHook(m, port, env, signal, options))
  for (const pending of started) {
    const result = await pending
    results.push(result)
    yield { kind: 'hook_result', result }
    mergeAggregated(aggregated, result)
  }
  return aggregated
}
