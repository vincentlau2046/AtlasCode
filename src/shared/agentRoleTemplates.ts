/**
 * shared/agentRoleTemplates — 0.1.93 W-D-A（Form A 临时小组，工单
 * docs/2026-11-08-p0-wave-0193-ticket.md；f4 批复 2026-11-08）。
 *
 * 职责两件：
 *   1. renderTeammatePrompt — spawn 触发点（Agent 扩参 name/team_name）的
 *      prompt 组装纯函数：把 TeamCreate members 名册（role/goal/backstory
 *      三元组，CrewAI 词汇吸收）+ 任务 prompt 合成为成员首条指令。纯函数
 *      零 I/O、零门依赖 → 落 shared（engine AgentTool 与未来 TUI 预览面
 *      双消费）。
 *   2. named 角色模板注册表（A4 载体）——role 标签 → 模板片段映射；
 *      renderTeammatePrompt 消费（命中则注入模板片段）。注册 = 组合根 /
 *      域包显式装配（PRT-2 同型：非模块顶层自注册）；缺省零注册 =
 *      render 恒等走名册三元组，零行为差。
 */

/** named 角色模板（role 标签检索单元；systemPromptFragment = 组装时注入
 * 的固定指令片段）。 */
export type AgentRoleTemplate = {
  role: string
  systemPromptFragment?: string
}

const roleTemplates = new Map<string, AgentRoleTemplate>()

/** 组合根 / 域包注册（幂等 last-wins；测试 resetAgentRoleTemplates 复位）。 */
export function registerAgentRoleTemplate(template: AgentRoleTemplate): void {
  roleTemplates.set(template.role, template)
}

/** role 标签检索（未注册 = undefined，render 走名册三元组）。 */
export function getAgentRoleTemplate(
  role: string,
): AgentRoleTemplate | undefined {
  return roleTemplates.get(role)
}

/** 测试复位（teardown 用）。 */
export function resetAgentRoleTemplates(): void {
  roleTemplates.clear()
}

/** renderTeammatePrompt 输入面（TeamCreate roster 条目 + Agent 任务 prompt）。 */
export type TeammatePromptParts = {
  /** 成员名（spawn 身份）。 */
  name: string
  /** 角色标签（命中注册表则注入模板片段）。 */
  role?: string
  goal?: string
  backstory?: string
  /** 任务 prompt（Agent call 透传原文）。 */
  prompt: string
}

/**
 * 合成成员首条指令：身份行 + 模板/角色元数据段 + 任务 prompt 原文。
 * 纯函数（无 I/O 无门）；roster 字段全可选（缺省只渲染任务 prompt +
 * 身份行 = roster 未建组仍可 spawn 的退化面）。
 */
export function renderTeammatePrompt(parts: TeammatePromptParts): string {
  const sections: string[] = []
  sections.push(`You are the team member "${parts.name}".`)
  const template = parts.role ? getAgentRoleTemplate(parts.role) : undefined
  if (template?.systemPromptFragment) {
    sections.push(template.systemPromptFragment)
  }
  if (parts.role) sections.push(`Role: ${parts.role}`)
  if (parts.goal) sections.push(`Goal: ${parts.goal}`)
  if (parts.backstory) sections.push(`Backstory: ${parts.backstory}`)
  sections.push(parts.prompt)
  return sections.join('\n\n')
}
