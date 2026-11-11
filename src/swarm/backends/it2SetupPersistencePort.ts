/**
 * it2Setup 标志持久化注入窗（W-D-C 段 R1 R1-D3；lock-face
 * docs/2026-11-11-wdc-r1-lockface.md §2，f4 批复 2026-11-11）。
 *
 * 用途：backends 收敛后 it2Setup 单源化于 src/swarm/backends，两标志
 * （iterm2It2SetupComplete / preferTmuxOverIterm2）旧 TUI 副本经
 * getGlobalConfig/saveGlobalConfig 持久化（跨进程 setup 提示不重复弹），
 * engine 域无 config 面（裁面 = 进程内标志）——经本窗由 tui/factory
 * 组合根注入 globalConfig 适配器，恢复 TUI 现行为；engine 直调不接线
 * = 进程内标志（现行为恒等）。
 *
 * **禁新增吞错（f4 批复附带硬条件）**：适配器读写异常维持 TUI 现行为
 * （globalConfig 抛错向上传播）——it2Setup 消费点直呼 port 不包
 * try/catch，禁降级为进程内标志静默继续。
 *
 * 与 backends/inProcessSpawnHooksPort.ts 同族（观测/偏好面 fail-soft
 * 缺省 + fail-visible 调用期）；与 backends/port.ts（seam ② fail-fast）
 * 区分：本窗未接线 = 语义缺省（进程内标志）非错误。
 */

/** 标志名（engine it2Setup 进程内标志名逐字；适配器侧映射 config 键）。 */
export type It2SetupFlagName = 'it2SetupComplete' | 'preferTmuxOverIterm2'

export type It2SetupFlags = {
  it2SetupComplete: boolean
  preferTmuxOverIterm2: boolean
}

export type It2SetupPersistencePort = {
  /** 读双标志现值（适配器 = getGlobalConfig 投影；抛错向上传播）。 */
  getFlags: () => It2SetupFlags
  /** 写单标志（适配器 = saveGlobalConfig；抛错向上传播）。 */
  setFlag: (name: It2SetupFlagName, value: boolean) => void
}

let port: It2SetupPersistencePort | null = null

/** 注入持久化 port（tui/factory 组合根装配；幂等 last-wins）。 */
export function setIt2SetupPersistencePort(p: It2SetupPersistencePort): void {
  port = p
}

/** 测试复位（teardown 用；复位后回落进程内标志）。 */
export function resetIt2SetupPersistencePort(): void {
  port = null
}

/** null 缺省读（未接线 = it2Setup 消费点走进程内标志支）。 */
export function getIt2SetupPersistencePort(): It2SetupPersistencePort | null {
  return port
}
