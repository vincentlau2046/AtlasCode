/**
 * ExecutorSandbox 端口 — sandbox 域 SandboxManager 在 executor 侧的窄视图（C2 · sandbox 注入）
 *
 * 旧仓消费面（32 方法 SandboxManager，新仓 src/sandbox/types.ts 已全量保留）：
 *   - ShellExecutor.exec → `shouldUseSandbox(command)`（S-T4 ⑧ 消费面激活，§8.53；
 *     旧仓 shouldUseSandbox 决策：isSandboxingEnabled 总门 + 用户 excludedCommands
 *     不动点剥除匹配，经组合根 adapter 委托 engine/tools shouldUseSandbox({command})）
 *   - Shell.ts → `isSandboxingEnabled()`（useSandbox AND 支，manager 总门）
 *   - Shell.ts → `wrapWithSandbox(command, binShell, undefined, signal)`（旧仓恒传 undefined customConfig）
 *   - Shell.ts → `cleanupAfterCommand()`（bwrap 幽灵 dotfile 清理，Linux）
 *
 * L3 自治：executor 域禁 import sandbox 域——只面向此窄端口编程。
 * 窄化裁定：omit `customConfig` 参数（旧仓 Shell.ts 恒传 undefined；窄面防 sandbox 内部
 * 类型 SandboxRuntimeConfig 渗入 executor）。SandboxManager → 本端口的适配器归组合根
 * （atlascode/compose.ts），不进任一域（两域互不 import，adapter 是组合根专属活）。
 *
 * 未注入 = fail-fast 抛错（静默"未启用沙箱"会无声改变安全语义，H6 防腐）。
 * fake = FakeExecutorSandbox（tests/fixtures/executor-port-fakes.ts）。
 */

/**
 * ExecutorSandbox 端口 — executor 真正消费的 sandbox 4 方法子集。
 * wrapWithSandbox 返回值 = 改写后的命令串（沙箱包装层，shellquote 层内层 /bin/sh）。
 *
 * S-T4 ⑧ 消费面激活（§8.53）：新增 shouldUseSandbox(command) 决策方法——旧仓
 * shouldUseSandbox 决策（isSandboxingEnabled 总门 + 用户 excludedCommands 不动点
 * 剥除匹配）经组合根 adapter 委托 engine/tools shouldUseSandbox({command}) 落 executor
 * 消费面。L3 保持：executor 只面向本端口编程（不 import engine/sandbox 域），决策实现
 * 归组合根 adapter（两域互不 import，adapter 是组合根专属活，charter L4.7）。
 * 逃生支（dangerouslyDisableSandbox + areUnsandboxedCommandsAllowed）= 工具层输入，
 * 本 executor 端口面不透出（Bash 工具本体子波经 engine shouldUseSandbox 直接消费）。
 */
export interface ExecutorSandboxPort {
  /** 沙箱是否启用（manager 总门；Shell.ts useSandbox AND 支消费）。 */
  isSandboxingEnabled(): boolean
  /**
   * 每命令沙箱决策（S-T4 ⑧ 消费面）：isSandboxingEnabled 总门 + 用户
   * excludedCommands 不动点剥除匹配（engine/tools shouldUseSandbox 语义）。
   * ShellExecutor.exec 消费 → Shell.ts shouldUseSandbox 参。
   */
  shouldUseSandbox(command: string): boolean
  /**
   * 命令沙箱包装（旧仓 wrapWithSandbox(command, binShell, undefined, signal) 的窄面）。
   * 返回包装后的命令串；调用方以 /bin/sh -c 外层 spawn 解析 POSIX 输出。
   */
  wrapWithSandbox(
    command: string,
    binShell?: string,
    abortSignal?: AbortSignal,
  ): Promise<string>
  /** 命令后清理（bwrap 在宿主残留 0 字节挂载点文件；macOS 上 no-op）。 */
  cleanupAfterCommand(): void
}

// ── 注入窗口（组合根注入，modelprovider/roles.ts 同款 idiom）──────────────
let activePort: ExecutorSandboxPort | null = null

/** 组合根注入 SandboxManager 适配器（SandboxManager → 本端口，omit customConfig）。 */
export function setExecutorSandboxPort(port: ExecutorSandboxPort): void {
  activePort = port
}

/** 读当前端口。未注入 = fail-fast 抛错（防沙箱语义无声降级）。 */
export function getExecutorSandboxPort(): ExecutorSandboxPort {
  if (!activePort) {
    throw new Error(
      'ExecutorSandboxPort 未注入 — 组合根（atlascode/compose.ts）须先 setExecutorSandboxPort()',
    )
  }
  return activePort
}

/** 测试复位。 */
export function resetExecutorSandboxPort(): void {
  activePort = null
}
