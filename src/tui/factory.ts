/**
 * tui/factory — UI 闭包组合根适配（§8.72 TUI 壳波 Slice B）
 *
 * 旧仓 `src/core/factory.ts`（CoreDependencies 单一装配点）的 tui 本地适配：
 * 闭包内 4 个消费方（memdir/memoryScan · memdir/findRelevantMemories ·
 * utils/attachments · skills/bundled/ascend*）经 `getCoreDependencies()`
 * 取 core 依赖。装配体不再自持旧 core/ 树，改为从新域门面取件：
 *   - modelProvider → `src/modelprovider`（兼容 getter，注入窗口模式不变）
 *   - sandbox       → `src/sandbox`（createSandboxManager + 事件总线 + 后端）
 *   - memoryStore   → `src/memory`（FileSystemMemoryStore）
 *   - memoryConfig  → `./core/memory/MemoryConfig`（tui 本地 8 方法端口面，
 *     C-7 原样搬；新 memory 域 3 属性 env 面不供闭包消费）
 *   - executor      → `src/executor`（ShellExecutor 零参构造 + 双 port 经
 *     本组合窗口注入：sandbox port〔shouldUseSandbox 委托 engine 决策〕+
 *     bootstrap port〔tui 本地 bootstrapState cwd 态〕；task-output port
 *     归壳侧 compose 注入〔Slice D〕，UI 独立态不触后台 exec 支）
 *   - ascendExecutor/ascendFreshnessPort/ascendMock → `./core/executor`
 *     （C-7 原样搬：新 ascend 域 executor 为占位前向接缝，Ascend 执行器
 *     六件套〔含 types/toolchain〕随闭包落 tui 本地，与新域门面去重归
 *     E-wave-end 审计）
 * settings 粘胶（默认 sandbox 依赖装配）仍走 tui 本地 `./utils/settings`
 * + `src/bootstrap` 状态面（getCwdState/getOriginalCwd）。
 *
 * 真实组合根（壳侧注入/生命周期）归 atlascode 壳（Slice D launcher/mount
 * 接线）；本文件 = UI 独立态下的懒单例装配窗口（与旧仓 getCoreDependencies
 * 语义逐字对齐，D4「接线通电」点不变）。
 */

import { modelProvider, setEndpointConfigSource } from 'src/modelprovider'
import type { ModelProvider } from 'src/modelprovider'
import {
  createSandboxManager,
  createSandboxBackend,
  DefaultSandboxEventBus,
} from 'src/tui/sandboxCompat'
import type {
  SandboxManager,
  SandboxEventBus,
  SandboxBackendConfig,
} from 'src/tui/sandboxCompat'
import { FileSystemMemoryStore } from 'src/memory'
import type { MemoryStore } from 'src/memory'
import { DefaultMemoryConfig } from './core/memory/MemoryConfig'
import type { MemoryConfigPort } from './core/memory/MemoryConfig'
import {
  ShellExecutor,
  setExecutorSandboxPort,
  setBootstrapStatePort,
} from 'src/executor'
import type { Executor, AscendConfig } from 'src/executor'
import { shouldUseSandbox } from 'src/engine'

import { AscendExecutor } from './core/executor/AscendExecutor'
import { DefaultAscendMockPort } from './core/executor/AscendMockPort'
import {
  DefaultAscendFreshnessPort,
  type AscendFreshnessPort,
} from './core/executor/AscendFreshnessPort'

import { createSettingsAdapter } from './config/settings-adapter'
import {
  getSettings_DEPRECATED,
  getInitialSettings,
  getSettingsForSource,
  getSettingsFilePathForSource,
  getSettingsRootPathForSource,
  updateSettingsForSource,
} from './utils/settings/settings'
import { SETTING_SOURCES } from './utils/settings/constants'
import { settingsChangeDetector } from './utils/settings/changeDetector'
import { getManagedSettingsDropInDir } from './utils/settings/managedPath'
import {
  getCwdState,
  getOriginalCwd,
  getAdditionalDirectoriesForClaudeMd,
  setCwdState,
} from 'src/tui/bootstrapState'
import { getPlatform } from './utils/platform'
import { getConfigDirName } from './utils/configDir'
import { getAtlasTempDir } from './utils/permissions/filesystem'

// ============================================================================
// CoreDependencies 接口（与旧仓 core/factory.ts 逐字对齐）
// ============================================================================

export interface CoreDependencies {
  modelProvider: ModelProvider
  sandbox: SandboxManager
  /** Phase 4 S4-4: 标准化违规事件总线（外部订阅） */
  sandboxEvents: SandboxEventBus
  memoryStore: MemoryStore
  /** tui 本地 MemoryConfigPort（8 方法面；新 memory 域 3 属性 env 面不供闭包消费） */
  memoryConfig: MemoryConfigPort
  executor: Executor
  ascendExecutor: AscendExecutor
  ascendConfig: AscendConfig
  /**
   * 知识源新鲜度 port — 检测 pinned 源（cannbot-skills/msprobe/
   * cann-learning-hub）与其上游 HEAD 的漂移。files-field 技能经
   * getPromptForCommand 追加非阻塞漂移提醒（vault 23 §5bis，仿 AscendMockPort）。
   */
  ascendFreshnessPort: AscendFreshnessPort
  /**
   * Phase A: Orchestrator 域接线（新仓 engine 门面尚未导出 Orchestrator 型 —
   * 前向接缝；责任波：E-wave-end 审计〔engine 门面类型面扩 Orchestrator 型 +
   * 闭包去重，与 engineCompat 去重登记同归口；H6 登记，复审勿重提〕）
   */
  orchestrator?: unknown
}

// ============================================================================
// Ascend 配置 — 启动时读一次 env
// ============================================================================

function defaultAscendConfig(): AscendConfig {
  return {
    mock:
      process.env.ATLAS_ASCEND_MOCK === '1' ||
      (process.env.ATLAS_MOCK_ON_NONINTERACTIVE !== '0' &&
        process.env.ATLAS_MOCK_ON_NONINTERACTIVE !== undefined),
    cannVersion: process.env.CANN_PKG_VER || '8.0.0',
    templateVersion: process.env.ASCEND_TEMPLATE_VERSION || '8.0.0',
    deviceId: parseInt(process.env.ASCEND_DEVICE_ID || '0', 10),
    timeoutMs: parseInt(process.env.ASCEND_TIMEOUT || '120000', 10),
    promptEnabled: process.env.ATLAS_ASCEND_PROMPT !== '0',
  }
}

// ============================================================================
// 默认 sandbox 依赖 — 将当前全局函数接到 SandboxDependencies
// ============================================================================

function defaultSandboxDeps() {
  return {
    getSettings: getSettings_DEPRECATED,
    getInitialSettings,
    getSettingsForSource,
    getSettingsFilePathForSource,
    getSettingsRootPathForSource,
    getCwd: getCwdState,
    getOriginalCwd,
    getPlatform,
    getAdditionalDirectories: getAdditionalDirectoriesForClaudeMd,
    onSettingsChange: (cb: (ev: unknown) => void) => settingsChangeDetector.subscribe(cb),
    getConfigDirName,
    getAtlasTempDir: () => getAtlasTempDir(),
    getManagedSettingsDropInDir: () => getManagedSettingsDropInDir(),
    updateSettingsForSource,
    SETTING_SOURCES,
  }
}

// ============================================================================
// createCoreDependencies — 单一装配点
// ============================================================================

export function createCoreDependencies(
  backendConfig?: SandboxBackendConfig,
): CoreDependencies {
  // 组合根注册模型配置端口适配器（依赖倒置注入窗口，R5）：
  // 未来替换数据源（如 WebGUI 远程配置）只改这一行。
  setEndpointConfigSource(createSettingsAdapter())

  // 默认 mock port 注册（委托 process.env）；测试在此单行替换。
  AscendExecutor.setMockPort(new DefaultAscendMockPort())

  // Phase 4 S4-4: 标准化违规事件总线
  const sandboxEvents = new DefaultSandboxEventBus()

  // 后端选择 — 默认 'atlas'；未来 createSandboxBackend({ backend: 'docker' })
  const sandboxBackend = createSandboxBackend({
    ...backendConfig,
    eventBus: sandboxEvents,
  })
  const sandbox = createSandboxManager(defaultSandboxDeps(), sandboxBackend)
  const ascendConfig = defaultAscendConfig()

  // executor 双 port 注入（C2 §8.8 同款，tui 本地组合窗口；atlascode/compose
  // 语义对齐）：SandboxManager → ExecutorSandboxPort（shouldUseSandbox 委托
  // engine 决策，与壳侧 adaptSandboxToExecutorPort 同形）+ tui 本地
  // bootstrapState cwd 态 → BootstrapStatePort。
  setExecutorSandboxPort({
    isSandboxingEnabled: () => sandbox.isSandboxingEnabled(),
    shouldUseSandbox: (command: string) => shouldUseSandbox({ command }),
    wrapWithSandbox: (command, binShell, abortSignal) =>
      sandbox.wrapWithSandbox(command, binShell, undefined, abortSignal),
    cleanupAfterCommand: () => sandbox.cleanupAfterCommand(),
  })
  setBootstrapStatePort({
    getCwd: () => getCwdState(),
    getOriginalCwd: () => getOriginalCwd(),
    setCwdState: (cwd: string) => setCwdState(cwd),
  })

  return {
    modelProvider, // 单例，经注入窗口
    sandbox,
    sandboxEvents,
    memoryStore: new FileSystemMemoryStore(),
    // 配置端口（13 总纲 §七 2.4）：DefaultMemoryConfig 包裹 feature()/env/GB
    // 读取（tui 本地 8 方法端口面；与旧仓 factory 逐字对齐）
    memoryConfig: new DefaultMemoryConfig(),
    executor: new ShellExecutor(),
    ascendExecutor: new AscendExecutor(ascendConfig),
    ascendConfig,
    ascendFreshnessPort: new DefaultAscendFreshnessPort(),
  }
}

// ============================================================================
// getCoreDependencies — 懒单例（D4 接线：注入窗口）
// ============================================================================

let _coreDeps: CoreDependencies | undefined

export function getCoreDependencies(): CoreDependencies {
  return (_coreDeps ??= createCoreDependencies())
}
