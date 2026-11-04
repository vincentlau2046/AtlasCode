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
  /** 任务 F Step 0 段（三总纲统一引用 ASCEND_UMBRELLA_STEP0_SECTION，渲染在正文头部——Routing table 之前，0.1.88 R-087-3 位置硬化）。 */
  step0Section?: string
}

const STATUS_LABEL: Record<AscendUmbrellaRouteStatus, string> = {
  preinstalled: 'preinstalled',
  'suggest-install': 'suggest install',
}

/**
 * 渲染总纲 SKILL_MD（frontmatter + Goal + [step0Section] + 路由表 +
 * extraSections + Rules）。路由表行 1:1 来自 routes（单一事实源直证）。
 * Step 0 段（若 def.step0Section）渲染在正文头部（Routing table 之前）——
 * 0.1.88 R-087-3 位置硬化：正文尾部指令遵循度低（跨模型 adherence 2/10 基线，
 * glm-5 2/7 + gpt-6.1-sol 0/1；工单 docs/2026-11-04-p0-wave-0188-ticket.md
 * §1.A，组合变更归因不拆分）。
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
    ...(def.step0Section ? [def.step0Section] : []),
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
  return lines.join('\n')
}

/**
 * 系统提示词分组行渲染（0.1.87 任务 B）：每行 = 总纲名 + 一句何时进总纲
 * （enterWhen）+ 由总纲再路由的说明（routesSummary），与 SKILL_MD 同一
 * AscendUmbrellaDefinition 单一事实源（不手抄第二份）。预算契约：≤40 词/行
 * （工单 Review Focus 2，wave0187-prompt-routing.test.ts ⑥ 守卫）。
 */
export function renderUmbrellaPromptLine(def: AscendUmbrellaDefinition): string {
  return `- /${def.name} — ${def.enterWhen} ${def.routesSummary}`
}

/**
 * 任务 F（0.1.87）：三总纲统一的 Step 0 段（单一事实源，三 def step0Section 同
 * 引用，工单 §F「三总纲 SKILL_MD Step 0 段统一措辞」）。措辞契约（工单 §139-141）：
 * check → drift 则 update → fresh/更新成功后才路由；禁止跳过 Step 0 直接路由；
 * unreachable/killed/验真败 = fail-visible 暂缓，不静默旧快照作答；用户明示后
 * stale 续行须声明 + 再调 check 落漂移登记；路由边界句（远端内容不换路由逻辑）。
 *
 * 0.1.88 R-087-3 措辞硬化：verdict-bullet（名词标签）→ 编号祈使清单
 * （1. Run check / 2. drift→update / 3. fresh 后 route / 4. unreachable→defer），
 * 语义零变化（verdict 分支/stale 声明/deferred-unavailable 支全保留）——
 * 位置硬化（尾→头）在 renderUmbrellaSkillMd；组合变更归因不拆分
 * （工单 docs/2026-11-04-p0-wave-0188-ticket.md §1.A + Review Focus 1）。
 *
 * 0.1.88 iter2（gate ①A 打回后措辞二次迭代，§7.3 迭代纪律）：iter1 对比轮
 * 4/10 < 6/10（glm-5 1/5 与 base 同型 + gpt-6.1-sol 3/5 方向性改善；miss 形态 =
 * 路由动作完成但 Step 0 零执行）→ 新增 first-tool-call 绑定句：check 必须是
 * 本 skill 的第一个工具调用 + 显式点名禁止动作（routed skill 调用/路由表作答）
 * + 时间条件（until Step 0 returns a verdict）。语义零新增（既有语义复述），
 * 位置不动（位置假说单轮已锁）；iter2 仍 <6/10 → 显式登记呈用户。
 */
export const ASCEND_UMBRELLA_STEP0_SECTION = [
  '## Step 0 — Skill source freshness check (run FIRST, before the routing table)',
  '',
  'Your FIRST tool call in this skill must be AscendSkillSourceCheck (action "check", source "agent-skills"). Do not call any routed skill, and do not answer from the routing table, until Step 0 returns a verdict.',
  '',
  'Never skip Step 0 and route straight away. Route targets are a fixed table in code — remote content updates never rewrite this routing logic. In environments where deferred tools are unavailable (e.g. experimental betas disabled), Step 0 cannot pass: defer and never silently answer from the stale snapshot.',
  '',
  '1. Run AscendSkillSourceCheck (action "check", source "agent-skills") FIRST, before routing anywhere below.',
  '2. If the verdict is drift: run AscendSkillSourceCheck again with action "update" (source "agent-skills"); route only after the update succeeds (updatedTo present). Never rewrite the manifest pinned_sha yourself — re-pinning belongs to the maintainers\' sync/verify flow.',
  '3. If the verdict is fresh (or the step-2 update succeeded): proceed to route.',
  '4. If the verdict is unreachable or killed, or the update is refused (non-fast-forward / integrity failure): do NOT route on the local snapshot. Report "could not complete the skill-source freshness check/update" together with the tool\'s error, and defer execution (fail-visible). Continue on the old snapshot only if the user explicitly approves; then state that the answer is based on the stale snapshot, and register the stale continuation by calling AscendSkillSourceCheck (check) again so the drift is logged.',
].join('\n')
