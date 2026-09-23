/**
 * atlascode 组合根适配器 — task 域 TaskOutput → TaskOutputPort（C2 · §8.8）
 *
 * executor 域只面向 TaskOutputPort 编程（L3：禁 import task 域）。
 * 本适配器把 task 域 TaskOutput 类包装成端口接口（createTaskOutput = new TaskOutput），
 * 由 compose.ts 注入。
 *
 * maxMemory 不入门面（task 域内部策略，默认 8MB）；onProgress 透传。
 */
import { TaskOutput } from '../../task'
import type { TaskOutputPort, TaskOutputHandle } from '../../executor'

/** task 域 TaskOutput → TaskOutputPort 适配器（createTaskOutput = new TaskOutput）。 */
export function adaptTaskOutputToExecutorPort(): TaskOutputPort {
  return {
    createTaskOutput: (taskId, onProgress, stdoutToFile) =>
      new TaskOutput(taskId, onProgress, stdoutToFile) as TaskOutputHandle,
  }
}
