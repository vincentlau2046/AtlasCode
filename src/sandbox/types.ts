/**
 * Sandbox module types — interfaces for the Sandbox service（B 波 S1 迁入）。
 *
 * 旧仓来源（a8af45b）: src/core/sandbox/types.ts
 * 旧仓经 `#atlas-sandbox-runtime` 别名 + settings/constants + settings/types + platform
 * 消费（G-3 R5-a：别名 + vendor shim 已裁，外部包不落地）；新仓下沉：runtime 类型 → ./runtime-types（域内自管），settings/platform 类型
 * → 域内本地定义（C 波 settings 模块落地后下沉 shared，见 TODO 标记）。
 *
 * SandboxManager 32 方法签名不变（旧仓实测 32 非 28，全保留）。
 */

import type {
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  IgnoreViolationsConfig,
  NetworkRestrictionConfig,
  SandboxAskCallback,
  SandboxDependencyCheck,
  SandboxRuntimeConfig,
  SandboxViolationStore,
} from "./runtime-types"

// ============================================================================
// 本地 settings/platform 类型（C 波 settings 模块落地后下沉 shared）
// ============================================================================

/**
 * 设置来源（旧仓 utils/settings/constants.ts SETTING_SOURCES）。
 * TODO: C 波 settings 模块落地后改 import from shared/settings。
 */
export type SettingSource =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "flagSettings"
  | "policySettings"

/**
 * 设置 JSON schema（旧仓 utils/settings/types.ts SettingsJson）。
 * TODO: C 波 settings 模块落地后替换为真实 schema 类型。
 * 暂用 opaque Record——SandboxDependencies 仅透传，不结构消费。
 */
export type SettingsJson = Record<string, unknown>

/**
 * 平台标识（旧仓 utils/platform.ts）。
 * TODO: C 波下沉 shared（多域共用）。
 */
export type Platform = "macos" | "windows" | "wsl" | "linux" | "unknown"

// ============================================================================
// SandboxDependencies — external dependencies injected into the factory
// ============================================================================

/**
 * All module-level external dependencies that createSandboxManager needs.
 *
 * Instead of directly importing settings/state/platform functions,
 * the factory function receives them through this interface.
 * This eliminates circular dependencies and enables testing.
 */
export interface SandboxDependencies {
  getSettings(): SettingsJson
  getInitialSettings(): SettingsJson
  getSettingsForSource(source: SettingSource): SettingsJson | undefined
  getSettingsFilePathForSource(source: SettingSource): string | undefined
  getSettingsRootPathForSource(source: SettingSource): string | undefined
  getCwd(): string
  getOriginalCwd(): string
  getPlatform(): Platform
  getAdditionalDirectories(): string[]
  onSettingsChange(callback: () => void): () => void
  getConfigDirName(): string
  getAtlasTempDir(): string
  getManagedSettingsDropInDir(): string
  updateSettingsForSource(source: SettingSource, values: Partial<SettingsJson>): void
  SETTING_SOURCES: readonly SettingSource[]
}

// ============================================================================
// SandboxManager — public interface (moved from sandbox-adapter.ts)
// ============================================================================

export interface SandboxManager {
  initialize(sandboxAskCallback?: SandboxAskCallback): Promise<void>
  isSupportedPlatform(): boolean
  isPlatformInEnabledList(): boolean
  getSandboxUnavailableReason(): string | undefined
  isSandboxingEnabled(): boolean
  isSandboxEnabledInSettings(): boolean
  checkDependencies(): SandboxDependencyCheck
  isAutoAllowBashIfSandboxedEnabled(): boolean
  areUnsandboxedCommandsAllowed(): boolean
  isSandboxRequired(): boolean
  areSandboxSettingsLockedByPolicy(): boolean
  setSandboxSettings(options: {
    enabled?: boolean
    autoAllowBashIfSandboxed?: boolean
    allowUnsandboxedCommands?: boolean
  }): Promise<void>
  getFsReadConfig(): FsReadRestrictionConfig
  getFsWriteConfig(): FsWriteRestrictionConfig
  getNetworkRestrictionConfig(): NetworkRestrictionConfig
  getAllowUnixSockets(): string[] | undefined
  getAllowLocalBinding(): boolean | undefined
  getIgnoreViolations(): IgnoreViolationsConfig | undefined
  getEnableWeakerNestedSandbox(): boolean | undefined
  getExcludedCommands(): string[]
  getProxyPort(): number | undefined
  getSocksProxyPort(): number | undefined
  getLinuxHttpSocketPath(): string | undefined
  getLinuxSocksSocketPath(): string | undefined
  waitForNetworkInitialization(): Promise<boolean>
  wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: Partial<SandboxRuntimeConfig>,
    abortSignal?: AbortSignal,
  ): Promise<string>
  cleanupAfterCommand(): void
  getSandboxViolationStore(): SandboxViolationStore
  annotateStderrWithSandboxFailures(command: string, stderr: string): string
  getLinuxGlobPatternWarnings(): string[]
  refreshConfig(): void
  reset(): Promise<void>
}

// ============================================================================
// Re-export types from runtime-types (so consumers can import from one place)
// ============================================================================

export type {
  SandboxAskCallback,
  SandboxDependencyCheck,
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  NetworkRestrictionConfig,
  NetworkHostPattern,
  SandboxViolationEvent,
  SandboxRuntimeConfig,
  IgnoreViolationsConfig,
  SandboxViolationStore,
  BaseSandboxManagerStatic,
} from "./runtime-types"

// 旧仓还 re-export 两个 runtime 值（SandboxViolationStore / SandboxRuntimeConfigSchema）。
// SandboxViolationStore 为类型（上列已导出）；runtime 值加载器已落
// ./runtime.ts（C-Deep 切片 2，placeholder + 注入窗口，经门面 index.ts 导出
// set/get/resetSandboxRuntimeModule）；SandboxRuntimeConfigSchema（zod 校验）
// 随真 runtime 包提供（B6-func/D 波，见 runtime.ts 残余清单）。
