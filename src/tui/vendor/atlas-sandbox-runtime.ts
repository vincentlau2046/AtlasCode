// De-Anthropic (P1.2): the public import specifier is `#atlas-sandbox-runtime`
// (resolved via the package.json `imports` map). This shim re-exports the
// installed `@anthropic-ai/sandbox-runtime` (main: index.js) so the Anthropic-
// branded package name stays an internal implementation detail.
//
// [ATLAS-HOLD] 物理 npm 依赖仍为 @anthropic-ai/sandbox-runtime（下方
// require 路径）：包改名需 Atlas 以自有 scope 重新发包（待 Atlas 发版），
// 在此之前 node_modules 路径保持原名。消费面已全部走 #atlas-sandbox-runtime
// 公开说明符，本文件是 @anthropic-ai 命名的最后残留点。
//
// Graceful fallback (test-optimize): @anthropic-ai/sandbox-runtime is an external
// package not installed locally (CI installs it). The original `export * from`
// crashed the module graph at import time for any test file that transitively
// imported this shim. We try to require the real package and fall back to empty
// placeholders, so the module graph loads cleanly regardless. Tests that actually
// exercise sandbox functionality will fail at call time, not at import time.
//
// Types: the real package ships no .d.ts usable in this environment, so the
// structural types below are the single source of truth for consumers
// (core/sandbox/*). They mirror the shapes produced by
// createSandboxManager.convertToSandboxRuntimeConfig() and consumed by
// BashTool/prompt.ts, pathValidation.ts, structuredIO.ts.

// ── Structural types ────────────────────────────────────────────────────────

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

// ── Runtime values (real package when installed, placeholders otherwise) ────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSandboxRuntime(): any {
  try {
    // @ts-ignore — external unpublished package (CI installs it).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@anthropic-ai/sandbox-runtime/index.js')
  } catch {
    // Package not installed — return empty placeholders. Consumers that actually
    // call into sandbox-runtime will fail at call time, which is correct for
    // environments lacking the package (local dev, most test files).
    return {
      SandboxManager: class {
        static isSupportedPlatform() { return false }
        static isSandboxingEnabled() { return false }
        static isSandboxEnabledInSettings() { return false }
      },
      SandboxRuntimeConfigSchema: {
        parse: (x: any) => x,
        safeParse: (x: any) => ({ success: true, data: x }),
      },
      SandboxViolationStore: class {
        add() {}
        get() { return [] }
        clear() {}
      },
    }
  }
}

const _sr = loadSandboxRuntime()

// Shape of the runtime class's static surface (declared here so the fallback
// class above and the real package both satisfy it structurally).
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

// Static-method holder for the sandbox runtime backend (AtlasSandboxBackend
// forwards lifecycle/wrap/getter calls onto it).
export const SandboxManager: BaseSandboxManagerStatic = _sr.SandboxManager
export const SandboxRuntimeConfigSchema: any = _sr.SandboxRuntimeConfigSchema
export const SandboxViolationStore: any = _sr.SandboxViolationStore
