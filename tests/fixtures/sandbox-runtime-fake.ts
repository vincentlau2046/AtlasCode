/**
 * sandbox runtime 注入 fake（func + unit 共用，C-Deep 切片 2）
 *
 * §8.7 边界：fake = 注入窗口 setSandboxRuntimeModule 的"真 runtime 替身"
 * （真 bwrap runtime 包 B6-func/D 波定案前的单点换入面）——确定性 +
 * 可观测（state 记录各方法调用），不模拟真实沙箱语义（那是真 runtime 包的
 * 事，不是 fake 的事，同 C2 executor-port-fakes 纪律）。
 */
import type {
  BaseSandboxManagerStatic,
  SandboxRuntimeConfig,
  SettingSource,
  SettingsJson,
  SandboxDependencies,
} from "../../src/sandbox"

export interface FakeSandboxRuntimeState {
  initializedConfigs: SandboxRuntimeConfig[]
  updatedConfigs: SandboxRuntimeConfig[]
  resets: number
  wrapped: {
    command: string
    binShell?: string
    customConfig?: Partial<SandboxRuntimeConfig>
  }[]
  cleans: number
  askCalls: number
}

export function createFakeSandboxRuntime(
  overrides?: Partial<BaseSandboxManagerStatic>,
): { runtime: BaseSandboxManagerStatic; state: FakeSandboxRuntimeState } {
  const state: FakeSandboxRuntimeState = {
    initializedConfigs: [],
    updatedConfigs: [],
    resets: 0,
    wrapped: [],
    cleans: 0,
    askCalls: 0,
  }
  const runtime: BaseSandboxManagerStatic = {
    async initialize(config, ask) {
      state.initializedConfigs.push(config)
      if (ask) state.askCalls++
    },
    updateConfig(config) {
      state.updatedConfigs.push(config)
    },
    async reset() {
      state.resets++
    },
    async wrapWithSandbox(command, binShell, customConfig) {
      state.wrapped.push({ command, binShell, customConfig })
      return `wrapped:${command}`
    },
    cleanupAfterCommand() {
      state.cleans++
    },
    isSupportedPlatform: () => true,
    isSandboxingEnabled: () => true,
    isSandboxEnabledInSettings: () => true,
    checkDependencies: () => ({ errors: [], warnings: [] }),
    getFsReadConfig: () => ({ denyOnly: [] }),
    getFsWriteConfig: () => ({
      allowOnly: [".", "/tmp"],
      denyWithinAllow: [],
    }),
    getNetworkRestrictionConfig: () => ({ allowedHosts: [], deniedHosts: [] }),
    getAllowUnixSockets: () => undefined,
    getAllowLocalBinding: () => undefined,
    getIgnoreViolations: () => undefined,
    getEnableWeakerNestedSandbox: () => undefined,
    getProxyPort: () => undefined,
    getSocksProxyPort: () => undefined,
    getLinuxHttpSocketPath: () => undefined,
    getLinuxSocksSocketPath: () => undefined,
    waitForNetworkInitialization: async () => true,
    annotateStderrWithSandboxFailures: (_command, stderr) => stderr,
    ...overrides,
  }
  return { runtime, state }
}

/** 内存版 SandboxDependencies（unit/func 共用；零磁盘零网络）。 */
export function createFakeSandboxDeps(
  overrides?: Partial<SandboxDependencies>,
): SandboxDependencies {
  const base: SettingsJson = {
    sandbox: { enabled: false },
  }
  const sources = new Map<SettingSource, SettingsJson>()
  const depBase: SandboxDependencies = {
    getSettings: () => base,
    getInitialSettings: () => base,
    getSettingsForSource: source => sources.get(source),
    getSettingsFilePathForSource: source =>
      `/tmp/atlascode/${source}.json`,
    getSettingsRootPathForSource: () => undefined,
    getCwd: () => "/work",
    getOriginalCwd: () => "/work",
    getPlatform: () => "linux",
    getAdditionalDirectories: () => [],
    onSettingsChange: () => () => {},
    getConfigDirName: () => ".atlas",
    getAtlasTempDir: () => "/tmp/atlascode-temp",
    getManagedSettingsDropInDir: () => "/etc/atlascode/managed",
    updateSettingsForSource: (source, values) => {
      sources.set(source, values)
    },
    SETTING_SOURCES: [
      "userSettings",
      "projectSettings",
      "localSettings",
      "flagSettings",
      "policySettings",
    ],
    ...overrides,
  }
  return depBase
}
