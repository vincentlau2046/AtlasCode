/**
 * task 域门面（STR-1：外部消费者只 import 域根 index）。
 *
 * L3 自治：task 域不 import 其他域——diskOutput 的 getProjectTempDir 跨域边
 * 经 permissions 薄骨架注入斩断（§8.14 注入序 permissions→task→hooks）。
 *
 * 当前面（切片 3 任务清单 T1 种子 + T2 真核心 + T3 磁盘层填实）：
 * - task.ts：TaskType/TaskStatus + canonical TaskId（前缀族 b/a/r/t/w/m/d）
 *   + createTaskStateBase
 * - TaskOutput.ts：真核心（spill 8MB / clear / deleteOutputFile ENOENT 容错 /
 *   static 轮询 API 保留零消费者）；结构满足 executor TaskOutputHandle（12
 *   成员），组合根注入适配器（L3：两域互不 import）
 * - fsRange.ts：readFileRange/tailFile（域内 fs 范围读）
 * - outputLimits.ts：getMaxOutputLength（切片 1 裁定 outputLimits 归 task 域）
 * - diskOutput.ts：真实现（451L 随迁：getTaskOutputDir memoize / DiskTaskOutput
 *   队列 drain + 5GB cap / getTaskOutput tail 8MB / getTaskOutputDelta /
 *   cleanupTaskOutput）；跨域边 getProjectTempDir（permissions）+
 *   getSessionId（bootstrap）经 setDiskOutputEnv 注入窗口斩断（未注入
 *   fail-fast），组合根按 §8.14 注入序 permissions→task→hooks 注入
 */
export * from './task'
export * from './TaskOutput'
export * from './fsRange'
export * from './outputLimits'
export * from './diskOutput'
