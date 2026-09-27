/**
 * engine/tools/team — TeamServices 注入接缝（C 桶 ③ shell·swarm 波 S-E2d；
 * §8.66.1.5 补差侧）。
 *
 * 用途：TeamCreate / TeamDelete 两工具本体消费 swarm 域 team-file 面
 *（旧仓 utils/swarm/teamHelpers + teammateLayoutManager）——L3 域隔离
 *（engine 允许列表无 swarm）→ 组合根（atlascode/compose.ts）把 swarm
 * 门面真实现注入本接缝（TeamFileLoader 接缝先例：engine/tools/team/
 * sendMessageTool.ts delta ⑤；PRT-2 接线 = 显式装配语句，非模块顶层
 * 自注册）。未注入 fail-fast（requireTeamServices 抛，不吞 = 旧仓
 * team-file-missing 错误面同源语义：编程错误早暴露）。
 *
 * 面清单（9 团队文件面 + 2 团队上下文态面）：
 *   - 团队文件 9 面 = 旧仓 TeamCreate/TeamDelete call 体直接消费的
 *     teamHelpers/teammateLayoutManager 面逐字（见 TeamServices 各成员注）。
 *   - 团队上下文态 2 面（getTeamContext/setTeamContext）= 旧仓
 *     appState.teamContext 读写（AppStateStore.ts:313-332）；新仓 AppState
 *     全量面归 TUI 波 → 本模块内存缺省 store（真实闭包单元，非 stub；
 *     组合根可整换 TUI appState 真值，同一注入窗）。
 *
 * 类型面漂移防（复审勿当遗漏重提）：
 *   - TeamServicesFile = swarm teamHelpers TeamFile 字段镜像（本域本地
 *     duck；swarm 域单一事实源 = teamHelpers.ts，本镜像随 S-E2 各切片
 *     对齐——swarm 侧 reconnection.ts TeamContextShape 先例同款登记）。
 *   - TeamContextShape/TeamMemberStateShape = 旧仓 AppStateStore
 *     teamContext 逐字段镜像（swarm reconnection.ts 本地镜像同款）。
 *
 * 裁面登记（H6，复审勿当遗漏重提）：
 *   - 旧仓 TeamDelete call 尾 `setAppState({ teamContext: undefined,
 *     inbox: { messages: [] } })` 的 inbox 清面裁：新仓无 inbox 状态成员
 *     （messaging 域队列面 = 消费支，非 appState 字段；TUI 波若有 inbox
 *     面随 TUI appState 接线点重裁定）。
 */

/** swarm teamHelpers TeamFile 字段镜像（成员面 = TeamCreate 写面 + TeamDelete
 * 读面消费字段并集；prompt/sessionId/backendType/mode 等兄弟成员不在
 * 本工具消费面 = 镜像省略，漂移防登记见头注）。 */
export type TeamServicesFile = {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string // 可选镜像 swarm TeamFile 逐字（写面恒提供，读面不消费）
  members: Array<{
    agentId: string
    name: string
    agentType?: string
    model?: string
    joinedAt: number
    tmuxPaneId: string
    cwd: string
    worktreePath?: string
    subscriptions: string[]
    isActive?: boolean // false = idle/finished，undefined/true = active
  }>
}

/** 旧 AppStateStore TeamMemberState 逐字段镜像（teammates record 值形）。 */
export type TeamMemberStateShape = {
  name: string
  agentType?: string
  color?: string
  tmuxSessionName: string
  tmuxPaneId: string
  cwd: string
  spawnedAt: number
}

/** 旧 AppStateStore teamContext 逐字段镜像（本工具消费字段）。 */
export type TeamContextShape = {
  teamName: string
  teamFilePath: string
  leadAgentId: string
  teammates: Record<string, TeamMemberStateShape>
}

/** 组合根注入面（swarm 门面真实现绑定；未注入 fail-fast）。 */
export interface TeamServices {
  /** 旧 readTeamFile（teamHelpers L180，同步读面）。 */
  readTeamFile(teamName: string): TeamServicesFile | null
  /** 旧 writeTeamFileAsync（teamHelpers L224）。 */
  writeTeamFileAsync(
    teamName: string,
    teamFile: TeamServicesFile,
  ): Promise<void>
  /** 旧 getTeamFilePath（teamHelpers L171，~/.atlas/teams/<name>/config.json）。 */
  getTeamFilePath(teamName: string): string
  /** 旧 registerTeamForSessionCleanup（teamHelpers L609，gh-32730）。 */
  registerTeamForSessionCleanup(teamName: string): void
  /** 旧 unregisterTeamForSessionCleanup（teamHelpers L617）。 */
  unregisterTeamForSessionCleanup(teamName: string): void
  /** 旧 cleanupTeamDirectories（teamHelpers L692，团队目录 + worktree 清面）。 */
  cleanupTeamDirectories(teamName: string): Promise<void>
  /** 旧 assignTeammateColor（teammateLayoutManager L44，round-robin 色池）。 */
  assignTeammateColor(agentId: string): string
  /** 旧 clearTeammateColors（teammateLayoutManager L70）。 */
  clearTeammateColors(): void
  /** 旧 sanitizeName（teamHelpers L149，taskListId 派生面）。 */
  sanitizeName(name: string): string
  /** 旧 appState.teamContext 读面（内存缺省 store，见下）。 */
  getTeamContext(): TeamContextShape | undefined
  /** 旧 appState.teamContext 写面（TeamDelete 清面 = undefined）。 */
  setTeamContext(ctx: TeamContextShape | undefined): void
}

let active: TeamServices | undefined

/** 组合根注入（幂等，last-wins；测试可 resetTeamServices 复位）。 */
export function setTeamServices(services: TeamServices): void {
  active = services
}

/** 测试复位（teardown 用）：清掉注入，恢复未注入 fail-fast 态。 */
export function resetTeamServices(): void {
  active = undefined
}

/** fail-fast 访问（未注入 = 编程错误早暴露，同 TeamFileLoader 接缝先例）。 */
export function requireTeamServices(): TeamServices {
  if (!active) {
    throw new Error(
      'TeamServices not wired — call setTeamServices at composition root first (swarm team-file seam, C 桶 ③ S-E2d)',
    )
  }
  return active
}

// ── 团队上下文态内存缺省 store ───────────────────────────────────────
// 旧 appState.teamContext 的进程内承载（TUI 波 appState 全量面落位后经
// 组合根整换真 appState 读写，同一 setTeamServices 注入窗）。

let teamContext: TeamContextShape | undefined

/** 内存缺省 store（组合根组装 TeamServices 时绑定 2 态面）。 */
export function createDefaultTeamContextStore(): Pick<
  TeamServices,
  'getTeamContext' | 'setTeamContext'
> {
  return {
    getTeamContext: () => teamContext,
    setTeamContext: ctx => {
      teamContext = ctx
    },
  }
}

/** 测试复位（teardown 用）：清掉缺省 store 态。 */
export function resetDefaultTeamContextStore(): void {
  teamContext = undefined
}
