/**
 * engine/context — post-compact 清理注册表（D-2a S6，M5 切端）：
 * 旧仓 orchestrator/context/postCompactCleanup.ts 的「重置注册」骨架落 engine
 * （React-free、零 tui 依赖）；~10 个 tui 状态模块的重置体 = 宿主侧注册
 * （registerPostCompactReset，S8 接线时把旧仓各 clear* 挂上），feature 门
 * （CONTEXT_COLLAPSE reset / COMMIT_ATTRIBUTION sweep）= 宿主注册时决定
 * （门开才注册对应 reset），engine 只持注册表骨架 + 主线程门控。
 *
 * 语义（旧仓 L24-78 逐字）：
 *  - resetMicrocompactState 恒跑（engine S4 单源）；
 *  - 主线程门：subagent（agent:*）与主线程同进程共享模块级状态——subagent
 *    压缩时重置主线程模块态（context-collapse / memory files / userContext
 *    cache）会摧毁主线程状态；querySource undefined / 'repl_main_thread'
 *    前缀 / 'sdk' = 主线程（旧仓逐字判定）；
 *  - 标 mainThreadOnly 的 reset 仅在主线程压缩时跑。
 *
 * delta 登记：旧仓内联的 10 个 clear* 调用 + 2 个 feature 门内动态 import
 * = 宿主注册项（S8 接线）；engine 侧无状态模块可清（零模块态红线），
 * 注册表缺省空 = 仅 resetMicrocompactState 跑（= 旧仓 feature 全关态等价）。
 */
import { resetMicrocompactState } from './microCompact'

export type PostCompactReset = (querySource?: string) => void

interface RegisteredReset {
  fn: PostCompactReset
  /** 仅主线程压缩重置（subagent 压缩跳过；旧仓 isMainThreadCompact 语义）。 */
  mainThreadOnly?: boolean
}

const registeredResets: RegisteredReset[] = []

/** 宿主注册 post-compact reset（S8 tui 接线；执行序 = 注册序）。 */
export function registerPostCompactReset(
  fn: PostCompactReset,
  opts?: { mainThreadOnly?: boolean },
): void {
  registeredResets.push({ fn, mainThreadOnly: opts?.mainThreadOnly })
}

/** 测试 teardown：清注册表（防跨用例污染）。 */
export function clearPostCompactResetsForTesting(): void {
  registeredResets.length = 0
}

/**
 * 压缩后清理（旧仓 runPostCompactCleanup 语义）。auto-compact 与手动 /compact
 * 之后调用，释放被压缩失效的 tracking 结构持有的内存。
 * 有意不清 invoked skill 内容（skill 文本须跨多次压缩存活，旧仓同注）。
 */
export function runPostCompactCleanup(querySource?: string): void {
  // subagent 压缩不重置主线程模块级状态（旧仓逐字判定）。
  const isMainThreadCompact =
    querySource === undefined ||
    querySource.startsWith('repl_main_thread') ||
    querySource === 'sdk'

  resetMicrocompactState()
  for (const r of registeredResets) {
    if (r.mainThreadOnly && !isMainThreadCompact) continue
    r.fn(querySource)
  }
}
