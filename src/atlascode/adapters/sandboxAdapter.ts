/**
 * atlascode 组合根适配器 — SandboxManager → ExecutorSandboxPort（C2 · §8.8）
 *
 * executor 域只面向 ExecutorSandboxPort 编程（L3：禁 import sandbox 域）。
 * 本适配器把 sandbox 域 SandboxManager 的 3 方法子集 + S-T4 ⑧ shouldUseSandbox
 * 决策方法包装成端口接口，由 compose.ts 注入。两域互不 import，adapter 是组合根
 * 专属活（charter L4.7）。
 *
 * 窄化裁定（ports/sandbox.ts 头注）：omit customConfig 参数（旧仓 Shell.ts
 * 恒传 undefined；窄面防 SandboxRuntimeConfig 渗入 executor）。
 *
 * S-T4 ⑧ 消费面激活（§8.53）：shouldUseSandbox(command) 决策不取 manager 方法，
 * 委托 engine/tools shouldUseSandbox({command})（isSandboxingEnabled 总门经
 * compose ⑧ setSandboxAccess 窗口读 manager.isSandboxingEnabled + 用户
 * excludedCommands 经 engine settings 门面读）——组合根 = 唯一可跨 engine/sandbox
 * 两域装配处。逃生支（dangerouslyDisableSandbox）不透出 executor 端口面（工具层输入）。
 */
import type { SandboxManager } from '../../sandbox'
import type { ExecutorSandboxPort } from '../../executor'
// STR-1：组合根 = engine 域外部，只能经 engine 根门面 index.ts（不可直达 tools 子门面）
import { shouldUseSandbox as engineShouldUseSandbox } from '../../engine'

/**
 * SandboxManager → ExecutorSandboxPort 适配器。
 * omit wrapWithSandbox 的 customConfig 参数（恒 undefined）。
 * shouldUseSandbox 委托 engine 决策（组合根 ⑧ 消费面；见头注）。
 */
export function adaptSandboxToExecutorPort(
  manager: SandboxManager,
): ExecutorSandboxPort {
  return {
    isSandboxingEnabled: () => manager.isSandboxingEnabled(),
    shouldUseSandbox: (command: string) => engineShouldUseSandbox({ command }),
    wrapWithSandbox: (command, binShell, abortSignal) =>
      manager.wrapWithSandbox(command, binShell, undefined, abortSignal),
    cleanupAfterCommand: () => manager.cleanupAfterCommand(),
  }
}
