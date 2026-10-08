/**
 * sandbox 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../sandbox"`（或 "src/sandbox"），
 * 不许 reach 内部文件（eslint entry-point 拦截）。
 *
 * re-export: types（SandboxManager/SandboxDependencies + runtime 结构类型）/
 *           config（createSandboxConfig + SandboxConfig）/
 *           violationText（removeSandboxViolationTags + extractSandboxViolationsBlock）/
 *           sandbox-events（SandboxEventBus + DefaultSandboxEventBus + ViolationEvent）/
 *           ripgrep（ripgrepCommand + ripGrep + checkRipgrep + RipgrepTimeoutError，
 *           裁剪版 system-rg 单模式，C-Deep 切片 2）/
 *           createSandboxManager 工厂 + backend 注册表 + runtime 注入窗口
 *           （C-Deep 切片 2，真 bwrap runtime 包待 B6-func/D 波经
 *           setSandboxRuntimeModule 单点注入）。
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
export {
  ripGrep,
  ripGrepStream,
  countFilesRoundedRg,
  getRipgrepStatus,
  ripgrepCommand,
  checkRipgrep,
  setRipgrepResolutionForTest,
  RipgrepTimeoutError,
  RipgrepMissingError,
  type ResolvedRg,
  type RgSource,
  type RipgrepStatusMode,
} from "./ripgrep"
export { createSandboxManager } from "./createSandboxManager"
export {
  AtlasSandboxBackend,
  createSandboxBackend,
  registerSandboxBackend,
  type SandboxBackend,
  type SandboxBackendConfig,
} from "./sandbox-backend"
export {
  setSandboxRuntimeModule,
  getSandboxRuntimeModule,
  resetSandboxRuntimeModule,
} from "./runtime"
