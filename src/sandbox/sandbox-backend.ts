/**
 * SandboxBackend — sandbox 运行时"后端扩展点"（C-Deep 切片 2 移植）
 *
 * 旧仓来源（a8af45b）: src/core/sandbox/sandbox-backend.ts（302L）。
 * SandboxManager 32 方法接口冻结——本层纯增量（新后端 = 1 类 + registry
 * 一行注册，manager 与消费方零改动）。
 *
 * 移植口径（裁剪版）：
 * - 旧仓 AtlasSandboxBackend 静态 import `#atlas-sandbox-runtime` 的（G-3 R5-a：别名 + shim 已裁）
 *   BaseSandboxManager 静态面；新仓 runtime 经注入窗口（./runtime
 *   getSandboxRuntimeModule，调用时查找）——构造后可换入真 runtime，
 *   与 executor 三 port 注入同款 idiom。
 * - violation store 逻辑照抄（100 条上限 + 标准化事件总线转发）。
 *
 * 残余：Docker/K8s 等真后端注册（B6-func/D 波随 runtime 定案）。
 */
import type {
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  IgnoreViolationsConfig,
  NetworkRestrictionConfig,
  SandboxAskCallback,
  SandboxDependencyCheck,
  SandboxRuntimeConfig,
  SandboxViolationEvent,
  SandboxViolationStore,
} from "./runtime-types"
import { getSandboxRuntimeModule } from "./runtime"
import type {
  SandboxEventBus,
  ViolationCategory,
  ViolationEvent,
} from "./sandbox-events"

// ============================================================================
// SandboxBackend — 接口（manager 转发面）
// ============================================================================

export interface SandboxBackend {
  readonly name: string

  // ---- 生命周期 ----
  initialize(config: SandboxRuntimeConfig, ask?: SandboxAskCallback): Promise<void>
  updateConfig(config: SandboxRuntimeConfig): void
  reset(): Promise<void>

  // ---- 命令包装 ----
  wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: Partial<SandboxRuntimeConfig>,
    signal?: AbortSignal,
  ): Promise<string>
  cleanupAfterCommand(): void

  // ---- 平台检查 ----
  isSupportedPlatform(): boolean
  checkDependencies(opts: { command: string; args: string[] }): SandboxDependencyCheck

  // ---- 配置 getters（转发 runtime）----
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

  // ---- 诊断 ----
  getSandboxViolationStore(): SandboxViolationStore
  annotateStderrWithSandboxFailures(command: string, stderr: string): string
}

// ============================================================================
// AtlasSandboxBackend — 包装注入的 runtime module
// ============================================================================

export class AtlasSandboxBackend implements SandboxBackend {
  readonly name = "atlas"

  private readonly _violationStore: SandboxViolationStore
  private readonly _eventBus: SandboxEventBus | undefined

  constructor(eventBus?: SandboxEventBus) {
    this._eventBus = eventBus

    // violation store（旧仓同逻辑：100 条上限 + 事件总线标准化转发）
    type Listener = (violations: SandboxViolationEvent[]) => void
    const violations: SandboxViolationEvent[] = []
    let totalCount = 0
    const listeners = new Set<Listener>()
    const maxSize = 100
    const toStandardEvent = (v: Record<string, unknown>): ViolationEvent => {
      const category: ViolationCategory =
        (v.type as ViolationCategory) ??
        (typeof v.path === "string" ? "fs:read" : "other")
      return {
        category,
        path: typeof v.path === "string" ? v.path : undefined,
        host: typeof v.host === "string" ? v.host : undefined,
        command: typeof v.command === "string" ? v.command : undefined,
        message:
          typeof v.message === "string"
            ? v.message
            : `Sandbox violation: ${String(v.type ?? "unknown")}`,
        timestamp: typeof v.timestamp === "number" ? v.timestamp : Date.now(),
      }
    }

    this._violationStore = {
      addViolation: (v: SandboxViolationEvent) => {
        violations.push(v)
        totalCount++
        if (violations.length > maxSize)
          violations.splice(0, violations.length - maxSize)
        for (const listener of listeners) listener([...violations])

        if (this._eventBus) {
          this._eventBus.emitViolation(
            toStandardEvent(v as Record<string, unknown>),
          )
        }
      },
      getViolations: (limit?: number) =>
        limit ? violations.slice(-limit) : [...violations],
      getCount: () => violations.length,
      getTotalCount: () => totalCount,
      clear: () => {
        violations.length = 0
        for (const listener of listeners) listener([])
      },
      subscribe: (listener: Listener) => {
        listeners.add(listener)
        listener([...violations])
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }

  // ---- 生命周期（转发注入 runtime，调用时查找）----

  async initialize(config: SandboxRuntimeConfig, ask?: SandboxAskCallback): Promise<void> {
    return getSandboxRuntimeModule().initialize(config, ask)
  }

  updateConfig(config: SandboxRuntimeConfig): void {
    getSandboxRuntimeModule().updateConfig(config)
  }

  async reset(): Promise<void> {
    return getSandboxRuntimeModule().reset()
  }

  // ---- 命令包装 ----

  async wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: Partial<SandboxRuntimeConfig>,
    signal?: AbortSignal,
  ): Promise<string> {
    return getSandboxRuntimeModule().wrapWithSandbox(
      command,
      binShell,
      customConfig,
      signal,
    )
  }

  cleanupAfterCommand(): void {
    getSandboxRuntimeModule().cleanupAfterCommand()
  }

  // ---- 平台检查 ----

  isSupportedPlatform(): boolean {
    return getSandboxRuntimeModule().isSupportedPlatform()
  }

  checkDependencies(opts: {
    command: string
    args: string[],
  }): SandboxDependencyCheck {
    return getSandboxRuntimeModule().checkDependencies(opts)
  }

  // ---- 配置 getters ----

  getFsReadConfig(): FsReadRestrictionConfig {
    return getSandboxRuntimeModule().getFsReadConfig()
  }

  getFsWriteConfig(): FsWriteRestrictionConfig {
    return getSandboxRuntimeModule().getFsWriteConfig()
  }

  getNetworkRestrictionConfig(): NetworkRestrictionConfig {
    return getSandboxRuntimeModule().getNetworkRestrictionConfig()
  }

  getAllowUnixSockets(): string[] | undefined {
    return getSandboxRuntimeModule().getAllowUnixSockets()
  }

  getAllowLocalBinding(): boolean | undefined {
    return getSandboxRuntimeModule().getAllowLocalBinding()
  }

  getIgnoreViolations(): IgnoreViolationsConfig | undefined {
    return getSandboxRuntimeModule().getIgnoreViolations()
  }

  getEnableWeakerNestedSandbox(): boolean | undefined {
    return getSandboxRuntimeModule().getEnableWeakerNestedSandbox()
  }

  getProxyPort(): number | undefined {
    return getSandboxRuntimeModule().getProxyPort()
  }

  getSocksProxyPort(): number | undefined {
    return getSandboxRuntimeModule().getSocksProxyPort()
  }

  getLinuxHttpSocketPath(): string | undefined {
    return getSandboxRuntimeModule().getLinuxHttpSocketPath()
  }

  getLinuxSocksSocketPath(): string | undefined {
    return getSandboxRuntimeModule().getLinuxSocksSocketPath()
  }

  async waitForNetworkInitialization(): Promise<boolean> {
    return getSandboxRuntimeModule().waitForNetworkInitialization()
  }

  // ---- 诊断 ----

  getSandboxViolationStore(): SandboxViolationStore {
    return this._violationStore
  }

  annotateStderrWithSandboxFailures(
    command: string,
    stderr: string,
  ): string {
    return getSandboxRuntimeModule().annotateStderrWithSandboxFailures(
      command,
      stderr,
    )
  }
}

// ============================================================================
// 后端工厂（预留扩展点：新后端 = 1 类 + 一行注册）
// ============================================================================

export interface SandboxBackendConfig {
  /** 后端名。默认 "atlas" */
  backend?: string
  /** 违规事件外部订阅总线。 */
  eventBus?: SandboxEventBus
}

const _backendRegistry = new Map<string, () => SandboxBackend>()

export function createSandboxBackend(
  config?: SandboxBackendConfig,
): SandboxBackend {
  const name = config?.backend ?? "atlas"
  const factory = _backendRegistry.get(name)
  if (factory) return factory()
  return new AtlasSandboxBackend(config?.eventBus)
}

/** 注册自定义后端工厂（应用启动时调用）。 */
export function registerSandboxBackend(
  name: string,
  factory: () => SandboxBackend,
): void {
  _backendRegistry.set(name, factory)
}
