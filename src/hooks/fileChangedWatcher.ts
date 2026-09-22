/**
 * hooks 域 — fileChangedWatcher no-op 起步（C-Deep 切片 3 T6，§8.14 跨域边②）
 *
 * 旧仓来源（a8af45b）: src/utils/hooks/fileChangedWatcher.ts（191L，chokidar
 * 文件/cwd 监听 → 触发 executeCwdChangedHooks / executeFileChangedHooks）。
 * 跨域边：executor Shell L30 import onCwdChangedForHooks（hooks↔executor 第二边）。
 *
 * 薄骨架 = no-op 起步：签名照抄（组合根 / executor 消费面稳定），体为空——真
 * chokidar 监听 + CwdChanged/FileChanged 钩子执行归 engine 波（依赖 hooks 执行
 * 引擎 + chokidar 依赖 + cleanupRegistry）。未注入 / 无钩子配置时 no-op 即正确
 * 行为（等价旧仓 hasEnvHooks=false 早退）。
 */

/** env 钩子通知回调（no-op 保留注入面，真实现归 engine）。 */
export function setEnvHookNotifier(
  _cb: ((text: string, isError: boolean) => void) | null,
): void {
  // no-op 起步：真监听未随迁（engine 波）
}

/** 初始化文件/cwd 监听（no-op：真 chokidar 监听 + 清理注册归 engine）。 */
export function initializeFileChangedWatcher(_cwd: string): void {
  // no-op 起步
}

/** 动态监听路径更新（no-op：真 watchPaths 重解析归 engine）。 */
export function updateWatchPaths(_paths: string[]): void {
  // no-op 起步
}

/**
 * cwd 变更钩子触发面（executor Shell 消费）。no-op：真 CwdChanged 钩子执行 +
 * clearCwdEnvFiles + 监听重启归 engine。未配 CwdChanged/FileChanged 钩子时
 * no-op 即正确（等价旧仓 currentHasEnvHooks=false 早退）。
 */
export async function onCwdChangedForHooks(
  _oldCwd: string,
  _newCwd: string,
): Promise<void> {
  // no-op 起步
}

/** 测试复位（no-op：无状态）。 */
export function resetFileChangedWatcherForTesting(): void {
  // no-op 起步
}
