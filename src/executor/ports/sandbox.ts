/**
 * ExecutorSandbox 端口 — sandbox 域 SandboxManager 在 executor 侧的窄视图（C2 · sandbox 注入）
 *
 * 旧仓消费面（32 方法 SandboxManager，新仓 src/sandbox/types.ts 已全量保留）：
 *   - ShellExecutor.exec → `isSandboxingEnabled()`（shouldUseSandbox 决策）
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
 * ExecutorSandbox 端口 — executor 真正消费的 sandbox 3 方法子集。
 * wrapWithSandbox 返回值 = 改写后的命令串（沙箱包装层，shellquote 层内层 /bin/sh）。
 */
export interface ExecutorSandboxPort {
  /** 沙箱是否启用（ShellExecutor → shouldUseSandbox）。 */
  isSandboxingEnabled(): boolean
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
