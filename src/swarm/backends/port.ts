/**
 * backends 族注入窗（C 桶 ③ shell·swarm 波 S-E2b；§8.66 切片内接缝 ②）。
 *
 * 用途：S-E2b 中层（teammateLayoutManager / teamHelpers killOrphanedTeammatePanes）
 * 消费 backends 检测/注册面（registry detectAndGetBackend / getBackendByType /
 * ensureBackendsRegistered + detection isInsideTmux）——该 4 面本体归 S-E2c
 * backends 族。域内跨切片物化接缝：S-E2b 落接缝（null 缺省零行为），S-E2c
 * registry/detection 落位后由组合根（或 swarm 门面显式 init）调
 * setBackendModule 接线（PRT-2：接线调用 = 组合根装配语句，非模块顶层自注册）。
 *
 * 与 R7 ports/ 目录裁定区分：R7 裁的是跨域 port（agent-loop / compaction
 * 直连裁定）；本文件为域内跨切片物化窗，不跨域。
 *
 * 双访问面：
 *   - getBackendModule() → null 缺省（teamHelpers 清理支：未接线 = 跳过 +
 *     debug 日志，shutdown 路径不抛）。
 *   - requireBackendModule() → 未接线 throw（teammateLayoutManager：编程错误
 *     早暴露，seam ② fail-fast 型）。
 */
import type {
  BackendDetectionResult,
  PaneBackend,
  PaneBackendType,
} from './types'

/** S-E2c registry/detection 4 面窄视图（接线时整对象注入，域内单一事实源）。 */
export type BackendModuleFace = {
  detectAndGetBackend(): Promise<BackendDetectionResult>
  getBackendByType(type: PaneBackendType): PaneBackend
  ensureBackendsRegistered(): Promise<void>
  isInsideTmux(): Promise<boolean>
}

let backendModule: BackendModuleFace | null = null

/** 注入 backends 族实现（组合根 / S-E2c 装配面调用）。 */
export function setBackendModule(module: BackendModuleFace): void {
  backendModule = module
}

/** 测试复位（teardown 用）。 */
export function resetBackendModule(): void {
  backendModule = null
}

/** null 缺省访问（清理支：未接线 = 消费者自行跳过）。 */
export function getBackendModule(): BackendModuleFace | null {
  return backendModule
}

/** fail-fast 访问（seam ②：编程性调用未接线 = 初始化 bug，抛不吞）。 */
export function requireBackendModule(): BackendModuleFace {
  if (!backendModule) {
    throw new Error(
      'BackendModule not wired — call setBackendModule at composition root first (swarm backends seam ②)',
    )
  }
  return backendModule
}
