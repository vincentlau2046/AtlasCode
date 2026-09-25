/**
 * executor 3 port fakes（C2 · 契约测试 + C-Deep 纵切 smoke / B6-func 复用）
 *
 * §8.7 port 边界规则落点：**port 之上可 fake**（本文件即该层替身），
 * port 之下（spawn/fs/ripgrep）必须真——tests/func/ smoke 用这些 fake 替换
 * task/bootstrap/sandbox 域，验 executor 纵切真执行链，防"fake 到底"。
 *
 * fake 行为断言原则：确定性 + 可观测（记录调用 / 计数），不模拟真实域语义
 * （真语义 = C-Deep 各域实现的责任，绝不在此假装）。
 *
 * I/O 纪律（分层）：
 * - **unit 层契约测试零磁盘**：FileTaskOutputFake 的 createTaskOutput 纯路径
 *   计算（无 I/O）；pipe 模式 getStdout/getStderr 走内存缓冲（无 I/O）；
 *   file 模式真 I/O（tmpdir 读/删）只在 tests/func/ 层经真 spawn 触发。
 * - **func 层真 I/O**：真 spawn 的 stdout fd 落 fake 路径（open O_CREAT 需父目录
 *   存在）——reduced Shell 在 spawn 前 `mkdir(dirname(handle.path))`（port 之下
 *   fs 必须真，§8.7）；fake 的 file 模式 getStdout 真读该文件（ENOENT → ''）。
 */
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  BootstrapStatePort,
  ExecutorSandboxPort,
  TaskOutputHandle,
  TaskOutputPort,
  TaskOutputProgressCallback,
} from '../../src/executor'

// ── TaskOutput file-backed fake ────────────────────────────────────
/**
 * FileTaskOutputFake：路径可预测（baseDir/taskId.out）+ file 模式真文件 I/O
 * （tmpdir，ENOENT 容错）+ pipe 模式内存缓冲 + 全调用可观测。
 * 构造零 I/O（baseDir 仅计算）；I/O 惰性触发（func 层）。
 */
export class FileTaskOutputFake implements TaskOutputPort {
  /** 输出文件基目录（默认 os.tmpdir()/atlascode-fake-<pid>，构造零 I/O）。 */
  readonly baseDir: string
  /** 创建顺序记录（契约断言用）。 */
  readonly createdTaskIds: string[] = []
  /** 真 I/O 记录（func 层断言用：哪些文件被读/删）。 */
  readonly readFiles: string[] = []
  readonly deletedFiles: string[] = []
  private readonly stdoutBuffers = new Map<string, string>()
  private readonly stderrBuffers = new Map<string, string>()
  private readonly clearCounts = new Map<string, number>()
  private readonly sizes = new Map<string, number>()
  private readonly redundant = new Map<string, boolean>()
  private readonly toFile = new Map<string, boolean>()

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? join(tmpdir(), `atlascode-fake-${process.pid}`)
  }

  createTaskOutput(
    taskId: string,
    _onProgress: TaskOutputProgressCallback | null,
    stdoutToFile = false,
  ): TaskOutputHandle {
    // 纯路径计算，无 I/O（unit 层可安全实例化；目录由消费方 spawn 前 mkdir）
    this.createdTaskIds.push(taskId)
    this.toFile.set(taskId, stdoutToFile)
    this.stdoutBuffers.set(taskId, '')
    this.stderrBuffers.set(taskId, '')
    const self = this
    return {
      taskId,
      path: join(self.baseDir, `${taskId}.out`),
      get stdoutToFile() {
        return self.toFile.get(taskId) ?? false
      },
      writeStdout: (data: string) => {
        self.stdoutBuffers.set(taskId, (self.stdoutBuffers.get(taskId) ?? '') + data)
      },
      writeStderr: (data: string) => {
        self.stderrBuffers.set(taskId, (self.stderrBuffers.get(taskId) ?? '') + data)
      },
      async getStdout() {
        if (self.toFile.get(taskId)) {
          // file 模式：真读输出文件（port 之下 fs 真；ENOENT → ''，旧仓语义）
          self.readFiles.push(self.pathOf(taskId))
          const size = self.statSize(self.pathOf(taskId))
          self.sizes.set(taskId, size)
          // 全量读（fake 无 maxOutputLength 截断——真实现的输出限制策略归 task 域）
          self.redundant.set(taskId, true)
          if (!existsSync(self.pathOf(taskId))) return ''
          return readFileSync(self.pathOf(taskId), 'utf8')
        }
        return self.stdoutBuffers.get(taskId) ?? ''
      },
      getStderr() {
        // file 模式 stderr 并入输出文件 → 缓冲恒 ''（旧仓语义）；pipe 模式读缓冲
        return self.toFile.get(taskId) ? '' : (self.stderrBuffers.get(taskId) ?? '')
      },
      get outputFileRedundant() {
        return self.redundant.get(taskId) ?? false
      },
      get outputFileSize() {
        return self.sizes.get(taskId) ?? 0
      },
      // fake = 纯内存缓冲，无溢写（真实现的 spill 语义归 task 域，fake no-op 可辨识）
      spillToDisk: () => {},
      async deleteOutputFile() {
        self.deletedFiles.push(self.pathOf(taskId))
        if (existsSync(self.pathOf(taskId))) unlinkSync(self.pathOf(taskId))
      },
      clear() {
        self.clearCounts.set(taskId, (self.clearCounts.get(taskId) ?? 0) + 1)
        self.stdoutBuffers.set(taskId, '')
        self.stderrBuffers.set(taskId, '')
        if (existsSync(self.pathOf(taskId))) unlinkSync(self.pathOf(taskId))
      },
    }
  }

  /** 可观测：clear 调用次数（fake 专有，非端口契约）。 */
  clearCount(taskId: string): number {
    return this.clearCounts.get(taskId) ?? 0
  }

  /** 确保输出目录存在（func 层真 spawn 前调用；reduced Shell 等价旧仓 getTaskOutputDir mkdir）。 */
  ensureOutputDir(): void {
    mkdirSync(this.baseDir, { recursive: true })
  }

  private pathOf(taskId: string): string {
    return join(this.baseDir, `${taskId}.out`)
  }

  private statSize(p: string): number {
    try {
      return statSync(p).size
    } catch {
      return 0
    }
  }
}

// ── BootstrapState fake ────────────────────────────────────────────
/**
 * BootstrapState fake：originalCwd 固定 + cwdState 可观测（旧仓两状态分离语义）。
 * getCwd() = 当前 cwdState（旧仓 pwd() 无覆盖路径；ALS 并发覆盖层归 engine，不进 fake）。
 */
export function createFakeBootstrapState(initialCwd = '/fake/original') {
  let cwdState = initialCwd
  const port: BootstrapStatePort = {
    getCwd: () => cwdState,
    getOriginalCwd: () => initialCwd,
    setCwdState: (cwd: string) => {
      cwdState = cwd
    },
  }
  return {
    port,
    /** 可观测：当前 cwdState（fake 专有，非端口契约）。 */
    getCwdState: () => cwdState,
  }
}

// ── Sandbox fake ───────────────────────────────────────────────────
/**
 * Sandbox fake：记录调用 + 可配置 sandboxingEnabled + wrap 标记（非 no-op，
 * 返回值可断言——防"包装层被 fake 成透传"的假绿）。
 */
export class FakeExecutorSandbox implements ExecutorSandboxPort {
  sandboxingEnabled = true
  /** S-T4 ⑧：shouldUseSandbox 决策 fake 可配返回值（默认 true；非 no-op 可断言）。 */
  shouldUseSandboxResult = true
  /** S-T4 ⑧：shouldUseSandbox 调用记录（命令串，可观测防假绿）。 */
  readonly shouldUseSandboxCalls: string[] = []
  readonly wrappedCommands: string[] = []
  readonly wrappedSignals: Array<AbortSignal | undefined> = []
  cleanups = 0

  isSandboxingEnabled(): boolean {
    return this.sandboxingEnabled
  }

  shouldUseSandbox(command: string): boolean {
    this.shouldUseSandboxCalls.push(command)
    return this.shouldUseSandboxResult
  }

  async wrapWithSandbox(
    command: string,
    _binShell?: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    this.wrappedCommands.push(command)
    this.wrappedSignals.push(abortSignal)
    return `[sandbox] ${command}`
  }

  cleanupAfterCommand(): void {
    this.cleanups += 1
  }
}
