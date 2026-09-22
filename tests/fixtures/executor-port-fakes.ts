/**
 * executor 3 port fakes（C2 · 契约测试 + C-Deep 纵切 smoke / B6-func 复用）
 *
 * §8.7 port 边界规则落点：**port 之上可 fake**（本文件即该层的替身），
 * port 之下（spawn/fs/ripgrep）必须真——tests/func/ smoke 用这些 fake 替换
 * task/bootstrap/sandbox 域，验 executor 纵切真执行链，防"fake 到底"。
 *
 * fake 行为断言原则：确定性 + 可观测（记录调用 / 计数），不模拟真实域语义
 * （真语义 = C-Deep 各域实现的责任，绝不在此假装）。
 */
import type {
  BootstrapStatePort,
  ExecutorSandboxPort,
  TaskOutputHandle,
  TaskOutputPort,
  TaskOutputProgressCallback,
} from '../../src/executor'

// ── TaskOutput 内存 fake ───────────────────────────────────────────
/** 内存 TaskOutput fake：路径确定性（taskId 派生）+ clear 计数可观测。 */
export class InMemoryTaskOutputFake implements TaskOutputPort {
  /** 创建顺序记录（契约断言用）。 */
  readonly createdTaskIds: string[] = []
  private readonly clearCounts = new Map<string, number>()

  createTaskOutput(
    taskId: string,
    _onProgress: TaskOutputProgressCallback | null,
    _stdoutToFile = false,
  ): TaskOutputHandle {
    this.createdTaskIds.push(taskId)
    return {
      path: `/fake/tasks/${taskId}.out`,
      clear: () => {
        this.clearCounts.set(taskId, (this.clearCounts.get(taskId) ?? 0) + 1)
      },
    }
  }

  /** 可观测：clear 调用次数（fake 专有，非端口契约）。 */
  clearCount(taskId: string): number {
    return this.clearCounts.get(taskId) ?? 0
  }
}

// ── BootstrapState fake ────────────────────────────────────────────
/** BootstrapState fake：originalCwd 固定 + cwdState 可观测（旧仓两状态分离语义）。 */
export function createFakeBootstrapState(initialCwd = '/fake/original') {
  let cwdState = initialCwd
  const port: BootstrapStatePort = {
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
  readonly wrappedCommands: string[] = []
  readonly wrappedSignals: Array<AbortSignal | undefined> = []
  cleanups = 0

  isSandboxingEnabled(): boolean {
    return this.sandboxingEnabled
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
