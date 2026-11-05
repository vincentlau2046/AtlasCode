/**
 * 0.1.62 /goal 核心+持久化波 · goal 活探针（e2e lane，gate 判据⑥；工单
 * docs/2026-10-13-p0-wave-0162-ticket.md §2/§4 + 评估卡
 * docs/2026-10-13-p0-goal-eval-card.md §4 harness 资产映射）。
 *
 * 判读面（0.1.60 tui-small-wave-0160 命令探针模板同族纪律）：产品函数活 import
 * 探针（@ 被测面 worktree 源码，零模型零网络零 8999 竞争；唯一活面例外 = G2
 * mock judge 走 127.0.0.1:8983 c4-mock-server judge 模式 canned 两态，
 * 确定性零真模型依赖——评估器路径 gate 判别力承载）。
 *
 * 断言面（全 hard）：
 *   G1 /goal 非交互命令行为（C0-1 set/clear/状态/one-goal 替换/超长拒绝）：
 *     G1a set 成功面「Goal armed: <cond>」+ 续跑提示句
 *     G1b 状态面 armed（「Current goal: <cond>」）
 *     G1c one-goal 替换（新设替换旧）
 *     G1d clear 面「Goal cleared.」
 *     G1e 未 armed clear 面「No goal is currently armed.」
 *     G1f set 缺条件面「Missing goal condition.」
 *     G1g 超长（>500 字符）拒绝面（fail-closed，「exceeds 500 characters」）
 *   G2 mock judge 活探针（C0-2 评估器面，c4-mock-server judge 模式 plan U,U,M）：
 *     G2a 请求 #1（plan U）= met:false + canned-unmet 原因（fail-safe 未达成语义）
 *     G2b 请求 #2（plan U）= met:false（续跑支 reminder 面驱动序）
 *     G2c 请求 #3（plan M）= met:true + canned-met 原因（自清除 goal_met 面）
 *     G2d 请求日志 c4-judge-requests.jsonl 三判（plan_letter U,U,M 按请求序判别在场）
 *   G3 overlay 面板 + footer 指示器面（C0-3/C0-4；TUI 活渲染像素面 = 生产 lane
 *     观察面，headless renderToAnsiString 挂起定因见 G3 段注）：
 *     G3a GoalOverlay 组件导出〔function 或 P7 React.memo 对象，结构无关〕+
 *         三要素（Elapsed/·API/turns/tokens）+ 未 armed 占位「(no goal armed)」
 *     G3b footer segmentRegistry.get('goal') = GoalSegment 注册在场（C0-4 registry
 *         挂载）+ 源级「🎯」chip 前缀 + 未 armed 零渲染行为面（seg()=null，
 *         P7 缓存形兼容，非源字面匹配）
 *     G3c P7 空闲零重渲染行为面（arm 后连调 seg() 引用相等 = 缓存命中零 JSX 构造；
 *         clear 后回 null = 缓存失效；pre-P7 结构 = 定向红形）
 *   ★ 0.1.63 P7 结构漂移适配（定因登记非产品回归，0.1.60 探针缺口条件加宽先例）：
 *     P7 波体重构 GoalOverlay（React.memo 导出）+ GoalSegment（模块级缓存）→
 *     G3 断言改结构无关（导出面/行为调用面），G3c 新断言承载 P7 意图
 *
 * 隔离：零盘写产品面（goalState = 模块级单例，进程退出即净）；judge 请求日志
 * 落 job tmp（ATLAS_E2E_GOAL0162_OUT）；零 8999（judge = 8983 独立端口）。
 * 用法（cwd 须 = 被测面 worktree，'src/...' root-relative 导入经 tsconfig baseUrl 解析）：
 *   cd <worktree> && ATLAS_E2E_GOAL0162_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-goal-0162.ts
 * 基线面（修前红形）：src/engine/goal/ + src/tui/commands/goal/ 缺席 →
 * 动态 import 定向红（文件不崩，0160 同形）。
 */
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.env.ATLAS_E2E_GOAL0162_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-062'
const OUT = process.env.ATLAS_E2E_GOAL0162_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-062/goal-probe'
const JUDGE_PORT = 8983
const JUDGE_URL = `http://127.0.0.1:${JUDGE_PORT}/v1/chat/completions`

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function loadMod(p: string): Promise<any> {
  return await import(p).catch(() => ({}))
}

async function main(): Promise<void> {
  const probes: Probe[] = []
  const report: Record<string, unknown> = { probe: 'tui-goal-0162', repo: REPO, probes: [] as Probe[] }

  // ── G1 /goal 非交互命令行为（C0-1 set/clear/状态/替换/拒绝）────────
  const goalMod: any = await loadMod(join(REPO, 'src/tui/commands/goal/goal-noninteractive.ts'))
  const call = goalMod?.call as ((args: string, ctx: unknown) => Promise<{ type: string, value?: string }>) | undefined
  const COND = 'all unit tests pass with zero failures'
  const COND2 = 'build completes under 60 seconds'

  if (typeof call !== 'function') {
    probes.push({
      id: 'G1-command-call-surface', hard: true, ok: false,
      detail: '/goal 非交互 call 导出缺席（src/tui/commands/goal/goal-noninteractive.ts 缺席或无 call = 修前红形活面现形）',
    })
  } else {
    const r1 = await call(`set ${COND}`, {})
    probes.push({
      id: 'G1a-set-armed', hard: true,
      ok: (r1.value ?? '').includes(`Goal armed: ${COND}`) && (r1.value ?? '').includes('will continue working'),
      detail: (r1.value ?? '').includes(`Goal armed: ${COND}`)
        ? `set 成功面（「Goal armed: ${COND}」+ 续跑提示句 = C0-1 armGoal 落盘回报；单测 goal-state set 面同形）`
        : `set 成功面缺口（value 节=${(r1.value ?? '').slice(0, 160)}）`,
    })
    const r2 = await call('', {})
    probes.push({
      id: 'G1b-status-armed', hard: true,
      ok: (r2.value ?? '').startsWith(`Current goal: ${COND}`),
      detail: (r2.value ?? '').startsWith(`Current goal: ${COND}`)
        ? `状态面 armed（「Current goal: ${COND}」+ USAGE = 无参状态支）`
        : `状态面 armed 缺口（value 节=${(r2.value ?? '').slice(0, 120)}）`,
    })
    const r3 = await call(`set ${COND2}`, {})
    const replaced = (r3.value ?? '').includes(`Goal armed: ${COND2}`) && (r3.value ?? '').includes(COND) === false
    probes.push({
      id: 'G1c-one-goal-replace', hard: true, ok: replaced,
      detail: replaced
        ? `one-goal 替换（新设 ${COND2} 替换旧 ${COND}；回报仅含新条件 = CC 2.1.139 one goal at a time）`
        : `one-goal 替换缺口（value 节=${(r3.value ?? '').slice(0, 160)}）`,
    })
    const r4 = await call('clear', {})
    probes.push({
      id: 'G1d-clear', hard: true, ok: (r4.value ?? '') === 'Goal cleared.',
      detail: (r4.value ?? '') === 'Goal cleared.'
        ? `clear 面（goalClearedNotification「Goal cleared.」= C0-6 提前清）`
        : `clear 面缺口（value=${(r4.value ?? '').slice(0, 80)}）`,
    })
    const r5 = await call('clear', {})
    probes.push({
      id: 'G1e-clear-not-armed', hard: true, ok: (r5.value ?? '') === 'No goal is currently armed.',
      detail: (r5.value ?? '') === 'No goal is currently armed.'
        ? `未 armed clear 面（幂等拒绝 = 状态机读面一致）`
        : `未 armed clear 面缺口（value=${(r5.value ?? '').slice(0, 80)}）`,
    })
    const r6 = await call('set', {})
    probes.push({
      id: 'G1f-set-missing-condition', hard: true, ok: (r6.value ?? '').includes('Missing goal condition.'),
      detail: (r6.value ?? '').includes('Missing goal condition.')
        ? `set 缺条件面（「Missing goal condition.」+ USAGE 用法回报）`
        : `set 缺条件面缺口（value=${(r6.value ?? '').slice(0, 80)}）`,
    })
    const longCond = 'x'.repeat(501)
    const r7 = await call(`set ${longCond}`, {})
    probes.push({
      id: 'G1g-set-oversize-reject', hard: true,
      ok: (r7.value ?? '').includes('exceeds 500 characters'),
      detail: (r7.value ?? '').includes('exceeds 500 characters')
        ? `超长拒绝面（501 > MAX_GOAL_CONDITION_CHARS=500 → fail-closed 拒绝不 arm，「exceeds 500 characters (got 501)」）`
        : `超长拒绝面缺口（value=${(r7.value ?? '').slice(0, 120)}）`,
    })
  }

  // ── G2 mock judge 活探针（C0-2 评估器 canned 两态，8983 零 8999）────
  const judgeOut = mkdtempSync(join(tmpdir(), 'atlas-goal0162-judge-'))
  const judgeLog = join(judgeOut, 'c4-judge-requests.jsonl')
  let server: ChildProcess | null = null
  try {
    server = spawn('python3', [
      '/home/vince/projects/AtlasCode/user-e2e/loop-robustness/c4-mock-server.py',
      judgeOut, '--mode', 'judge', '--port', String(JUDGE_PORT), '--judge-plan', 'U,U,M',
    ], { stdio: 'ignore' })
    // 端口就绪轮询（mock 启动 ~100ms 内）
    let ready = false
    for (let i = 0; i < 50 && !ready; i++) {
      await new Promise(r => setTimeout(r, 100))
      try {
        const s = await fetch(JUDGE_URL, { method: 'POST', body: '{"messages":[]}', headers: { 'content-type': 'application/json' } })
        void s
        ready = true
      } catch { /* 未就绪 */ }
    }
    if (!ready) {
      probes.push({ id: 'G2-mock-judge', hard: true, ok: false, detail: `judge mock 未就绪（${JUDGE_PORT} 5s 未响应）→ 探针侧环境面` })
    } else {
      const goalEngine: any = await loadMod(join(REPO, 'src/engine/goal/goalState.ts'))
      const evaluateGoal = goalEngine?.evaluateGoal as
        | ((p: { modelProvider: unknown, messages: unknown, condition: string }) => Promise<{ met: boolean, reason: string }>)
        | undefined
      if (typeof evaluateGoal !== 'function') {
        probes.push({
          id: 'G2-evaluator-surface', hard: true, ok: false,
          detail: 'evaluateGoal 导出缺席（src/engine/goal/goalState.ts 缺席或无 evaluateGoal = 修前红形活面现形）',
        })
      } else {
        // fake provider = fetch 面（OpenAI /v1/chat/completions → canned judge 响应）；
        // 形状对齐 evaluateGoal 调用契约（role small 无 tools + systemPrompt + messages）
        const fakeProvider = {
          chat: async (req: any) => {
            const systemContent = typeof req?.systemPrompt?.content === 'string' ? req.systemPrompt.content : ''
            const userMsgs = (req?.messages ?? []).map((m: any) => ({
              role: 'user',
              content: typeof m?.message?.content === 'string' ? m.message.content : JSON.stringify(m?.message?.content ?? ''),
            }))
            const resp = await fetch(JUDGE_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                model: 'c4mock-judge',
                stream: false,
                messages: [{ role: 'system', content: systemContent }, ...userMsgs],
              }),
            })
            const data: any = await resp.json()
            const text: string = data?.choices?.[0]?.message?.content ?? ''
            return { message: { content: [{ type: 'text', text }] } }
          },
        }
        const fixtureMessages = [
          { type: 'user', message: { role: 'user', content: 'Please make all unit tests pass.' } },
          { type: 'assistant', message: { role: 'assistant', content: 'Running the test suite now.' } },
        ] as unknown
        const e1 = await evaluateGoal({ modelProvider: fakeProvider, messages: fixtureMessages, condition: COND })
        const e2 = await evaluateGoal({ modelProvider: fakeProvider, messages: fixtureMessages, condition: COND })
        const e3 = await evaluateGoal({ modelProvider: fakeProvider, messages: fixtureMessages, condition: COND })
        probes.push({
          id: 'G2a-judge-unmet-1', hard: true,
          ok: e1.met === false && /canned-unmet/.test(e1.reason),
          detail: e1.met === false
            ? `judge 请求 #1（plan U）= 未达成 fail-safe（met=false + 原因「${e1.reason.slice(0, 60)}…」= loop 续跑支 reminder 注入面驱动）`
            : `judge 请求 #1 应未达成（met=${e1.met} reason=${e1.reason.slice(0, 60)}）→ 评估器解析/协议面缺口`,
        })
        probes.push({
          id: 'G2b-judge-unmet-2', hard: true,
          ok: e2.met === false && /canned-unmet/.test(e2.reason),
          detail: e2.met === false
            ? `judge 请求 #2（plan U）= 续跑序第 2 轮未达成（maxGoalTurns 守卫前的续跑面）`
            : `judge 请求 #2 应未达成（met=${e2.met}）→ 请求序判别面缺口`,
        })
        probes.push({
          id: 'G2c-judge-met', hard: true,
          ok: e3.met === true && /canned-met/.test(e3.reason),
          detail: e3.met === true
            ? `judge 请求 #3（plan M）= 达成（met=true + 原因「${e3.reason.slice(0, 60)}…」= 自清除 goal_met 事件面）`
            : `judge 请求 #3 应达成（met=${e3.met} reason=${e3.reason.slice(0, 60)}）→ MET 解析面缺口`,
        })
        let logOk = false
        let logDetail = 'judge 请求日志缺席'
        if (existsSync(judgeLog)) {
          const lines = readFileSync(judgeLog, 'utf8').trim().split('\n').filter(Boolean)
            .map(l => { try { return JSON.parse(l) as any } catch { return null } })
            .filter(Boolean)
          const judgeEntries = lines.filter((l) => l?.judge === true)
          const letters = judgeEntries.map((l) => l?.plan_letter).join(',')
          logOk = judgeEntries.length === 3 && letters === 'U,U,M'
          logDetail = logOk
            ? `judge 请求日志三判（3 条 judge 请求 plan_letter U,U,M 按请求序判别在场 = mock 两态确定性承载）`
            : `judge 请求日志面缺口（judge 条目=${judgeEntries.length}；plan_letter=${letters}）`
        }
        probes.push({ id: 'G2d-judge-request-log', hard: true, ok: logOk, detail: logDetail })
      }
    }
  } finally {
    server?.kill('SIGTERM')
  }

  // ── G3 overlay 面板 + footer 指示器 源级在场核验（C0-3/C0-4）────────
  // 定因（探针侧环境面，非产品缺陷）：产品 renderToAnsiString（ink 嵌套 render +
  // waitUntilExit）在 headless bare bun 下不 resolve（ink 实例常驻 → 事件循环不排空/
  // 排空即静默 exit 0；2026-10-13 探针侧最小复现 render-repro.ts 双 stdin 变体确证
  // = 探针侧挂起，非产品）。→ 面板/chip 的「TUI 活渲染像素面」归生产 lane 观察面
  // （同 goalState.ts 自律「活面真 judge 仅生产观察面」），gate 判别力 = 源级在场核验
  // （组件导出 + 三要素结构 + registry 挂载 + armed/未 armed 分支），零模型零网络零 8999。
  // ★ 0.1.63 P7 结构漂移适配（定因登记，非产品回归）：P7 波体有意重构两组件
  // （GoalOverlay → React.memo 导出〔非 function，$$typeof memo 对象〕+
  // GoalSegment 模块级缓存〔源字面「!isGoalArmed() return null」→ 缓存 null 支〕）。
  // 行为不变量恒等（未 armed 零渲染 / 三要素+占位 / 🎯 chip / registry 挂载），
  // 仅源形变 → 断言改结构无关（0.1.60 探针缺口「条件加宽修」先例同族）：
  // 导出面 = function 或 React.memo 对象；未 armed 零渲染 = 行为调用面（seg()=null）
  // 非源字面匹配。G3c 新断言 = P7 空闲零重渲染行为面（arm 后连调引用相等 = 缓存命中
  // 零 JSX 构造；clear 后回 null = 缓存失效；基线 pre-P7 结构引用不等 = 定向红形）。
  const readSrc = (p: string): string => { try { return readFileSync(p, 'utf8') } catch { return '' } }
  const overlayMod: any = await loadMod(join(REPO, 'src/tui/components/GoalOverlay.tsx'))
  const overlaySrc = readSrc(join(REPO, 'src/tui/components/GoalOverlay.tsx'))
  const overlayExport = overlayMod.GoalOverlay
  const overlayExportOk = typeof overlayExport === 'function'
    || (overlayExport != null && (overlayExport['$$typeof'] != null || typeof overlayExport.type === 'function'))
  const overlayOk = overlayExportOk
    && overlaySrc.includes("(no goal armed)") && /Elapsed/.test(overlaySrc) && /Turns/.test(overlaySrc) && /Tokens/.test(overlaySrc)
  probes.push({
    id: 'G3a-overlay-source', hard: true,
    ok: overlayOk,
    detail: overlayOk
      ? `GoalOverlay 源级在场（组件导出〔function 或 P7 React.memo 对象〕+ 三要素 Elapsed/·API + Turns + Tokens 行 + 未 armed 占位「(no goal armed)」面在场 = C0-3 面板在场 scope；TUI 活渲染像素面 = 生产 lane 观察面，headless 挂起定因见探针头注）`
      : `GoalOverlay 源级在场缺口（组件导出=${typeof overlayExport}〔memo 对象 $$typeof=${overlayExport?.['$$typeof']}〕；三要素/占位行缺席 = 修前红形活面现形）`,
  })

  const segmentIdx: any = await loadMod(join(REPO, 'src/tui/components/StatusLine/segments/index.ts'))
  const seg = segmentIdx?.segmentRegistry?.get?.('goal')
  const segMod: any = await loadMod(join(REPO, 'src/tui/components/StatusLine/segments/GoalSegment.tsx'))
  const segSrc = readSrc(join(REPO, 'src/tui/components/StatusLine/segments/GoalSegment.tsx'))
  const goalStateMod: any = await loadMod(join(REPO, 'src/engine/goal/goalState.ts'))
  // 未 armed 零渲染 = 行为调用面（结构无关：旧形「!isGoalArmed() return null」/
  // P7 缓存形「!armed → _cachedNode=null → return null」）；此刻 G1d 已 clear → 未 armed
  const notArmedZero = typeof goalStateMod.isGoalArmed === 'function' && !goalStateMod.isGoalArmed()
    && seg != null && seg() === null
  const segOk = (typeof seg === 'function' || (seg != null && typeof seg === 'object'))
    && typeof segMod.GoalSegment === 'function'
    && segSrc.includes('🎯') && notArmedZero
  probes.push({
    id: 'G3b-footer-registry', hard: true, ok: segOk,
    detail: segOk
      ? `footer registry 挂载（segmentRegistry.get('goal') = GoalSegment 组件导出 + 源级「🎯」chip 前缀〔GOAL_PREFIX〕+ 未 armed 零渲染行为面〔seg()=null，P7 缓存形兼容〕= C0-4 挂载面；chip 活渲染像素面 = 生产 lane 观察面）`
      : `footer registry 挂载缺口（registry.get('goal')=${typeof seg}；组件导出=${typeof segMod.GoalSegment}；🎯在场=${segSrc.includes('🎯')}；notArmedZero=${notArmedZero} → C0-4 未落/修前红形）`,
  })

  // ── G3c P7 空闲零重渲染行为面（arm 后连调引用相等 = 缓存命中；clear 回 null）──
  let g3c: boolean
  let g3cDetail: string
  if (typeof goalStateMod.armGoal === 'function' && typeof seg === 'function') {
    goalStateMod.armGoal('probe-p7-cache-check')
    const node1 = seg()
    const node2 = seg()
    const cacheHit = node1 !== null && node1 === node2
    goalStateMod.clearGoal()
    const nodeAfterClear = seg()
    const clearBackNull = nodeAfterClear === null
    g3c = cacheHit && clearBackNull
    g3cDetail = cacheHit && clearBackNull
      ? `P7 空闲零重渲染行为面（arm『probe-p7-cache-check』→ 连调 seg() 两次引用相等〔缓存命中 = 零 JSX 构造零截断计算〕+ clear 后回 null〔缓存失效重算〕= 0.1.63 P7 意图活面断言；pre-P7 结构引用不等 = 定向红形）`
      : `P7 零重渲染缺口（cacheHit=${cacheHit}〔node1===node2〕clearBackNull=${clearBackNull} → 缓存面缺席或失效路径缺失）`
  } else {
    g3c = false
    g3cDetail = `P7 零重渲染探针不可执行（armGoal=${typeof goalStateMod.armGoal}；seg=${typeof seg}）`
  }
  probes.push({ id: 'G3c-p7-zero-rerender', hard: true, ok: g3c, detail: g3cDetail })

  rmSync(judgeOut, { recursive: true, force: true })

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  report.verdict = verdict
  const fs = await import('node:fs')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(join(OUT, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-GOAL-0162 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-GOAL-0162 ERROR', e); process.exit(1) })
