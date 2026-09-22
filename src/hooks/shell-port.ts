/**
 * hooks 域 — 命令钩子执行跨域注入端口（C-Deep 切片 3 T6，§8.16 D17 偏差）
 *
 * 旧仓 hooks 命令钩子经 executor Shell（ShellCommand）spawn。薄骨架把「跑一条
 * 钩子命令并取 stdout/stderr/exit code」收敛为注入端口 HookShellPort，组合根接
 * executor 域真 Shell（L3/B-wave 边切端口）。§8.14 未列此边，薄骨架新增为第 6 注入项
 * （B6-func 前置清单 4+5 → 4+6，见 §8.16 D17）。
 *
 * 未注入 fail-fast：钩子已配置却未注入执行端口 = 组合根配置错误（无钩子时
 * getMatchingHooks 返回空，本端口不会被调用，故 fail-fast 不误伤常态）。
 */
export type HookShellExecution = {
  stdout: string
  stderr: string
  code: number
  aborted?: boolean
}

export type HookShellPort = {
  runCommand: (
    command: string,
    env: Record<string, string>,
    signal: AbortSignal,
    timeoutMs?: number,
  ) => Promise<HookShellExecution>
}

let _port: HookShellPort | null = null

/** 组合根注入 executor 真 Shell 适配（§8.16 D17）。 */
export function setHookShellPort(port: HookShellPort): void {
  _port = port
}

/** 读端口。未注入 fail-fast。 */
export function getHookShellPort(): HookShellPort {
  if (!_port) {
    throw new Error(
      'hooks HookShellPort 未注入 — 组合根须先 setHookShellPort（§8.16 D17，hooks→executor 边切端口）',
    )
  }
  return _port
}

/** 测试复位（teardown 用）。 */
export function resetHookShellPort(): void {
  _port = null
}
