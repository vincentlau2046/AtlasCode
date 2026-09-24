/**
 * 任务注册表（旧仓 src/tasks.ts 39L 随迁，S-7a）
 *
 * 旧仓 getAllTasks = [LocalShellTask, LocalAgentTask, RemoteAgentTask,
 * DreamTask] + feature 门控 LocalWorkflowTask / MonitorMcpTask。新仓注册表
 * 收窄为已落两态（toolRegistry 接缝 ⑯ 槽位：Task 四件套随本切片落，
 * 其余任务态不预置死位——H6 防空洞）。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - RemoteAgentTask（旧仓 855L，远程会话）/ DreamTask（157L，离线做梦）
 *     未迁（顺延波，登记）；InProcessTeammateTask（125L，teammate 进程内
 *     协作）归 shell/swarm 波（§8.50 裁定：inProcessTeammateHelpers 102L 依赖
 *     本任务态 + updateTaskState 归同波；S-7e 完结后 tasks 面仍两态——原注
 *     「随 S-7e 波落」写于 §8.50 范围裁定前已陈旧，§8.51 复审 B-NOTE-1 回刷）；
 *     LocalWorkflowTask /
 *     MonitorMcpTask 旧仓 feature('WORKFLOW_SCRIPTS') / feature('MONITOR_TOOL')
 *     require 门控 + 模块本体未迁 → 门随模块裁（新仓 shared feature() 纯模块，
 *     registry 级门无消费模块可 require）。
 *   - 注：monitor 的 kind 输入面（BashTaskKind 'monitor'）与 MONITOR_TOOL
 *     通知支已随 LocalShellTask 落（runtime 支），仅 MonitorMcpTask 任务态
 *     本体顺延。
 */
import type { Task, TaskType } from '../../../task'
import { LocalAgentTask } from './localAgentTask'
import { LocalShellTask } from './localShellTask'

/**
 * Get all tasks.
 * Mirrors the pattern from tools.ts
 * Note: Returns array inline to avoid circular dependency issues with top-level const
 */
export function getAllTasks(): Task[] {
  return [LocalShellTask, LocalAgentTask]
}

/**
 * Get a task by its type.
 */
export function getTaskByType(type: TaskType): Task | undefined {
  return getAllTasks().find(t => t.type === type)
}
