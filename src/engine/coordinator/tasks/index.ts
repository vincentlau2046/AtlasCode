/**
 * tasks 追踪层门面（S-7a）
 *
 * 域内文件：
 *   - framework.ts：状态机框架（updateTaskState/registerTask/evictTerminalTask/
 *     generateTaskAttachments/applyTaskOffsetsAndEvictions/pollTasks）
 *   - localAgentTask.ts：后台 agent 任务态 + 进度追踪 + agent 通知
 *   - localShellTask.ts：bash 任务态 + spawn/foreground/background 生命周期
 *   - guards.ts / killShellTasks.ts：shell 态类型 + 纯 kill 助手
 *   - stopTask.ts：StopTaskError + stopTask 三态守卫
 *   - registry.ts：getAllTasks/getTaskByType（两态注册表）
 *   - 域内 utils：notification（注入窗口）/ xml / cleanupRegistry /
 *     abortController / types（TaskState 真联合）
 */
export * from './framework'
export * from './guards'
export * from './killShellTasks'
export * from './localAgentTask'
export * from './localShellTask'
export * from './notification'
export * from './registry'
export * from './stopTask'
export * from './types'
export * from './xml'
export * from './cleanupRegistry'
export * from './abortController'
