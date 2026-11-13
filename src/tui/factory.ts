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
import { shouldUseSandbox, type AgentLoopDeps } from 'src/engine'
// 0.1.94 C-3（f4 §13③）：swarm 换道 seam 窗组合根装配——teammate 工具池
// deps 3 工具 materialize 面（compose.ts:361 同形）。
import { SnipTool, TeamCreateTool, TeamDeleteTool } from 'src/engine'
// 0.1.94 C-3（f4 §13③）：swarm 换道 seam 窗——TUI 进程注入窗接线
//（PRT-2 显式装配语句，非模块顶层自注册；compose.ts:342 同形）。
import {
  startInProcessTeammate,
  setStartInProcessTeammate,
  setTeammateToolRegistryDeps,
  // W-D-C 段 R1（lock-face §2，f4 批复 2026-11-11）：R1-D1 观测钩子工厂 +
  // R1-D3 it2Setup 标志持久化 port（null 缺省=进程内标志恒等）。
  setInProcessSpawnHooksFactory,
  setIt2SetupPersistencePort,
  // W-D-C 段 R1：backends port seam ② 装配（TUI 消费端改道 engine 单源后，
  // teammateLayoutManager/teamHelpers 的 requireBackendModule 面需本接线；
  // compose.ts:341 同形，幂等 last-wins）。
  wireBackends,
} from 'src/swarm'
import { createInProcessSpawnHooks } from './utils/swarm/inProcessSpawnHooks'
import { getGlobalConfig, saveGlobalConfig } from './utils/config'

import { AscendExecutor } from './core/executor/AscendExecutor'
import { DefaultAscendMockPort } from './core/executor/AscendMockPort'
// D-2a S8（M5 切端）：engine context 簇宿主端口接线（组合根单一装配点；
// 切端后 TUI 富 compact/SM/reactive/partial 本体经 engine DI 端口委托回宿主）
import { wireContextHostPorts } from './contextHostWiring'
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
import { getCwdState, getOriginalCwd, setCwdState } from 'src/bootstrap'
import { getAdditionalDirectoriesForClaudeMd } from 'src/tui/bootstrapState.js'
import {
  setKernelBootstrapNoopSeam,
  setKernelBootstrapState,
} from '../kernel/state/injection.js'
import {
  createKernelBootstrapNoopSeam,
  createKernelBootstrapStatePort,
} from './bootstrapStatePort.js'
import { getPlatform } from './utils/platform'
import { getConfigDirNameForProject } from '../kernel/utils/configDir'
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
   * W3-3b（§8.74.15）：engine loop 依赖活态装配前向接缝（取代 Phase A
   * orchestrator?: unknown 占位——旧仓 orchestrator 运行体 3c 删净后本接缝
   * 即 engine AgentLoopDeps 注入口）。REPL 活链路经 replLoopDeps.buildReplLoopParams
   * 活态装配（非经本工厂）；headless 经 createAgentLoopDeps 构建器；本字段为
   * 未来「工厂统一供 deps」面的前向接缝（未消费者 = 窄缺省，零行为）。
   */
  agentLoopDeps?: AgentLoopDeps
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
    getConfigDirName: getConfigDirNameForProject,
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

  // D-2a S8（M5 切端）：engine context 簇宿主端口接线（compact/SM/reactive/
  // partial 富体 + post-compact reset 注册表 + settings/GB 读面；幂等）
  wireContextHostPorts()

  // 0.1.94 C-3（f4 §13③）：swarm 换道 seam 窗接线（compose.ts:342/361
  // 同形，PRT-2 显式装配）——单 spawn 入口不变量：InProcessBackend.spawn
  // 经 requireStartInProcessTeammate 端口消费 src/swarm 单源 runner；
  // teammate 工具池 deps 注入窗 ⑬（registry 3 工具 materialize 面）。
  setStartInProcessTeammate(startInProcessTeammate)
  setTeammateToolRegistryDeps({
    baseTools: [SnipTool, TeamCreateTool, TeamDeleteTool],
  })
  // W-D-C 段 R1：backends 族 port 注入窗接线（registry/detection 4 面 →
  // setBackendModule；PRT-2 显式装配语句）。
  wireBackends()
  // W-D-C 段 R1（lock-face §2，f4 批复 2026-11-11，两处均禁吞错）：
  // R1-D1 —— in-process spawn 观测钩子工厂（四钩子闭包体归 TUI 域，
  // 经窄视图注入窗传入 engine 单源 runner；factory 调用期异常 fail-visible
  // 向上传播，InProcessBackend 调用点无 try/catch）。
  setInProcessSpawnHooksFactory(createInProcessSpawnHooks)
  // R1-D3 —— it2Setup 标志持久化 port（恢复 TUI 跨进程持久行为：读写
  // globalConfig；适配器读写异常维持 TUI 现行为 = globalConfig 抛错向上
  // 传播，不包 try/catch）。不接线 = 进程内标志恒等（headless 语义）。
  setIt2SetupPersistencePort({
    getFlags: () => {
      const config = getGlobalConfig()
      return {
        it2SetupComplete: config.iterm2It2SetupComplete === true,
        preferTmuxOverIterm2: config.preferTmuxOverIterm2 === true,
      }
    },
    setFlag: (name, value) => {
      saveGlobalConfig(current => ({ ...current, [name]: value }))
    },
  })

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
  // 0.1.106 S3b 切片 1（lock-face 必答④ lane ①）：kernel/state 缝注入——
  // 真状态实现包装 bootstrapState（零行为变更），先于 REPL 首帧消费面。
  setKernelBootstrapState(createKernelBootstrapStatePort())
  setKernelBootstrapNoopSeam(createKernelBootstrapNoopSeam())

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
