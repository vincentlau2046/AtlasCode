/**
 * 三总纲（umbrella）skill 共享形态 + SKILL_MD 渲染器（0.1.87 任务 A）。
 *
 * 总纲 = 薄路由 bundled skill：只做「分类/决策 → 路由到既有技能」，不搬子技能
 * 方法论正文（工单 §3 边界）。路由表（AscendUmbrellaRoute[]）= 单一事实源：
 *   - SKILL_MD 正文的路由表由 renderUmbrellaSkillMd 从 routes 渲染生成（无手抄
 *     第二份）；
 *   - 系统提示词分组行（任务 B）由 enterWhen/routesSummary 渲染生成（同源）。
 *
 * 形态对齐既有五件套（ascendOptimize.ts:58-63）：各总纲文件导出
 * ASCEND_<X>_SKILL_MD / NAME / DESCRIPTION / WHEN_TO_USE / ALLOWED_TOOLS，壳侧
 * src/tui/skills/bundled/ascend<X>.ts 以 userInvocable:false 注册（模型经
 * skill_listing 可见——getSkillToolCommands 不滤 isHidden；slash 面不注册，
 * 命令面零变化）。
 *
 * 壳侧副本（boundaries 约束 tui 不可 import ascend）的字节全等由
 * tests/unit/wave0187-umbrella-skills.test.ts ⑩ 守卫。
 */

export type AscendUmbrellaRouteStatus = 'preinstalled' | 'suggest-install'

/**
 * 路由目标来源（⑥ 无死链锁的判别维度）：
 *   - bundled：5 运行时 bundled skill（二进制内）
 *   - atlas-plugins：6 域知识技能（市场预装）
 *   - agent-skills：agent-skills 市场 cannbot/Common/MindSpeed/community pack
 *   - ms-agent-skills：ms-agent pin 快照（任务 C 落 manifest）
 *   - external：当前市场未收录条目（只能 suggest-install，不得伪 preinstalled）
 */
export type AscendUmbrellaRouteSource =
  | 'bundled'
  | 'atlas-plugins'
  | 'agent-skills'
  | 'ms-agent-skills'
  | 'external'

export interface AscendUmbrellaRoute {
  /** 路由目标：bundled skill 名 / 市场知识技能名 / agent-skills pack 名 / 市场外条目名。 */
  skill: string
  /** 触发条件（何时路由到此目标）。 */
  trigger: string
  status: AscendUmbrellaRouteStatus
  source: AscendUmbrellaRouteSource
  /** 可选补充（代表性 skill 名、pin 快照名等）。 */
  note?: string
}

export interface AscendUmbrellaDefinition {
  name: string
  /** 正文 H1 标题。 */
  title: string
  description: string
  whenToUse: string
  allowedTools: readonly string[]
  /** 一句「何时进总纲」（系统提示词分组行 + 正文 Goal 段共用）。 */
  enterWhen: string
  /** 「由总纲再路由」说明句（同上共用）。 */
  routesSummary: string
  routes: readonly AscendUmbrellaRoute[]
  /** 追加正文段（doctor 的 msprof-mcp MCP 预设段等），拼在路由表之后、Rules 之前。 */
  extraSections?: readonly string[]
  /**
   * 任务 F Step 0 段（三总纲统一措辞，渲染在正文尾部；任务 A 不设 —— 任务 F
   * 落 AscendSkillSourceCheck 时统一填充）。
   */
  step0Section?: string
}

const STATUS_LABEL: Record<AscendUmbrellaRouteStatus, string> = {
  preinstalled: 'preinstalled',
  'suggest-install': 'suggest install',
}

/**
 * 渲染总纲 SKILL_MD（frontmatter + Goal + 路由表 + extraSections + Rules
 * [+ step0Section]）。路由表行 1:1 来自 routes（单一事实源直证）。
 */
export function renderUmbrellaSkillMd(def: AscendUmbrellaDefinition): string {
  const lines: string[] = [
    '---',
    `name: ${def.name}`,
    `description: ${def.description}`,
    `when_to_use: ${def.whenToUse}`,
    `allowed-tools: ${def.allowedTools.join(', ')}`,
    '---',
    '',
    `# ${def.title}`,
    '',
    def.enterWhen,
    '',
    def.routesSummary,
    '',
    '## Routing table',
    '',
    'Pick the route from the classification below. Route — do not re-derive the routed skill\'s methodology here.',
    '',
    '| Route to | Route when | Status |',
    '|---|---|---|',
  ]
  for (const r of def.routes) {
    const target = r.note ? `${r.skill} (${r.note})` : r.skill
    lines.push(`| ${target} | ${r.trigger} | ${STATUS_LABEL[r.status]} |`)
  }
  for (const section of def.extraSections ?? []) {
    lines.push('', section)
  }
  lines.push(
    '',
    '## Rules',
    '',
    '- This umbrella ROUTES only. The routed skill owns its methodology; do not copy or substitute it here.',
    '- If a routed skill is missing (marketplace entry not installed / install failed), follow its "suggest install" guidance (install via the plugin marketplace) and never fabricate its content.',
    '- Route targets are a fixed table in code; remote content updates never rewrite this routing logic.',
    '- Tools return evidence, not decisions — classification comes from evidence (logs, error codes, profiling, golden mismatches), not guesses.',
  )
  if (def.step0Section) {
    lines.push('', def.step0Section)
  }
  return lines.join('\n')
}
