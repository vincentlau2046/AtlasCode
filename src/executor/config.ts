/**
 * 自治三柱③: executor 配置 — 契约冻结（B 波分叉前锁死）
 *
 * charter L3 executor 自治：Shell/ShellCommand/shellProvider 收进域内；
 * config.ts 读 env → ShellExecutorConfig。
 * AscendConfig 在 ascend/ 域包（E 波），不在此。
 *
 * env 来源：env-defaults-decision.md（ATLAS_SHELL / ATLAS_SHELL_PREFIX）。
 */

/** executor 域从 env 读取的 shell 配置 */
export interface ShellExecutorConfig {
  /** ATLAS_SHELL（③ 缺省 = 自动探测） */
  readonly shell: string | undefined
  /** ATLAS_SHELL_PREFIX（② 值默认） */
  readonly shellPrefix: string | undefined
  /** ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR（③ 保持关） */
  readonly maintainProjectWorkingDir: boolean
}

/**
 * 读 env 生成 ShellExecutorConfig。B 波 S1 实现。
 * @returns executor 域 shell 配置
 */
export function createShellExecutorConfig(): ShellExecutorConfig {
  // B 波 S1 实现：读 process.env + env-defaults-decision fallback
  throw new Error("B 波 S1 实现：createShellExecutorConfig()")
}
