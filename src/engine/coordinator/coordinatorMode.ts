/**
 * engine/coordinator — coordinator 门控（§8.25 E-2 T-5b spawn 深度门 前置；T-5d 补提示词）
 *
 * 旧仓 coordinator/coordinatorMode.ts 裁剪版真核心：
 *   - isCoordinatorMode()：73631df 翻转为 ON_BY_DEFAULT（feature 门打开，运行时由
 *     ATLAS_COORDINATOR_MODE env 门控，kill-switch FEATURE_COORDINATOR_MODE=false 保留）。
 *     旧仓经 bun:bundle feature()（不可单测，见 bun-bundle-feature-untestable）→ 新仓
 *     直接读 env，语义等价且可测。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - matchSessionMode（会话恢复模式对齐）/ getCoordinatorUserContext（worker 工具面
 *     上下文）/ getCoordinatorSystemPrompt（coordinator 主提示词）→ T-5d（同模块补）。
 *   - isScratchpadGateEnabled / getCoordinatorSystemPrompt 的 MCP/scratchpad 段 → 残留守。
 *   - INTERNAL_WORKER_TOOLS 过滤（team/sendmessage/syntheticoutput 从 worker 工具面剔除）
 *     → 残留守（依赖 SendMessage/TaskStop 等工具面，归 E-2 工具面全量后补）。
 */
import { isEnvTruthy } from '../../shared'

/**
 * coordinator 模式是否激活（ON_BY_DEFAULT，73631df）。
 *
 * 旧仓 = `feature('COORDINATOR_MODE') && isEnvTruthy(ATLAS_COORDINATOR_MODE)`，其中
 * feature('COORDINATOR_MODE') 经 73631df 加入 ON_BY_DEFAULT 集（恒真，除非
 * FEATURE_COORDINATOR_MODE=false 强制关）。新仓剥掉不可测的 bun:bundle feature()，
 * 语义等价：kill-switch 显式 false → 关；否则读 ATLAS_COORDINATOR_MODE env。
 */
export function isCoordinatorMode(): boolean {
  if (process.env.FEATURE_COORDINATOR_MODE === 'false') return false
  return isEnvTruthy(process.env.ATLAS_COORDINATOR_MODE)
}
