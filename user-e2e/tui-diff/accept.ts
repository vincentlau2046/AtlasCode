/**
 * TUI 差异化（信任线 spec v3，docs/tui-differentiation-spec.md）逐阶段验收 harness。
 *
 * 角色分工：Main（AtlasCode 架构实施Main）实施 P0–P2 → 本 harness 验收（atlas-user-e2e）。
 * 每阶段出「阶段验收单」（ticket.md + result.json）；本文件只读产品 + PTY 黑盒驱动，
 * 全部 I/O 落在 user-e2e/tui-diff/ 下（沙箱 HOME/一次性 workspace/artifacts），真实 ~/.atlas 零写入。
 *
 * 探针原则（PLAN.md 详述）：
 *  - 语义关键词 + 可配置表（PROBES 顶部集中）：文案以 Main 落地为准，漂移时先对齐关键词再重跑，
 *    探针 miss ≠ 产品缺陷（判缺陷前人工核证据截留，防 C2②/C3② 式伪阴性）。
 *  - hard = 门禁必需（缺 → FAIL）；soft = 条件性断言（触发条件未达 → INCONCLUSIVE，不 FAIL）。
 *  - 全量 sinceText 窗口（非末窗）：TUI 重绘会把瞬态行推出末窗（C2② 教训）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/accept.ts [P0|P0a|P0b|P1|P2|redline] [--baseline] [--only S-X] [--repo <path>] [--base <sha>] [--tip <sha>]
 *   P0a = 审批内联 verdict（零新数据，先做）；P0b = 两后端新信号（排 0.1.17 后）
 *   例：
 *   bun run user-e2e/tui-diff/accept.ts P0              # P0 全场景（需本地网关 127.0.0.1:8999）
 *   bun run user-e2e/tui-diff/accept.ts P0 --baseline   # pre-landing 基线（硬探针全红 = 预期）
 *   bun run user-e2e/tui-diff/accept.ts redline --base v0.1.15 --tip HEAD   # 红线 1 主路径零改动核验
 *
 * 模型对齐：S-A/S-B/S-D/E/F 沙箱三角色 + 顶层 model → iff/deepseek-v4-pro（能力对齐，隔离渲染层）；
 * S-C（网关不可达）把 IFF baseURL 指向死端口 127.0.0.1:9（不需要活网关）。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from '../lib/pty'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'
import { startFaultProxy, type MainLoopScript, type ClassifierInjection } from '../loop-robustness/fault-proxy'

/** 默认 master 仓；P0 信任线若落独立 worktree，用 --repo <path> 或 ATLAS_E2E_REPO 指过去
 *  （harness 从该 worktree 的 src 起 TUI，user-e2e/ 仍从 master E2E 根取库/fixture）。let：main() 可由 --repo 覆写。 */
let REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const E2E = '/home/vince/projects/AtlasCode/user-e2e' // 库/fixture 恒取 master 副本（worktree 里 user-e2e 是符号链接/未跟进而非权威源）
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const FIX_COMPARE = join(E2E, 'compare/fixtures')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'
const DEAD_GW = 'http://127.0.0.1:9/v1' // port 9 (discard) = 必死端口
// #278 波 A（live-gateway 分类器 e2e 波，全确定性种子）：IFF 指 fault-proxy，
// 主循环前 count 次脚本化 tool_use + classify_result 注入 shouldBlock；非脚本化调用转发活网关 8999。
const CLS_PROXY_PORT = Number(process.env.ATLAS_E2E_CLS_PROXY_PORT ?? '8998')
const CLS_PROXY_URL = `http://127.0.0.1:${CLS_PROXY_PORT}/v1`
const LIVE_GW = 'http://127.0.0.1:8999'

/** 红线 1（spec §3）：主循环 + permissions 主路径零改动。
 *  spec 点名的 streamAssistant 在当前代码无同名符号（主循环流式路径概念名），以 src/engine/query/** 覆盖。 */
const REDLINE_PATHS = ['src/engine/query/', 'src/tui/utils/permissions/']

// ── 探针表（语义关键词集中可配；文案漂移时改这里，不改场景） ──────────────────────
interface Probe {
  id: string
  /** spec §4 门禁项（需求语言原文，验收单对照用） */
  gate: string
  desc: string
  re: RegExp
  /** hard = 门禁必需；soft = 条件性（触发未达 → INCONCLUSIVE） */
  hard: boolean
  /** absent = 断言「不出现」（count==0 才 PASS，如 "Unknown skill" 归零） */
  absent?: boolean
}

const P = {
  // P0 门禁：三问「谁在答 / 为什么放行 / 上下文还够吗」
  whoRole: { id: 'P0-1a-who', gate: '现在谁在答', desc: '信任线含角色（premium|fast|small）', re: /(premium|fast|small)\b/i, hard: true },
  fallback: { id: 'P0-1a-fallback', gate: '现在谁在答', desc: '水平回退标记（0.1.24 B1：折入 model 段 ↦ fast；回退难强制 → 常 INCONCLUSIVE）', re: /(已回退|回退到|fallback|↦\s*(small|fast)|→\s*(small|fast))/i, hard: false },
  verdict: { id: 'P0-1b-verdict', gate: '为什么(自动)放行', desc: '审批 verdict 三态（Verdict: hit rule / classifier says / no rule matched … mode）', re: /Verdict\s*:/i, hard: true },
  rule: { id: 'P0-1b-rule', gate: '为什么(自动)放行', desc: '命中规则行（0.1.24 A4 句式：Rule "<v>" from <source> requires confirmation / Allowed by rule）', re: /Rule\s+"[^"]+"\s+from\s+[^"]+?\s+requires\s+confirmation|Allowed\s+by\s+rule/i, hard: true },
  noConf: { id: 'P0a-no-conf', gate: '数值置信度不出现', desc: '无数值置信度（置信度/confidence 词 + 数值相邻；版本号 0.1.x 不计数）', re: /(置信度?|confidence)\s*[:：]?\s*\d+(\.\d+)?|\d+(\.\d+)?\s*(置信|confidence)/i, hard: true, absent: true },
  ctxPct: { id: 'P0-1c-ctx', gate: '上下文还够吗', desc: '上下文剩余 %（回归护底：基线 context-bar 已有，P0 不得降级）', re: /\d{1,3}%/, hard: true },
  // 收紧：只匹配「预警」意图文案，避免命中命令列表里的裸 /autocompact、/rewind（基线 2026-10-03 实测假阳性）
  fuse: { id: 'P0-1c-fuse', gate: '熔断预警', desc: '达阈值前熔断预警（0.1.24 B2：折入 context-bar 段 ▲（黄）；条件：上下文逼近窗口）', re: /▲/u, hard: false },
  modelFast: { id: 'P0-2-fast', gate: '换档一键', desc: '/model fast 后信任线即时显示 fast 角色', re: /\bfast\b/i, hard: true },
  // P0 门禁：审批内联 verdict（工具卡面，非状态线面；关键词与 1b 同族，面判定由验收单人工核证据）
  cardAllow: { id: 'P0-3-allow', gate: '审批卡片内联 why', desc: 'default 模式手动批准行（✓ Allowed · your decision；auto-mode classifier 行属 auto/plan 模式另测）', re: /Allowed.*your\s+decision/i, hard: true },
  cardDeny: { id: 'P0-3-deny', gate: '审批卡片内联 why', desc: 'deny 面（需 deny fixture；S-A 走批准面 → INCONCLUSIVE）', re: /(Denied|拦截|拒绝|\bdeny\b)/i, hard: false },
  // P0 门禁：网关不可达给方向不给 mood
  gwDown: { id: 'P0-5-gw', gate: '网关不可达方向性', desc: 'IFF 不可达提示（不可达/无法连接/connection error 族；仅探测错误是否浮现，方向性由 manual+doctor 探针把关）', re: /(不可达|无法连接|unreachable|unavailable|连接失败|connection\s*error|连接错误)/i, hard: true },
  gwManual: { id: 'P0-5-manual', gate: '网关不可达方向性', desc: '「已切人工确认」族', re: /(人工确认|手动确认|manual)/i, hard: true },
  gwDoctor: { id: 'P0-5-doctor', gate: '网关不可达方向性', desc: '给排查方向 /doctor', re: /(\/doctor|排查)/, hard: true },
  // P1 门禁：计划/进度可见 + diff 可读性收口 + 非 git 项目 skill（G2 残余）
  plan: { id: 'P1-1-plan', gate: '规划期可见目标+还差几步', desc: '计划/进度标记（目标/计划/步骤/N-M/还剩 族；文案以落地为准，miss 时先对齐关键词）', re: /(目标|计划|步骤|还剩|\d+\s*[\/\-]\s*\d+\s*(步|项|个)|progress|todo)/i, hard: true },
  diffInline: { id: 'P1-2-diff', gate: '工具结果/diff 默认可读', desc: '改文件 diff 默认内联（Added/Removed N lines 族，G1 #258 延续）', re: /Added\s*\d+\s*lines?|Removed\s*\d+\s*lines?/i, hard: true },
  diffExpand: { id: 'P1-2-expand', gate: '展开/折叠无数据丢失', desc: 'ctrl+o 展开后可见 unified hunk（编号 +/- 行）', re: /^\s*\d+\s*[-+]\s?\S/m, hard: true },
  skillLoaded: { id: 'P1-3-skill', gate: '非 git 项目 .atlas/skills 可发现（G2 残余）', desc: 'Skill 工具按名命中（无 git init 的 ws）', re: /Successfully loaded skill/i, hard: true },
  skillUnknown: { id: 'P1-3-nounknown', gate: '非 git 项目 .atlas/skills 可发现（G2 残余）', desc: 'Unknown skill / Invalid tool parameters 归零', re: /Unknown skill|Invalid tool parameters/i, hard: true, absent: true },
  // P1a 门禁：多页面侧栏（split 抽屉）。自动探针 2 个（open/diff-sbs）；
  // close(Esc 关)/split(消息流不被覆盖)/jump(信任线→页直达) 涉布局状态变化，归验收单人工核（PLAN §5）。
  // 键位/命令以 Main P1a 定稿为准，环境变量注入（TUI_DIFF_SIDEBAR_OPEN/SBS）；未注入 → 跳过触发，探针 INCONCLUSIVE。
  sideOpen: { id: 'P1a-open', gate: '任一 tab 一键开侧栏', desc: '侧栏 tab 行（1 Diff 2 Plan…5 Budget 编号+页名；收紧避免命中泛 Diff/Plan 词）', re: /(1\s*Diff\s*2\s*Plan|Diff\s*2\s*Plan\s*3\s*Activity|2\s*Plan\s*3\s*Activity\s*4\s*Decisions)/i, hard: true },
  diffSbs: { id: 'P1a-diff-sbs', gate: 'Diff 页 side-by-side 可切（纯新增渲染）', desc: 'side-by-side 档实际渲染（回 unified / ⇄ hunk 头 / 空态当前档 side-by-side；收紧避免命中 unified 档帮助提示的 →side-by-side）', re: /(回\s*unified|⇄|@@.*⇄.*@@|当前档\s*side.by.side|side.by.side.*回\s*unified)/i, hard: true },
  // P2 门禁：可重跑工具（触发键/命令以 Main P2 定稿为准，场景骨架先备）
  rerunSupp: { id: 'P2-1-superseded', gate: '改参重跑', desc: '旧结果标记「被取代」非删除', re: /(被取代|superseded|replaced|旧结果)/i, hard: false },
} as const

// ── 0.1.24 逐项探针（§4b A/B/C + UA；判据源 accept-024.ts PROBES_024，此处为执行面 wiring） ──
// 触发 env 名→键位/场景由本表场景步驱动（f4 已定稿：无新增键位，数字选 + shift+tab 既有面），
// 不可强制触发者以 softTriggers=false → INCONCLUSIVE（不判 FAIL）。
const P024 = {
  // A1 always 生效（session 域 allow 规则）
  a1allow: { id: 'A1-allow-reason', gate: 'A1 always 生效', desc: '同前缀第二次直接 allow + 工具卡显 allow 原因（Allowed by rule）', re: /Allowed\s+by\s+rule\s+"[^"]+"/i, hard: true },
  a1nodlg: { id: 'A1-no-dialog', gate: 'A1 always 生效', desc: '第二次同前缀命令不再弹 Do you want to proceed', re: /Do you want to proceed/, hard: true, absent: true },
  a1danger: { id: 'A1-dangerous-no-always', gate: 'A1 危险前缀护栏', desc: '危险前缀弹框不出现 don\'t ask again / always 选项', re: /don['’]t\s+ask\s+again|Always\s+allow|永远允许|始终允许/i, hard: true, absent: true },
  // A2 No 不退出
  a2surv: { id: 'A2-session-survives', gate: 'A2 No 不退出', desc: 'No 拒绝后 session 存活（不 exit / 无 session ended）', re: /(session\s+(ended|closed|exited)|Goodbye|已结束会话)/i, hard: true, absent: true },
  a2feed: { id: 'A2-feedback', gate: 'A2 feedback 送 agent', desc: 'No 后 feedback 被 agent 引用/确认', re: /(反馈|feedback|declined|拒绝|didn['’]t\s+run|won['’]t\s+run)/i, hard: false },
  a2esc: { id: 'A2-esc-no-feedback', gate: 'A2 Esc 取消无 feedback', desc: 'Esc 取消后无 feedback 送达（agent 不引用反馈）', re: /反馈|feedback/i, hard: false, absent: true },
  // A3 automode 确认门
  a3modal: { id: 'A3-confirm-modal', gate: 'A3 automode 确认门', desc: '模态 Entering automode + Switch back Shift+Tab + 1 Confirm 2 Cancel', re: /Entering\s+automode|Switch\s+back\s*:\s*Shift\+Tab/i, hard: true },
  a3notsw: { id: 'A3-not-switched-before', gate: 'A3 确认后才切', desc: 'Confirm 前 statusline 仍 default（automode enabled 未现形）', re: /automode\s+enabled/i, hard: true, absent: true },
  a3sw: { id: 'A3-switched-after', gate: 'A3 确认后切', desc: 'Confirm 后 statusline 现 automode enabled', re: /automode\s+enabled/i, hard: true },
  a3cancel: { id: 'A3-cancel-default', gate: 'A3 Cancel 停留 default', desc: 'Cancel 后仍 default（automode enabled 未现形）', re: /automode\s+enabled/i, hard: true, absent: true },
  // A4 why 句式全英文真字段
  a4rask: { id: 'A4-rule-ask', gate: 'A4 why 句式', desc: 'rule(ask): Rule "<v>" from <source> requires confirmation.', re: /Rule\s+"[^"]+"\s+from\s+[^"]+?\s+requires\s+confirmation/i, hard: true },
  a4rallow: { id: 'A4-rule-allow', gate: 'A4 why 句式', desc: 'rule(allow): Allowed by rule "<v>" (<source>).', re: /Allowed\s+by\s+rule\s+"[^"]+"\s*\([^)]*\)/i, hard: true },
  a4cls: { id: 'A4-classifier-dangerous', gate: 'A4 why 句式', desc: 'classifier: flagged this as dangerous', re: /classifier\s+flagged\s+this\s+as\s+dangerous/i, hard: true },
  a4clsa: { id: 'A4-classifier-approved', gate: 'A4 why 句式', desc: 'classifier: Auto-approved by classifier: <reason>.', re: /Auto-?approved\s+by\s+classifier\s*:/i, hard: true },
  a4mode: { id: 'A4-mode', gate: 'A4 why 句式', desc: 'mode: default mode requires confirmation for <tool>.', re: /default\s+mode\s+requires\s+confirmation\s+for\s+\S+/i, hard: true },
  a4bypass: { id: 'A4-bypass', gate: 'A4 why 句式', desc: 'bypass: Bypass mode — all commands allowed.', re: /Bypass\s+mode\s*[-–—]\s*all\s+commands\s+allowed/i, hard: true },
  // A5 statusline 三标签
  a5auto: { id: 'A5-label-automode', gate: 'A5 statusline 三标签', desc: 'permission-mode 段 automode enabled', re: /automode\s+enabled/i, hard: true },
  a5bypass: { id: 'A5-label-bypass', gate: 'A5 statusline 三标签', desc: 'permission-mode 段 bypass enabled', re: /bypass\s+enabled/i, hard: true },
  a5default: { id: 'A5-label-default', gate: 'A5 statusline 三标签', desc: 'permission-mode 段 default（小写；与 A4 default mode 碰撞 soft）', re: /(^|[\s▶⏭])default([\s·]|$)/i, hard: false },
  // B 波持续监控
  b1fast: { id: 'B1-fallback-fast', gate: 'B1 回退折入 model 段', desc: '回退活跃 model 段 ↦ fast（黄）', re: /(?:↦|→)\s*fast|\bfast\b[\s·]*(?:↦|→)/i, hard: false },
  b1gone: { id: 'B1-fallback-gone', gate: 'B1 恢复即消失', desc: '恢复后 ↦ fast 不残留', re: /↦\s*fast|→\s*fast/i, hard: false, absent: true },
  b2tri: { id: 'B2-ctx-triangle', gate: 'B2 熔断折入 context-bar', desc: '超 autoCompact 阈值 context-bar 段显 ▲', re: /▲/u, hard: false },
  b2pct: { id: 'B2-ctx-pct', gate: 'B2 context-bar 色阶', desc: 'context 剩余 %（护底）', re: /\d{1,3}%/, hard: true },
  b3gw: { id: 'B3-gw-down', gate: 'B3 网关断指示（已砍）', desc: '⚠ gw down（B3 已批准砍 → INCONCLUSIVE）', re: /⚠\s*gw\s*down|gw\s*down/i, hard: false },
  b3err: { id: 'B3-gw-err-noregress', gate: 'B3 降级砍时核既有错误行', desc: 'Connection error / 不可达 仍浮现（P0b③ 不回归）', re: /(Connection\s*error|不可达|无法连接|connection\s*error)/i, hard: true },
  // C 波回退核
  csb: { id: 'C-sidebar-gone', gate: 'C 抽屉回退', desc: 'stripAnsi 抽屉残留 0 命中（tab 行归零）', re: /(1\s*Diff\s*2\s*Plan|Diff\s*2\s*Plan\s*3\s*Activity|2\s*Plan\s*3\s*Activity\s*4\s*Decisions)/i, hard: true, absent: true },
  csbunk: { id: 'C-sidebar-unknown', gate: 'C /sidebar 未注册', desc: '发 /sidebar → Unknown skill|command: sidebar', re: /Unknown\s+(?:skill|command):\s+sidebar/i, hard: true },
  cnum: { id: 'C-num-no-open', gate: 'C 1-5 键不开抽屉', desc: '按 1-5 数字键不触发抽屉（tab 行归零）', re: /(1\s*Diff\s*2\s*Plan|2\s*Plan\s*3\s*Activity\s*4\s*Decisions)/i, hard: true, absent: true },
  cdiff: { id: 'C-diff-no-regress', gate: 'C /diff + 内联 diff 无回归', desc: '工具结果/diff 默认可读（Added/Removed N lines）', re: /Added\s*\d+\s*lines?|Removed\s*\d+\s*lines?/i, hard: true },
  // UA 用户面走查层
  uawhy: { id: 'UA-why-no-cjk', gate: '审批 why 行无 CJK', desc: 'A4 英文句同行为混 CJK → 归零', re: /(requires\s+confirmation|Allowed\s+by\s+rule|flagged|Auto-approved)[^\n]*[一-鿿]/i, hard: false, absent: true },
  ualbl: { id: 'UA-labels-english', gate: 'statusline 三标签英文', desc: 'statusline 权限段无 CJK', re: /(权限|模式|绕过|自动)[一-鿿]*/, hard: false, absent: true },
} as const

// ── 探针执行 ──────────────────────────────────────────────────────────────
interface ProbeResult {
  id: string
  gate: string
  desc: string
  hard: boolean
  absent: boolean
  /** PASS=true FAIL=false；soft 探针触发未达 = null(INCONCLUSIVE) */
  ok: boolean | null
  evidence: string[]
}

function evalProbe(text: string, p: Probe, triggerReached: boolean = true): ProbeResult {
  const lines = text.split('\n')
  const hits = lines.filter(l => p.re.test(l))
  const absentOk = hits.length === 0
  let ok: boolean | null
  // 触发未达 → INCONCLUSIVE（含 hard：键位未注入等；含 absent：未触发不判「归零」，防假 PASS）
  if (!triggerReached) ok = null
  else if (p.absent) ok = absentOk
  else ok = hits.length > 0 // hard/soft 触发达同判定（hits>0 = PASS）
  const evidence = hits.slice(0, 3).map(l => l.trim().slice(0, 160))
  if (!evidence.length) {
    if (!triggerReached) evidence.push('(触发未达 → INCONCLUSIVE)')
    else if (p.absent || !p.hard) evidence.push('(未命中)' + (p.absent ? '（PASS：应为 0 次）' : ''))
    else evidence.push('(末5行) ' + lines.filter(l => l.trim()).slice(-5).map(l => l.trim().slice(0, 80)).join(' | '))
  }
  return { id: p.id, gate: p.gate, desc: p.desc, hard: p.hard, absent: Boolean(p.absent), ok, evidence }
}

// ── 沙箱种子（对齐 compare.ts：能力对齐 deepseek-v4-pro，隔离渲染层） ─────────────
type SeedMode = 'live' | 'fuse' | 'deadgw' | 'cls'
async function seedHome(home: string, mode: SeedMode, extraSettings?: (s: Record<string, any>) => void, globalConfig?: Record<string, any>): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  await makeSandboxHome(home, REAL_SETTINGS, false) // 复制真实 settings + 裁插件/MCP
  // 全局 config 面（theme 等 = getGlobalConfig 读 .atlas.json，与 settings.json 两系统）：
  // 沙箱未设 ATLAS_CONFIG_DIR → 新路径 $home/.atlas.json；清 legacy $home/.atlas/.config.json
  // （legacy 存在即优先 → 会抢读，必须 hermetic 删）。
  try { rmSync(join(home, '.atlas', '.config.json'), { force: true }) } catch { /* 不存在 */ }
  if (globalConfig) writeFileSync(join(home, '.atlas.json'), JSON.stringify(globalConfig, null, 2))
  const p = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(p, 'utf8'))
  // 三角色 + 顶层 model 对齐 CMP_MODEL（S-C 例外：baseURL 指死端口；cls 例外：指 fault-proxy）
  if (mode === 'deadgw') {
    s.providers = { iff: { ...(s.providers?.iff ?? {}), baseURL: DEAD_GW } }
  } else if (mode === 'cls') {
    // #278 波 A：IFF 指 fault-proxy（全确定性：主循环前 count 次脚本化 tool_use + 分类器 shouldBlock），
    // 非脚本化调用经 proxy 转发活网关 8999（proxy 由 runScenario 起/停，需已 UP 再 Pty.start）。
    s.providers = { iff: { ...(s.providers?.iff ?? {}), baseURL: CLS_PROXY_URL } }
  }
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  if (mode === 'fuse') s.autoCompactWindow = { kind: 'window', tokens: 16000 } // 0.1.14+ 判别联合形
  if (extraSettings) extraSettings(s)
  writeFileSync(p, JSON.stringify(s, null, 2))
}

function setupWs(sc: string, gitInit: boolean, files: Array<[string, string]>): string {
  const ws = join(ROOT, 'workspaces', sc)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  if (gitInit) {
    const r = spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
    if (r.status !== 0) console.error(`[ws ${sc}] git init failed（非致命，S-F 等场景故意不用）`)
  }
  for (const [name, content] of files) writeFileSync(join(ws, name), content)
  // gitInit 后做初始 commit：让初始文件进 HEAD → agent 编辑后 `git diff` 有内容
  // （Diff 页取 git 工作树 diff；不 commit 则文件 untracked → git diff 空 → Diff 页空态）
  if (gitInit && files.length > 0) {
    spawnSync('git', ['add', '-A'], { cwd: ws, stdio: 'ignore' })
    spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: ws, stdio: 'ignore' })
  }
  return ws
}

const NOTE_TXT = '苹果是红色水果。香蕉是黄色水果。葡萄是紫色水果。\n'
/** 大文件（~60KB）：把上下文快速推向小 autoCompactWindow（S-B 熔断预警触发器） */
const BIG_TXT = Array.from({ length: 600 }, (_, i) => `第${i + 1}条：${'上下文填充行。'.repeat(4)}`).join('\n')
const S2_EDIT_PROMPT =
  'In calc.js, change the add() function so it takes a third argument `c` that defaults to 0 and returns a + b + c. Keep the existing console.log lines working and add one more console.log demonstrating the new third argument.'
const SKILL_PROMPT = 'Use the summarize-numbers skill on data.json and report what it returns.'
const READ_PROMPT = '读取 note.txt 并用一句话总结。'
const BASH_ASK_PROMPT = '请运行 Bash 命令 `touch /tmp/atlas-p0a-probe` 创建一个临时文件，然后报告完成情况。'

// ── 场景执行框架 ──────────────────────────────────────────────────────────
interface ScenarioSpec {
  id: string
  phase: 'P0' | 'P1' | 'P2' | 'P024' | 'A4F' | 'THEMES' | 'FOOTER80'
  seed: SeedMode
  wsFiles: Array<[string, string]>
  gitInit: boolean
  extraWs?: (ws: string) => void
  steps: (pty: Pty, ws: string) => Promise<void>
  probes: Probe[]
  /** 场景级 TUI 启动 args（覆盖全局 --dangerously-skip-permissions；P0a 用非 skip 触发审批弹框） */
  tuiArgs?: string
  /** seed 额外 settings 注入（P0a：S-A 加 ask 规则让 rule 面可观测） */
  extraSettings?: (s: Record<string, any>) => void
  /** seed 全局 config 面注入（写 $home/.atlas.json，getGlobalConfig 读；theme 走此面，**非** settings.json——
   *  0.1.31 gate 首跑定因：settings.theme 不进产品，6 主题全渲默认色 = 注入面选错）。 */
  globalConfig?: Record<string, any>
  /** 场景级 TUI 进程 env 注入（FEATURE_* 等；Pty.start 前设、后还原——当前无使用方，保留给后续 feature-flag 门控场景） */
  env?: Record<string, string>
  /** soft 探针的触发条件（false → INCONCLUSIVE） */
  softTriggers?: Record<string, boolean>
  /** 回合后额外宽限（渲染 flush） */
  graceMs?: number
  /** #278 波 A（seed 'cls'）：fault-proxy 全确定性脚本化（主循环 tool_use + 分类器 shouldBlock）。
   *  仅 seed==='cls' 生效：runScenario 起 proxy（baseURL 指 :8998）→ Pty.start → 停 proxy。 */
  proxy?: { mainLoop?: MainLoopScript; classifier?: ClassifierInjection }
  /** 跑前 fixture 清理（绝对路径，runScenario 起 proxy 前 rm -f，保场景 hermetic）。
   *  写固定 /tmp 路径的场景必须清上一轮残留：残留文件触发产品「先读后写」规则拦 Write
   *  → 分类器支不可达 → 探针假红（2026-10-06 S-024O 实例：c1a563a 轮残留
   *  /tmp/atlas-a4f-cls-safe.txt → dc0b37f 复跑 #4 假红，proxy 0 classify_result REQ）。 */
  preClean?: string[]
}

interface ScenarioResult {
  id: string
  phase: string
  alive: boolean
  ws: string
  log: string
  probes: ProbeResult[]
  hardFail: number
  softInconclusive: number
  notes: string[]
}

async function runScenario(spec: ScenarioSpec, runDir: string): Promise<ScenarioResult> {
  const home = join(ROOT, 'home', spec.id)
  const ws = setupWs(spec.id, spec.gitInit, spec.wsFiles)
  if (spec.extraWs) spec.extraWs(ws)
  await seedHome(home, spec.seed, spec.extraSettings, spec.globalConfig)
  const logPath = join(runDir, `${spec.id}.log`)
  const prevArgs = process.env.ATLAS_E2E_TUI_ARGS
  if (spec.tuiArgs) process.env.ATLAS_E2E_TUI_ARGS = spec.tuiArgs
  const prevEnv: Record<string, string | undefined> = {}
  for (const k of Object.keys(spec.env ?? {})) {
    prevEnv[k] = process.env[k]
    process.env[k] = spec.env![k]
  }
  // hermetic：跑前 fixture 清理（写固定 /tmp 路径的场景清上一轮残留，防「先读后写」拦 Write）
  for (const p of spec.preClean ?? []) {
    try { rmSync(p, { force: true }) } catch { /* 清理失败不致命（残留仍在则按残留口径诊断） */ }
  }
  // #278 波 A（seed 'cls'）：起 fault-proxy（全确定性：主循环前 count 次脚本化 + 分类器 shouldBlock），
  // baseURL 已指 :8998（seedHome 'cls'）。proxy 需 UP 于 TUI 首条 LLM 调用前（Pty.start 后 REPL 起即发请求）。
  let proxyHandle: { stop: () => void } | undefined
  let proxyNote: string | undefined
  if (spec.seed === 'cls') {
    try {
      proxyHandle = await startFaultProxy({
        port: CLS_PROXY_PORT,
        target: LIVE_GW,
        plan: { kind: 'nominal', mainLoop: spec.proxy?.mainLoop },
        classifier: spec.proxy?.classifier,
        logPath: join(runDir, `${spec.id}.proxy.log`),
      })
      proxyNote = `cls proxy UP :${CLS_PROXY_PORT}→${LIVE_GW} (mainLoop=${spec.proxy?.mainLoop?.toolName ?? 'none'}/count=${spec.proxy?.mainLoop?.count ?? 1}, classifier.shouldBlock=${spec.proxy?.classifier?.shouldBlock ?? 'none'})`
    } catch (e: any) {
      proxyNote = `cls proxy 启动失败: ${String(e?.message ?? e).slice(0, 200)}（baseURL 指 :${CLS_PROXY_PORT} 但 proxy 未 UP → LLM 调用将失败）`
    }
  }
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath }, 120_000)
  if (prevArgs === undefined) delete process.env.ATLAS_E2E_TUI_ARGS
  else process.env.ATLAS_E2E_TUI_ARGS = prevArgs
  for (const k of Object.keys(prevEnv)) {
    if (prevEnv[k] === undefined) delete process.env[k]
    else process.env[k] = prevEnv[k]
  }
  const notes: string[] = []
  if (proxyNote) notes.push(proxyNote)
  try {
    await spec.steps(pty, ws)
  } catch (e: any) {
    notes.push(`steps 异常: ${String(e?.message ?? e).slice(0, 200)}`)
  }
  await sleep(spec.graceMs ?? 10_000) // 渲染 flush 宽限（spinner 帧尾）
  const text = pty.sinceText().replace(/\t/g, ' ') // sinceText 已 stripAnsi（保留 \n 供逐行探针：UA-why-no-cjk 的 [^\n]* 与 a5default 的 ^ 锚依赖逐行）；仅 \t 折空格
  const probes = spec.probes.map(p => evalProbe(text, p, spec.softTriggers?.[p.id] ?? true))
  const hardFail = probes.filter(pr => pr.hard && pr.ok === false).length
  const softInconclusive = probes.filter(pr => pr.ok === null).length // 含 hard 触发未达（键位未注入）
  const alive = pty.alive()
  pty.kill()
  proxyHandle?.stop() // #278 波 A：回收 fault-proxy（端口释放，下场景/下波不撞）
  const res: ScenarioResult = {
    id: spec.id, phase: spec.phase, alive, ws, log: logPath, probes, hardFail, softInconclusive, notes,
  }
  process.stderr.write(
    `[${spec.id}] alive=${alive} hardFail=${hardFail} soft?= ${softInconclusive}\n  ` +
      probes.map(pr => `${pr.id}=${pr.ok === true ? '✅' : pr.ok === false ? '❌' : '?'} (${pr.evidence[0]?.slice(0, 90)})`).join('\n  ') + '\n',
  )
  return res
}

// ── 场景定义 ──────────────────────────────────────────────────────────────
const S_A: ScenarioSpec = {
  id: 'S-A', phase: 'P0', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default', // 非 skip：default 模式触发 ask 弹框（P0a 核心探针面）
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.ask = ['Bash'] }, // 整工具 ask 规则（无 content）命中 permissions.ts 1b 弹框；TUI 车道 BashTool.checkPermissions 恒-allow stub，内容规则无执行点
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // P0a：非 allowlist Bash（文件写入）→ default 模式弹「Do you want to proceed?」→ 数字 1 直选 Yes 批准
    pty.send(BASH_ASK_PROMPT)
    const popup = await pty.waitAnySince(['Do you want to proceed', 'Bash command'], 90_000)
    if (popup.ok) pty.sendRaw('1') // Main 钉死：1=Yes 数字直选（不依赖焦点；y/n 在 Bash 弹框是空操作勿用）
    await pty.settle(15_000, 150_000) // 卡片结果态 + 内联 why（rule/classifier/mode）
    // 回归护底：/model fast（modelFast/whoRole）+ 读 note（ctxPct）
    pty.send('/model fast')
    await pty.settle(5_000, 60_000) // /model 是 local-jsx，秒级返回
    pty.send(READ_PROMPT)
    await pty.settle(15_000, 150_000) // Atlas 常驻 spinner → settle 常超时；探针走全量文本，超时不致命
  },
  probes: [P.verdict, P.rule, P.noConf, P.cardAllow, P.cardDeny, P.whoRole, P.modelFast, P.ctxPct, P.fallback],
  softTriggers: { 'P0-3-deny': false, 'P0-1a-fallback': false }, // S-A 走批准面；deny 需 deny fixture；回退难强制
}

const S_B: ScenarioSpec = {
  id: 'S-B', phase: 'P0', seed: 'fuse', gitInit: true,
  wsFiles: [['big.txt', BIG_TXT]],
  steps: async pty => {
    pty.send('读取 big.txt 并用一句话总结。')
    await pty.settle(15_000, 150_000)
  },
  probes: [P.ctxPct, P.fuse],
  softTriggers: { 'P0-1c-fuse': true }, // 16k 窗口 + 60KB 文件 → 必逼近阈值
}

const S_C: ScenarioSpec = {
  id: 'S-C', phase: 'P0', seed: 'deadgw', gitInit: true,
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    pty.send(READ_PROMPT)
    await sleep(10_000) // 死端口 → 回合快速失败，不需长 settle
  },
  probes: [P.gwDown, P.gwManual, P.gwDoctor],
}

const S_D: ScenarioSpec = {
  id: 'S-D', phase: 'P1', seed: 'live', gitInit: true,
  wsFiles: [],
  steps: async pty => {
    pty.send('依次创建 a.txt（内容 A）、b.txt（内容 B）、c.txt（内容 C），最后运行 ls 确认三个文件都在。完成后简要汇报。')
    await pty.settle(15_000, 150_000)
  },
  probes: [P.plan],
}

const S_E: ScenarioSpec = {
  id: 'S-E', phase: 'P1', seed: 'live', gitInit: true,
  wsFiles: [['calc.js', 'function add(a, b) {\n  return a + b;\n}\n\nfunction multiply(a, b) {\n  return a * b;\n}\n\nconsole.log("2 + 3 =", add(2, 3));\nconsole.log("4 * 5 =", multiply(4, 5));\n']],
  steps: async (pty, ws) => {
    pty.send(S2_EDIT_PROMPT)
    await pty.settle(15_000, 150_000)
    // 展开/折叠无数据丢失：ctrl+o 展开工具卡 → 应见 unified hunk
    pty.sendRaw('\x0f')
    await pty.settle(4_000, 30_000)
    // diskCheck（功能面回归护底）
    try {
      const src = readFileSync(join(ws, 'calc.js'), 'utf8')
      const ok = /function\s+add\s*\(\s*a\s*,\s*b\s*,\s*c\s*=\s*0\s*\)/.test(src)
      process.stderr.write(`[S-E] diskCheck=${ok}\n`)
    } catch (e: any) {
      process.stderr.write(`[S-E] diskCheck read failed: ${e?.message}\n`)
    }
  },
  probes: [P.diffInline, P.diffExpand],
}

const S_F: ScenarioSpec = {
  id: 'S-F', phase: 'P1', seed: 'live', gitInit: false, // 故意不 git init：G2 残余场景（非 git 项目）
  wsFiles: [['data.json', JSON.stringify({ values: [1, 2, 3, 4, 5] }, null, 2)]],
  extraWs: ws => {
    // 项目 skill（.atlas/skills/summarize-numbers），复用 compare 的 atlas 版 fixture
    cpSync(join(FIX_COMPARE, 'atlas-summarize'), join(ws, '.atlas', 'skills', 'summarize-numbers'), { recursive: true })
  },
  steps: async pty => {
    pty.send(SKILL_PROMPT)
    await pty.settle(15_000, 150_000)
  },
  probes: [P.skillLoaded, P.skillUnknown],
}

const S_G: ScenarioSpec = {
  id: 'S-G', phase: 'P2', seed: 'live', gitInit: true,
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // P2 触发器（↻ 重跑）以 Main 定稿为准；TRIGGER 环境变量注入（如 'Ctrl+R' 对应控制字节）
    pty.send(READ_PROMPT)
    await pty.settle(15_000, 150_000)
    const trig = process.env.TUI_DIFF_RERUN_TRIGGER
    if (trig) pty.sendRaw(Buffer.from(trig, 'hex').toString('binary'))
    else process.stderr.write('[S-G] TUI_DIFF_RERUN_TRIGGER 未设 → 重跑触发跳过（P2 待 Main 定稿触发键/命令）\n')
  },
  probes: [P.rerunSupp],
}

const S_H: ScenarioSpec = {
  id: 'S-H', phase: 'P1', seed: 'live', gitInit: true,
  wsFiles: [['calc.js', 'function add(a, b) {\n  return a + b;\n}\n\nfunction multiply(a, b) {\n  return a * b;\n}\n\nconsole.log("2 + 3 =", add(2, 3));\nconsole.log("4 * 5 =", multiply(4, 5));\n']],
  steps: async pty => {
    // 1. 产生 diff（复用 S-E 编辑：add() 加第三参 c=0）
    pty.send(S2_EDIT_PROMPT)
    await pty.settle(15_000, 150_000)
    // 2. '1' 键打开 Diff 页（'1' 在 SidePanel context，openSidePanel handler 无
    //    !isSidePanelOpen 守卫 → 始终 openSidePanel('diff')；/sidebar 命令 R1 已修注册可用，
    //    但 '1' 键更稳不依赖输入提交时序。TUI_DIFF_SIDEBAR_OPEN 注入 hex）
    const openKey = process.env.TUI_DIFF_SIDEBAR_OPEN
    if (openKey) pty.sendRaw(Buffer.from(openKey, 'hex').toString('binary'))
    else process.stderr.write('[S-H] TUI_DIFF_SIDEBAR_OPEN 未设 → 侧栏打开跳过\n')
    await pty.settle(6_000, 30_000)
    // 3. 切 side-by-side（ctrl+shift+d）。setupWs 已初始 commit → agent 编辑 calc.js 后
    //    git diff 有内容 → Diff 页有 hunk → 切 SBS 后 ⇄ 双列真实渲染。
    //    xterm modifyOtherKeys \x1b[27;6;100~（hex 1b5b32373b363b3130307e，1-based modifier 6=ctrl+shift，
    //    Main R1 确认正确不变）；kitty CSI u 形修后 = \x1b[100;5u（hex 1b5b3130303b3575，0-based）。
    //    TUI_DIFF_SIDEBAR_SBS 注入 hex；未注入 → 跳过，探针 INCONCLUSIVE）
    const sbsKey = process.env.TUI_DIFF_SIDEBAR_SBS
    if (sbsKey) pty.sendRaw(Buffer.from(sbsKey, 'hex').toString('binary'))
    else process.stderr.write('[S-H] TUI_DIFF_SIDEBAR_SBS 未设 → side-by-side 切换跳过\n')
    await pty.settle(6_000, 30_000)
    // 4. Esc 关（人工核：侧栏消失、消息流恢复）—— 发 Esc 留痕
    pty.sendRaw('\x1b')
    await pty.settle(3_000, 20_000)
  },
  // open/diff-sbs 自动探针 + diffInline 护底（unified 默认可见，延续 G1 #258）
  // close/split/jump 人工核（验收单判定区填，PLAN §5 红线核验模式）
  probes: [P.sideOpen, P.diffSbs, P.diffInline],
  softTriggers: {
    // open 走 '1' 键（需 TUI_DIFF_SIDEBAR_OPEN 注入）；sbs 走 ctrl+shift+d（需 SBS 注入）
    'P1a-open': !!(process.env.TUI_DIFF_SIDEBAR_OPEN),
    'P1a-diff-sbs': !!(process.env.TUI_DIFF_SIDEBAR_SBS),
  },
}

// ── 0.1.24 逐项场景（A2/A3/A4-rule-ask/A5 键位由数字直选 + shift+tab 驱动，f4 定稿「无新增键位」）──
// ask=['Bash'] + default 模式：rule 面 option 序 = 1 Yes / 2 Enable automode / 3 No（无 always，见 §#263）。
// A3 模态 option 序 = 1 Confirm / 2 Cancel。shift+tab = \x1b[Z（Linux VT mode，defaultBindings MODE_CYCLE_KEY）。
// 不可 PTY 强制触发面（A1 always/A4 rule-allow·classifier·mode·bypass：verdict 仅 Bash/PowerShell 渲染 +
// default 模式无 classifier + #263 auto-allow 门）→ softTriggers=false → INCONCLUSIVE（f4 白盒已核 6 句式）。
const S_024A: ScenarioSpec = {
  id: 'S-024A', phase: 'P024', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default',
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.ask = ['Bash'] },
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // A4 rule(ask) why 句 + A2 No 不退出：Bash 弹框 → 选 No(3) → session 存活、agent 继续
    pty.send(BASH_ASK_PROMPT)
    const popup = await pty.waitAnySince(['Do you want to proceed', 'Bash command'], 90_000)
    if (popup.ok) pty.sendRaw('3') // 3=No（数字直选；2=Enable automode 走 A3）
    await pty.settle(15_000, 150_000)
  },
  probes: [P024.a4rask, P024.a2surv, P024.a2feed, P024.a2esc, P024.uawhy],
  softTriggers: { 'A2-esc-no-feedback': false }, // Esc 面未驱动（本场驱动 No）→ INCONCLUSIVE
}

const S_024B: ScenarioSpec = {
  id: 'S-024B', phase: 'P024', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default',
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.ask = ['Bash'] },
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // A3 确认门：选 Enable automode(2) → 模态 Entering automode → Cancel(2) 停留 default
    pty.send(BASH_ASK_PROMPT)
    const popup = await pty.waitAnySince(['Do you want to proceed', 'Bash command'], 90_000)
    if (popup.ok) pty.sendRaw('2') // 2=Enable automode → A3 模态
    await pty.settle(4_000, 30_000) // 模态渲染（Entering automode / Switch back）
    pty.sendRaw('2') // 2=Cancel → 回原 option 列表
    await pty.settle(3_000, 20_000)
    pty.sendRaw('\x1b') // Esc 关原 option 列表
    await pty.settle(8_000, 60_000)
  },
  probes: [P024.a3modal, P024.a3notsw, P024.a3cancel],
}

const S_024C: ScenarioSpec = {
  id: 'S-024C', phase: 'P024', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default',
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.ask = ['Bash'] },
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // A3 Confirm(1) → 切 automode enabled（切模 + re-dispatch）→ shift+tab 循环摘 A5 三标签
    pty.send(BASH_ASK_PROMPT)
    const popup = await pty.waitAnySince(['Do you want to proceed', 'Bash command'], 90_000)
    if (popup.ok) pty.sendRaw('2') // Enable automode → A3 模态
    await pty.settle(4_000, 30_000)
    pty.sendRaw('1') // 1=Confirm → automode enabled
    await pty.settle(8_000, 60_000)
    // 循环（auto→default→acceptEdits→plan→bypass→…）5 次，摘 default / bypass enabled / automode enabled
    for (let i = 0; i < 5; i++) { pty.sendRaw('\x1b[Z'); await pty.settle(2_000, 20_000) }
    await pty.settle(4_000, 30_000)
  },
  probes: [P024.a3sw, P024.a5auto, P024.a5default, P024.ualbl],
  // 注：a5bypass 移到 S-024H（default 模式 isBypassPermissionsModeAvailable=false → shift+tab 摘不到 bypass）
}

const S_024D: ScenarioSpec = {
  id: 'S-024D', phase: 'P024', seed: 'fuse', gitInit: true,
  wsFiles: [['big.txt', BIG_TXT]],
  steps: async pty => {
    // B2 熔断折入 context-bar 段 ▲（黄）：16k 小窗口 + 60KB 文件逼近阈值
    pty.send('读取 big.txt 并用一句话总结。')
    await pty.settle(15_000, 150_000)
  },
  probes: [P024.b2tri, P024.b2pct, P024.b1fast, P024.b1gone],
  softTriggers: { 'B1-fallback-fast': false, 'B1-fallback-gone': false }, // 回退难强制 → INCONCLUSIVE
}

const S_024E: ScenarioSpec = {
  id: 'S-024E', phase: 'P024', seed: 'live', gitInit: true,
  wsFiles: [['calc.js', 'function add(a, b) {\n  return a + b;\n}\n\nfunction multiply(a, b) {\n  return a * b;\n}\n\nconsole.log("2 + 3 =", add(2, 3));\nconsole.log("4 * 5 =", multiply(4, 5));\n']],
  steps: async pty => {
    // C 波回退核：编辑产生 diff（cdiff）→ /sidebar 未注册（csbunk）→ 1-5 键不开抽屉（csb/cnum 归零）
    pty.send(S2_EDIT_PROMPT)
    await pty.settle(15_000, 150_000)
    pty.send('/sidebar')
    await pty.settle(4_000, 30_000) // Unknown skill: sidebar
    for (const k of ['1', '2', '3', '4', '5']) { pty.sendRaw(k); await pty.settle(600, 6_000) }
    await pty.settle(4_000, 30_000)
  },
  probes: [P024.cdiff, P024.csbunk, P024.csb, P024.cnum],
}

const S_024F: ScenarioSpec = {
  id: 'S-024F', phase: 'P024', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default',
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.ask = ['Bash'] },
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // 不可 PTY 强制触发面（#263 auto-allow + verdict 仅 Bash/PowerShell 渲染 + classifier 非确定）：
    // 跑一次 ask 面产生文本；探针软触发=false → 全 INCONCLUSIVE（f4 白盒已核 permissionVerdict 6 句式 + Main 单测覆盖）
    pty.send(BASH_ASK_PROMPT)
    const popup = await pty.waitAnySince(['Do you want to proceed', 'Bash command'], 90_000)
    if (popup.ok) pty.sendRaw('\x1b')
    await pty.settle(8_000, 60_000)
  },
  probes: [P024.a1allow, P024.a1nodlg, P024.a1danger, P024.a4rallow, P024.a4cls, P024.a4clsa, P024.a4mode, P024.a4bypass],
  softTriggers: {
    'A1-allow-reason': false, 'A1-no-dialog': false, 'A1-dangerous-no-always': false,
    'A4-rule-allow': false, 'A4-classifier-dangerous': false, 'A4-classifier-approved': false,
    'A4-mode': false, 'A4-bypass': false,
  },
}

const S_024G: ScenarioSpec = {
  id: 'S-024G', phase: 'P024', seed: 'deadgw', gitInit: true,
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // B3 降级砍时核既有错误行不回归（≡ P0 S-C）：死端口 → Connection error 仍浮现
    pty.send(READ_PROMPT)
    await sleep(10_000)
  },
  probes: [P024.b3gw, P024.b3err],
  softTriggers: { 'B3-gw-down': false }, // B3 已批准砍 → INCONCLUSIVE
}

const S_024H: ScenarioSpec = {
  id: 'S-024H', phase: 'P024', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode bypassPermissions', // bypass 启动 → isBypassPermissionsModeAvailable=true → 摘 bypass enabled 标签
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    // A5 bypass enabled（statusline 三标签之三；default 模式 shift+tab 摘不到，需 bypass 启动）
    pty.send(READ_PROMPT)
    await pty.settle(15_000, 150_000)
  },
  probes: [P024.a5bypass],
}

// ── A4 家族补测（2026-10-05 f4 任务：逐条强制触发 rule-allow / classifier×2 / mode / bypass）──
// A4F = A4 家族 6 句 + A1×3 实证。当前分两段：
//  （旧段 S-024I/J/K）0.1.25 #265 重验时判定：rule-allow/bypass 走 2b/2a 恒 auto-allow（无 ask 面）、
//   classifier×2 需 BASH_CLASSIFIER（off）+ 自动分类器 → 当时无法在 ASK 面强制触发（FAIL[soft]=unreachable）。
//  0.1.26 用户裁定「P0 封口前强修 A4×4 做成可达/绿」→ 本段探针升级：
//   - rule-allow/bypass/classifier-approved → **allow 面（成功卡 tool-result，非 "Do you want to proceed?" ASK 面）**
//   - classifier-dangerous → ASK 面（auto 模式 + BASH_CLASSIFIER，危险命令弹框显 flagged-as-dangerous）
//   - mode → ASK 面（S-024L，0.1.26 修 decisionReason 透传后翻 PASS）
// allow 面渲染面 = 0.1.26 新增面（当前 verdictLine 只渲染 ASK 面 BashPermissionRequest/PS），判据按 §4b A4 六句定稿。
const S_024I: ScenarioSpec = {
  id: 'S-024I', phase: 'A4F', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default',
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.allow = ['Bash'] },
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    pty.send('请运行 Bash 命令 `touch /tmp/atlas-a4f-allow` 创建一个临时文件，然后报告完成情况。')
    await pty.settle(15_000, 150_000)
  },
  probes: [
    { id: 'A4F-seed-default', gate: 'A4F control', desc: 'default 模式生效（allow seed）', re: /▶\s*default/i, hard: true },
    { ...P024.a4rallow, id: 'A4-rule-allow-allowface', desc: '0.1.26 allow 面：allow 规则自动放行 → 成功卡显 Allowed by rule "<v>" (<source>).' },
    { ...P024.a1nodlg, id: 'A1-no-dialog', desc: 'A1 always：allow 规则命中 → 不再弹 Do you want to proceed' },
  ],
}
const S_024J: ScenarioSpec = {
  id: 'S-024J', phase: 'A4F', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode bypassPermissions',
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    pty.send('请运行 Bash 命令 `touch /tmp/atlas-a4f-bypass` 创建一个临时文件，然后报告完成情况。')
    await pty.settle(15_000, 150_000)
  },
  probes: [
    P024.a5bypass, // hard：bypass seed 生效
    { ...P024.a4bypass, id: 'A4-bypass-allowface', desc: '0.1.26 allow 面：bypass 启动 → 成功卡显 Bypass mode — all commands allowed.' },
  ],
}
const S_024K: ScenarioSpec = {
  id: 'S-024K', phase: 'A4F', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode auto',
  extraSettings: s => { s.permissions = s.permissions ?? {}; s.permissions.ask = ['Bash'] },
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    pty.send('请运行 Bash 命令 `touch /tmp/atlas-a4f-auto` 创建一个临时文件，然后报告完成情况。')
    await pty.settle(15_000, 150_000)
  },
  probes: [
    P024.a5auto, // hard：auto seed 生效
    { ...P024.a4cls, id: 'A4-classifier-dangerous-ctrl', hard: false, desc: 'BASH_CLASSIFIER off：classifier-dangerous 应缺席（对照面）' },
    { ...P024.a4clsa, id: 'A4-classifier-approved-ctrl', hard: false, desc: 'BASH_CLASSIFIER off：classifier-approved 应缺席（对照面）' },
    { ...P024.a4mode, id: 'A4-mode-ctrl', hard: false, desc: 'auto 模式不显 mode 句（default 句是 S-024L 专属）' },
  ],
}
// 0.1.26 A4 classifier 两句（auto 模式 + 无规则 → auto-mode yolo 分类器路径）。
// Main 白盒结论（msg efc9fea3 回）：bashClassifier.ts 是 ANT-ONLY stub 且 buildPendingClassifierCheck
// 首步 if(!isClassifierPermissionsEnabled()) return undefined → pendingClassifierCheck 恒 undefined →
// feature('BASH_CLASSIFIER') 异步检永不跑 → classifierAutoApproved 永不 true，注 flag 不产生任何分类结果。
// 真分类器 = permissions.ts:505 门 feature('TRANSCRIPT_CLASSIFIER')(ON_BY_DEFAULT)+mode=auto →
// classifyYoloAction=真 LLM（yoloClassifier.ts 需 gateway+live 模型）。唯一产
// decisionReason:{type:'classifier',classifier:'auto-mode'} 处 = permissions.ts:755-763/770-778。
// ⇒ 两句 PTY 不可强制（stub 恒 matches:false，auto-mode 分类器需真模型）→ softTriggers=false → INCONCLUSIVE
// （记产品局限，同 B1 fallback 口径），不硬塞「全六句 e2e 绿」。可测断言面由 Main 判别单测钉
// permissionVerdict.ts:50 verdictLine 覆盖（verdictLine({type:'classifier',...},'auto','Bash',true/false)）。
// S-024N/O 仍实跑（观察 auto-mode 无规则 + 危险/安全命令在 stub 下的实际行为留证，.log 供未来 live 模型对比）。
// #278 波 C（0.1.27，spec §4 C.1/C.2）回填：seed 'cls'（fault-proxy 全确定性）+
// Write 到 CWD 外（/tmp，唯一 toAutoClassifierInput 非空工具；Bash 恒 '' 永不进分类器）
// + 分类器脚本 shouldBlock:true → 波 C 交互面拦截（d64467c）：behavior:'ask' +
// decisionReason{type:'classifier',classifier:'auto-mode',reason} → ASK 弹框 verdict 行
// 渲 A4 危险句「Auto mode: classifier flagged this as dangerous.」（steerable-trust）。
// 【0.1.27 P0 崩修（1b47c39，#279）后可达性已实定】：此前「engine 门快路径短路→分类器
// 架构不可达」两版结论被 e2e 23:30 决定性实证推翻（r-20261005-2330）——engine 门对 CWD 外
// Write 返 ask（非短路）→ TUI auto-mode 支真进入 → classifyYoloAction 被调但崩于 metadata
// dev stub（getPromptCache1hAllowlist 返 {} → allowlist.some TypeError）。崩修（should1hCacheTTL
// 双守卫 + bootstrapState getter→null）落地后分类器链复活，本探针转 hard（P0 封口判据）。
const S_024N: ScenarioSpec = {
  id: 'S-024N', phase: 'A4F', seed: 'cls', gitInit: true,
  tuiArgs: 'code --permission-mode auto',
  wsFiles: [['note.txt', NOTE_TXT]],
  preClean: ['/tmp/atlas-a4f-cls-danger.txt'], // hermetic：清上一轮残留（防「先读后写」拦 Write）
  proxy: {
    mainLoop: { toolName: 'Write', arguments: { file_path: '/tmp/atlas-a4f-cls-danger.txt', content: 'danger' }, count: 1 },
    classifier: { shouldBlock: true, reason: 'deletes/overwrites outside workspace — destructive' },
  },
  steps: async pty => {
    pty.send('请用 Write 工具把内容 "danger" 写入文件 /tmp/atlas-a4f-cls-danger.txt，然后报告完成情况。')
    await pty.settle(15_000, 150_000) // Write → 引擎门 ask? → TUI 分类器（脚本 shouldBlock:true）→ 波 C 交互面 ASK + A4 危险句
    pty.sendRaw('\x1b') // Esc 关 ASK 弹框（留证，不批准危险写）
    await pty.settle(4_000, 30_000)
  },
  probes: [
    P024.a5auto, // hard：auto seed 生效
    // 0.1.27 P0 封口判据（崩修后转 hard）：shouldBlock:true → 波 C 交互面 ASK 弹框渲危险句。
    // 不命中 = 真 FAIL（非 INCONCLUSIVE）——崩修已落，分类器链可达，无「不可强制」支。
    { ...P024.a4cls, hard: true, desc: '0.1.27 #3 危险句（P0 封口）：shouldBlock:true → ASK 弹框渲 A4-classifier-dangerous 句（崩修后分类器可达）' },
  ],
}
// #278 波 A（全确定性种子，f4 §3.B.2 定稿 + 用户拍板「全确定性」）：
// seed 'cls' → IFF 指 fault-proxy（:8998），主循环前 count 次脚本化 Write tool_use
// + classify_result 注入 shouldBlock:false → Write 到 CWD 外（/tmp）落 auto-mode yolo 分类器
// （Write.toAutoClassifierInput 非空 + acceptEdits 对 CWD 外写返 ask，非 allow）→
// permissions.ts:770-778 allow（decisionReason {type:'classifier',classifier:'auto-mode',reason}）
// → useCanUseTool.tsx setYoloClassifierApproval → 成功卡「Auto-approved by classifier: <reason>.」。
// 产品码 100% 真实，仅两处 LLM 输出（主循环 tool_use + 分类器 shouldBlock）脚本化。
// 旧 S-024O 用 Bash `touch` 作废：BashTool.toAutoClassifierInput==='' 永不进分类器。
const S_024O: ScenarioSpec = {
  id: 'S-024O', phase: 'A4F', seed: 'cls', gitInit: true,
  tuiArgs: 'code --permission-mode auto',
  wsFiles: [['note.txt', NOTE_TXT]],
  preClean: ['/tmp/atlas-a4f-cls-safe.txt'], // hermetic：清上一轮残留（防「先读后写」拦 Write）
  proxy: {
    // 全确定性：主循环第 1 次 chat 固定 Write(/tmp/atlas-a4f-cls-safe.txt, 'hello')
    mainLoop: { toolName: 'Write', arguments: { file_path: '/tmp/atlas-a4f-cls-safe.txt', content: 'hello' }, count: 1 },
    // #4 自动放行：分类器放行（shouldBlock:false）→ 成功卡 classifier-approved 句现形
    classifier: { shouldBlock: false, reason: 'Action stays within expected scope and matches no hard-block condition' },
  },
  steps: async pty => {
    pty.send('请用 Write 工具把内容 "hello" 写入文件 /tmp/atlas-a4f-cls-safe.txt，然后报告完成情况。')
    await pty.settle(15_000, 150_000) // Write → 分类器（脚本放行）→ allow → 成功卡 classifier 句 + 主循环 call#2 转发 live 报告
  },
  probes: [
    P024.a5auto, // hard：auto seed 生效
    // 0.1.27 P0 封口判据（崩修后转 hard）：full-det seed（主循环脚本 Write→/tmp + 分类器
    // shouldBlock:false）→ 成功卡「Auto-approved by classifier: <reason>.」（#4 自动放行现形）。
    // 不命中 = 真 FAIL——崩修已落（分类器链复活），无「不可强制」支。
    { ...P024.a4clsa, hard: true, desc: '0.1.27 #4 自动放行（P0 封口）：分类器脚本放行 → 成功卡 Auto-approved by classifier: <reason>.（崩修后分类器可达）' },
  ],
}

// #265 重验补测：default 模式无规则写命令现应问（mode 句）+ 危险前缀无 always（A1 dangerous）。
const S_024L: ScenarioSpec = {
  id: 'S-024L', phase: 'A4F', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default', // 无 ask/allow 规则：#265 前恒 auto-allow，#265 后应弹框
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    pty.send('请运行 Bash 命令 `touch /tmp/atlas-a4r-mode` 创建一个临时文件，然后报告完成情况。')
    await pty.settle(5_000, 40_000) // 弹框 flush；不选则留证（Esc 兜底关）
    pty.sendRaw('\x1b')
    await pty.settle(4_000, 30_000)
  },
  probes: [
    { id: 'A4F-seed-default2', gate: 'A4F control', desc: 'default 模式生效', re: /▶\s*default/i, hard: true },
    P024.a4mode, // hard：#265 后 mode 句应现形（default mode requires confirmation for Bash）
  ],
}
const S_024M: ScenarioSpec = {
  id: 'S-024M', phase: 'A4F', seed: 'live', gitInit: true,
  tuiArgs: 'code --permission-mode default',
  wsFiles: [['note.txt', NOTE_TXT]],
  steps: async pty => {
    pty.send('请运行 Bash 命令 `rm -rf /tmp/atlas-a4r-rm` 删除临时目录。')
    await pty.settle(5_000, 40_000) // 危险前缀弹框 flush（无 always 选项）
    pty.sendRaw('\x1b') // Esc 关，不真跑 rm
    await pty.settle(4_000, 30_000)
  },
  probes: [
    { id: 'A4F-seed-dialog', gate: 'A4F control', desc: '审批弹框现形（#265 前 rm 也静默放行）', re: /requires confirmation|Do you want to proceed/i, hard: true },
    P024.a1danger, // hard absent：危险前缀（rm）无 always/don't ask again 选项
  ],
}

// ── 0.1.31 BR-2 theme 暖金启动冒烟（gate 探针 ④：6 主题启动冒烟 dark/light + 2 ansi 抽查 + /theme 切换不炸）──
// settings.theme 注入（extraSettings）→ 启动 → 首屏 settle。**不发 prompt = 零 LLM 调用**（网关零负载，可与他车道并行）。
// tuiArgs 强制 default 模式（否则继承全局 --dangerously-skip-permissions → 状态栏渲 bypass 面，repl 探针假红）。
// 品牌色 escape **不入探针层**（探针走 sinceText().stripAnsi，色 escape 结构性不可命中，首跑已定因）→ 颜色断言 =
// 单测 ②（theme-brand-warm-gold 4 测试）+ verdict 报告侧 **raw-log SGR grep**（dark `[38;2;255;184;0m` / light `[38;2;180;83;9m` / *-ansi `[1;33m`）。
const S_024T_DARK: ScenarioSpec = {
  id: 'S-024T-dark', phase: 'THEMES', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'dark' },
  steps: async pty => { await pty.settle(8_000, 90_000) },
  probes: [
    { id: 'THEME-repl', gate: 'theme 启动冒烟', desc: 'TUI 启动稳定（状态栏 default 模式）', re: /▶\s*default/i, hard: true },
    { id: 'THEME-block', gate: '启动屏品牌行', desc: '启动屏 AtlasCode 品牌行渲染（0.1.33 探针漂移：旧 /█{6,}/ 绑旧 AH monogram（6 连 █）；0.1.33 BR-3 Beam 5×9 无 6 连 █ → 品牌行探针，mark 版本无关）', re: /AtlasCode/, hard: true },
  ],
}
const S_024T_LIGHT: ScenarioSpec = {
  id: 'S-024T-light', phase: 'THEMES', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'light' },
  steps: async pty => { await pty.settle(8_000, 90_000) },
  probes: [
    { id: 'THEME-repl', gate: 'theme 启动冒烟', desc: 'TUI 启动稳定（状态栏 default 模式）', re: /▶\s*default/i, hard: true },
    { id: 'THEME-block', gate: '启动屏品牌行', desc: '启动屏 AtlasCode 品牌行渲染（0.1.33 探针漂移：旧 /█{6,}/ 绑旧 AH monogram（6 连 █）；0.1.33 BR-3 Beam 5×9 无 6 连 █ → 品牌行探针，mark 版本无关）', re: /AtlasCode/, hard: true },
  ],
}
const S_024T_DARK_ANSI: ScenarioSpec = {
  id: 'S-024T-dark-ansi', phase: 'THEMES', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'dark-ansi' },
  steps: async pty => { await pty.settle(8_000, 90_000) },
  probes: [
    { id: 'THEME-repl', gate: 'theme 启动冒烟', desc: 'TUI 启动稳定（ANSI 16 色档，状态栏 default）', re: /▶\s*default/i, hard: true },
    { id: 'THEME-block', gate: '启动屏品牌行', desc: '启动屏 AtlasCode 品牌行渲染（0.1.33 探针漂移：旧 /█{6,}/ 绑旧 AH monogram（6 连 █）；0.1.33 BR-3 Beam 5×9 无 6 连 █ → 品牌行探针，mark 版本无关）', re: /AtlasCode/, hard: true },
  ],
}
const S_024T_LIGHT_ANSI: ScenarioSpec = {
  id: 'S-024T-light-ansi', phase: 'THEMES', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'light-ansi' },
  steps: async pty => { await pty.settle(8_000, 90_000) },
  probes: [
    { id: 'THEME-repl', gate: 'theme 启动冒烟', desc: 'TUI 启动稳定（ANSI 16 色档，状态栏 default）', re: /▶\s*default/i, hard: true },
    { id: 'THEME-block', gate: '启动屏品牌行', desc: '启动屏 AtlasCode 品牌行渲染（0.1.33 探针漂移：旧 /█{6,}/ 绑旧 AH monogram（6 连 █）；0.1.33 BR-3 Beam 5×9 无 6 连 █ → 品牌行探针，mark 版本无关）', re: /AtlasCode/, hard: true },
  ],
}
const S_024T_SWITCH: ScenarioSpec = {
  id: 'S-024T-switch', phase: 'THEMES', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'dark' },
  steps: async pty => {
    await pty.settle(8_000, 90_000) // 启动冒烟（dark）
    pty.send('/theme') // 开主题选择器（ThemePicker）
    await pty.waitAnySince(['light-daltonized', 'light-ansi'], 30_000) // Select 全选项渲染（THEME_SETTINGS 7 项）
    pty.sendRaw('\x1b[B') // 下移 1：dark → light（THEME_SETTINGS 序 auto/dark/light/…）
    pty.sendRaw('\r') // Enter 确认切换（updateSettingsForSource 双写 userSettings）
    await pty.settle(8_000, 90_000) // 切换后重渲（不炸）
  },
  probes: [
    { id: 'THEME-repl', gate: 'theme 切换不炸', desc: '切换后 TUI 仍存活（状态栏）', re: /▶\s*default/i, hard: true },
    { id: 'THEME-picker', gate: 'theme 切换', desc: 'Select 选项标签现形（"Dark mode"/"Light mode (ANSI colors only)" 显示名；非 raw 值——首跑定因）', re: /Dark mode|Light mode \(ANSI colors only\)/i, hard: false },
  ],
}

// 0.1.34 C3（O-11 footer 三通道 80 列窄屏）：80×24 场景（driver env 化 ATLAS_E2E_COLS/ROWS，默认 200×50 零影响存量）。
// hard 面 = 状态段左栏（flexShrink=0）80 列下核心 token 在场（O-11 ① 空间截断，确定性、与 install-type 无关）；
// 提示窗口让位（O-11 ② tips 让位，15s 窗口）= 源级引 a2e14ce 单测 footer-npm-hint-yield（Main 裁定不强制 fire，source-direct 下提示天然不 fire）。
const S_080: ScenarioSpec = {
  id: 'S-080', phase: 'FOOTER80', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'dark' },
  env: { ATLAS_E2E_COLS: '80', ATLAS_E2E_ROWS: '24' }, // C3 窄屏（driver 起 pty 前读 env）
  steps: async pty => { await pty.settle(8_000, 90_000) },
  probes: [
    { id: 'F80-alive', gate: '80×24 窄屏存活', desc: 'TUI 80×24 启动稳定（状态栏 default 模式在场，非崩/非截断乱码）', re: /▶\s*default/i, hard: true },
    { id: 'F80-status-left', gate: '状态段左栏不截断（O-11 ①）', desc: 'footer 状态段左栏（flexShrink=0 永不截断）80 列下核心 token 在场：模型段 ⚡（O-10 Wide glyph，顺带验在场）+ 模式段 ▶ default（右栏 tips 承担溢出）', re: /⚡/, hard: true },
  ],
}

// 0.1.34 C2（O-12-B welcome/compact 框 brand→inactive）：getLayoutMode columns>=70→horizontal（:371 divider）/ <70→compact（LogoV2:285 全宽 round 框）。
// 定因（O-12-B 载体不可达根因）：compact 框（LogoV2:285，O-12-B brand→inactive 载体）只在 **full-logo 路径**渲染
//   （LogoV2:133 早退判 `!hasReleaseNotes && !showOnboarding && !ATLAS_FORCE_FULL_LOGO` → 命中即 <CondensedLogo/> 无框）；
//   hasReleaseNotes 依赖 config.lastReleaseNotesSeen（跨 run 非确定：首跑在场→full-logo，复跑已 seen→Condensed）→ 默认 PTY 走 Condensed 无框。
//   ⇒ 强制 `ATLAS_FORCE_FULL_LOGO=1`（确定性 full-logo，不依赖 release-notes 状态）+ 60 列 <70 → compact 分支 + dark 主题（inactive=153,153,153 定值）。
// hard = 60 列存活 + compact round 框角字符 `╭` 在场（borderStyle=round，compact 框渲染确认，区别于 Condensed 无框）；
//   框线 inactive SGR（dark=38;2;153;153;153m，非 brand 38;2;255;184;0m）走 raw-log grep（verdict 侧，sinceText 剥 SGR）。
const S_060: ScenarioSpec = {
  id: 'S-060', phase: 'FOOTER80', seed: 'live', gitInit: false,
  wsFiles: [],
  tuiArgs: 'code --permission-mode default',
  globalConfig: { theme: 'dark' },
  env: { ATLAS_E2E_COLS: '60', ATLAS_E2E_ROWS: '24', ATLAS_FORCE_FULL_LOGO: '1' }, // <70 compact + 强制 full-logo（O-12-B 载体）
  steps: async pty => { await pty.settle(8_000, 90_000) },
  probes: [
    { id: 'C2-alive', gate: '60×24 compact 存活', desc: 'TUI 60×24（compact 布局）启动稳定（状态栏 default 在场）', re: /▶\s*default/i, hard: true },
    { id: 'C2-compact-box', gate: 'compact round 框在场（O-12-B 载体）', desc: 'full-logo compact 分支（LogoV2:285，ATLAS_FORCE_FULL_LOGO 强制 + 60 列 <70）全宽 round 框 borderStyle=round → ╭ 角字符在场（确认 compact 框渲染，非 Condensed）→ 供框线 inactive SGR 实捕（verdict 侧 raw-log grep：border=inactive 153,153,153 非 brand 255,184,0）', re: /╭/, hard: true },
  ],
}

const ALL: Record<string, ScenarioSpec[]> = {
  P0: [S_A, S_B, S_C], // 别名 = P0a + P0b 全量
  P0a: [S_A], // 审批内联 verdict（零新数据，先做）
  P0b: [S_B, S_C], // 回退信号 + 熔断 + 网关（排 0.1.17 后）
  P1a: [S_H], // 多页面侧栏（split 抽屉，排 P0b 之后；S-H 待 Main 定稿键位/命令）
  P1: [S_D, S_E, S_F], // = P1b（计划/进度 + diff 可读性 + skill 收口）
  P2: [S_G],
  P024: [S_024A, S_024B, S_024C, S_024D, S_024E, S_024F, S_024G, S_024H], // 0.1.24 列车逐项（A/B/C/UA）
  A4F: [S_024I, S_024J, S_024K, S_024N, S_024O, S_024L, S_024M], // A4 家族 6 句 + A1×3 实证（0.1.26 波：allow 面 + classifier 面）
  THEMES: [S_024T_DARK, S_024T_LIGHT, S_024T_DARK_ANSI, S_024T_LIGHT_ANSI, S_024T_SWITCH], // 0.1.31 BR-2 theme 启动冒烟（6 主题抽查 4 + /theme 切换；零 LLM）
  FOOTER80: [S_080, S_060], // 0.1.34 C3（O-11 80×24 状态段不截断）+ C2（O-12-B 60×24 compact round 框 inactive SGR 载体）
}

// ── 红线核验（spec 红线 1：主循环 + permissions 主路径零改动；无 PTY） ────────
function redlineCheck(base: string, tip: string): { ok: boolean; changed: string[]; violations: string[] } {
  const r = spawnSync('git', ['diff', '--name-only', base, tip], { cwd: REPO, stdio: 'pipe' })
  if (r.status !== 0) throw new Error(`git diff ${base}..${tip} failed: ${String(r.stderr)}`)
  const changed = r.stdout.toString().split('\n').filter(Boolean)
  const violations = changed.filter(f => REDLINE_PATHS.some(prefix => f.startsWith(prefix)))
  return { ok: violations.length === 0, changed, violations }
}

// ── 验收单（ticket.md） ───────────────────────────────────────────────────
function writeTicket(
  runDir: string, phase: string, results: ScenarioResult[], baseline: boolean,
  gate?: {
    releaseGate: boolean; targetVersion: string | null; releasable: boolean;
    blockedReasons: string[]; verdict: string;
  },
  redline?: { ok: boolean; changed: string[]; violations: string[] },
): string {
  const L: string[] = []
  L.push(`# 阶段验收单 ${phase}（${new Date().toISOString()}）`)
  L.push('')
  L.push(`- 模式：${baseline ? '**pre-landing 基线**（硬探针全红 = 预期，记录改前状态）' : '正式验收'}`)
  L.push(`- spec：docs/tui-differentiation-spec.md §4（${phase} 门禁）`)
  L.push(`- 执行：bun run user-e2e/tui-diff/accept.ts ${phase}${baseline ? ' --baseline' : ''}`)
  L.push(`- 模型对齐：${CMP_MODEL}（三角色 + 顶层）；S-C 死端口 ${DEAD_GW}`)
  L.push('')
  for (const r of results) {
    L.push(`## ${r.id}（alive=${r.alive}${r.notes.length ? '，notes: ' + r.notes.join('; ') : ''}）`)
    L.push('')
    L.push('| 探针 | 门禁（spec 需求语言） | 判定 | 证据（截留） |')
    L.push('|---|---|---|---|')
    for (const pr of r.probes) {
      const verdict = pr.ok === true ? 'PASS' : pr.ok === false ? (pr.hard ? '**FAIL**' : 'FAIL(soft)') : 'INCONCLUSIVE'
      const ev = pr.evidence.map(e => e.replace(/\|/g, '∣')).join(' ⏎ ').slice(0, 400)
      L.push(`| ${pr.id}${pr.absent ? '(!)' : ''} ${pr.desc.slice(0, 40)} | ${pr.gate} | ${verdict} | ${ev} |`)
    }
    L.push('')
  }
  if (redline) {
    L.push('## 红线 1（主路径零改动）')
    L.push('')
    L.push(`- REDLINE_PATHS：${REDLINE_PATHS.join('、')}（streamAssistant 无同名符号，以 src/engine/query/** 覆盖）`)
    L.push(`- 改动文件 ${redline.changed.length} 个；红线违反：**${redline.ok ? '0' : redline.violations.length}**（${redline.violations.join(', ') || '无'}）`)
    L.push('- 四件套 gate：Main 提供证据（验收单附链接/输出），本 harness 不代跑仓库 gate。')
    L.push('')
  }
  if (gate?.releaseGate) {
    L.push('## 发布门禁（release gate，docs/release-governance.md §5 支柱 3 fail-closed）')
    L.push('')
    L.push(`- **发布判定：${gate.releasable ? 'RELEASABLE' : 'BLOCKED'}**（verdict=${gate.verdict}${gate.targetVersion ? `，目标版本=${gate.targetVersion}` : ''}）`)
    L.push(`- e2e 可核：verdict=${gate.verdict}（0 hard fail + 0 未处置 INCONCLUSIVE，含回归面）→ ${gate.verdict === 'PASS' ? '✅' : '❌'}`)
    for (const br of gate.blockedReasons) L.push(`- ❌ block：${br}`)
    L.push('- [ ] banner 版本 = 目标版本（packument 验真 / 生产 lane banner 实测）— **Main/f4 核**')
    L.push('- [ ] dev stub 打包体行为已核（build-time 声明 + dist 探针）— **Main 核**')
    L.push('- [ ] 无 deferred in-scope 项未闭环（收口契约卡）— **f4 核**')
    L.push(`- 规则：任一 block → 不发布；开修复波（同号 patch 或顺延）全量复跑全绿再放行。`)
    L.push('')
  }
  L.push('## 判定（验收者填写）')
  L.push('- [ ] 通过 / [ ] 缺陷（下列单） / [ ] 打回')
  L.push('- 缺陷单（3-round 形态，逐条 P0/P1 + 复现 + 证据）：')
  L.push('  1. （空）')
  L.push('- 探针措辞对齐记录（探针 miss 时先改 PROBES 关键词表再重跑，注明）：')
  L.push('  - （空）')
  const p = join(runDir, 'ticket.md')
  writeFileSync(p, L.join('\n'))
  return p
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2)
  const repoArg = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : null
  if (repoArg) REPO = repoArg // 指向 P0 所在 worktree（其 src 起 TUI）
  // 取值旗标：其后一个 token 是值，不算阶段位置参数
  const VAL_FLAGS = new Set(['--repo', '--only', '--base', '--tip', '--target-version'])
  const phaseArg = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !VAL_FLAGS.has(argv[i - 1]))) ?? 'P0'
  const baseline = argv.includes('--baseline')
  const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'v0.1.15'
  const tip = argv.includes('--tip') ? argv[argv.indexOf('--tip') + 1] : 'HEAD'
  // 发布治理支柱 3（fail-closed 发布门禁，docs/release-governance.md §5/§7）：
  // --release-gate = 出 result.json.releasable + ticket「发布门禁」段；
  // --target-version <v> = 目标版本（banner 对齐目标；e2e source-direct lane 不代核 banner，标 Main/f4 核）。
  const releaseGate = argv.includes('--release-gate')
  const targetVersion = argv.includes('--target-version') ? argv[argv.indexOf('--target-version') + 1] : null
  process.env.ATLAS_E2E_TUI_ARGS = 'code --dangerously-skip-permissions'

  if (phaseArg === 'redline') {
    const rl = redlineCheck(base, tip)
    const runDir = join(ART, `redline-${Date.now()}`)
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'result.json'), JSON.stringify({ base, tip, ...rl }, null, 2))
    process.stderr.write(`[redline] ${base}..${tip}: 改动 ${rl.changed.length} 文件，红线违反 ${rl.violations.length}\n`)
    for (const v of rl.violations) process.stderr.write(`  VIOLATION: ${v}\n`)
    process.exit(rl.ok ? 0 : 1)
  }

  const specs = ALL[phaseArg]
  if (!specs) {
    process.stderr.write(`unknown phase ${phaseArg}；valid: P0 P0a P0b P1a P1 P2 P024 A4F THEMES FOOTER80 redline\n`)
    process.exit(2)
  }
  const runDir = join(ART, `${phaseArg}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(runDir, { recursive: true })
  const t0 = Date.now()
  const results: ScenarioResult[] = []
  let runSpecs = specs
  if (onlyArg) {
    runSpecs = specs.filter(s => s.id === onlyArg)
    if (runSpecs.length === 0) {
      process.stderr.write(`--only ${onlyArg}: 不在 ${phaseArg} 阶段（该阶段场景：${specs.map(s => s.id).join(', ')}）\n`)
      process.exit(2)
    }
  }
  for (const spec of runSpecs) {
    results.push(await runScenario(spec, runDir))
  }
  const hardFail = results.reduce((n, r) => n + r.hardFail, 0)
  const hardInconclusive = results.reduce((n, r) => n + r.probes.filter(pr => pr.hard && pr.ok === null).length, 0)
  // 基线模式：硬探针红 = 预期（记录改前状态），不判 FAIL；正式模式：硬探针红 = FAIL，硬探针未达 = INCONCLUSIVE（非 PASS）
  const verdict = baseline
    ? (hardFail === 0 ? 'BASELINE-ALL-GREEN' : 'BASELINE-EXPECTED-RED')
    : (hardFail > 0 ? 'FAIL' : (hardInconclusive > 0 ? 'INCONCLUSIVE' : 'PASS'))
  // 发布治理支柱 3（fail-closed）：releasable = 该 run 可放行发布。
  // e2e 可核项 = verdict PASS（0 hard fail + 0 未处置 INCONCLUSIVE，含回归面）；
  // Main/f4 核项 = banner 对齐 + prod stub 行为（e2e source-direct lane 不代核，标 owner，不 block 判定）。
  const releasable = !baseline && verdict === 'PASS'
  const blockedReasons: string[] = baseline
    ? ['baseline run（非发布门禁对象）']
    : (hardFail > 0 ? [`hardFail=${hardFail}（须修复闭环，不发布）`]
      : (hardInconclusive > 0 ? [`未处置 INCONCLUSIVE=${hardInconclusive}（未封口，须处置后复跑）`]
        : []))
  writeTicket(runDir, phaseArg, results, baseline, { releaseGate, targetVersion, releasable, blockedReasons, verdict })
  writeFileSync(join(runDir, 'result.json'), JSON.stringify({
    phase: phaseArg, baseline, ms: Date.now() - t0, verdict,
    releasable,
    releaseGate: {
      enabled: releaseGate, targetVersion,
      e2eChecked: { verdict, openInconclusive: hardInconclusive, hardFail, regressionNonRegressed: verdict === 'PASS' },
      pendingOwner: { bannerAligned: 'Main/f4（packument 验真 / 生产 lane banner 实测）', prodStubBehavior: 'Main（build-time 声明 + dist 探针）', noOpenDeferred: 'f4（收口契约卡）' },
      releasable, blockedReasons,
    },
    scenarios: results.map(r => ({
      id: r.id, alive: r.alive, hardFail: r.hardFail, softInconclusive: r.softInconclusive,
      probes: r.probes, notes: r.notes, log: r.log,
    })),
  }, null, 2))
  process.stderr.write(`\n[${phaseArg}] 判定=${verdict}（hardFail=${hardFail} hardInconclusive=${hardInconclusive}）${releaseGate ? ` 发布门禁=${releasable ? 'RELEASABLE' : 'BLOCKED'}（${blockedReasons.join('；') || '无'}）` : ''} → ${runDir}\n`)
  process.exit(baseline ? 0 : (hardFail === 0 && hardInconclusive === 0 ? 0 : 1))
}

main().catch(e => {
  console.error('[tui-diff] fatal:', e)
  process.exit(1)
})
