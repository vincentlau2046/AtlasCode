/**
 * 进程退出清理注册表（域内镜像；C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/cleanupRegistry.ts（~30L 通用 graceful-shutdown
 * 注册表逐字）。新仓 engine/coordinator/tasks/cleanupRegistry 为 task 作用域
 * 队列（enqueue-on-task-completion，非进程退出面）——两概念不同名不撞，
 * 本文件 = swarm 域进程退出面（concurrentSessions PID 文件 unlink /
 * spawnInProcess teammate abort）。
 *
 * 装配登记（H6 前向接缝，复审勿当遗漏重提）：runCleanupFunctions 消费 =
 * gracefulShutdown 装配面（组合根残留守 ⑤ / analytics 波 #143 落
 * 退出钩子时挂接）——未接线时注册表仅累积零行为（无调用点触发即无影响）。
 */

// 全局清理函数注册表
const cleanupFunctions = new Set<() => Promise<void>>()

/**
 * 注册清理函数（graceful shutdown 时执行）。
 * @returns 注销函数（从注册表移除该 handler）
 */
export function registerCleanup(
  cleanupFn: () => Promise<void>,
): () => void {
  cleanupFunctions.add(cleanupFn)
  return () => cleanupFunctions.delete(cleanupFn)
}

/**
 * 执行全部已注册清理函数（gracefulShutdown 消费；装配面登记见头注）。
 */
export async function runCleanupFunctions(): Promise<void> {
  await Promise.all(Array.from(cleanupFunctions).map(fn => fn()))
}
