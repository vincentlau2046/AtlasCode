/**
 * sandbox-runtime 结构类型（sandbox 域自管，B 波 S1 迁入）。
 *
 * 旧仓来源（a8af45b）: src/vendor/atlas-sandbox-runtime.ts（类型部分）
 * 旧仓经 `#atlas-sandbox-runtime` package.json imports map 别名消费；新仓无该别名，
 * 类型下沉到 sandbox 域内（runtime 值加载器待 createSandboxManager 迁移时落）。
 *
 * 这些结构类型是 sandbox 消费面的单一事实源（旧仓 vendor shim 注释明示），
 * 镜像 createSandboxManager.convertToSandboxRuntimeConfig() 产出 + BashTool/prompt 消费。
 */

export interface NetworkHostPattern {
  host: string
  port?: number
}

export type SandboxAskCallback = (
  hostPattern: NetworkHostPattern,
) => Promise<boolean>

export interface SandboxDependencyCheck {
  errors: string[]
  warnings: string[]
}

export interface FsReadRestrictionConfig {
  denyOnly: string[]
  allowWithinDeny?: string[]
}

export interface FsWriteRestrictionConfig {
  allowOnly: string[]
  denyWithinAllow: string[]
}

export interface NetworkRestrictionConfig {
  allowedHosts?: string[]
  deniedHosts?: string[]
}

export type IgnoreViolationsConfig = Record<string, readonly string[]>

export interface SandboxRuntimeConfig {
  network: {
    allowedDomains: string[]
    deniedDomains: string[]
    allowUnixSockets?: string[]
    allowAllUnixSockets?: boolean
    allowLocalBinding?: boolean
    httpProxyPort?: number
    socksProxyPort?: number
  }
  filesystem: {
    denyRead: string[]
    allowRead: string[]
    allowWrite: string[]
    denyWrite: string[]
  }
  ignoreViolations?: IgnoreViolationsConfig
  enableWeakerNestedSandbox?: boolean
  enableWeakerNetworkIsolation?: boolean
  ripgrep: {
    command: string
    args: string[]
    argv0?: string
  }
}

export interface SandboxViolationEvent {
  type?: string
  path?: string
  host?: string
  command?: string
  message?: string
  timestamp?: number
}

export interface SandboxViolationStore {
  addViolation(v: SandboxViolationEvent): void
  getViolations(limit?: number): SandboxViolationEvent[]
  getCount(): number
  getTotalCount(): number
  clear(): void
  subscribe(listener: (violations: SandboxViolationEvent[]) => void): () => void
}

/**
 * sandbox runtime 后端静态面（createSandboxManager 转发生命周期/wrap/getter 调用到此）。
 * 旧仓 vendor shim 的 BaseSandboxManagerStatic；运行时值加载待 createSandboxManager 迁移。
 */
export interface BaseSandboxManagerStatic {
  initialize(config: SandboxRuntimeConfig, ask?: SandboxAskCallback): Promise<void>
  updateConfig(config: SandboxRuntimeConfig): void
  reset(): Promise<void>
  wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: Partial<SandboxRuntimeConfig>,
    signal?: AbortSignal,
  ): Promise<string>
  cleanupAfterCommand(): void
  isSupportedPlatform(): boolean
  isSandboxingEnabled(): boolean
  isSandboxEnabledInSettings(): boolean
  checkDependencies(opts: { command: string; args: string[] }): SandboxDependencyCheck
  getFsReadConfig(): FsReadRestrictionConfig
  getFsWriteConfig(): FsWriteRestrictionConfig
  getNetworkRestrictionConfig(): NetworkRestrictionConfig
  getAllowUnixSockets(): string[] | undefined
  getAllowLocalBinding(): boolean | undefined
  getIgnoreViolations(): IgnoreViolationsConfig | undefined
  getEnableWeakerNestedSandbox(): boolean | undefined
  getProxyPort(): number | undefined
  getSocksProxyPort(): number | undefined
  getLinuxHttpSocketPath(): string | undefined
  getLinuxSocksSocketPath(): string | undefined
  waitForNetworkInitialization(): Promise<boolean>
  annotateStderrWithSandboxFailures(command: string, stderr: string): string
}
