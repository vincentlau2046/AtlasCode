/**
 * hooks 域 — Task 族钩子执行器（§8.56 S-D2 依赖闭包层，旧仓 utils/hooks.ts
 * executeTaskCreatedHooks / executeTaskCompletedHooks + 两消息格式化器；
 * TaskCreate / TaskUpdate 工具消费面）。
 *
 * 适配 delta 登记（复审勿当遗漏重提）：
 *  ① 旧仓 AsyncGenerator（yield 进度消息 + 末次 AggregatedHookResult）→ 新
 *     Promise runTaskCreatedHooks / runTaskCompletedHooks（对齐 E-5 S-5a
 *     run*Hooks 执行器族；进度 yield 面 = S-5b 流式面 runHooksStream，
 *     工具面不消费 → 裁，登记为前向接缝）。
 *  ② 旧仓位置参 (…, permissionMode?, signal?, timeoutMs?, toolUseContext?) →
 *     HookRunOptions { permissionMode, sessionId, agentInfo, signal,
 *     timeoutMs, toolUseID, env }（对齐 runPreToolUseHooks 族；旧
 *     toolUseContext 的 appState/sessionId 解析职责由 bootstrap 注入窗口
 *     + options.sessionId 承接）。
 *  ③ 旧仓 `toolUseID: randomUUID()` 缺省 → options.toolUseID（消费方 S-D3
 *     传真 tool_use_id，比随机 UUID 更保真；undefined = runHooks 容忍）。
 *  ④ getTaskCreatedHookMessage / getTaskCompletedHookMessage（旧仓
 *     utils/hooks.ts 格式化器族 2 件）随消费面落本域——新仓 hook 族无
 *     Task 族格式化器（Stop 族属 loop 消费面，Team 族归 shell·swarm 波），
 *     两格式化器逐字随迁（`<Event> hook feedback:\n${blockingError}`）。
 *  ⑤ hook_event_name 面：HOOK_EVENTS 已含 'TaskCreated' / 'TaskCompleted'
 *     （hookEvents.ts L27-28）+ getMatchingHooks 匹配支（无 matchQuery，
 *     E-5 已落）→ 本文件仅事件字段叠加 + runHooks 调用。
 */
import { createBaseHookInput } from './createBaseHookInput'
import { runHooks, type HookRunOptions } from './runHooks'
import type {
  AggregatedHookResult,
  HookBlockingError,
  HookInput,
} from './types'

/**
 * 格式化 TaskCreated 钩子阻塞错误（旧仓 utils/hooks.ts 逐字）。
 */
export function getTaskCreatedHookMessage(
  blockingError: HookBlockingError,
): string {
  return `TaskCreated hook feedback:\n${blockingError.blockingError}`
}

/**
 * 格式化 TaskCompleted 钩子阻塞错误（旧仓 utils/hooks.ts 逐字）。
 */
export function getTaskCompletedHookMessage(
  blockingError: HookBlockingError,
): string {
  return `TaskCompleted hook feedback:\n${blockingError.blockingError}`
}

/**
 * 执行 TaskCreated 钩子（任务创建时；exit 2 阻塞 → 阻止创建并回灌反馈）。
 * 无配置源 / 无 matcher / 信任门跳过 → { results: [] } 正常返回。
 */
export async function runTaskCreatedHooks(
  taskId: string,
  taskSubject: string,
  taskDescription?: string,
  teammateName?: string,
  teamName?: string,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = {
    ...base,
    hook_event_name: 'TaskCreated',
    task_id: taskId,
    task_subject: taskSubject,
    task_description: taskDescription,
    teammate_name: teammateName,
    team_name: teamName,
  }
  return runHooks('TaskCreated', hookInput, options)
}

/**
 * 执行 TaskCompleted 钩子（任务标记完成时；exit 2 阻塞 → 阻止完成并回灌
 * 反馈）。无配置源 / 无 matcher / 信任门跳过 → { results: [] } 正常返回。
 */
export async function runTaskCompletedHooks(
  taskId: string,
  taskSubject: string,
  taskDescription?: string,
  teammateName?: string,
  teamName?: string,
  options: HookRunOptions = {},
): Promise<AggregatedHookResult> {
  const base = createBaseHookInput(
    options.permissionMode,
    options.sessionId,
    options.agentInfo,
  )
  const hookInput: HookInput = {
    ...base,
    hook_event_name: 'TaskCompleted',
    task_id: taskId,
    task_subject: taskSubject,
    task_description: taskDescription,
    teammate_name: teammateName,
    team_name: teamName,
  }
  return runHooks('TaskCompleted', hookInput, options)
}
