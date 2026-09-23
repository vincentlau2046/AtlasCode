/**
 * atlascode 组合根适配器 — executor 真 Shell → hooks HookShellPort（§8.16 D17）
 *
 * hooks 域命令钩子经 executor Shell（ShellCommand）spawn。薄骨架把「跑一条钩子
 * 命令并取 stdout/stderr/exit code」收敛为 HookShellPort，本适配器接 executor
 * 域真 Shell（L3：hooks 不 import executor，边切端口）。
 *
 * 契约映射（executor 门面 Shell 执行链）：
 *   execShell(command, signal, { timeout, env }) → Promise<ShellCommand>
 *   shellCmd.result → Promise<ShellExecResult{ stdout, stderr, code, interrupted }>
 *   HookShellExecution{ stdout, stderr, code, aborted }（interrupted → aborted）
 *
 * env 经 ExecOptions.env 透传（§8.17 D17 补齐：hooks 域 buildHookEnv 产物
 * 落到子进程 env，优先级 process.env < env < harness 标记，见 Shell.ts spawn）。
 */
import { execShell } from '../../executor'
import type { HookShellPort, HookShellExecution } from '../../hooks'

/** executor 真 Shell → hooks HookShellPort 适配器。 */
export function adaptExecutorToHookShellPort(): HookShellPort {
  return {
    runCommand: async (
      command: string,
      env: Record<string, string>,
      signal: AbortSignal,
      timeoutMs?: number,
    ): Promise<HookShellExecution> => {
      const shellCmd = await execShell(command, signal, {
        timeout: timeoutMs,
        env,
      })
      const result = await shellCmd.result
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
        aborted: result.interrupted,
      }
    },
  }
}
