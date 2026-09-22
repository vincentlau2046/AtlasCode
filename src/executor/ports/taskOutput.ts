/**
 * TaskOutput 端口 — 旧仓 utils/task/TaskOutput.ts 的 executor 消费面（C2 · C-Deep 前置）
 *
 * 消费面调研（C2-复审修订：初版只列 Shell.ts 3 点，漏了 ShellCommand.ts——
 * 两文件同属 C-Deep 切片 1 的 4 stub，端口面必须一次定全防 C-Deep 撞墙）：
 *   Shell.ts：`new TaskOutput(taskId, onProgress, !usePipeMode)` + `.path`
 *   （file 模式 spawn 经 open(path, O_WRONLY|O_CREAT|O_APPEND|O_NOFOLLOW) 直落 fd，
 *   不进 JS；父目录须先 mkdir）+ `.clear()`
 *   ShellCommand.ts（StreamWrapper + result 组装）：`.taskId` / `.path` /
 *   `.stdoutToFile` / `.writeStdout` / `.writeStderr`（pipe 模式喂内存缓冲）/
 *   `.getStdout()` / `.getStderr()` / `.outputFileRedundant` / `.outputFileSize` /
 *   `.deleteOutputFile()` / `.spillToDisk()`
 *
 * 不在端口面（残余项，注明归属）：static startPolling/stopPolling = React 进度
 * 组件消费（engine/D 波）；maxMemory 构造参数 = task 域策略（域内定值）。
 *
 * L3 自治：executor 域禁 import task 域（C-Deep 建的 4 新域之一）——域内只面向
 * 此端口编程；task 域提供真实现（适配器），组合根（atlascode/compose.ts）经
 * setTaskOutputPort() 注入。
 *
 * 未注入 = fail-fast 抛错（非静默 no-op）：静默空输出汇是 H6 空洞等价腐化向量
 * （命令输出无声丢失）。fake = FileTaskOutputFake（tests/fixtures/
 * executor-port-fakes.ts）：路径/缓冲可观测，file 模式 getStdout 真读 tmpdir
 * 文件（§8.7 port 边界规则：port 之上可 fake，port 之下 spawn/fs 必须真——
 * 真 spawn 的 stdout fd 落 fake 路径，父目录/文件必须真实存在）。
 */

/** 输出进度回调（旧仓 TaskOutput ProgressCallback，5 参签名忠实保留）。 */
export type TaskOutputProgressCallback = (
  lastLines: string,
  allLines: string,
  totalLines: number,
  totalBytes: number,
  isIncomplete: boolean,
) => void

/**
 * 输出句柄 — executor 消费面（旧仓 TaskOutput 公共字段/方法 1:1 窄视图，
 * 12 成员；static 轮询与 maxMemory 策略不在面内，见文件头残余清单）。
 */
export interface TaskOutputHandle {
  /** 任务 id（旧仓 readonly taskId；ShellCommand result.outputTaskId）。 */
  readonly taskId: string
  /** 输出文件路径（file 模式 stdout 直落该 fd；pipe 模式不用，但恒有值）。 */
  readonly path: string
  /** stdout 是否直落文件 fd（构造参数 1:1；false = pipe 模式走内存缓冲）。 */
  readonly stdoutToFile: boolean
  /** pipe 模式：喂 stdout 缓冲（StreamWrapper 在 data 事件调用）。 */
  writeStdout(data: string): void
  /** pipe 模式：喂 stderr 缓冲（file 模式 stderr 并入输出文件，此缓冲恒空）。 */
  writeStderr(data: string): void
  /** 取 stdout：file 模式读输出文件（≤maxOutputLength 全量），pipe 模式读缓冲。 */
  getStdout(): Promise<string>
  /** 取 stderr（pipe 模式缓冲；file 模式 = ''，旧仓语义）。 */
  getStderr(): string
  /** getStdout() 后为真：文件全量读入（内容冗余，可删文件）。 */
  readonly outputFileRedundant: boolean
  /** getStdout() 后为文件总字节数（旧仓 getter 语义）。 */
  readonly outputFileSize: number
  /** 缓冲溢写磁盘（旧仓 spillToDisk；fake = no-op，真实现归 task 域）。 */
  spillToDisk(): void
  /** 删输出文件（旧仓 deleteOutputFile，ENOENT 容错）。 */
  deleteOutputFile(): Promise<void>
  /** 清理输出（旧仓 clear：清缓冲 + 删文件；前台命令结束后调用）。 */
  clear(): void
}

/**
 * TaskOutput 端口 — task 域输出收集能力在 executor 侧的窄视图。
 * 对应旧仓 `new TaskOutput(taskId, onProgress, stdoutToFile)`（C-Deep task 域实现）。
 * maxMemory 不入门面（task 域内部策略，默认 8MB 旧仓定值）。
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
