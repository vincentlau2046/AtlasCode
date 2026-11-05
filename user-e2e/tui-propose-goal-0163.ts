/**
 * 0.1.63 /goal 演化批波 · P8 ProposeGoal 工具面活探针（e2e lane，
 * gate 判据⑤新活面；工单 docs/2026-10-13-p0-wave-0163-ticket.md §2 P8 行 +
 * 评估卡 docs/2026-10-13-p0-goal-eval-card.md §5 源 A 工具描述断言）。
 *
 * 判读面（0162 同族纪律）：产品函数活 import（@ 被测面 worktree 源码，
 * 零模型零网络零 8999；goal 状态机 = 模块级单例进程退出即净，零盘写）。
 * P8 交付面 = 工具本体（schema + checkPermissions ask_user 双支 + call→armGoal
 * + description 提示词）+ loopDeps 恒注册（baseTools 注入）+ 工具描述提示词
 * （2.1.227 全文移植 + 国产适配 + ask_user=false 误用硬约束）。审批弹窗活渲染
 * 像素面 = 生产观察面（TUI AskUserQuestion 族，同 0162 overlay 先例）；gate
 * 判别力 = checkPermissions 双支行为 + call→armGoal 语义 + 提示词硬约束断言。
 *
 * 断言面（全 hard）：
 *   P1a 注册面：PROPOSE_GOAL_TOOL_NAME='ProposeGoal' + ProposeGoalTool.name 同 +
 *      isEnabled()=true（恒注册非门控）+ loopDeps.ts baseTools 注入源级在场
 *   P1b schema 面：condition string + ask_user boolean（默认 true 语义）+
 *      required=['condition'] + additionalProperties=false
 *   P1c ask_user 双支（checkPermissions 行为面）：ask_user 缺省/true →
 *      behavior='ask' + 审批消息 'Approve goal: "<cond>"?'（审批弹窗面）/
 *      ask_user=false → behavior='allow'（直接执行，工具描述承载硬约束）
 *   P1d call→armGoal 语义：set 成功 armed=true + 状态机 armed + 条件落盘 /
 *      one-goal 替换（新设替换旧）/ 501>500 fail-closed 拒绝（exceeds 500）/
 *      空条件拒绝（cannot be empty）
 *   P1e 工具描述提示词（2.1.227 硬约束面）：ask_user 双支语义 +
 *      ask_user=false 误用判别（'misuse of the tool' + 'ONLY when the user's
 *      own words'）+ 评估器仅对话验证（'does not run commands, does not read
 *      files'）+ one goal at a time + ≤500 + BR-8 无字面 + 号 + 1P 裁除
 *   P1f 零回归清理：clearGoal → 状态机复位（isGoalArmed=false）
 *
 * 基线面（修前红形）：src/engine/tools/proposeGoal/ProposeGoal.ts 缺席 →
 * 动态 import 定向红（文件不崩，0162 同形）。
 * 用法：
 *   ATLAS_E2E_PROP0163_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-propose-goal-0163.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_PROP0163_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-063'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function loadMod(p: string): Promise<any> {
  return await import(p).catch(() => ({}))
}

async function main(): Promise<void> {
  const probes: Probe[] = []
  const toolMod: any = await loadMod(join(REPO, 'src/engine/tools/proposeGoal/ProposeGoal.ts'))
  const hasTool = typeof toolMod.ProposeGoalTool === 'object' && toolMod.ProposeGoalTool !== null
  const goalMod: any = await loadMod(join(REPO, 'src/engine/goal/goalState.ts'))

  if (!hasTool) {
    probes.push({
      id: 'P1a-tool-surface', hard: true, ok: false,
      detail: 'src/engine/tools/proposeGoal/ProposeGoal.ts 缺席或 ProposeGoalTool 缺席 = 修前红形活面现形',
    })
    for (const id of ['P1b-schema', 'P1c-ask-user-branches', 'P1d-call-armgoal', 'P1e-prompt', 'P1f-cleanup']) {
      probes.push({ id, hard: true, ok: false, detail: '模块缺席 → 跳过（修前红形）' })
    }
  } else {
    const T = toolMod.ProposeGoalTool
    // ── P1a 注册面 ─────────────────────────────────────────────────────
    const loopDepsSrc = (() => { try { return readFileSync(join(REPO, 'src/engine/loopDeps.ts'), 'utf8') } catch { return '' } })()
    const c1a = toolMod.PROPOSE_GOAL_TOOL_NAME === 'ProposeGoal'
      && T.name === 'ProposeGoal'
      && T.isEnabled() === true
      && /ProposeGoalTool/.test(loopDepsSrc) && /import \{ ProposeGoalTool \} from '\.\/tools\/proposeGoal\/ProposeGoal'/.test(loopDepsSrc)
    probes.push({
      id: 'P1a-tool-surface', hard: true, ok: c1a,
      detail: c1a
        ? `注册面（PROPOSE_GOAL_TOOL_NAME='ProposeGoal' + 工具 name 同 + isEnabled()=true 恒注册非门控 + loopDeps.ts baseTools 注入源级在场 = CC 2.1.227 工具注册）`
        : `注册面缺口（name=${T.name}；isEnabled=${T.isEnabled?.()}；loopDeps 注入在场=${/ProposeGoalTool/.test(loopDepsSrc)}）`,
    })

    // ── P1b schema 面 ─────────────────────────────────────────────────
    const sch = T.inputSchema
    const c1b = sch?.properties?.condition?.type === 'string'
      && sch?.properties?.ask_user?.type === 'boolean'
      && Array.isArray(sch?.required) && sch.required.includes('condition')
      && sch?.additionalProperties === false
    probes.push({
      id: 'P1b-schema', hard: true, ok: c1b,
      detail: c1b
        ? `schema 面（condition string required + ask_user boolean〔checkPermissions 缺省 true 语义〕+ additionalProperties=false fail-closed）`
        : `schema 缺口（properties=${JSON.stringify(Object.keys(sch?.properties ?? {}))}；required=${JSON.stringify(sch?.required)}；addl=${sch?.additionalProperties}）`,
    })

    // ── P1c ask_user 双支（checkPermissions 行为面）─────────────────
    const rAskDefault = await T.checkPermissions({ condition: 'tests pass' })
    const rAskTrue = await T.checkPermissions({ condition: 'tests pass', ask_user: true })
    const rAllow = await T.checkPermissions({ condition: 'tests pass', ask_user: false })
    const c1c = rAskDefault?.behavior === 'ask'
      && typeof rAskDefault?.message === 'string' && rAskDefault.message.includes('Approve goal:')
      && rAskTrue?.behavior === 'ask'
      && rAllow?.behavior === 'allow'
    probes.push({
      id: 'P1c-ask-user-branches', hard: true, ok: c1c,
      detail: c1c
        ? `ask_user 双支（缺省→ask『Approve goal: "tests pass"?』审批弹窗面 / ask_user=true→ask / ask_user=false→allow 直接执行〔工具描述承载「仅用户原话」硬约束〕= CC 2.1.227 双支语义；弹窗活渲染像素面 = 生产观察面）`
        : `ask_user 双支缺口（缺省 behavior=${rAskDefault?.behavior} msg=${rAskDefault?.message}；true=${rAskTrue?.behavior}；false=${rAllow?.behavior}）`,
    })

    // ── P1d call→armGoal 语义 ─────────────────────────────────────────
    const a1 = await T.call({ condition: 'build completes under 60 seconds' }, {})
    const armed1 = a1?.data?.armed === true
    const stateArmed = typeof goalMod.isGoalArmed === 'function' && goalMod.isGoalArmed() === true
      && goalMod.getGoalCondition?.() === 'build completes under 60 seconds'
    const a2 = await T.call({ condition: 'ci pipeline green' }, {})
    const replaced = a2?.data?.armed === true && goalMod.getGoalCondition?.() === 'ci pipeline green'
    const a3 = await T.call({ condition: 'x'.repeat(501) }, {})
    const oversize = a3?.data?.armed === false && /exceeds 500 characters \(got 501\)/.test(a3?.data?.reason ?? '')
    const a4 = await T.call({ condition: '' }, {})
    const empty = a4?.data?.armed === false && /cannot be empty/.test(a4?.data?.reason ?? '')
    const c1d = armed1 && stateArmed && replaced && oversize && empty
    probes.push({
      id: 'P1d-call-armgoal', hard: true, ok: c1d,
      detail: c1d
        ? `call→armGoal 语义（set 成功 armed=true + 状态机 armed + 条件落 / one-goal 替换〔ci pipeline green 替换 build…〕/ 501>500 fail-closed『exceeds 500 characters (got 501)』/ 空条件『cannot be empty』= CC 2.1.139 one goal at a time 继承面）`
        : `call→armGoal 缺口（set=${armed1} state=${stateArmed} replace=${replaced} oversize=${oversize} empty=${empty}）`,
    })

    // ── P1e 工具描述提示词（2.1.227 硬约束 + 国产适配 + BR-8）────────
    const desc = await T.description()
    const no1p = !/claude\.ai|Remote Control/i.test(desc)
    const br8 = !desc.includes('+')
    const c1e = desc.includes("ONLY when the user's own words")
      && desc.includes('misuse of the tool')
      && desc.includes('does not run commands, does not read files')
      && desc.includes('One goal at a time')
      && desc.includes('maximum 500 characters')
      && no1p && br8
    probes.push({
      id: 'P1e-prompt', hard: true, ok: c1e,
      detail: c1e
        ? `工具描述硬约束面（ask_user=false 误用判别『ONLY when the user\'s own words…misuse of the tool』+ 评估器仅对话验证『does not run commands, does not read files』+ one goal at a time + ≤500 + BR-8 无 + 号 + 1P 裁除 = 0.1.55 提示词批先例断言面）`
        : `工具描述硬约束缺口（no1p=${no1p} br8=${br8}；节=${desc.slice(0, 140)}…）`,
    })

    // ── P1f 零回归清理 ────────────────────────────────────────────────
    goalMod.clearGoal?.()
    const c1f = typeof goalMod.isGoalArmed === 'function' && goalMod.isGoalArmed() === false
    probes.push({
      id: 'P1f-cleanup', hard: true, ok: c1f,
      detail: c1f
        ? `零回归清理（clearGoal → 状态机复位 isGoalArmed=false，探针面不遗留 armed 态）`
        : `清理缺口（clearGoal 后 isGoalArmed=${goalMod.isGoalArmed?.()}）`,
    })
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const fs = await import('node:fs')
  const OUT = process.env.ATLAS_E2E_PROP0163_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-063/propose-goal-probe'
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-propose-goal-0163', repo: REPO, verdict, probes }, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-PROPOSE-GOAL-0163 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-PROPOSE-GOAL-0163 ERROR', e); process.exit(1) })
