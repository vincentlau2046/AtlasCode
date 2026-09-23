/**
 * atlascode 组合根 — sandbox 域 SandboxDependencies 内存默认面（B6-func 最小）
 *
 * createSandboxManager 须消费 15 方法 SandboxDependencies（settings 体系 /
 * 真平台探测 / 托管 drop-in 目录归 engine 波 settings 体系）。最小组合根给
 * 占位默认，使 manager 可构造（placeholder runtime 禁用态：isSandboxingEnabled
 * 恒 false，executor wrapWithSandbox 不被调用）。真 deps 由 engine 波回填。
 *
 * 与 tests/fixtures/sandbox-runtime-fake.ts createFakeSandboxDeps 同源口径，
 * 但 src 侧不可 import tests/，故此处置组合根专属内存实现。
 */
import type {
  Platform,
  SandboxDependencies,
  SettingSource,
  SettingsJson,
} from '../sandbox'

const SETTING_SOURCES: readonly SettingSource[] = [
  'userSettings',
  'projectSettings',
  'localSettings',
  'flagSettings',
  'policySettings',
]

function resolvePlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    case 'linux':
      // WSL 判定归 engine 波；此处按 linux 处理
      return 'linux'
    default:
      return 'unknown'
  }
}

/** 组合根内存 SandboxDependencies（禁用态 settings，供 placeholder runtime 构造）。 */
export function createInMemorySandboxDeps(): SandboxDependencies {
  const base: SettingsJson = { sandbox: { enabled: false } }
  const sources = new Map<SettingSource, SettingsJson>()
  const cwd = process.cwd()
  const tempDir = process.env.ATLAS_TMPDIR || '/tmp'

  return {
    getSettings: () => base,
    getInitialSettings: () => base,
    getSettingsForSource: (source) => sources.get(source),
    getSettingsFilePathForSource: (source) => `${tempDir}/atlas/${source}.json`,
    getSettingsRootPathForSource: () => undefined,
    getCwd: () => cwd,
    getOriginalCwd: () => cwd,
    getPlatform: () => resolvePlatform(),
    getAdditionalDirectories: () => [],
    onSettingsChange: () => () => {},
    getConfigDirName: () => '.atlas',
    getAtlasTempDir: () => tempDir,
    getManagedSettingsDropInDir: () => '/etc/atlas/managed_settings.json',
    updateSettingsForSource: (source, values) => {
      sources.set(source, values)
    },
    SETTING_SOURCES,
  }
}
