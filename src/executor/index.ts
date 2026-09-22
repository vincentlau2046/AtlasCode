/**
 * executor 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../executor"`（或 "src/executor"），
 * 不许 reach 内部文件（eslint entry-point 拦截）。
 *
 * re-export: types（ExecResult/Executor/ExecError/AscendConfig 等）/
 *           toolchain（NpuToolchain + applyToolchainPlaceholders）/
 *           config（createShellExecutorConfig + ShellExecutorConfig）。
 *
 * ShellExecutor 实现待 Shell.ts 内部迁移完成（见 B 波 S1 报告）。
 * AscendExecutor 属 ascend 域包，不在此门面。
 */
export {
  ExecError,
  type ExecResult,
  type ExecOptions,
  type Executor,
  type BackgroundExecutor,
  type BackgroundHandle,
  type AscendConfig,
} from "./types"
export { type NpuToolchain, applyToolchainPlaceholders } from "./toolchain"
export { createShellExecutorConfig, type ShellExecutorConfig } from "./config"
