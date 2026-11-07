/**
 * engine/tools/agent — teammateSpawnPort（0.1.93 W-D-A A3；工单
 * docs/2026-11-08-p0-wave-0193-ticket.md；f4 批复 2026-11-08 五(a)）。
 *
 * 用途：AgentTool teammate 分支（name/team_name 扩参）触发成员 spawn 的
 * 唯一入口接缝。engine↛swarm L3 域隔离（engine 允许列表无 swarm）→
 * 组合根（atlascode/compose.ts ⑫ 块）注入真实现（InProcessBackend.spawn
 * + isTeammate 嵌套守卫）。PRT-2 同型（TeamServices/TeamFileLoader/
 * StartInProcessTeammate 三 seam 先例）：接线 = 显式装配语句，非模块
 * 顶层自注册；未注入 fail-fast（requireTeammateSpawnTrigger 抛，编程
 * 错误早暴露）。
 *
 * 配置类型 = duck 面（swarm TeammateSpawnConfig 的 AgentTool 消费子集）：
 * swarm 域单一事实源 = backends/types.ts，本 duck 随消费面收窄；组合根
 * 装配处做 duck → 真型映射（compose ⑫ 块注）。
 */

/** spawn 触发配置（AgentTool teammate 分支产出；组合根映射到
 * swarm TeammateSpawnConfig）。 */
export type TeammateSpawnTriggerConfig = {
  /** 成员名（spawn 身份，禁含 '@'）。 */
  name: string
  /** 目标组名（teamContext.teamName，TeamCreate 先行）。 */
  teamName: string
  /** 首条指令（renderTeammatePrompt 组装产物）。 */
  prompt: string
  /** per-member 模型 override（ModelRole 或模型 id，透传面）。 */
  model?: string
  /** 成员工具允许集（缺省 = 全量池）。 */
  allowedTools?: string[]
  /** 权限提示面：成员 spawn 恒 false（headless 形态定谳——gate ask 支
   * auto-deny，fail-closed 权限不放大；delta ⑭ 既有面）。 */
  allowPermissionPrompts?: boolean
  /** 预留：plan 模式要求 / 系统提示词组装（pane 系消费面，Form A 不设）。 */
  planModeRequired?: boolean
  systemPrompt?: string
  systemPromptMode?: 'default' | 'replace' | 'append'
}

/** spawn 结果（InProcessBackend.spawn TeammateSpawnResult 子集映射）。 */
export type TeammateSpawnTriggerResult = {
  success: boolean
  agentId: string
  taskId?: string
  error?: string
}

export type TeammateSpawnTrigger = (
  config: TeammateSpawnTriggerConfig,
) => Promise<TeammateSpawnTriggerResult>

let trigger: TeammateSpawnTrigger | null = null

/** 组合根注入（幂等 last-wins；测试 resetTeammateSpawnTrigger 复位）。 */
export function setTeammateSpawnTrigger(fn: TeammateSpawnTrigger): void {
  trigger = fn
}

/** 测试复位（teardown 用）。 */
export function resetTeammateSpawnTrigger(): void {
  trigger = null
}

/** fail-fast 访问（未接线 = 编程错误早暴露，seam 先例同型）。 */
export function requireTeammateSpawnTrigger(): TeammateSpawnTrigger {
  if (!trigger) {
    throw new Error(
      'TeammateSpawnTrigger not wired — call setTeammateSpawnTrigger at composition root first (0.1.93 W-D-A spawn seam)',
    )
  }
  return trigger
}
