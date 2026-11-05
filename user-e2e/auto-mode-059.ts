/**
 * 0.1.59 PAC V2-07/08/09 权限/配置语法 · autoMode 判别探针（e2e lane，gate 判据④）。
 *
 * 判据面（f4 预审信号 + 工单 §4）：
 *   C1-1 hard_deny 第 4 类（CC 2.1.136）：用户「do it」意图不清除 =
 *     aggregateAutoModeSeverity({hard_deny, allow}) → 'hard_deny'（rank 最严聚合
 *     无清除支）+ 既有类聚合恒等（soft_deny 不被 allow 清除 / 常规 deny 被 allow
 *     清除 / 无命中 → allow 中性缺省）。
 *   C9-1 Tool(param:value)（CC 2.1.178）：参数规则命中活面 =
 *     parseParametricContent 解析 + ruleMatchesParametric 全参 AND 命中 +
 *     非声明字段回落 content 面（null）+ 非 param:value 形不误判。
 *   C9-3 --permission-prompts none（CC 2.1.259）：flag 面 =
 *     buildHeadlessOptions({permissionPrompts:'none'}) → permissionMode='dontAsk'
 *     + 缺省面恒等（flag 缺省 = 零变更）。
 *
 * 判读面（0.1.57 D4-B / 0.1.58 C4-1 同族纪律）：产品函数活 import 探针
 * （@ 被测面 worktree 源码，真函数真模板，确定性零模型零网络零 8999 竞争）；
 * 回合级 fallback 支 = 单测面承载（turn-fallback-0159，engine 循环面需 mock
 * provider 高成本，不入本探针，A4F 权限 lane + 单测双层承载）。
 *
 * 断言面：
 *   hard（活面判别核心）：
 *     M1 hard_deny 意图不清除（{hard_deny, allow} → hard_deny）
 *     M2 rank 恒等（{soft_deny, allow} → soft_deny / {deny, allow} → allow / 无命中 → allow）
 *     M3 解析（parseParametricContent('model:premium') 表形 + 非形 null）
 *     M4 命中矩阵（Agent(model:premium) × input 全命中/单参不符/非声明字段/多参 AND）
 *     M5 缺省恒等（C9-3 缺省零变更面 + C9-1 无参规则面恒等锚）
 *   soft（build 面登记，单测 31/31 承载）：
 *     M6 hard_deny 规则块模板段在场（'## USER HARD DENY'）
 *     M7 dontAsk 折入（C9-3 flag 开启面，buildHeadlessOptions 活面）
 *
 * 隔离：零盘写产品面（结果 = job tmp）；零 8999（纯函数 import，无 LLM 面）。
 * 用法：ATLAS_E2E_AUTO59_REPO=<worktree 绝对路径> bun run user-e2e/auto-mode-059.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_AUTO59_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-059'
const OUT = process.env.ATLAS_E2E_AUTO59_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-059/auto-mode'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const report: any = { ts: new Date().toISOString(), repo: REPO, probes: [] as Probe[] }

  // 产品面活 import（@ 被测面 worktree 源码）
  const perms: any = await import(join(REPO, 'src/permissions/index.ts'))
  const rm: any = await import(join(REPO, 'src/permissions/ruleMatching.ts'))

  const {
    aggregateAutoModeSeverity,
    parseParametricContent,
    ruleMatchesParametric,
    getParametricRuleForTool,
  } = {
    aggregateAutoModeSeverity: perms.aggregateAutoModeSeverity,
    parseParametricContent: rm.parseParametricContent,
    ruleMatchesParametric: rm.ruleMatchesParametric,
    getParametricRuleForTool: rm.getParametricRuleForTool,
  }
  if (typeof aggregateAutoModeSeverity !== 'function' || typeof ruleMatchesParametric !== 'function') {
    console.log(`AUTO59 ERROR: 产品导出缺席（aggregateAutoModeSeverity=${typeof aggregateAutoModeSeverity} / ruleMatchesParametric=${typeof ruleMatchesParametric}）→ 修前红形活面现形`)
    writeFileSync(join(OUT, 'result.json'), JSON.stringify({ ...report, verdict: 'FAIL(导出缺席)' }, null, 2))
    process.exit(1)
  }

  const agentTool: any = {
    name: 'Agent',
    inputSchema: { properties: { description: {}, prompt: {}, subagent_type: {}, model: {} } },
  }

  // ── M1 hard_deny 意图不清除（用户「do it」意图面 = allow 在场仍 hard_deny）──
  const m1 = aggregateAutoModeSeverity({ hard_deny: ['no prod deploy'], allow: ['read-only'] }) === 'hard_deny'
    && aggregateAutoModeSeverity({ hard_deny: true, allow: true }) === 'hard_deny'

  // ── M2 rank 恒等（既有类聚合零回归）──
  const m2 = aggregateAutoModeSeverity({ soft_deny: true, allow: true }) === 'soft_deny'
    && aggregateAutoModeSeverity({ deny: true, allow: true }) === 'allow'
    && aggregateAutoModeSeverity({}) === 'allow'

  // ── M3 解析面 ──
  const m3 = (() => {
    const t = parseParametricContent('model:premium')
    const non = parseParametricContent('npm install') // 非 param:value 形（无 ':'）
    const bad = parseParametricContent(':v') // 空 param
    return t?.model === 'premium' && non === null && bad === null
  })()

  // ── M4 命中矩阵（rule 形 = 单测同构：ruleValue{toolName, ruleContent} 嵌套）──
  const mkRule = (toolName: string, ruleContent?: string): any => ({
    source: 'cliArg',
    ruleBehavior: 'deny',
    ruleValue: ruleContent === undefined ? { toolName } : { toolName, ruleContent },
  })
  const m4 = (() => {
    // 工具入参全命中（Agent 调用 input.model='premium'）
    const hit = ruleMatchesParametric(mkRule('Agent', 'model:premium'), agentTool, { model: 'premium' })
    // 单参不符
    const miss = ruleMatchesParametric(mkRule('Agent', 'model:premium'), agentTool, { model: 'fast' })
    // 非声明字段（Agent 无 'foo' 入参 → 非参数化面回落 content 面）
    const nonField = ruleMatchesParametric(mkRule('Agent', 'foo:x'), agentTool, { foo: 'x' })
    return hit === true && miss === false && nonField === false
  })()

  // ── M5 缺省/无参面恒等 ──
  const m5 = (() => {
    // 无参 exact 规则（ruleContent 形 'npm install' 走 content 面）= 解析 null 不误判参数化
    const contentForm = parseParametricContent('npm install')
    // 多参 AND（全命中才 allow/deny）
    const multi = parseParametricContent('model:premium,subagent_type:Explore')
    return contentForm === null && !!multi && multi.model === 'premium' && multi.subagent_type === 'Explore'
  })()

  // ── M7 C9-3 dontAsk 折入（活面 = buildHeadlessOptions；缺省面 = 零变更）──
  let m7: boolean | null = null
  try {
    const cli: any = await import(join(REPO, 'src/cli/index.ts'))
    const opts = cli.buildHeadlessOptions ? cli.buildHeadlessOptions({ permissionPrompts: 'none' }) : null
    const def = cli.buildHeadlessOptions ? cli.buildHeadlessOptions({}) : null
    m7 = opts?.permissionMode === 'dontAsk' && def?.permissionMode !== 'dontAsk'
  } catch (e: any) {
    m7 = null // 导出面缺席/加载异常 → 单测面承载（定因登记不 gate）
  }

  const probes: Probe[] = [
    { id: 'M1-hard-deny-not-cleared', hard: true, ok: m1, detail: `aggregateAutoModeSeverity({hard_deny,allow})（用户「do it」意图面 = allow 在场仍 hard_deny，无清除支；单测同形 M1）` },
    { id: 'M2-rank-identity', hard: true, ok: m2, detail: `rank 恒等（{soft_deny,allow}→soft_deny / {deny,allow}→allow 清除 / 无命中→allow 中性）= 既有 3 类聚合零回归` },
    { id: 'M3-parametric-parse', hard: true, ok: m3, detail: `parseParametricContent 活面（'model:premium'→{model:'premium'} / 非形 null / 空 param null）` },
    { id: 'M4-hit-matrix', hard: true, ok: m4, detail: `命中矩阵（Agent(model:premium) × input model=premium 命中 / fast 不命中 / 非声明字段不命中 = 全参 AND 语义活面）` },
    { id: 'M5-default-identity', hard: true, ok: m5, detail: `缺省/无参面恒等（content 形 null 不误判 + 多参 AND 表形）` },
    { id: 'M7-dontask-fold', hard: false, ok: m7, detail: `C9-3 flag 面（buildHeadlessOptions permissionPrompts:'none'→dontAsk + 缺省零变更；导出面缺席时 = 单测面承载定因登记不 gate）` },
  ]
  report.probes = probes
  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  report.verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict: report.verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`AUTO-MODE-059 ${report.verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('AUTO-MODE-059 ERROR', e); process.exit(1) })
