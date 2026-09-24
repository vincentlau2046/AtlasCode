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
 *   D18   setEndpointConfigSource（modelprovider ← engine/config settings 面 +
 *          env OpenAI 静态键车道，S-3d §8.29 替换 B6-func env-only 版）
 *   + setPermissionsBootstrapEnv（§8.14 注入序首步，permissions ← bootstrap 两 cwd 态）
 *   + S-3c（§8.28）setSettingsPathsProvider（permissions ← engine/config settings
 *     路径面）+ setHookConfigProvider + captureHooksConfigSnapshot（hooks ←
 *     engine/config settings.hooks 配置面，启动捕获一次）
 *   + E-5 S-5a（§8.39）setHooksBootstrapEnv（hooks ← bootstrap ⑤ 3 成员面，
 *     三层断补齐之第三断；先于首次带命令钩子 runHooks，未注入 fail-fast）
 *   + S-3d（§8.29）applySafeConfigEnvironmentVariables（engine/config managedEnv，
 *     旧仓启动序信任前位——trusted 源 env 先入 process.env，后 roles lane env 读）
 *
 * 残留守（§8.29）：applyConfigEnvironmentVariables（信任后全量 env）→ 信任
 * 对话框面（新仓未落；§8.28 预声明消费接缝此处重登记，旧仓启动序
 * applySafe → 信任对话框 → applyConfig）。
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
import { setHookConfigProvider, setHooksBootstrapEnv, setHookShellPort } from '../hooks'
import {
  applySafeConfigEnvironmentVariables,
  captureHooksConfigSnapshot,
  createHooksConfigProvider,
  getSettingsPaths,
} from '../engine'
import {
  getIsNonInteractiveSession,
  getMainThreadAgentType,
  getCwdState,
  getSessionId,
  getOriginalCwd,
  getTranscriptPathForSession,
  hasTrustAccepted,
} from '../bootstrap'

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

  // ⑤ hooks ← bootstrap（E-5 S-5a 三层断补齐，§8.38 C-5 第三断：本接线缺失前
  //    生产路径 runHooks 必 fail-fast 抛「hooks bootstrap 未注入」）+
  //    hooks ← executor（D17，注入序末步；先于首次带命令钩子 runHooks）+
  //    hooks ← engine/config（S-3c settings.hooks 配置面，启动捕获一次快照）。
  //    实际注入序：setHooksBootstrapEnv → setHookShellPort → setHookConfigProvider
  //    → captureHooksConfigSnapshot（三窗口注入期互不依赖，无功能影响；hooks 域
  //    门面头注所列序为推荐序非约束——§8.42 审视 MINOR 注释失真订正）。
  //    3 成员源 = bootstrap 域 ⑤ 族（transcript path 窄适配 /
  //    agent type 缺省 undefined=CLI 面残留守 / trust 缺省 true=headless 信任隐式）。
  setHooksBootstrapEnv({
    getSessionId,
    getCwd: getCwdState,
    getTranscriptPath: getTranscriptPathForSession,
    getMainThreadAgentType,
    isNonInteractive: getIsNonInteractiveSession,
    hasTrustAccepted,
  })
  setHookShellPort(adaptExecutorToHookShellPort())
  setHookConfigProvider(createHooksConfigProvider())
  captureHooksConfigSnapshot()

  // ⑥ managedEnv ← engine/config（S-3d §8.29，旧仓启动序信任前位）：trusted 源
  //    （user/flag/policy）env → process.env（roles lane env 读之前生效）；
  //    applyConfig（信任后全量 env）= 信任对话框面残留守（见头注）。
  applySafeConfigEnvironmentVariables()

  // ⑦ modelprovider ← engine/config settings 面 + env 静态键车道（S-3d §8.29，
  //    替换 B6-func D18 env-only 版）
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
