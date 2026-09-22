/**
 * executor 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../executor"`（或 "src/executor"），
 * 不许 reach 内部文件（eslint entry-point 拦截）。
 *
 * re-export: types（ExecResult/Executor/ExecError/AscendConfig 等）/
 *           toolchain（NpuToolchain + applyToolchainPlaceholders）/
 *           config（createShellExecutorConfig + ShellExecutorConfig）/
 *           C2 三 port（TaskOutput/bootstrapState/ExecutorSandbox + 注入窗口）/
 *           C-Deep 切片 1（ShellExecutor + shell 执行核心 + bash provider）。
 *
 * 命名消歧：types.ExecResult（Executor 统一结果）vs shell 执行链的
 * ShellExecResult（ShellCommand.result，code/interrupted 口径）——门面别名导出。
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

// C2：3 port（task/bootstrap/sandbox 注入面，execution-strategy §8.8；
// L3 自治——executor 域内只面向端口编程，真实现/适配器由组合根注入）
export {
  type TaskOutputPort,
  type TaskOutputHandle,
  type TaskOutputProgressCallback,
  setTaskOutputPort,
  getTaskOutputPort,
  resetTaskOutputPort,
} from "./ports/taskOutput"
export {
  type BootstrapStatePort,
  setBootstrapStatePort,
  getBootstrapStatePort,
  resetBootstrapStatePort,
} from "./ports/bootstrapState"
export {
  type ExecutorSandboxPort,
  setExecutorSandboxPort,
  getExecutorSandboxPort,
  resetExecutorSandboxPort,
} from "./ports/sandbox"

// C-Deep 切片 1：shell 执行核心（bash-only 裁剪版）+ ShellExecutor 统一接口实现
export { ShellExecutor } from "./ShellExecutor"
export {
  exec as execShell,
  setCwd,
  findSuitableShell,
  type ExecOptions as ShellExecOptions,
  type ExecResult as ShellExecResult,
  type ShellCommand,
} from "./shell/Shell"
export {
  createBashShellProvider,
  DEFAULT_HOOK_SHELL,
  SHELL_TYPES,
  type BuildExecCommandOptions,
  type ExecCommandBuild,
  type ShellProvider,
  type ShellType,
} from "./shell/shellProvider"
