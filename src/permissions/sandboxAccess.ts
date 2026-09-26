/**
 * permissions 域 — sandbox 状态跨域注入窗口（E-6 S-6a，§8.43）。
 *
 * L3 自治裁定（E-1）：permissions 域不 import sandbox 域——消费 sandbox
 * 状态的两个决策点走本窗口：
 *   - isPathInSandboxWriteAllowlist（pathValidation.ts 3.7 支：写 allowlist
 *     命中免弹框）—— isSandboxingEnabled + getFsWriteConfig
 *   - hasPermissionsToUseTool ⑥ Bash sandbox 自动放行（S-6b 半落）——
 *     isAutoAllowBashIfSandboxedEnabled
 * 接线面 = 组合根（E-wave-end 装配项）：setSandboxAccess(
 * createSandboxManager() 闭包面，结构兼容——getFsWriteConfig 返回 sandbox
 * 域 FsWriteRestrictionConfig，此处按 { allowOnly, denyWithinAllow } 窄视图
 * 消费，不 import sandbox 域类型）。
 *
 * placeholder 禁用态（未注入 / reset）：
 *   - isSandboxingEnabled / isAutoAllowBashIfSandboxedEnabled = false
 *     （写 allowlist 3.7 支短路 false / ⑥ 自动放行短路失活——等价旧仓
 *     sandbox 未启用态，零行为变化）
 *   - areUnsandboxedCommandsAllowed = false（工具本体波 S-T2b 扩面 2026-09-25，
 *     §8.53：shouldUseSandbox 逃生支 `dangerouslyDisableSandbox &&
 *     areUnsandboxedCommandsAllowed()` 为第一真消费者——placeholder 态
 *     isSandboxingEnabled 恒 false 先行短路，此返回仅类型完备，零行为；
 *     S-T4 组合根 ⑧ 注入真闭包 = sandbox 域
 *     manager.areUnsandboxedCommandsAllowed（src/sandbox/
 *     createSandboxManager.ts:288，旧仓 `?? true` 语义逐字））
 *   - getFsWriteConfig = 空配置（仅在 isSandboxingEnabled 真分支后触达；
 *     placeholder 态恒被前者短路，此返回仅类型完备）
 *
 * 前向消费接缝（H6 防空洞登记）：
 *   - S-6b ⑥ 半落（isAutoAllowBashIfSandboxedEnabled 消费点）
 *   - 组合根接线（E-wave-end 装配项 / 工具本体波 S-T4 ⑧）：生产链
 *     setSandboxAccess(manager 闭包面，含 areUnsandboxedCommandsAllowed）
 *
 * S-B4 扩面 4 成员（Bash 本体纵切子波 §8.54 ⑤，2026-09-26）：
 *   getFsReadConfig / getNetworkRestrictionConfig / getAllowUnixSockets /
 *   getIgnoreViolations —— bashPrompt getSimpleSandboxSection（旧仓
 *   prompt.ts getSandboxManager 7 调用面剩余 4 配置读成员）首消费者；
 *   窄视图类型（SandboxFsReadConfig / SandboxNetworkRestrictionConfig /
 *   SandboxIgnoreViolationsConfig）= sandbox 域配置型同构子集，不 import
 *   sandbox 域类型（SandboxFsWriteConfig 先例）；组合根 ⑧ 注入位同步扩
 *   （直绑 manager 方法，adapter 壳零改——executor 端口不消费新成员）。
 *   placeholder 态 4 成员 = 空配置/undefined（仅在 isSandboxingEnabled
 *   真分支后触达；placeholder 恒 false 短路 → 零行为，仅类型完备，同
 *   getFsWriteConfig 登记）。
 */

/** sandbox FS 写配置窄视图（sandbox 域 FsWriteRestrictionConfig 同构子集）。 */
export type SandboxFsWriteConfig = {
  allowOnly: string[]
  denyWithinAllow: string[]
}

/** sandbox FS 读配置窄视图（sandbox 域 FsReadRestrictionConfig 同构子集）。 */
export type SandboxFsReadConfig = {
  denyOnly: string[]
  allowWithinDeny?: string[]
}

/** 网络限制配置窄视图（sandbox 域 NetworkRestrictionConfig 同构子集）。 */
export type SandboxNetworkRestrictionConfig = {
  allowedHosts?: string[]
  deniedHosts?: string[]
}

/** 忽略违规配置窄视图（sandbox 域 IgnoreViolationsConfig 同构子集）。 */
export type SandboxIgnoreViolationsConfig = Record<string, readonly string[]>

export type SandboxAccess = {
  isSandboxingEnabled(): boolean
  isAutoAllowBashIfSandboxedEnabled(): boolean
  /**
   * dangerouslyDisableSandbox 逃生门策略读面（S-T2b 扩面；旧仓
   * SandboxManager.areUnsandboxedCommandsAllowed = settings.sandbox.
   * allowUnsandboxedCommands ?? true）。placeholder false = 逃生支失活。
   */
  areUnsandboxedCommandsAllowed(): boolean
  getFsWriteConfig(): SandboxFsWriteConfig
  /**
   * S-B4 扩面（§8.54 ⑤）：bashPrompt sandbox 段配置读 4 成员（窄视图，
   * 不 import sandbox 域类型）。placeholder 态恒被 isSandboxingEnabled
   * 短路不可达，零行为（类型完备，复审勿当遗漏重提）。
   */
  getFsReadConfig(): SandboxFsReadConfig
  getNetworkRestrictionConfig(): SandboxNetworkRestrictionConfig
  getAllowUnixSockets(): string[] | undefined
  getIgnoreViolations(): SandboxIgnoreViolationsConfig | undefined
}

const PLACEHOLDER: SandboxAccess = {
  isSandboxingEnabled: () => false,
  isAutoAllowBashIfSandboxedEnabled: () => false,
  areUnsandboxedCommandsAllowed: () => false,
  getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
  getFsReadConfig: () => ({ denyOnly: [] }),
  getNetworkRestrictionConfig: () => ({}),
  getAllowUnixSockets: () => undefined,
  getIgnoreViolations: () => undefined,
}

let instance: SandboxAccess = PLACEHOLDER

export function setSandboxAccess(access: SandboxAccess): void {
  instance = access
}

export function getSandboxAccess(): SandboxAccess {
  return instance
}

export function resetSandboxAccess(): void {
  instance = PLACEHOLDER
}
