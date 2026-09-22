/**
 * 自治三柱③: sandbox 配置收拢（env+settings）— B 波 S1 实现
 *
 * charter L3 sandbox 自治：settings 5 处耦合 → SandboxDependencies 注入；
 * ripgrep/permissions 收进域内；config.ts 读 env → SandboxConfig。
 *
 * env 来源：env-defaults-decision.md（ATLAS_GLOB_* 三项）。
 * 布尔 env 走 shared isEnvTruthy（T3 约定）；整数 env 走 shared parseBoundedIntEnv。
 * settings 部分走 SandboxDependencies 注入（不在 env config 内）。
 */

import { isEnvTruthy, parseBoundedIntEnv } from "../shared"

/** sandbox 域从 env 读取的配置（settings 部分走 SandboxDependencies 注入，不在此） */
export interface SandboxConfig {
  /** ATLAS_GLOB_TIMEOUT_SECONDS（② preset 0 = 不限时） */
  readonly globTimeoutSeconds: number
  /** ATLAS_GLOB_HIDDEN（③ 保持关） */
  readonly globHidden: boolean
  /** ATLAS_GLOB_NO_IGNORE（③ 保持关） */
  readonly globNoIgnore: boolean
}

/**
 * 读 env 生成 SandboxConfig。
 * @returns sandbox 域 env 配置（settings 走注入不在此）
 */
export function createSandboxConfig(): SandboxConfig {
  // ② preset 0 = 不限时。upperLimit 1_800_000（30 min cap，防误设超大值挂起）
  const timeout = parseBoundedIntEnv(
    "ATLAS_GLOB_TIMEOUT_SECONDS",
    process.env.ATLAS_GLOB_TIMEOUT_SECONDS,
    0,
    1_800_000,
  )
  return {
    globTimeoutSeconds: timeout.effective,
    // ③ 保持关（未设置 = false）
    globHidden: isEnvTruthy(process.env.ATLAS_GLOB_HIDDEN),
    // ③ 保持关（未设置 = false）
    globNoIgnore: isEnvTruthy(process.env.ATLAS_GLOB_NO_IGNORE),
  }
}
