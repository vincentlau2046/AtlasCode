/**
 * sandbox 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../sandbox"`（或 "src/sandbox"），
 * 不许 reach 内部文件（eslint entry-point 拦截）。
 *
 * re-export: types（SandboxManager/SandboxDependencies + runtime 结构类型）/
 *           config（createSandboxConfig + SandboxConfig）/
 *           violationText（removeSandboxViolationTags + extractSandboxViolationsBlock）/
 *           sandbox-events（SandboxEventBus + DefaultSandboxEventBus + ViolationEvent）。
 *
 * createSandboxManager 工厂实现待 sandbox-backend 迁移完成
 * （见 B 波 S1 报告：深迁移 blocked on C 波 port 基础设施）。
 */
export type {
  SandboxManager,
  SandboxDependencies,
  SettingSource,
  SettingsJson,
  Platform,
  SandboxAskCallback,
  SandboxDependencyCheck,
  FsReadRestrictionConfig,
  FsWriteRestrictionConfig,
  NetworkRestrictionConfig,
  NetworkHostPattern,
  SandboxViolationEvent,
  SandboxRuntimeConfig,
  IgnoreViolationsConfig,
  SandboxViolationStore,
  BaseSandboxManagerStatic,
} from "./types"
export { createSandboxConfig, type SandboxConfig } from "./config"
export {
  removeSandboxViolationTags,
  extractSandboxViolationsBlock,
} from "./violationText"
export {
  DefaultSandboxEventBus,
  type SandboxEventBus,
  type ViolationEvent,
  type ViolationCategory,
} from "./sandbox-events"
