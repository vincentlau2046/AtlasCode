/**
 * bootstrap 域 — cwd 并发覆盖层（旧仓 utils/cwd.ts 33L 随迁，C-Deep 切片 3 T4）
 *
 * ALS 覆盖层 runWithCwdOverride：并发 agent 各见自己 cwd 互不影响（engine 波
 * 消费；executor 端口面只暴露 getCwd() = 无覆盖路径，见 C2-复审 F3 裁定——
 * 并发需求出现时经本域扩展，executor 端口面不动）。
 * pwd() = 覆盖 ?? getCwdState()；getCwd() 异常回落 getOriginalCwd()（目录消失
 * 恢复路径：shell realpath 失败 → originalCwd 回落 → createFailedCommand）。
 *
 * 裁剪注：旧仓 pwd() 的 `val && typeof val === 'object'` 兼容分支依赖旧仓
 * state.ts stub 导出的 any 类型擦除（store 为 string 时该分支不可达）——
 * 新仓严格类型下简化为 store ?? state 形式。
 */
import { AsyncLocalStorage } from 'async_hooks'
import { getCwdState, getOriginalCwd } from './state'

const cwdOverrideStorage = new AsyncLocalStorage<string>()

/**
 * Run a function with an overridden working directory for the current async
 * context. All calls to pwd()/getCwd() within the function (and its async
 * descendants) will return the overridden cwd instead of the global one.
 * This enables concurrent agents to each see their own working directory
 * without affecting each other.
 */
export function runWithCwdOverride<T>(cwd: string, fn: () => T): T {
  return cwdOverrideStorage.run(cwd, fn)
}

/**
 * Get the current working directory（覆盖 ?? 全局 cwdState）。
 */
export function pwd(): string {
  return cwdOverrideStorage.getStore() ?? getCwdState()
}

/**
 * Get the current working directory or the original working directory if the
 * current one is not available.
 */
export function getCwd(): string {
  try {
    return pwd()
  } catch {
    return getOriginalCwd()
  }
}
