/**
 * in-process spawn 观测钩子注入窗（W-D-C 段 R1 R1-D1；lock-face
 * docs/2026-11-11-wdc-r1-lockface.md §2，f4 批复 2026-11-11）。
 *
 * 用途：backends 收敛后 InProcessBackend 单源化于 src/swarm/backends，
 * C-3 换道反向面四钩子（mainSystemPrompt/onMessage/onPermissionWaitMs/
 * getPermissionMode，f4 §13①②⑤）闭包体全在 TUI 域（getSystemPrompt/
 * LocalAgentTask/InProcessTeammateTask）——engine 不可 import，经本窗
 * 由 tui/factory 组合根注入工厂（与 setStartInProcessTeammate 同批装配，
 * PRT-2 显式装配语句）。
 *
 * fail-soft：未接线 = null 缺省零钩子（engine lane 恒等）。
 * **fail-visible 硬条件（f4 批复附带）**：已接线后 factory 调用期异常
 * 禁吞——InProcessBackend.spawn 直呼不包 try/catch，抛错向上传播，
 * 禁降级为零钩子静默继续。
 *
 * 与 backends/inProcessRunnerPort.ts（seam ② fail-fast）同族：本窗为
 * 观测面（UX 可选），缺省静默；runner 启动面缺省抛（初始化 bug 早暴露）。
 */
import type { Message } from '../../shared'
import type { TeammateExecutorContext, TeammateSpawnConfig } from './types'

/** 四钩子面（= StartInProcessTeammateArgs 四钩子可选面逐字镜像）。 */
export type InProcessSpawnHooks = {
  /** §13⑤：主系统提示词策略分离（TUI 调用点显式计算；缺省 undefined = ADDENDUM-only）。 */
  mainSystemPrompt?: string
  /** §13①：逐消息观测钩子（progress tracker 镜像 + task.messages 逐消息镜像）。 */
  onMessage?: (message: Message) => void
  /** §13①：权限等待时长回调（gate leader 队列支 settle 点调用）。 */
  onPermissionWaitMs?: (waitMs: number) => void
  /** §13②：per-iteration permissionMode 覆盖钩子（返回 undefined = 不覆盖）。 */
  getPermissionMode?: () => string | undefined
}

/** 工厂输入面：spawn 配置 + executor 窄视图上下文 + taskId。 */
export type InProcessSpawnHooksFactoryArgs = {
  config: TeammateSpawnConfig
  ctx: TeammateExecutorContext
  taskId: string
}

export type InProcessSpawnHooksFactory = (
  args: InProcessSpawnHooksFactoryArgs,
) => Promise<InProcessSpawnHooks> | InProcessSpawnHooks

let factory: InProcessSpawnHooksFactory | null = null

/** 注入观测钩子工厂（tui/factory 组合根装配；幂等 last-wins）。 */
export function setInProcessSpawnHooksFactory(f: InProcessSpawnHooksFactory): void {
  factory = f
}

/** 测试复位（teardown 用）。 */
export function resetInProcessSpawnHooksFactory(): void {
  factory = null
}

/** null 缺省读（未接线 = engine lane 零钩子恒等）。 */
export function getInProcessSpawnHooksFactory(): InProcessSpawnHooksFactory | null {
  return factory
}
