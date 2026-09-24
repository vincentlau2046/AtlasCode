/**
 * 全局清理函数注册表（旧仓 utils/cleanupRegistry.ts 26L 逐字随迁，S-7a）
 *
 * 消费方：LocalAgentTask/LocalShellTask 注册优雅关闭清理（kill 孤儿任务）；
 * 运行入口（E-wave-end 组合根 / CLI 关闭路径）调用 runCleanupFunctions。
 * 域内独立副本（旧仓为全局单例 utils，新仓 tasks 域内自持，防跨域泄漏）。
 */

// 全局清理函数注册表
const cleanupFunctions = new Set<() => Promise<void>>()

/**
 * 注册优雅关闭时运行的清理函数。
 * @param cleanupFn - 清理函数（可同步可异步）
 * @returns 注销函数（从注册表移除该清理项）
 */
export function registerCleanup(cleanupFn: () => Promise<void>): () => void {
  cleanupFunctions.add(cleanupFn)
  return () => cleanupFunctions.delete(cleanupFn) // 返回注销函数
}

/**
 * 运行全部已注册清理函数（并行）。
 * 由优雅关闭路径内部调用。
 */
export async function runCleanupFunctions(): Promise<void> {
  await Promise.all(Array.from(cleanupFunctions).map(fn => fn()))
}
