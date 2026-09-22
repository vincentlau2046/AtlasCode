/**
 * ShellCommand — 子进程包装（裁剪版，C-Deep 切片 1）
 *
 * 旧仓来源（a8af45b）: src/utils/ShellCommand.ts
 * 移植口径：exit 映射常量化照抄（SIGKILL=137 / SIGTERM=143 / 超时码 143、
 * null→SIGTERM?144:1、aborted=145、preSpawn=1）；TaskOutput 经 C2 端口注入
 * （旧 `new TaskOutput(...)` 全部替换为 getTaskOutputPort().createTaskOutput）。
 *
 * 裁剪裁定（2026-09-22 调研定稿，复审勿当遗漏重提）：
 * - tree-kill 依赖 → POSIX 进程组 kill（spawn detached → 进程组组长，
 *   process.kill(-pid, 'SIGKILL')）；Windows taskkill 回退归残余
 * - size watchdog（5s 轮询 stat + MAX_TASK_OUTPUT_BYTES 5GB 上限）归 task 域
 *   （常量在旧 utils/task/diskOutput.ts，task 域 C-Deep 切片 3 落地后接回）
 * - shouldAutoBackground / onTimeout 回调 / backgroundedByUser /
 *   assistantAutoBackgrounded = assistant 自动后台化语义，归 engine 波
 * - StreamWrapper 不做 maxOutputLength 截断（outputLimits 归 task 域策略）
 * - generateTaskId 本地最小版（'local_bash'→'b' 前缀 + 8 字节 base36，
 *   旧仓 Task.ts 同算法）；canonical generateTaskId/TaskType 表归 task 域切片 3
 */
import type { ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import type { Readable } from 'stream'
import { getTaskOutputPort, type TaskOutputHandle } from '../ports/taskOutput'

export type ExecResult = {
  stdout: string
  stderr: string
  code: number
  interrupted: boolean
  backgroundTaskId?: string
  /** stdout 过大无法内联时——指向磁盘输出文件 */
  outputFilePath?: string
  /** 输出文件总字节数（outputFilePath 设置时同步设置） */
  outputFileSize?: number
  /** 输出文件的 task id（outputFilePath 设置时同步设置） */
  outputTaskId?: string
  /** 命令 spawn 前即失败（如 cwd 被删）时的错误信息 */
  preSpawnError?: string
}

export type ShellCommand = {
  background: (backgroundTaskId: string) => boolean
  result: Promise<ExecResult>
  kill: () => void
  status: 'running' | 'backgrounded' | 'completed' | 'killed'
  /**
   * 清理流资源（事件监听）。
   * 命令完成或 kill 后调用，防内存泄漏。
   */
  cleanup: () => void
  /** 拥有全部 stdout/stderr 数据与进度的 TaskOutput 端口句柄 */
  taskOutput: TaskOutputHandle
}

const SIGKILL = 137
const SIGTERM = 143

/**
 * 'local_bash' → 'b'（旧仓 Task.ts TASK_ID_PREFIXES 同值；
 * canonical 表归 task 域切片 3）。8 字节 base36 ≈ 2.8 万亿组合（防 symlink 暴力）。
 */
const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 本地最小版任务 id 生成（executor 域内自治，免跨域 import Task 面） */
export function generateLocalTaskId(): string {
  const bytes = randomBytes(8)
  let id = 'b'
  for (let i = 0; i < 8; i++) {
    id += TASK_ID_ALPHABET[bytes[i]! % TASK_ID_ALPHABET.length]
  }
  return id
}

/** 时长格式化（旧仓 format.ts formatDuration 的 <1m 分支口径；30min 超时 → '30m'） */
function formatDurationMs(ms: number): string {
  if (ms < 60_000) {
    return ms === 0 ? '0s' : `${Math.floor(ms / 1000)}s`
  }
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function prependStderr(prefix: string, stderr: string): string {
  return stderr ? `${prefix} ${stderr}` : prefix
}

/**
 * 子进程流 → TaskOutput 的细管道（pipe 模式用；file 模式两 fd 直写文件，无 wrapper）。
 */
class StreamWrapper {
  #stream: Readable | null
  #isCleanedUp = false
  #taskOutput: TaskOutputHandle | null
  #isStderr: boolean
  #onData = this.#dataHandler.bind(this)

  constructor(stream: Readable, taskOutput: TaskOutputHandle, isStderr: boolean) {
    this.#stream = stream
    this.#taskOutput = taskOutput
    this.#isStderr = isStderr
    // 发字符串而非 Buffer——省掉反复 .toString()
    stream.setEncoding('utf-8')
    stream.on('data', this.#onData)
  }

  #dataHandler(data: Buffer | string): void {
    const str = typeof data === 'string' ? data : data.toString()
    if (this.#isStderr) {
      this.#taskOutput!.writeStderr(str)
    } else {
      this.#taskOutput!.writeStdout(str)
    }
  }

  cleanup(): void {
    if (this.#isCleanedUp) {
      return
    }
    this.#isCleanedUp = true
    this.#stream!.removeListener('data', this.#onData)
    // 释放引用，让流/StringDecoder/TaskOutput 与本 wrapper 各自独立 GC
    this.#stream = null
    this.#taskOutput = null
    this.#onData = () => {}
  }
}

/**
 * ShellCommand 实现：包装子进程。
 *
 * file 模式（bash 命令）：stdout/stderr 直写文件 fd，JS 零参与，
 * 进度靠轮询文件尾。pipe 模式（hooks）：StreamWrapper 实时转发。
 */
class ShellCommandImpl implements ShellCommand {
  #status: 'running' | 'backgrounded' | 'completed' | 'killed' = 'running'
  #backgroundTaskId: string | undefined
  #stdoutWrapper: StreamWrapper | null
  #stderrWrapper: StreamWrapper | null
  #childProcess: ChildProcess
  #timeoutId: NodeJS.Timeout | null = null
  #abortSignal: AbortSignal
  #timeout: number
  #resultResolver: ((result: ExecResult) => void) | null = null
  #exitCodeResolver: ((code: number) => void) | null = null
  #boundAbortHandler: (() => void) | null = null
  readonly taskOutput: TaskOutputHandle

  static #handleTimeout(self: ShellCommandImpl): void {
    // 裁剪版无 shouldAutoBackground（残余：engine 波 assistant 自动后台化）
    self.#doKill(SIGTERM)
  }

  readonly result: Promise<ExecResult>

  constructor(
    childProcess: ChildProcess,
    abortSignal: AbortSignal,
    timeout: number,
    taskOutput: TaskOutputHandle,
  ) {
    this.#childProcess = childProcess
    this.#abortSignal = abortSignal
    this.#timeout = timeout
    this.taskOutput = taskOutput

    // file 模式两 fd 直写文件 → childProcess.stdout/.stderr 均为 null
    this.#stderrWrapper = childProcess.stderr
      ? new StreamWrapper(childProcess.stderr, taskOutput, true)
      : null
    this.#stdoutWrapper = childProcess.stdout
      ? new StreamWrapper(childProcess.stdout, taskOutput, false)
      : null

    this.result = this.#createResultPromise()
  }

  get status(): 'running' | 'backgrounded' | 'completed' | 'killed' {
    return this.#status
  }

  #abortHandler(): void {
    // 'interrupt'（用户提交新消息）不 kill——让调用方后台化，模型可见部分输出
    if (this.#abortSignal.reason === 'interrupt') {
      return
    }
    this.kill()
  }

  #exitHandler(code: number | null, signal: NodeJS.Signals | null): void {
    // 旧仓同映射：code 为 null（信号杀死）→ SIGTERM 记 144，其余记 1
    const exitCode =
      code !== null && code !== undefined
        ? code
        : signal === 'SIGTERM'
          ? 144
          : 1
    this.#resolveExitCode(exitCode)
  }

  #errorHandler(): void {
    this.#resolveExitCode(1)
  }

  #resolveExitCode(code: number): void {
    if (this.#exitCodeResolver) {
      this.#exitCodeResolver(code)
      this.#exitCodeResolver = null
    }
  }

  // 注意：exit/error 监听不在这里移除——result promise 依赖它们。
  #cleanupListeners(): void {
    const timeoutId = this.#timeoutId
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.#timeoutId = null
    }
    const boundAbortHandler = this.#boundAbortHandler
    if (boundAbortHandler) {
      this.#abortSignal.removeEventListener('abort', boundAbortHandler)
      this.#boundAbortHandler = null
    }
  }

  #createResultPromise(): Promise<ExecResult> {
    this.#boundAbortHandler = this.#abortHandler.bind(this)
    this.#abortSignal.addEventListener('abort', this.#boundAbortHandler, {
      once: true,
    })

    // 用 'exit' 而非 'close'：'close' 等 stdio 全关（含继承 fd 的孙进程，
    // 如 `sleep 30 &`），'exit' 在 shell 自身退出时即返回
    this.#childProcess.once('exit', this.#exitHandler.bind(this))
    this.#childProcess.once('error', this.#errorHandler.bind(this))

    this.#timeoutId = setTimeout(
      ShellCommandImpl.#handleTimeout,
      this.#timeout,
      this,
    ) as NodeJS.Timeout

    const exitPromise = new Promise<number>(resolve => {
      this.#exitCodeResolver = resolve
    })

    return new Promise<ExecResult>(resolve => {
      this.#resultResolver = resolve
      void exitPromise.then(this.#handleExit.bind(this))
    })
  }

  async #handleExit(code: number): Promise<void> {
    this.#cleanupListeners()
    if (this.#status === 'running' || this.#status === 'backgrounded') {
      this.#status = 'completed'
    }

    const stdout = await this.taskOutput.getStdout()
    const result: ExecResult = {
      code,
      stdout,
      stderr: this.taskOutput.getStderr(),
      interrupted: code === SIGKILL,
      backgroundTaskId: this.#backgroundTaskId,
    }

    if (this.taskOutput.stdoutToFile && !this.#backgroundTaskId) {
      if (this.taskOutput.outputFileRedundant) {
        // 小文件——全文已在 result.stdout，删文件
        void this.taskOutput.deleteOutputFile()
      } else {
        // 大文件——告知调用方完整输出落点
        result.outputFilePath = this.taskOutput.path
        result.outputFileSize = this.taskOutput.outputFileSize
        result.outputTaskId = this.taskOutput.taskId
      }
    }

    // killedForSize 分支随 size watchdog 归残余（task 域接回时补）
    if (code === SIGTERM) {
      result.stderr = prependStderr(
        `Command timed out after ${formatDurationMs(this.#timeout)}`,
        result.stderr,
      )
    }

    const resultResolver = this.#resultResolver
    if (resultResolver) {
      this.#resultResolver = null
      resultResolver(result)
    }
  }

  #doKill(code?: number): void {
    this.#status = 'killed'
    const pid = this.#childProcess?.pid
    if (pid) {
      // POSIX 进程组 kill（spawn detached → 组长）替代 tree-kill（免新依赖）；
      // 组已退则 EINVAL/ESRCH，吞掉（exit 码由 resolveExitCode 记录）
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // 进程组已不存在
      }
    }
    this.#resolveExitCode(code ?? SIGKILL)
  }

  kill(): void {
    this.#doKill()
  }

  background(taskId: string): boolean {
    if (this.#status === 'running') {
      this.#backgroundTaskId = taskId
      this.#status = 'backgrounded'
      this.#cleanupListeners()
      if (!this.taskOutput.stdoutToFile) {
        // pipe 模式：把内存缓冲溢写到盘，读者可从磁盘找到
        this.taskOutput.spillToDisk()
      }
      // file 模式旧仓此处启 size watchdog（768GB 事件防线）——
      // 归残余：task 域 MAX_TASK_OUTPUT_BYTES 落地后接回
      return true
    }
    return false
  }

  cleanup(): void {
    this.#stdoutWrapper?.cleanup()
    this.#stderrWrapper?.cleanup()
    this.taskOutput.clear()
    // 必须在置空 #abortSignal 前执行——#cleanupListeners() 要对它 removeEventListener。
    // 否则 kill()+cleanup() 序列会崩：kill() 把 #handleExit 排进微任务，
    // cleanup() 先置空，#handleExit 再在空引用上调 #cleanupListeners()。
    this.#cleanupListeners()
    // 释放引用，允许 ChildProcess 内部与 AbortController 链 GC
    this.#childProcess = null!
    this.#abortSignal = null!
  }
}

/**
 * 包装子进程，启用 shell 命令执行的灵活处理。
 */
export function wrapSpawn(
  childProcess: ChildProcess,
  abortSignal: AbortSignal,
  timeout: number,
  taskOutput: TaskOutputHandle,
): ShellCommand {
  return new ShellCommandImpl(childProcess, abortSignal, timeout, taskOutput)
}

/**
 * 静态实现：命令执行前即被中止。
 */
class AbortedShellCommand implements ShellCommand {
  readonly status = 'killed' as const
  readonly result: Promise<ExecResult>
  readonly taskOutput: TaskOutputHandle

  constructor(opts?: {
    backgroundTaskId?: string
    stderr?: string
    code?: number
  }) {
    this.taskOutput = getTaskOutputPort().createTaskOutput(generateLocalTaskId(), null)
    this.result = Promise.resolve({
      code: opts?.code ?? 145,
      stdout: '',
      stderr: opts?.stderr ?? 'Command aborted before execution',
      interrupted: true,
      backgroundTaskId: opts?.backgroundTaskId,
    })
  }

  background(): boolean {
    return false
  }

  kill(): void {}

  cleanup(): void {}
}

export function createAbortedCommand(
  backgroundTaskId?: string,
  opts?: { stderr?: string; code?: number },
): ShellCommand {
  return new AbortedShellCommand({
    backgroundTaskId,
    ...opts,
  })
}

export function createFailedCommand(preSpawnError: string): ShellCommand {
  const taskOutput = getTaskOutputPort().createTaskOutput(generateLocalTaskId(), null)
  return {
    status: 'completed' as const,
    result: Promise.resolve({
      code: 1,
      stdout: '',
      stderr: preSpawnError,
      interrupted: false,
      preSpawnError,
    }),
    taskOutput,
    background(): boolean {
      return false
    },
    kill(): void {},
    cleanup(): void {},
  }
}
