/**
 * tui 本地副本（§8.72 TUI 壳波 Slice B，C-7 原样搬自旧仓
 * `src/core/memory/MemoryConfig.ts`）：旧仓 factory 的 `MemoryConfigPort`
 * 面（8 方法，memdir/extractMemories/attachments 消费）未进新 memory 域
 * （新域 MemoryConfig 仅 3 属性 env 面）→ 端口体随闭包落 tui 本地；
 * 与新域 config.ts 去重归 E-wave-end 审计。
 *
 * MemoryConfig — ③ 配置端口化（13-Memory模块解耦实施总纲 §七，步骤 2.4）。
 *
 * 把 memdir 各调用点对配置源（feature()/process.env 双读/GrowthBook）的
 * 直读收敛到 `MemoryConfigPort` 端口 + `DefaultMemoryConfig` 适配器：
 *  - 适配器**包裹现有读取逻辑**（委托给 memdir/paths、memdir/teamMemPaths、
 *    bootstrap/state、growthbook），Phase 2 行为零变化（总红线 1）。
 *  - 调用点（memdir.ts / findRelevantMemories.ts / sessionFileAccessHooks.ts）
 *    改经 `getCoreDependencies().memoryConfig` 读取（与 2.2 的 memoryStore
 *    注入通道一致，不扩 ToolUseContext——D6 裁定）。
 *  - env 读取仅用新名 `ATLAS_X`（v0.2 切硬：memory 域的
 *    CLAUDE_* 旧名兜底已移除，不再支持旧名；其余域残留见 REVIEW_ENV_VARS.md）。
 *  - 可测性收益：单测可直接注入 flag 值，摆脱 `FEATURE_<NAME>` env 桩。
 *
 * 编译期 DCE 说明（风险项）：`feature()` 经 `bun:bundle` 做编译期
 * tree-shaking；端口化后模块代码常驻包体（影响小——模块已被 factory 引用，
 * 仅包体形状变化，运行行为不变）。
 */

import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import {
  getCoworkMemoryPathOverride,
  isAutoMemoryEnabled,
  isExtractModeActive,
} from '../../memdir/paths.js'
import { isTeamMemoryEnabled } from '../../memdir/teamMemPaths.js'

/**
 * Memory 模块的配置端口（13 总纲 §二 端口 ③）。
 * 实现方给一个适配器（默认 `DefaultMemoryConfig`）；调用方只依赖本接口，
 * 换数据源（如 Web GUI 的远程配置）不改调用方。
 */
export interface MemoryConfigPort {
  /** auto-memory 是否启用（env/SIMPLE/REMOTE/settings 优先级链，委托 paths.ts）。 */
  isAutoMemoryEnabled(): boolean
  /** Team 记忆是否启用（auto 启用 + atlas_herring_clock，委托 teamMemPaths.ts）。 */
  isTeamMemoryEnabled(): boolean
  /** extract-memories 后台代理是否本会话运行（委托 paths.ts，含两个 GB 标志）。 */
  isExtractModeActive(): boolean
  /** --bare / SIMPLE 模式（env：ATLAS_SIMPLE，v0.2 切硬后仅读新名）。 */
  isSimpleMode(): boolean
  /** 远程记忆根目录覆盖（env：ATLAS_REMOTE_MEMORY_DIR，仅新名）。 */
  getRemoteMemoryDir(): string | undefined
  /** Cowork 全路径覆盖（env ATLAS_COWORK_MEMORY_PATH_OVERRIDE + 路径安全校验，委托 paths.ts 的 validateMemoryPath）。 */
  getCoworkPathOverride(): string | undefined
  /** Cowork 注入的记忆策略文本（env ATLAS_COWORK_MEMORY_EXTRA_GUIDELINES，trim 后为空视为未设）。 */
  getCoworkExtraGuidelines(): string | undefined
  /** 遥测形状事件门控（GrowthBook atlas_memory_shape_telemetry，3.5 运行时放量）。 */
  memoryShapeTelemetryEnabled(): boolean
}

/**
 * 默认适配器：包裹现有读取逻辑，行为零变化。
 * 经 `core/factory.ts` 注入 `CoreDependencies.memoryConfig`（与 modelProvider
 * "注入窗口"同模式）——未来替换数据源（WebGUI 远程配置）只改 factory 一行。
 */
export class DefaultMemoryConfig implements MemoryConfigPort {
  isAutoMemoryEnabled(): boolean {
    // 委托现有优先级链（L30-55）：DISABLE_AUTO_MEMORY / SIMPLE / REMOTE / settings
    return isAutoMemoryEnabled()
  }

  isTeamMemoryEnabled(): boolean {
    // 委托 teamMemPaths.ts：isAutoMemoryEnabled() && atlas_herring_clock
    return isTeamMemoryEnabled()
  }

  isExtractModeActive(): boolean {
    // 委托 paths.ts L69-77：atlas_passport_quail + 非交互会话判定 + atlas_slate_thimble
    return isExtractModeActive()
  }

  isSimpleMode(): boolean {
    // 切硬：仅读 ATLAS_SIMPLE（旧名兜底已移除，不再支持旧名）
    return isEnvTruthy(process.env.ATLAS_SIMPLE)
  }

  getRemoteMemoryDir(): string | undefined {
    return process.env.ATLAS_REMOTE_MEMORY_DIR
  }

  getCoworkPathOverride(): string | undefined {
    // 双读 + 安全校验（null 字节/绝对路径拒绝/NFC 归一化）都在 paths.ts
    return getCoworkMemoryPathOverride()
  }

  getCoworkExtraGuidelines(): string | undefined {
    // v0.2 切硬：仅读新名 ATLAS_COWORK_MEMORY_EXTRA_GUIDELINES
    const v = process.env.ATLAS_COWORK_MEMORY_EXTRA_GUIDELINES
    return v && v.trim().length > 0 ? v : undefined
  }

  memoryShapeTelemetryEnabled(): boolean {
    // 运行时 GrowthBook 门控（3.5 放量方案 b）；feature() 是编译期 DCE 不能靠它放量
    return getFeatureValue_CACHED_MAY_BE_STALE('atlas_memory_shape_telemetry', false)
  }
}
