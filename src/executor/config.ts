/**
 * 自治三柱③: executor 配置 — B 波 S1 实现
 *
 * charter L3 executor 自治：Shell/ShellCommand/shellProvider 收进域内；
 * config.ts 读 env → ShellExecutorConfig。
 * AscendConfig 在 ascend/ 域包（E 波），不在此。
 *
 * env 来源：env-defaults-decision.md（ATLAS_SHELL / ATLAS_SHELL_PREFIX /
 * ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR）。
 * 布尔 env 走 shared parseBoolEnv（"1"/"true" → true，其余 false）。
 */

import { parseBoolEnv } from "../shared"

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
 * 读 env 生成 ShellExecutorConfig。
 * @returns executor 域 shell 配置
 */
export function createShellExecutorConfig(): ShellExecutorConfig {
  return {
    // ③ 缺省 = undefined（自动探测，Shell.ts findSuitableShell 处理）
    shell: process.env.ATLAS_SHELL || undefined,
    // ② 值默认 = env 原值（bashProvider.ts 直接读 process.env.ATLAS_SHELL_PREFIX）
    shellPrefix: process.env.ATLAS_SHELL_PREFIX || undefined,
    // ③ 保持关（未设置 = false）
    maintainProjectWorkingDir: parseBoolEnv(
      process.env.ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR,
    ),
  }
}
