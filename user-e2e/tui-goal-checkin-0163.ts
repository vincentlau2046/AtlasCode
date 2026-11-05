/**
 * 0.1.63 /goal 演化批波 · P4 check-in 短常数 override 活探针（e2e lane，
 * gate 判据⑤新活面；工单 docs/2026-10-13-p0-wave-0163-ticket.md §2 P4 行 +
 * 评估卡 docs/2026-10-13-p0-goal-eval-card.md §4）。
 *
 * 判读面（0162 tui-goal-0162 同族纪律）：产品函数活 import（@ 被测面 worktree
 * 源码，零模型零网络零 8999；状态机 = 模块级单例进程退出即净，零盘写）。
 * P4 交付面 = 状态机 + 退避计算 + env 解析 + 提示词 + 组合根导出（engine/index.ts
 * 重导出）；定时器触发回合 = TUI 车道调度面（生产观察面，同 0162 overlay
 * 像素面先例）。gate 判别力 = 短常数 override 驱动导出函数面 + 提示词裁剪断言。
 *
 * 断言面（全 hard）：
 *   C1 env 解析（ATLAS_GOAL_CHECKIN_MINUTES）：缺省 30 / '7'→7 / '0'→0 关断 /
 *      'abc'→30 / '-5'→30（非法回落缺省 fail-safe 不误关）
 *   C2 退避序列：GOAL_CHECKIN_BACKOFF_MULTIPLIERS=[1,2,4] + base=30 →
 *      1800000/3600000/7200000ms（30m→1h→2h）+ 短常数 base=0.1min →
 *      6000/12000/24000ms（等比 1:2:4 保持）+ index≥3 = Infinity（超预算无槽）
 *   C3 预算 3：MAX_GOAL_CHECKINS=3 + recordCheckIn ×3 → remaining 0 +
 *      canCheckIn=false + resetCheckInState 归满
 *   C4 刷新 +3：refreshOnUserMessage 重置回 MAX（幂等非叠加）
 *   C5 env 关断：ATLAS_GOAL_CHECKIN_MINUTES=0 → canCheckIn=false（预算满也关断）
 *   C6 提示词（2.1.246 国产适配裁剪面）：'automated goal check-in' +
 *      'Goal condition: <cond>' 条件注入面 + steward 语义（'Do not start new
 *      unrelated work'）+ 1P 裁除（无 claude.ai/Remote Control/Pull Request）+
 *      BR-8 无字面 + 号
 *   C7 wiring：engine/index.ts 组合根重导出 7 函数面在场（源级）
 *
 * 基线面（修前红形）：src/engine/goal/goalCheckIn.ts 缺席 → 动态 import
 * 定向红（文件不崩，0162 同形）。
 * 用法（cwd 任意，REPO 绝对路径导入）：
 *   ATLAS_E2E_GOAL0163_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-goal-checkin-0163.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_GOAL0163_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-063'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function loadMod(p: string): Promise<any> {
  return await import(p).catch(() => ({}))
}

async function main(): Promise<void> {
  const probes: Probe[] = []
  const mod: any = await loadMod(join(REPO, 'src/engine/goal/goalCheckIn.ts'))
  const hasMod = typeof mod.getGoalCheckInMinutes === 'function'

  if (!hasMod) {
    probes.push({
      id: 'C0-module-surface', hard: true, ok: false,
      detail: 'src/engine/goal/goalCheckIn.ts 缺席或导出缺席 = 修前红形活面现形',
    })
    for (const id of ['C1-env-parse', 'C2-backoff', 'C3-budget', 'C4-refresh', 'C5-env-disable', 'C6-prompt', 'C7-wiring']) {
      probes.push({ id, hard: true, ok: false, detail: '模块缺席 → 跳过（修前红形）' })
    }
  } else {
    // ── C1 env 解析 ────────────────────────────────────────────────────
    const saved = process.env.ATLAS_GOAL_CHECKIN_MINUTES
    const setEnv = (v: string | undefined) => { if (v === undefined) delete process.env.ATLAS_GOAL_CHECKIN_MINUTES; else process.env.ATLAS_GOAL_CHECKIN_MINUTES = v }
    try {
      setEnv(undefined)
      const d = mod.getGoalCheckInMinutes()
      setEnv('7')
      const o = mod.getGoalCheckInMinutes()
      setEnv('0')
      const z = mod.getGoalCheckInMinutes()
      setEnv('abc')
      const bad1 = mod.getGoalCheckInMinutes()
      setEnv('-5')
      const bad2 = mod.getGoalCheckInMinutes()
      const c1 = d === 30 && o === 7 && z === 0 && bad1 === 30 && bad2 === 30
      probes.push({
        id: 'C1-env-parse', hard: true, ok: c1,
        detail: c1
          ? `env 解析五态（缺省 30 / '7'→7 / '0'→0 关断 / 'abc'→30 / '-5'→30 fail-safe 回落不误关 = 工单 §2 短常数 override 可测性）`
          : `env 解析缺口（缺省=${d} '7'=${o} '0'=${z} 'abc'=${bad1} '-5'=${bad2}）`,
      })
    } finally {
      setEnv(saved)
    }

    // ── C2 退避序列（30m→1h→2h 等比 1:2:4 + 短常数等比保持 + 超预算）──
    const ms = (i: number, base: number) => mod.getCheckInDelayMs(i, base)
    const c2 = mod.GOAL_CHECKIN_BACKOFF_MULTIPLIERS?.length === 3
      && mod.GOAL_CHECKIN_BACKOFF_MULTIPLIERS[0] === 1
      && mod.GOAL_CHECKIN_BACKOFF_MULTIPLIERS[1] === 2
      && mod.GOAL_CHECKIN_BACKOFF_MULTIPLIERS[2] === 4
      && ms(0, 30) === 1_800_000 && ms(1, 30) === 3_600_000 && ms(2, 30) === 7_200_000
      && ms(0, 0.1) === 6_000 && ms(1, 0.1) === 12_000 && ms(2, 0.1) === 24_000
      && mod.getCheckInDelayMs(3, 30) === Infinity
    probes.push({
      id: 'C2-backoff', hard: true, ok: c2,
      detail: c2
        ? `退避序列（乘子 [1,2,4] + base=30 → 30m/1h/2h〔1800000/3600000/7200000ms〕+ 短常数 base=0.1min → 6s/12s/24s 等比保持 + index≥3 = Infinity 超预算无第 4 槽 = 工单 §2 退避断言）`
        : `退避序列缺口（乘子=${JSON.stringify(mod.GOAL_CHECKIN_BACKOFF_MULTIPLIERS)}；base30=[${ms(0, 30)},${ms(1, 30)},${ms(2, 30)}]；short=[${ms(0, 0.1)},${ms(1, 0.1)},${ms(2, 0.1)}]；idx3=${ms(3, 30)}）`,
    })

    // ── C3 预算 3 + C4 刷新 + C5 关断（状态机驱动）───────────────────
    const savedEnv2 = process.env.ATLAS_GOAL_CHECKIN_MINUTES
    delete process.env.ATLAS_GOAL_CHECKIN_MINUTES
    try {
      mod.resetCheckInState()
      const rem0 = mod.getRemainingCheckIns()
      mod.recordCheckIn()
      mod.recordCheckIn()
      mod.recordCheckIn()
      const remExhausted = mod.getRemainingCheckIns()
      const canExhausted = mod.canCheckIn()
      mod.refreshOnUserMessage()
      const remRefresh = mod.getRemainingCheckIns()
      mod.refreshOnUserMessage() // 幂等
      const remRefresh2 = mod.getRemainingCheckIns()
      mod.resetCheckInState()
      const remReset = mod.getRemainingCheckIns()
      const c34 = rem0 === 3 && remExhausted === 0 && canExhausted === false && remRefresh === 3 && remRefresh2 === 3 && remReset === 3
      probes.push({
        id: 'C3-budget-refresh', hard: true, ok: c34,
        detail: c34
          ? `预算 3 + 刷新（初始 remaining=3 / recordCheckIn ×3 → 0 且 canCheckIn=false / refreshOnUserMessage 重置回 3 幂等非叠加 / resetCheckInState 归满 = 工单 §2 预算 3 + +3 刷新断言）`
          : `预算/刷新缺口（rem0=${rem0} exhausted=${remExhausted} canExhausted=${canExhausted} refresh=${remRefresh}/${remRefresh2} reset=${remReset}）`,
      })
      // C5 env 关断（预算满状态下 =0 关断）
      process.env.ATLAS_GOAL_CHECKIN_MINUTES = '0'
      mod.resetCheckInState()
      const canDisabled = mod.canCheckIn()
      const c5 = canDisabled === false
      probes.push({
        id: 'C5-env-disable', hard: true, ok: c5,
        detail: c5
          ? `env 关断（ATLAS_GOAL_CHECKIN_MINUTES=0 预算满下 canCheckIn=false = 上游 =0 关断同构）`
          : `env 关断缺口（canCheckIn=${canDisabled}）`,
      })
    } finally {
      if (savedEnv2 === undefined) delete process.env.ATLAS_GOAL_CHECKIN_MINUTES
      else process.env.ATLAS_GOAL_CHECKIN_MINUTES = savedEnv2
    }

    // ── C6 提示词（2.1.246 国产适配裁剪面 + BR-8）──────────────────
    const prompt = mod.goalCheckInPrompt('all tests green')
    const no1p = !/claude\.ai|Remote Control|Pull Request/i.test(prompt)
    const br8 = !prompt.includes('+')
    const c6 = prompt.includes('automated goal check-in')
      && prompt.includes('Goal condition: all tests green')
      && prompt.includes('Do not start new unrelated work')
      && no1p && br8
    probes.push({
      id: 'C6-prompt', hard: true, ok: c6,
      detail: c6
        ? `提示词裁剪面（'automated goal check-in' 头 + 条件注入面 'Goal condition: <cond>' + steward 语义『Do not start new unrelated work』+ 1P 裁除〔无 claude.ai/Remote Control/Pull Request〕+ BR-8 无字面 + 号 = 工单 §0 P4 提示词面断言）`
        : `提示词裁剪面缺口（节=${prompt.slice(0, 120)}…；no1p=${no1p} br8=${br8}）`,
    })
  }

  // ── C7 wiring（组合根 engine/index.ts 重导出面，源级）─────────────
  const idxSrc = (() => { try { return readFileSync(join(REPO, 'src/engine/index.ts'), 'utf8') } catch { return '' } })()
  const c7 = ['getGoalCheckInMinutes', 'getCheckInDelayMs', 'goalCheckInPrompt', 'resetCheckInState', 'recordCheckIn', 'refreshOnUserMessage', 'canCheckIn']
    .every((n) => new RegExp(`\\b${n}\\b`).test(idxSrc))
  probes.push({
    id: 'C7-wiring', hard: true, ok: c7,
    detail: c7
      ? `组合根 wiring（engine/index.ts 重导出 P4 七函数面在场 = 定时器触发面消费锚点；TUI 车道调度 = 生产观察面）`
      : `组合根 wiring 缺口（engine/index.ts P4 导出面缺席）`,
  })

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const fs = await import('node:fs')
  const OUT = process.env.ATLAS_E2E_GOAL0163_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-063/checkin-probe'
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-goal-checkin-0163', repo: REPO, verdict, probes }, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-GOAL-CHECKIN-0163 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-GOAL-CHECKIN-0163 ERROR', e); process.exit(1) })
