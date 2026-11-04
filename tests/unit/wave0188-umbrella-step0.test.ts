/**
 * 0.1.88 任务 A — R-087-3 Step 0 硬化判别单测（工单
 * docs/2026-11-04-p0-wave-0188-ticket.md §1.A；基线 adherence 2/8 跨模型，
 * glm-5 2/7 + gpt-6.1-sol 0/1，见 0187 gate 报告 §118/141）。
 *
 * 修前红（位置 + 形态判别）：Step 0 段渲染在正文尾部（umbrella.ts :113-115，
 * Rules 之后）→ 位置断言红；措辞为 verdict-bullet 形态（无编号祈使清单）→
 * 形态断言红。既有内容锚修前即绿（语义零变化契约的反向守卫）。
 *
 * 硬化 = 位置（尾→头：正文首个二级标题之前）+ 措辞（祈使清单化）组合变更
 * （工单 Review Focus 1：归因不拆分，登记为组合变更）；语义零变化（verdict
 * 分支/stale 声明/deferred-unavailable 支全保留）。
 *
 * 工单 §1.A GREEN 附加面：SKILL_MD 体长度登记（审计 1c——Step 0 在 SKILL_MD
 * 体经 Skill 交付，非 system prompt）+ listing 面零变化（0187 ⑦⑧ 契约回归）。
 * ④ prompt 逐字节零 diff 锚 = ASCEND_TOOL_USAGE_GUIDE 面（ascend-skills-prompt
 * 既有锁文本测试回归绿 + 本波 diff 零 prompt 文件），不在本文件展开。
 *
 * 分层纪律：纯逻辑 + 模块注册面（无网络 / 无 PTY / 无 LLM / 无真实 HOME）→ unit。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

interface UmbrellaDef {
  name: string
  routes: readonly unknown[]
}

const ascend = (await import('../../src/ascend/index.js').catch(() => ({}))) as {
  ASCEND_UMBRELLA_SKILLS?: readonly UmbrellaDef[]
  ASCEND_DOCTOR_SKILL_MD?: string
  ASCEND_OPTIMISM_SKILL_MD?: string
  ASCEND_OPDEV_SKILL_MD?: string
}

const shellDoctor = (await import(
  '../../src/tui/skills/bundled/ascendDoctor.js'
).catch(() => ({}))) as { UMBRELLA_DOCTOR_SKILL_MD?: string }
const shellOptimism = (await import(
  '../../src/tui/skills/bundled/ascendOptimism.js'
).catch(() => ({}))) as { UMBRELLA_OPTIMISM_SKILL_MD?: string }
const shellOpdev = (await import(
  '../../src/tui/skills/bundled/ascendOpdev.js'
).catch(() => ({}))) as { UMBRELLA_OPDEV_SKILL_MD?: string }

const { getBundledSkills, clearBundledSkills } = await import(
  '../../src/tui/skills/bundledSkills.js'
)
const shellRegister = (await import(
  '../../src/tui/skills/bundled/ascendDoctor.js'
).catch(() => ({}))) as { registerAscendDoctorSkill?: () => void }

const PAIRS: Array<[string | undefined, string | undefined]> = [
  [ascend.ASCEND_DOCTOR_SKILL_MD, shellDoctor.UMBRELLA_DOCTOR_SKILL_MD],
  [ascend.ASCEND_OPTIMISM_SKILL_MD, shellOptimism.UMBRELLA_OPTIMISM_SKILL_MD],
  [ascend.ASCEND_OPDEV_SKILL_MD, shellOpdev.UMBRELLA_OPDEV_SKILL_MD],
]

const STEP0_HEADING = '## Step 0'
const FIRST_SECTION_HEADING = '## Routing table'

beforeEach(() => {
  clearBundledSkills()
})

afterEach(() => {
  clearBundledSkills()
})

// ---------------------------------------------------------------------------
// ① 位置断言（RED 核心）：Step 0 段在正文首个二级标题之前（尾→头）
// ---------------------------------------------------------------------------
describe('① Step 0 位置：正文首个二级标题之前（硬化目标）', () => {
  test('三总纲 SKILL_MD：## Step 0 行 index < ## Routing table 行 index', () => {
    for (const [md] of PAIRS) {
      expect(md).toBeDefined()
      const lines = md!.split('\n')
      const step0Idx = lines.findIndex(l => l.startsWith(STEP0_HEADING))
      const firstSectionIdx = lines.findIndex(l =>
        l.startsWith(FIRST_SECTION_HEADING),
      )
      expect(step0Idx).toBeGreaterThan(-1)
      expect(firstSectionIdx).toBeGreaterThan(-1)
      expect(step0Idx).toBeLessThan(firstSectionIdx)
    }
  })

  test('Step 0 段之后才是路由表与 Rules（Rules 不再尾随 Step 0 之后出现新段）', () => {
    for (const [md] of PAIRS) {
      const lines = md!.split('\n')
      const step0Idx = lines.findIndex(l => l.startsWith(STEP0_HEADING))
      const rulesIdx = lines.findIndex(l => l.startsWith('## Rules'))
      // Rules 在 Step 0 之后（尾部保留 Rules，Step 0 前置）——即 Step 0 不在 Rules 后
      expect(rulesIdx).toBeGreaterThan(step0Idx)
      // Step 0 段自身之后不再有 Step 0 第二次出现（单一事实源渲染一次）
      const secondOccurrence = lines.findIndex(
        (l, i) => i > step0Idx && l.startsWith(STEP0_HEADING),
      )
      expect(secondOccurrence).toBe(-1)
    }
  })
})

// ---------------------------------------------------------------------------
// ② 措辞祈使清单化（RED 核心）：编号祈使形态
// ---------------------------------------------------------------------------
describe('② Step 0 措辞祈使清单化（硬化目标）', () => {
  test('编号祈使清单在场（1./2./3. 形态 + FIRST/NOW 时序强调）', () => {
    for (const [md] of PAIRS) {
      expect(md).toMatch(/\n1\. /)
      expect(md).toMatch(/\n2\. /)
      expect(md).toMatch(/\n3\. /)
      expect(md).toContain('run FIRST')
    }
  })

  test('祈使动词开头（Run / If the verdict）非名词化 verdict-bullet 形态', () => {
    for (const [md] of PAIRS) {
      // 新形态祈使句（旧形态 = "- fresh — proceed" / "- drift — call" 名词标签 bullet）
      expect(md).toContain('1. Run AscendSkillSourceCheck')
      expect(md).toContain('2. If the verdict is')
      expect(md).toContain('3. If the verdict is')
    }
  })

  test('iter2 first-tool-call 绑定句（gate ①A 打回回灌：miss 形态 = 路由动作完成但 Step 0 零执行）', () => {
    for (const [md] of PAIRS) {
      // iter2 杠杆：check 绑定为本 skill 第一个工具调用 + 点名禁止 routed skill
      // 调用 until verdict（§7.3 迭代纪律 iter2，位置不动）。
      expect(md).toContain(
        'Your FIRST tool call in this skill must be AscendSkillSourceCheck',
      )
      expect(md).toContain(
        'Do not call any routed skill, and do not answer from the routing table, until Step 0 returns a verdict',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// ③ 语义零变化锚（修前即绿——硬化不许丢语义）
// ---------------------------------------------------------------------------
describe('③ Step 0 语义零变化锚（工单 §1.A：不许借机改 verdict 面）', () => {
  test('verdict 分支语义全保留：fresh→route / drift→update→updatedTo / unreachable+killed→fail-visible defer', () => {
    for (const [md] of PAIRS) {
      expect(md).toContain("action \"check\", source \"agent-skills\"")
      expect(md).toContain('action "update"')
      expect(md).toContain('updatedTo present')
      expect(md).toContain('Never rewrite the manifest pinned_sha yourself')
      expect(md).toContain('do NOT route on the local snapshot')
      expect(md).toContain('fail-visible')
      expect(md).toContain('could not complete the skill-source freshness check/update')
    }
  })

  test('Never skip + stale 声明 + 漂移登记 + deferred-unavailable 支全保留', () => {
    for (const [md] of PAIRS) {
      expect(md).toContain('Never skip Step 0 and route straight away')
      expect(md).toContain('based on the stale snapshot')
      expect(md).toContain('register the stale continuation')
      expect(md).toContain('deferred tools are unavailable')
      expect(md).toContain('never silently answer from the stale snapshot')
      expect(md).toContain('remote content updates never rewrite this routing logic')
    }
  })
})

// ---------------------------------------------------------------------------
// ④ 既有契约不回归（0187 ③⑩ 面）
// ---------------------------------------------------------------------------
describe('④ SKILL_MD 契约不回归：≤120 行 + 壳副本字节全等 + listing 注册面', () => {
  test('三总纲 ≤120 行（0187 ③）+ 体长度登记（审计 1c）', () => {
    for (const [md, name] of [
      [PAIRS[0]![0], 'doctor'],
      [PAIRS[1]![0], 'optimism'],
      [PAIRS[2]![0], 'opdev'],
    ] as const) {
      expect(md).toBeDefined()
      const lineCount = md!.split('\n').length
      // 审计 1c：Step 0 段在 SKILL_MD 体（经 Skill 交付），非 system prompt——
      // 体长度在此登记（gate ④ prompt 零 diff 锚在 e2e 面复核）。
      console.log(`[wave0188] SKILL_MD body length (${name}): ${lineCount} lines / ${md!.length} chars`)
      expect(lineCount).toBeLessThanOrEqual(120)
    }
  })

  test('壳三副本与域渲染字节全等（0187 ⑩——同源渲染随硬化同步）', () => {
    expect(PAIRS[0]![0]).toBe(PAIRS[0]![1])
    expect(PAIRS[1]![0]).toBe(PAIRS[1]![1])
    expect(PAIRS[2]![0]).toBe(PAIRS[2]![1])
  })

  test('三总纲注册面零变化：userInvocable:false + skill_listing 谓词可见（0187 ⑦⑧）', () => {
    const ascendIndex = ascend
    expect(ascendIndex.ASCEND_UMBRELLA_SKILLS).toBeDefined()
    shellRegister.registerAscendDoctorSkill?.()
    const registered = getBundledSkills()
    const cmd = registered.find(c => c.name === 'ascend-doctor')
    expect(cmd).toBeDefined()
    expect(cmd!.userInvocable).toBe(false)
    expect(cmd!.isHidden).toBe(true)
    expect(cmd!.type).toBe('prompt')
    expect(cmd!.disableModelInvocation).toBe(false)
  })
})
