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
 *   - getFsWriteConfig = 空配置（仅在 isSandboxingEnabled 真分支后触达；
 *     placeholder 态恒被前者短路，此返回仅类型完备）
 *
 * 前向消费接缝（H6 防空洞登记）：
 *   - S-6b ⑥ 半落（isAutoAllowBashIfSandboxedEnabled 消费点）
 *   - 组合根接线（E-wave-end 装配项）：生产链 setSandboxAccess(manager)
 */

/** sandbox FS 写配置窄视图（sandbox 域 FsWriteRestrictionConfig 同构子集）。 */
export type SandboxFsWriteConfig = {
  allowOnly: string[]
  denyWithinAllow: string[]
}

export type SandboxAccess = {
  isSandboxingEnabled(): boolean
  isAutoAllowBashIfSandboxedEnabled(): boolean
  getFsWriteConfig(): SandboxFsWriteConfig
}

const PLACEHOLDER: SandboxAccess = {
  isSandboxingEnabled: () => false,
  isAutoAllowBashIfSandboxedEnabled: () => false,
  getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
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
