/**
 * engine/tools/bash — Bash 超时常量面（Bash 本体纵切子波 §8.54 S-B1 依赖闭包层）。
 *
 * 旧仓来源（a8af45b）: src/utils/timeouts.ts 全文逐字随迁（getDefaultBashTimeoutMs
 * + getMaxBashTimeoutMs + BASH_DEFAULT_TIMEOUT_MS/BASH_MAX_TIMEOUT_MS env 面，
 * max≥default 不变式双支）。消费方 = S-B5 bashTool.ts call() 超时钳制
 * `Math.min(args.timeout_ms ?? args.timeout ?? getDefaultBashTimeoutMs(),
 * getMaxBashTimeoutMs())`（探针 P-B4 锚点 = 该 clamp 删除）。
 *
 * 零 delta（纯函数 + env 面，无 import；env 参注入口保留 = 旧仓测试面）。
 */

// Constants for timeout values
const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes
const MAX_TIMEOUT_MS = 600_000 // 10 minutes

type EnvLike = Record<string, string | undefined>

/**
 * Get the default timeout for bash operations in milliseconds
 * Checks BASH_DEFAULT_TIMEOUT_MS environment variable or returns 2 minutes default
 * @param env Environment variables to check (defaults to process.env for production use)
 */
export function getDefaultBashTimeoutMs(env: EnvLike = process.env): number {
  const envValue = env.BASH_DEFAULT_TIMEOUT_MS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return DEFAULT_TIMEOUT_MS
}

/**
 * Get the maximum timeout for bash operations in milliseconds
 * Checks BASH_MAX_TIMEOUT_MS environment variable or returns 10 minutes default
 * @param env Environment variables to check (defaults to process.env for production use)
 */
export function getMaxBashTimeoutMs(env: EnvLike = process.env): number {
  const envValue = env.BASH_MAX_TIMEOUT_MS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) {
      // Ensure max is at least as large as default
      return Math.max(parsed, getDefaultBashTimeoutMs(env))
    }
  }
  // Always ensure max is at least as large as default
  return Math.max(MAX_TIMEOUT_MS, getDefaultBashTimeoutMs(env))
}
