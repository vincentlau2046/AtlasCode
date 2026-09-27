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
 *     协作）= 已落（下段「槽 ⑮ 核销」S-E2b 闭合：本体 swarm 域
 *     inProcessTeammateTask.ts 经 registerTaskDefinition 注入窗口落位；
 *     依赖件 inProcessTeammateHelpers 102L = swarm 域 inProcessTeammateHelpers.ts
 *     S-E2b 落 + inProcessRunner hub S-E2d 落，§8.66 核销 ④ 闭合）；
 *     LocalWorkflowTask /
 *     MonitorMcpTask 旧仓 feature('WORKFLOW_SCRIPTS') / feature('MONITOR_TOOL')
 *     require 门控 + 模块本体未迁 → 门随模块裁（新仓 shared feature() 纯模块，
 *     registry 级门无消费模块可 require）。
 *   - 注：monitor 的 kind 输入面（BashTaskKind 'monitor'）与 MONITOR_TOOL
 *     通知支已随 LocalShellTask 落（runtime 支），仅 MonitorMcpTask 任务态
 *     本体顺延。
 *
 * 槽 ⑮ 核销（C 桶 ③ shell·swarm 波 S-E2b，§8.66；上段 InProcessTeammateTask
 * 「归 shell/swarm 波」登记项闭合）：InProcessTeammateTask 本体（swarm 域
 * inProcessTeammateTask.ts，.ts 零 JSX）经注入窗口 registerTaskDefinition
 * 挂入注册表（PRT-2：导出函数非顶层调用；接线 = 组合根残留守 ⑤——
 * 未接线时注册表保持两态基线零行为，getTaskByType('in_process_teammate')
 * 返 undefined，无消费点触达即零影响）。
 */
import type { Task, TaskType } from '../../../task'
import { LocalAgentTask } from './localAgentTask'
import { LocalShellTask } from './localShellTask'

/** 注入窗挂入的任务定义（组合根装配；swarm InProcessTeammateTask 等）。 */
const extraTaskDefinitions: Task[] = []

/**
 * 注入窗：挂入额外任务定义（registerTaskDefinition 为导出函数非顶层
 * 自注册——PRT-2 合规；消费 = getAllTasks/getTaskByType 扩展面）。
 */
export function registerTaskDefinition(task: Task): void {
  extraTaskDefinitions.push(task)
}

/**
 * Get all tasks.
 * Mirrors the pattern from tools.ts
 * Note: Returns array inline to avoid circular dependency issues with top-level const
 */
export function getAllTasks(): Task[] {
  return [LocalShellTask, LocalAgentTask, ...extraTaskDefinitions]
}

/**
 * Get a task by its type.
 */
export function getTaskByType(type: TaskType): Task | undefined {
  return getAllTasks().find(t => t.type === type)
}
