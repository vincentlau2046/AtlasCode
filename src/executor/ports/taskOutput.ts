/**
 * TaskOutput 端口 — 旧仓 utils/task/TaskOutput.ts 的 executor 消费面（C2 · C-Deep 前置）
 *
 * 旧仓 Shell.ts（新仓空 stub src/executor/shell/Shell.ts 待 C-Deep 填）消费 3 点：
 *   - `new TaskOutput(taskId, onProgress ?? null, !usePipeMode)`（创建）
 *   - `taskOutput.path`（file 模式 stdout 直落该文件 fd，不进 JS）
 *   - `taskOutput.clear()`（前台命令结束后清理）
 *
 * L3 自治：executor 域禁 import task 域（C-Deep 建的 4 新域之一）——域内只面向此端口编程；
 * task 域提供真实现（适配器），组合根（atlascode/compose.ts）经 setTaskOutputPort() 注入。
 *
 * 未注入 = fail-fast 抛错（非静默 no-op）：静默空输出汇是 H6 空洞等价腐化向量
 * （命令输出无声丢失）。fake = 内存实现（tests/fixtures/executor-port-fakes.ts），
 * §8.7 port 边界规则：port 之上可 fake，port 之下（spawn/fs）必须真。
 */

/** 输出进度回调（旧仓 TaskOutput ProgressCallback，5 参数签名忠实保留）。 */
export type TaskOutputProgressCallback = (
  lastLines: string,
  allLines: string,
  totalLines: number,
  totalBytes: number,
  isIncomplete: boolean,
) => void

/** 输出句柄 — executor 只消费 path + clear（窄面，旧仓字段/方法 1:1）。 */
export interface TaskOutputHandle {
  /** 输出文件路径（file 模式 stdout 直落该 fd；pipe 模式不用，但恒有值）。 */
  readonly path: string
  /** 清理输出（旧仓 TaskOutput.clear()，前台命令结束后调用）。 */
  clear(): void
}

/**
 * TaskOutput 端口 — task 域输出收集能力在 executor 侧的窄视图。
 * 对应旧仓 `new TaskOutput(taskId, onProgress, stdoutToFile)`（C-Deep task 域实现）。
 */
export interface TaskOutputPort {
  createTaskOutput(
    taskId: string,
    onProgress: TaskOutputProgressCallback | null,
    stdoutToFile?: boolean,
  ): TaskOutputHandle
}

// ── 注入窗口（组合根注入，modelprovider/roles.ts 同款 idiom）──────────────
let activePort: TaskOutputPort | null = null

/** 组合根注入 task 域真 TaskOutputPort。 */
export function setTaskOutputPort(port: TaskOutputPort): void {
  activePort = port
}

/** 读当前端口。未注入 = fail-fast 抛错（防静默输出丢失，H6 防腐）。 */
export function getTaskOutputPort(): TaskOutputPort {
  if (!activePort) {
    throw new Error(
      'TaskOutputPort 未注入 — 组合根（atlascode/compose.ts）须先 setTaskOutputPort()',
    )
  }
  return activePort
}

/** 测试复位。 */
export function resetTaskOutputPort(): void {
  activePort = null
}
