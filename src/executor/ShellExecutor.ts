/**
 * ShellExecutor — 在 Executor/BackgroundExecutor 接口后面包装 Shell.ts。
 * 所有命令执行委托给 Shell.exec()；ShellExecutor 只做统一类型映射。
 *
 * 旧仓来源（a8af45b）: src/core/executor/ShellExecutor.ts（strangler 包装，
 * 旧类 ctor(sandbox, defaultCwd) → 裁剪版零状态：sandbox 能力经 C2 端口
 * （getExecutorSandboxPort，组合根注入），cwd 状态归 bootstrap port。
 *
 * 残余（后续波次，复审勿当遗漏重提）：
 * - BackgroundExecutor（spawn/listProcesses）= engine 波后台任务面
 * - Shell.exec 的 onProgress / preventCwdChanges 不透出（接口面不扩）
 */
import { exec as shellExec } from './shell/Shell'
import { getExecutorSandboxPort } from './ports/sandbox'
import {
  ExecError,
  type ExecOptions,
  type ExecResult,
  type Executor,
} from './types'

export class ShellExecutor implements Executor {
  // ---- Executor 接口 ----

  async exec(command: string, args: string[], opts?: ExecOptions): Promise<ExecResult> {
    const startMs = Date.now()

    // 组装命令串：有 args 时拼接。Shell.ts 期望单条 bash 命令串而非 argv。
    const commandString = args.length > 0 ? [command, ...args].join(' ') : command

    // 把调用方 AbortSignal（如有）接进 Shell.ts 直接消费的本地 AbortController
    const localAbort = new AbortController()
    if (opts?.signal) {
      if (opts.signal.aborted) {
        localAbort.abort(opts.signal.reason)
      } else {
        opts.signal.addEventListener(
          'abort',
          () => localAbort.abort(opts.signal!.reason),
          { once: true },
        )
      }
    }

    let shellCommand
    try {
      shellCommand = await shellExec(commandString, localAbort.signal, {
        timeout: opts?.timeoutMs,
        shouldUseSandbox: getExecutorSandboxPort().isSandboxingEnabled(),
        onStdout: opts?.onStdout,
        // ShellExecutor 不透出：onProgress / preventCwdChanges
      })
    } catch (e) {
      // Shell.ts 只在灾难性失败时抛（找不到 shell、spawn ENOENT）
      return this.rethrowAsExecError(e, startMs)
    }

    const shellResult = await shellCommand.result
    const durationMs = Date.now() - startMs
    const timedOut = localAbort.signal.aborted && !shellResult.interrupted

    const result: ExecResult = {
      exitCode: shellResult.code,
      signal: null, // 裁剪版 Shell.ts 不暴露 signal
      stdout: shellResult.stdout,
      stderr: shellResult.stderr,
      durationMs,
      timedOut,
      ok: shellResult.code === 0 && !timedOut,
    }

    if (!result.ok) {
      const code = timedOut
        ? 'TIMEOUT'
        : (shellResult.code as number) === 127
          ? 'NOT_FOUND'
          : shellResult.interrupted
            ? 'SIGNAL'
            : shellResult.code !== 0
              ? 'NON_ZERO'
              : 'UNKNOWN'

      throw new ExecError(code, `Command failed: ${command}`, result)
    }

    return result
  }

  isAvailable(_command: string): boolean {
    // Shell 在 spawn 时经 $PATH 解析二进制——不做预校验，
    // 让 shell 的 "command not found" 在 exec 时成为 ExecError('NOT_FOUND')。
    return true
  }

  availableCommands(): string[] {
    // Shell 能跑 $PATH 上任何东西——穷举不现实。返回空，
    // 调用方靠尝试来发现命令。
    return []
  }

  // ---- 私有助手 ----

  /** 把 spawn 裸错误翻译成 ExecError（尽力定 code）。 */
  private rethrowAsExecError(e: unknown, startMs: number): never {
    const message = e instanceof Error ? e.message : String(e)
    const result: ExecResult = {
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: message,
      durationMs: Date.now() - startMs,
      timedOut: false,
      ok: false,
    }
    // ENOENT → 命令不在 $PATH 上
    const isNotFound =
      message.includes('ENOENT') || message.includes('not found')
    throw new ExecError(
      isNotFound ? 'NOT_FOUND' : 'UNKNOWN',
      message,
      result,
      e instanceof Error ? e : undefined,
    )
  }
}
