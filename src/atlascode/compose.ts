/**
 * 组合根（唯一装配点: 注入 port → 域 create() → CoreDependencies）
 *
 * 实现波次: B6-func（★最小组合根，先于 engine 波）
 * 状态: 落地（§8.16/§8.17 4+7 前置清单 + 6 适配器）
 *
 * 职责（charter L4.7）：全仓唯一可跨 8 域 import 的装配点。注入序遵 §8.14
 * permissions→task→hooks（末步 hooks shell-port 先于首次带命令钩子 runHooks）；
 * executor 三 port 先于首次 exec（§8.8 C2）。域内 port 注入窗口 set 后，
 * 各域只面向端口编程（L3 自治），真实现/适配器在此收敛。
 *
 * 装配面（4+7 前置清单，§8.17 D18 终稿）：
 *   基项  setTaskOutputPort / setBootstrapStatePort / setExecutorSandboxPort
 *   D11   setDiskOutputEnv（task ← permissions getProjectTempDir + bootstrap getSessionId）
 *   D17   setHookShellPort（hooks ← executor 真 Shell）
 *   D18   setEndpointConfigSource（modelprovider ← env OpenAI 静态键车道）
 *   + setPermissionsBootstrapEnv（§8.14 注入序首步，permissions ← bootstrap 两 cwd 态）
 *   + S-3c（§8.28）setSettingsPathsProvider（permissions ← engine/config settings
 *     路径面）+ setHookConfigProvider + captureHooksConfigSnapshot（hooks ←
 *     engine/config settings.hooks 配置面，启动捕获一次）
 */
import { createSandboxManager, type SandboxManager } from '../sandbox'
import {
  getModelProvider,
  setEndpointConfigSource,
  type ModelProvider,
} from '../modelprovider'
import { FileSystemMemoryStore, type MemoryStore } from '../memory'
import {
  setTaskOutputPort,
  setBootstrapStatePort,
  setExecutorSandboxPort,
} from '../executor'
import { setPermissionsBootstrapEnv, setSettingsPathsProvider } from '../permissions'
import { setDiskOutputEnv } from '../task'
import { setHookConfigProvider, setHookShellPort } from '../hooks'
import {
  captureHooksConfigSnapshot,
  createHooksConfigProvider,
  getSettingsPaths,
} from '../engine'
import { getCwdState, getOriginalCwd } from '../bootstrap'

import { adaptSandboxToExecutorPort } from './adapters/sandboxAdapter'
import { adaptBootstrapToExecutorPort } from './adapters/bootstrapAdapter'
import { adaptTaskOutputToExecutorPort } from './adapters/taskOutputAdapter'
import { adaptExecutorToHookShellPort } from './adapters/hookShellAdapter'
import { createDiskOutputEnv } from './adapters/diskOutputEnvAdapter'
import { createEndpointConfigSource } from './adapters/endpointConfigSourceAdapter'
import { createInMemorySandboxDeps } from './sandboxDeps'

/** 组合根装配产物（engine 波/消费方持有的域对象 + 已就绪的注入窗口）。 */
export interface CoreDependencies {
  /** sandbox 域：placeholder runtime 禁用态 manager（真 bwrap runtime 包 B6-func/D 波单点换入）。 */
  sandboxManager: SandboxManager
  /** modelprovider 域：lazy 单例（smoke 可经 setModelProviderForTesting 换 fake，§8.13 L-2）。 */
  modelProvider: ModelProvider
  /** memory 域：文件系统 store（只读面；写经真 fs，§8.13 L-1）。 */
  memoryStore: MemoryStore
}

/**
 * 装配 CoreDependencies（唯一跨域 import 点）。幂等——各 set 窗口可重复调用；
 * 重复装配仅重建 sandboxManager（engine 波可换真 runtime 包后复用此入口）。
 */
export function createCoreDependencies(): CoreDependencies {
  // ① sandbox 域：placeholder runtime 禁用态（isSandboxingEnabled 恒 false，
  //    executor wrapWithSandbox 不被调用；真 deps 归 engine 波 settings 体系）。
  const sandboxManager = createSandboxManager(createInMemorySandboxDeps())

  // ② executor 三 port（§8.8 C2，先于首次 exec）
  setTaskOutputPort(adaptTaskOutputToExecutorPort())
  setBootstrapStatePort(adaptBootstrapToExecutorPort())
  setExecutorSandboxPort(adaptSandboxToExecutorPort(sandboxManager))

  // ③ permissions ← bootstrap（§8.14 注入序首步：两 cwd 态）+
  //    permissions ← engine/config（S-3c settings 路径面，桩① 接真）
  setPermissionsBootstrapEnv({
    getOriginalCwd,
    getCwd: getCwdState,
  })
  setSettingsPathsProvider(getSettingsPaths)

  // ④ task ← permissions+bootstrap（D11，permissions 之后）
  setDiskOutputEnv(createDiskOutputEnv())

  // ⑤ hooks ← executor（D17，注入序末步；先于首次带命令钩子 runHooks）+
  //    hooks ← engine/config（S-3c settings.hooks 配置面，启动捕获一次快照）
  setHookShellPort(adaptExecutorToHookShellPort())
  setHookConfigProvider(createHooksConfigProvider())
  captureHooksConfigSnapshot()

  // ⑥ modelprovider ← atlascode env 车道（D18）
  setEndpointConfigSource(createEndpointConfigSource())

  return {
    sandboxManager,
    modelProvider: getModelProvider(),
    memoryStore: new FileSystemMemoryStore(),
  }
}

let _core: CoreDependencies | undefined

/** lazy 单例（旧仓 factory.ts 同款 idiom）：首访问装配，其后复用。 */
export function getCoreDependencies(): CoreDependencies {
  return (_core ??= createCoreDependencies())
}

/** 测试复位（teardown 用）：清掉装配缓存，恢复未装配态。 */
export function resetCoreDependencies(): void {
  _core = undefined
}
