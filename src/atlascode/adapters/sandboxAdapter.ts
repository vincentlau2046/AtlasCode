/**
 * atlascode 组合根适配器 — SandboxManager → ExecutorSandboxPort（C2 · §8.8）
 *
 * executor 域只面向 ExecutorSandboxPort 编程（L3：禁 import sandbox 域）。
 * 本适配器把 sandbox 域 SandboxManager 的 3 方法子集包装成端口接口，
 * 由 compose.ts 注入。两域互不 import，adapter 是组合根专属活（charter L4.7）。
 *
 * 窄化裁定（ports/sandbox.ts 头注）：omit customConfig 参数（旧仓 Shell.ts
 * 恒传 undefined；窄面防 SandboxRuntimeConfig 渗入 executor）。
 */
import type { SandboxManager } from '../../sandbox'
import type { ExecutorSandboxPort } from '../../executor'

/**
 * SandboxManager → ExecutorSandboxPort 适配器。
 * omit wrapWithSandbox 的 customConfig 参数（恒 undefined）。
 */
export function adaptSandboxToExecutorPort(
  manager: SandboxManager,
): ExecutorSandboxPort {
  return {
    isSandboxingEnabled: () => manager.isSandboxingEnabled(),
    wrapWithSandbox: (command, binShell, abortSignal) =>
      manager.wrapWithSandbox(command, binShell, undefined, abortSignal),
    cleanupAfterCommand: () => manager.cleanupAfterCommand(),
  }
}
