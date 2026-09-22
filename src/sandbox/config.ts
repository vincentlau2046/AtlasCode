/**
 * 自治三柱③: sandbox 配置收拢（env+settings）— 契约冻结（B 波分叉前锁死）
 *
 * charter L3 sandbox 自治：settings 5 处耦合 → SandboxDependencies 注入；
 * ripgrep/permissions 收进域内；config.ts 读 env → SandboxConfig。
 *
 * 契约 = 接口签名定死（factory 签名锁，实现 B 波 S1 做）。
 * env 来源：env-defaults-decision.md（ATLAS_GLOB_* 三项）。
 */

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
 * 读 env 生成 SandboxConfig。B 波 S1 实现。
 * @returns sandbox 域 env 配置（settings 走注入不在此）
 */
export function createSandboxConfig(): SandboxConfig {
  // B 波 S1 实现：读 process.env + env-defaults-decision fallback
  throw new Error("B 波 S1 实现：createSandboxConfig()")
}
