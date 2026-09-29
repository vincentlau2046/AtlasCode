/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * createSandboxManager(deps) 工厂（裁剪版，C-Deep 切片 2）
 *
 * 旧仓来源（a8af45b）: src/core/sandbox/createSandboxManager.ts（450L）。
 * 工厂闭包替代模块级 let（旧仓 Phase 4 S4-2 同款结构照抄）：
 * SandboxDependencies 注外部依赖 + 可选 SandboxBackend（默认经
 * createSandboxBackend() 注册表取 atlas 后端）。
 *
 * 移植口径（D5 裁剪裁定，bwrap/Linux 主路径，复审勿当遗漏重提）：
 * - 32 方法面全保留（SandboxManager 签名不变）
 * - runtime config 构造 = 最小集：cwd/config 目录 denyWrite 族 /
 *   getAtlasTempDir + additionalDirs allowWrite / bare-git-repo scrub /
 *   worktree 检测 / settings.sandbox.* 开关族（typed cast，settings
 *   体系未落地前 SettingsJson 为 opaque Record）/ ripgrep 命令
 * - lodash memoize → 本地闭包缓存 memoizeNoArg（新仓无 lodash）
 *
 * 残余清单（engine 波 settings 体系 / 组合根 D 波，复审勿当遗漏重提）：
 * ① permissions 规则解析（WebFetch `domain:` 规则 → 网络域名族 /
 *    Edit·Read 规则 → 文件路径族，含 policySettings managed 分支）
 *    = engine 波 settings 体系落地后回填 convertToSandboxRuntimeConfig
 * ② makePathResolvers（旧仓 pathResolve.ts，settings 根路径驱动）
 * ③ getLinuxGlobPatternWarnings 真 glob 扫描（裁剪版返回 []）
 * ④ WSL·Windows·macOS seatbelt 平台分支（国内目标 = Linux bwrap；
 *    旧仓 WSL1 提示 / macOS doctor 提示裁）
 * ⑤ compat.ts 遗留单例 shim（组合根 D 波）
 * ⑥ SandboxRuntimeConfigSchema（zod 校验，随真 runtime 包提供，见
 *    ./runtime 残余清单）
 */
import { rmSync, statSync } from "fs"
import { readFile } from "fs/promises"
import { join, resolve, sep } from "path"

import { errorMessage, logForDebugging } from "../shared"
import type {
  Platform,
  SandboxDependencies,
  SandboxManager,
  SettingsJson,
} from "./types"
import type {
  IgnoreViolationsConfig,
  SandboxAskCallback,
  SandboxDependencyCheck,
  SandboxRuntimeConfig,
} from "./runtime-types"
import { createSandboxBackend, type SandboxBackend } from "./sandbox-backend"
import { ripgrepCommand } from "./ripgrep"

// ============================================================================
// 本地辅助
// ============================================================================

/**
 * lodash memoize 替身（新仓无 lodash）——无参函数缓存 + cache.clear()。
 * reset() 经 .cache.clear() 失效（旧仓同语义）。
 */
function memoizeNoArg<T>(fn: () => T): { (): T; cache: { clear(): void } } {
  let cached = false
  let value: T
  const wrapped = (): T => {
    if (!cached) {
      value = fn()
      cached = true
    }
    return value
  }
  wrapped.cache = {
    clear: () => {
      cached = false
    },
  }
  return wrapped
}

/**
 * settings.sandbox.* 开关族的最小结构视图（typed cast 面）。
 * engine 波 settings 体系落地后，此视图并入真实 settings schema。
 */
interface SandboxSettingsView {
  sandbox?: {
    enabled?: boolean
    autoAllowBashIfSandboxed?: boolean
    allowUnsandboxedCommands?: boolean
    failIfUnavailable?: boolean
    enabledPlatforms?: Platform[]
    excludedCommands?: string[]
    network?: {
      allowedDomains?: string[]
      allowUnixSockets?: string[]
      allowAllUnixSockets?: boolean
      allowLocalBinding?: boolean
      httpProxyPort?: number
      socksProxyPort?: number
    }
    filesystem?: {
      allowWrite?: string[]
      denyWrite?: string[]
      denyRead?: string[]
      allowRead?: string[]
    }
    ripgrep?: { command?: string; args?: string[]; argv0?: string }
    ignoreViolations?: IgnoreViolationsConfig
    enableWeakerNestedSandbox?: boolean
    enableWeakerNetworkIsolation?: boolean
  }
}

/** SettingsJson 为 opaque Record（settings 体系未落地）→ typed cast。 */
function view(settings: SettingsJson | undefined): SandboxSettingsView | undefined {
  return settings as unknown as SandboxSettingsView
}

// ============================================================================
// 工厂
// ============================================================================

export function createSandboxManager(
  deps: SandboxDependencies,
  backend?: SandboxBackend,
): SandboxManager {
  // 默认后端 = atlas 后端（注册表扩展点；B6-func/D 波随 runtime 定案可注册替代）
  const sandboxBackend = backend ?? createSandboxBackend()

  let initializationPromise: Promise<void> | undefined
  let settingsSubscriptionCleanup: (() => void) | undefined
  let worktreeMainRepoPath: string | null | undefined
  const bareGitRepoScrubPaths: string[] = []

  // Violation store 归后端所有（旧仓 S4-2）
  const violationStore = sandboxBackend.getSandboxViolationStore()

  // ---- runtime config 构造（最小集，残余见头注释 ①②）----

  function convertToSandboxRuntimeConfig(
    settings: SettingsJson,
  ): SandboxRuntimeConfig {
    const s = view(settings)
    const allowedDomains: string[] = [
      ...(s?.sandbox?.network?.allowedDomains || []),
    ]
    const allowWrite: string[] = [".", deps.getAtlasTempDir()]
    const denyWrite: string[] = []
    const denyRead: string[] = []
    const allowRead: string[] = []

    const cwd = deps.getCwd()
    const originalCwd = deps.getOriginalCwd()
    if (cwd !== originalCwd) {
      denyWrite.push(resolve(cwd, deps.getConfigDirName(), "settings.json"))
      denyWrite.push(resolve(cwd, deps.getConfigDirName(), "settings.local.json"))
    }
    denyWrite.push(resolve(originalCwd, deps.getConfigDirName(), "skills"))
    if (cwd !== originalCwd) {
      denyWrite.push(resolve(cwd, deps.getConfigDirName(), "skills"))
    }

    // bare git repo 文件：存在 → denyWrite；不存在 → 记录待 scrub 路径
    // （命令可能植入，cleanupAfterCommand 回收）
    bareGitRepoScrubPaths.length = 0
    const bareGitRepoFiles = ["HEAD", "objects", "refs", "hooks", "config"]
    for (const dir of cwd === originalCwd ? [originalCwd] : [originalCwd, cwd]) {
      for (const gitFile of bareGitRepoFiles) {
        const p = resolve(dir, gitFile)
        try {
          statSync(p)
          denyWrite.push(p)
        } catch {
          bareGitRepoScrubPaths.push(p)
        }
      }
    }

    if (worktreeMainRepoPath && worktreeMainRepoPath !== cwd) {
      allowWrite.push(worktreeMainRepoPath)
    }
    allowWrite.push(...new Set(deps.getAdditionalDirectories()))

    // settings.sandbox.filesystem 直读数组（permissions 规则解析 = 残余 ①）
    const fs = s?.sandbox?.filesystem
    if (fs) {
      for (const p of fs.allowWrite || []) allowWrite.push(p)
      for (const p of fs.denyWrite || []) denyWrite.push(p)
      for (const p of fs.denyRead || []) denyRead.push(p)
      for (const p of fs.allowRead || []) allowRead.push(p)
    }

    const { rgPath, rgArgs, argv0 } = ripgrepCommand()
    // settings 覆盖缺字段时逐字段回落系统 rg（typed cast 面，非 schema 校验）
    const ripgrepOverride = s?.sandbox?.ripgrep
    const ripgrepConfig = ripgrepOverride
      ? {
          command: ripgrepOverride.command ?? rgPath,
          args: ripgrepOverride.args ?? rgArgs,
          argv0: ripgrepOverride.argv0 ?? argv0,
        }
      : { command: rgPath, args: rgArgs, argv0 }

    return {
      network: {
        allowedDomains,
        // deniedDomains 由 permissions WebFetch 规则解析（残余 ①）；
        // 最小集恒空
        deniedDomains: [],
        allowUnixSockets: s?.sandbox?.network?.allowUnixSockets,
        allowAllUnixSockets: s?.sandbox?.network?.allowAllUnixSockets,
        allowLocalBinding: s?.sandbox?.network?.allowLocalBinding,
        httpProxyPort: s?.sandbox?.network?.httpProxyPort,
        socksProxyPort: s?.sandbox?.network?.socksProxyPort,
      },
      filesystem: {
        denyRead,
        allowRead,
        allowWrite,
        denyWrite,
      },
      ignoreViolations: s?.sandbox?.ignoreViolations,
      enableWeakerNestedSandbox: s?.sandbox?.enableWeakerNestedSandbox,
      enableWeakerNetworkIsolation:
        s?.sandbox?.enableWeakerNetworkIsolation,
      ripgrep: ripgrepConfig,
    }
  }

  // ---- scrub bare git repo files（post-command cleanup）----

  function scrubBareGitRepoFiles(): void {
    for (const p of bareGitRepoScrubPaths) {
      try {
        rmSync(p, { recursive: true })
        logForDebugging("[Sandbox] scrubbed planted bare-repo file: " + p)
      } catch {
        // ENOENT is expected - nothing was planted
      }
    }
  }

  // ---- worktree detection ----

  async function detectWorktreeMainRepoPath(cwd: string): Promise<string | null> {
    const gitPath = join(cwd, ".git")
    try {
      const gitContent = await readFile(gitPath, { encoding: "utf8" })
      const gitdirMatch = gitContent.match(/^gitdir:\s*(.+)$/m)
      if (!gitdirMatch?.[1]) {
        return null
      }
      const gitdir = resolve(cwd, gitdirMatch[1].trim())
      const marker = sep + ".git" + sep + "worktrees" + sep
      const markerIndex = gitdir.lastIndexOf(marker)
      if (markerIndex > 0) {
        return gitdir.substring(0, markerIndex)
      }
      return null
    } catch {
      return null
    }
  }

  // ---- memoized checkers（本地闭包缓存，非 lodash）----

  const checkDependencies = memoizeNoArg((): SandboxDependencyCheck => {
    const { rgPath, rgArgs } = ripgrepCommand()
    return sandboxBackend.checkDependencies({
      command: rgPath,
      args: rgArgs,
    })
  })

  const isSupportedPlatform = memoizeNoArg((): boolean => {
    return sandboxBackend.isSupportedPlatform()
  })

  // ---- settings readers ----

  function getSandboxEnabledSetting(): boolean {
    try {
      return view(deps.getSettings())?.sandbox?.enabled ?? false
    } catch (error) {
      logForDebugging("Failed to get settings for sandbox check: " + error)
      return false
    }
  }

  function isAutoAllowBashIfSandboxedEnabled(): boolean {
    return view(deps.getSettings())?.sandbox?.autoAllowBashIfSandboxed ?? true
  }

  function areUnsandboxedCommandsAllowed(): boolean {
    return view(deps.getSettings())?.sandbox?.allowUnsandboxedCommands ?? true
  }

  function isSandboxRequired(): boolean {
    const s = view(deps.getSettings())?.sandbox
    return getSandboxEnabledSetting() && (s?.failIfUnavailable ?? false)
  }

  function isPlatformInEnabledList(): boolean {
    try {
      const enabledPlatforms =
        view(deps.getInitialSettings())?.sandbox?.enabledPlatforms
      if (enabledPlatforms === undefined) {
        return true
      }
      if (enabledPlatforms.length === 0) {
        return false
      }
      return enabledPlatforms.includes(deps.getPlatform())
    } catch (error) {
      logForDebugging("Failed to check enabledPlatforms: " + error)
      return true
    }
  }

  function isSandboxingEnabled(): boolean {
    if (!isSupportedPlatform()) {
      return false
    }
    if (checkDependencies().errors.length > 0) {
      return false
    }
    if (!isPlatformInEnabledList()) {
      return false
    }
    return getSandboxEnabledSetting()
  }

  function getSandboxUnavailableReason(): string | undefined {
    if (!getSandboxEnabledSetting()) {
      return undefined
    }
    if (!isSupportedPlatform()) {
      // WSL 特例提示裁（残余 ④）；国内目标 = Linux bwrap 主路径
      return (
        "sandbox.enabled is set but " +
        deps.getPlatform() +
        " is not supported (requires Linux with bubblewrap)"
      )
    }
    if (!isPlatformInEnabledList()) {
      return (
        "sandbox.enabled is set but " +
        deps.getPlatform() +
        " is not in sandbox.enabledPlatforms"
      )
    }
    const depsCheck = checkDependencies()
    if (depsCheck.errors.length > 0) {
      return (
        "sandbox.enabled is set but dependencies are missing: " +
        depsCheck.errors.join(", ") +
        " . install missing tools (e.g. apt install bubblewrap socat)"
      )
    }
    return undefined
  }

  // 真 glob 扫描归 engine 波（残余 ③）；裁剪版恒空
  function getLinuxGlobPatternWarnings(): string[] {
    return []
  }

  function areSandboxSettingsLockedByPolicy(): boolean {
    const overridingSources = ["flagSettings", "policySettings"] as const
    for (const source of overridingSources) {
      const s = view(deps.getSettingsForSource(source))?.sandbox
      if (
        s?.enabled !== undefined ||
        s?.autoAllowBashIfSandboxed !== undefined ||
        s?.allowUnsandboxedCommands !== undefined
      ) {
        return true
      }
    }
    return false
  }

  async function setSandboxSettings(options: {
    enabled?: boolean
    autoAllowBashIfSandboxed?: boolean
    allowUnsandboxedCommands?: boolean
  }): Promise<void> {
    const existing = view(deps.getSettingsForSource("localSettings"))?.sandbox
    deps.updateSettingsForSource("localSettings", {
      sandbox: {
        ...existing,
        ...(options.enabled !== undefined && { enabled: options.enabled }),
        ...(options.autoAllowBashIfSandboxed !== undefined && {
          autoAllowBashIfSandboxed: options.autoAllowBashIfSandboxed,
        }),
        ...(options.allowUnsandboxedCommands !== undefined && {
          allowUnsandboxedCommands: options.allowUnsandboxedCommands,
        }),
      },
    })
  }

  function getExcludedCommands(): string[] {
    return view(deps.getSettings())?.sandbox?.excludedCommands ?? []
  }

  async function wrapWithSandbox(
    command: string,
    binShell?: string,
    customConfig?: Partial<SandboxRuntimeConfig>,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    if (isSandboxingEnabled()) {
      if (initializationPromise) {
        await initializationPromise
      } else {
        throw new Error("Sandbox failed to initialize. ")
      }
    }
    return sandboxBackend.wrapWithSandbox(
      command,
      binShell,
      customConfig,
      abortSignal,
    )
  }

  async function initialize(
    sandboxAskCallback?: SandboxAskCallback,
  ): Promise<void> {
    if (initializationPromise) {
      return initializationPromise
    }
    if (!isSandboxingEnabled()) {
      return
    }
    // managed-domains 门（policySettings 分支）= 残余 ①；裁剪版透传 callback
    initializationPromise = (async () => {
      try {
        if (worktreeMainRepoPath === undefined) {
          worktreeMainRepoPath = await detectWorktreeMainRepoPath(
            deps.getCwd(),
          )
        }
        const settings = deps.getSettings()
        const runtimeConfig = convertToSandboxRuntimeConfig(settings)
        await sandboxBackend.initialize(runtimeConfig, sandboxAskCallback)
        settingsSubscriptionCleanup = deps.onSettingsChange(() => {
          const s = deps.getSettings()
          const newConfig = convertToSandboxRuntimeConfig(s)
          sandboxBackend.updateConfig(newConfig)
          logForDebugging("Sandbox configuration updated from settings change")
        })
      } catch (error) {
        initializationPromise = undefined
        logForDebugging("Failed to initialize sandbox: " + errorMessage(error))
      }
    })()
    return initializationPromise
  }

  function refreshConfig(): void {
    if (!isSandboxingEnabled()) return
    const settings = deps.getSettings()
    const newConfig = convertToSandboxRuntimeConfig(settings)
    sandboxBackend.updateConfig(newConfig)
  }

  async function reset(): Promise<void> {
    settingsSubscriptionCleanup?.()
    settingsSubscriptionCleanup = undefined
    worktreeMainRepoPath = undefined
    bareGitRepoScrubPaths.length = 0
    checkDependencies.cache.clear()
    isSupportedPlatform.cache.clear()
    initializationPromise = undefined
    return sandboxBackend.reset()
  }

  // ---- 返回 SandboxManager 实现（32 方法面全保留）----

  return {
    initialize,
    isSupportedPlatform,
    isPlatformInEnabledList,
    getSandboxUnavailableReason,
    isSandboxingEnabled,
    isSandboxEnabledInSettings: getSandboxEnabledSetting,
    checkDependencies,
    isAutoAllowBashIfSandboxedEnabled,
    areUnsandboxedCommandsAllowed,
    isSandboxRequired,
    areSandboxSettingsLockedByPolicy,
    setSandboxSettings,
    getFsReadConfig: sandboxBackend.getFsReadConfig,
    getFsWriteConfig: sandboxBackend.getFsWriteConfig,
    getNetworkRestrictionConfig: sandboxBackend.getNetworkRestrictionConfig,
    getIgnoreViolations: sandboxBackend.getIgnoreViolations,
    getLinuxGlobPatternWarnings,
    getAllowUnixSockets: sandboxBackend.getAllowUnixSockets,
    getAllowLocalBinding: sandboxBackend.getAllowLocalBinding,
    getEnableWeakerNestedSandbox:
      sandboxBackend.getEnableWeakerNestedSandbox,
    getProxyPort: sandboxBackend.getProxyPort,
    getSocksProxyPort: sandboxBackend.getSocksProxyPort,
    getLinuxHttpSocketPath: sandboxBackend.getLinuxHttpSocketPath,
    getLinuxSocksSocketPath: sandboxBackend.getLinuxSocksSocketPath,
    waitForNetworkInitialization: sandboxBackend.waitForNetworkInitialization,
    getExcludedCommands,
    wrapWithSandbox,
    cleanupAfterCommand: (): void => {
      sandboxBackend.cleanupAfterCommand()
      scrubBareGitRepoFiles()
    },
    getSandboxViolationStore: () => violationStore,
    annotateStderrWithSandboxFailures:
      sandboxBackend.annotateStderrWithSandboxFailures,
    refreshConfig,
    reset,
  }
}
