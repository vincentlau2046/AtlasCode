/**
 * atlascode 组合根适配器 — bootstrap 域 cwd 状态 → BootstrapStatePort（C2 · §8.8）
 *
 * executor 域只面向 BootstrapStatePort 编程（L3：禁 import bootstrap 域）。
 * 本适配器把 bootstrap 域的 getCwdState/getOriginalCwd/setCwdState 包装成
 * 端口接口，由 compose.ts 注入。
 *
 * 窄面裁定（ports/bootstrapState.ts 头注）：pwd() 的 ALS 并发覆盖层归 engine，
 * 端口只暴露 getCwd()（无覆盖路径）。
 */
import { getCwdState, getOriginalCwd, setCwdState } from '../../bootstrap'
import type { BootstrapStatePort } from '../../executor'

/** bootstrap 域 cwd 状态 → BootstrapStatePort 适配器。 */
export function adaptBootstrapToExecutorPort(): BootstrapStatePort {
  return {
    getCwd: () => getCwdState(),
    getOriginalCwd: () => getOriginalCwd(),
    setCwdState: (cwd: string) => setCwdState(cwd),
  }
}
