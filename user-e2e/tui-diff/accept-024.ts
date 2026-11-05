/**
 * 0.1.24 列车 · 逐项探针表 + 基线预演（判据先行，防 P1a 式措辞假阳性）。
 *
 * 角色：Main 白盒实施 0.1.24（A P0a 行为修复 + B P0b 持续监控 + C P1a 全量回退）
 *   → 本 harness 先在「判据」层把每个需求点的探针定义死（§4b 逐项，不合并粗粒度），
 *   再跑基线预演核探针不误中当前代码/日志，最后在 Main 回 worktree+键位后由 f4 触发正式执行。
 *
 * 设计（承接 accept.ts 的 Probe 形状 {id,gate,desc,re,hard,absent}，后续可并入 accept.ts）：
 * - present 探针（assert 新行为文本出现）= 0.1.24 落地后应命中；基线（现码）应 0 命中，
 *   命中即「措辞假阳性」→ 收紧 re。
 * - absent 探针（assert 旧面归零）= 需要触发场景（如按键开抽屉）后才断言归零；白盒基线另证
 *   「旧面尚存」。
 * - UA 探针（用户面走查层）= statusline 三标签英文 / why 行无 CJK / 无抽屉视觉残留。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/accept-024.ts --whitebox            # 白盒基线（C 波回退目标尚在?）
 *   bun run user-e2e/tui-diff/accept-024.ts --text <log…>         # 文本基线（探针对现日志误中?）
 *   bun run user-e2e/tui-diff/accept-024.ts --probes              # 打印完整探针表（判据文档面）
 *   默认 = 全部（whitebox + text over artifacts 下所有 .log + probes 表）
 */
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const ROOT = '/home/vince/projects/AtlasCode/user-e2e/tui-diff'
const ART = join(ROOT, 'artifacts')

interface Probe024 {
  id: string
  wave: 'A' | 'B' | 'C' | 'UA'
  gate: string // §4b 需求语言原文（判据对照）
  desc: string
  re: RegExp
  hard: boolean
  absent?: boolean // assert 归零
  /** 依赖触发（键位 env 或场景），未触发 → INCONCLUSIVE；表内给 env 名 */
  trigger?: string
}

// ── 0.1.24 逐项探针表（§4b 逐条；regex 用 A4 目标句式 + 符号，不合并）────────────────
const PROBES_024: Probe024[] = [
  // ===== A 波 · P0a 审批行为（全 session 域）=====
  {
    id: 'A1-allow-reason', wave: 'A', gate: 'A1 always 生效',
    desc: '同前缀第二次命令不弹框，工具卡显 allow 原因（= A4 rule-allow 句式）',
    re: /Allowed\s+by\s+rule\s+"[^"]+"/i, hard: true, trigger: 'TUI_DIFF_A1_ALWAYS_KEY',
  },
  {
    id: 'A1-no-dialog', wave: 'A', gate: 'A1 always 生效',
    desc: '第二次同前缀命令不再弹「Do you want to proceed」（absent）',
    re: /Do you want to proceed/, hard: true, absent: true, trigger: 'TUI_DIFF_A1_ALWAYS_KEY',
  },
  {
    id: 'A1-dangerous-no-always', wave: 'A', gate: 'A1 危险前缀护栏',
    desc: 'rm/sudo/cd/单字符/* 前缀弹框不出现「don\'t ask again / always」选项（absent）',
    re: /don['’]t\s+ask\s+again|Always\s+allow|永远允许|始终允许/i, hard: true, absent: true,
    trigger: 'TUI_DIFF_A1_DANGEROUS_PROMPT',
  },
  {
    id: 'A2-session-survives', wave: 'A', gate: 'A2 No 不退出',
    desc: 'No 拒绝后 session 存活、agent 继续响应（不 exit / 无 session ended）',
    re: /(session\s+(ended|closed|exited)|Goodbye|已结束会话)/i, hard: true, absent: true,
    trigger: 'TUI_DIFF_A2_NO_KEY',
  },
  {
    id: 'A2-feedback', wave: 'A', gate: 'A2 feedback 送 agent',
    desc: 'No 的 feedback（tell Atlas what to do differently）被 agent 下一轮引用/确认',
    re: /(反馈|feedback|declined|拒绝|didn['’]t\s+run|won['’]t\s+run)/i, hard: false,
    trigger: 'TUI_DIFF_A2_NO_KEY',
  },
  {
    id: 'A2-esc-no-feedback', wave: 'A', gate: 'A2 Esc 取消无 feedback',
    desc: 'Esc 取消后无 feedback 送达（agent 不引用反馈）',
    re: /反馈|feedback/i, hard: false, absent: true, trigger: 'TUI_DIFF_A2_ESC',
  },
  {
    id: 'A3-confirm-modal', wave: 'A', gate: 'A3 automode 确认门',
    desc: '选 Enable automode → 模态 Entering automode + 1 Confirm 2 Cancel + Switch back Shift+Tab',
    re: /Entering\s+automode|1\s*Confirm\s*2\s*Cancel|Switch\s+back\s*:\s*Shift\+Tab/i, hard: true,
    trigger: 'TUI_DIFF_A3_ENABLE_KEY',
  },
  {
    id: 'A3-not-switched-before', wave: 'A', gate: 'A3 确认后才切',
    desc: 'Confirm 前 statusline 仍 default（automode enabled 未现形，absent）',
    re: /automode\s+enabled/i, hard: true, absent: true, trigger: 'TUI_DIFF_A3_ENABLE_KEY',
  },
  {
    id: 'A3-switched-after', wave: 'A', gate: 'A3 确认后切',
    desc: 'Confirm 后 statusline 现 automode enabled',
    re: /automode\s+enabled/i, hard: true, trigger: 'TUI_DIFF_A3_CONFIRM_KEY',
  },
  {
    id: 'A3-cancel-default', wave: 'A', gate: 'A3 Cancel 停留 default',
    desc: 'Cancel 后 statusline 仍 default（automode enabled 未现形，absent）',
    re: /automode\s+enabled/i, hard: true, absent: true, trigger: 'TUI_DIFF_A3_CANCEL_KEY',
  },
  {
    id: 'A4-rule-ask', wave: 'A', gate: 'A4 why 句式',
    desc: 'rule(ask): Rule "<ruleValue>" from <source> requires confirmation.',
    re: /Rule\s+"[^"]+"\s+from\s+\S+\s+requires\s+confirmation/i, hard: true,
    trigger: 'TUI_DIFF_A4_MASK_RULE_ASK',
  },
  {
    id: 'A4-rule-allow', wave: 'A', gate: 'A4 why 句式',
    desc: 'rule(allow): Allowed by rule "<ruleValue>" (<source>).',
    re: /Allowed\s+by\s+rule\s+"[^"]+"\s*\([^)]*\)/i, hard: true, trigger: 'TUI_DIFF_A4_MASK_RULE_ALLOW',
  },
  {
    id: 'A4-classifier-dangerous', wave: 'A', gate: 'A4 why 句式',
    desc: 'classifier: Auto mode: classifier flagged this as dangerous.',
    re: /classifier\s+flagged\s+this\s+as\s+dangerous/i, hard: true, trigger: 'TUI_DIFF_A4_MASK_CLS_DANGER',
  },
  {
    id: 'A4-classifier-approved', wave: 'A', gate: 'A4 why 句式',
    desc: 'classifier: Auto-approved by classifier: <reason>.',
    re: /Auto-?approved\s+by\s+classifier\s*:/i, hard: true, trigger: 'TUI_DIFF_A4_MASK_CLS_OK',
  },
  {
    id: 'A4-mode', wave: 'A', gate: 'A4 why 句式',
    desc: 'mode: default mode requires confirmation for <tool>.',
    re: /default\s+mode\s+requires\s+confirmation\s+for\s+\S+/i, hard: true, trigger: 'TUI_DIFF_A4_MASK_MODE',
  },
  {
    id: 'A4-bypass', wave: 'A', gate: 'A4 why 句式',
    desc: 'bypass: Bypass mode — all commands allowed.',
    re: /Bypass\s+mode\s*[-–—]\s*all\s+commands\s+allowed/i, hard: true, trigger: 'TUI_DIFF_A4_MASK_BYPASS',
  },
  {
    id: 'A5-label-automode', wave: 'A', gate: 'A5 statusline 三标签',
    desc: 'permission-mode 段 automode enabled',
    re: /automode\s+enabled/i, hard: true, trigger: 'TUI_DIFF_A5_SHIFTTAB',
  },
  {
    id: 'A5-label-bypass', wave: 'A', gate: 'A5 statusline 三标签',
    desc: 'permission-mode 段 bypass enabled',
    re: /bypass\s+enabled/i, hard: true, trigger: 'TUI_DIFF_A5_SHIFTTAB',
  },
  {
    id: 'A5-label-default', wave: 'A', gate: 'A5 statusline 三标签',
    desc: 'permission-mode 段 default（小写；注意：与 A4「default mode requires...」+ 现「Default」词形碰撞，故 soft，实质 A5 信号=automode/bypass 两新标签）',
    re: /(^|[\s▶⏭])default([\s·]|$)/i, hard: false, trigger: 'TUI_DIFF_A5_SHIFTTAB',
  },

  // ===== B 波 · P0b 持续监控（连续状态，非瞬态 banner）=====
  {
    id: 'B1-fallback-fast', wave: 'B', gate: 'B1 回退折入 model 段',
    desc: '回退活跃 model 段 `deepseek-v4-pro ↦ fast`（黄）；恢复即消失',
    re: /(?:↦|→)\s*fast|\bfast\b[\s·]*(?:↦|→)/i, hard: false, trigger: 'TUI_DIFF_B1_FALLBACK',
  },
  {
    id: 'B1-fallback-gone', wave: 'B', gate: 'B1 恢复即消失',
    desc: '恢复后 ↦ fast 不残留（absent）',
    re: /↦\s*fast|→\s*fast/i, hard: false, absent: true, trigger: 'TUI_DIFF_B1_RECOVER',
  },
  {
    id: 'B2-ctx-triangle', wave: 'B', gate: 'B2 熔断折入 context-bar',
    desc: '超 autoCompact 阈值 context-bar 段显 ▲（72%/90% 首屏仍沿 ctxPct 护底）',
    re: /▲/u, hard: false, trigger: 'TUI_DIFF_B2_CTX',
  },
  {
    id: 'B2-ctx-pct', wave: 'B', gate: 'B2 context-bar 色阶',
    desc: 'context 剩余 %（护底，P0-1c-ctx 延续）',
    re: /\d{1,3}%/, hard: true, trigger: 'TUI_DIFF_B2_CTX',
  },
  {
    id: 'B3-gw-down', wave: 'B', gate: 'B3 网关断指示',
    desc: '断网期 statusline ⚠ gw down（红）；恢复即消失；不可连续信号取 → 降级砍 B3 则改核既有错误行不回归',
    re: /⚠\s*gw\s*down|gw\s*down/i, hard: false, trigger: 'TUI_DIFF_B3_GWDOWN',
  },
  {
    id: 'B3-gw-err-noregress', wave: 'B', gate: 'B3 降级砍时核既有错误行',
    desc: '既有错误行提示不回归（Connection error / 不可达 仍浮现）',
    re: /(Connection\s*error|不可达|无法连接|connection\s*error)/i, hard: true, trigger: 'TUI_DIFF_B3_GWDOWN',
  },

  // ===== C 波 · P1a 回退核（删 19 文件 + 3 接线）=====
  {
    id: 'C-sidebar-gone', wave: 'C', gate: 'C 抽屉回退',
    desc: 'stripAnsi 抽屉残留 0 命中（含模态期）：tab 行 `1 Diff 2 Plan…5 Budget` 归零',
    re: /(1\s*Diff\s*2\s*Plan|Diff\s*2\s*Plan\s*3\s*Activity|2\s*Plan\s*3\s*Activity\s*4\s*Decisions)/i,
    hard: true, absent: true, trigger: 'TUI_DIFF_C_TRY_OPEN',
  },
  {
    id: 'C-sidebar-unknown', wave: 'C', gate: 'C /sidebar 未注册',
    desc: '发 /sidebar → `Unknown skill: sidebar` 或 `Unknown command: sidebar`（commandName 已去斜杠；排除抽屉自身渲染的其它 unknown 文案）',
    re: /Unknown\s+(?:skill|command):\s+sidebar/i, hard: true, trigger: 'TUI_DIFF_C_SIDEBAR_CMD',
  },
  {
    id: 'C-num-no-open', wave: 'C', gate: 'C 1-5 键不开抽屉',
    desc: '按 1-5 数字键不触发开抽屉（tab 行归零，absent）',
    re: /(1\s*Diff\s*2\s*Plan|2\s*Plan\s*3\s*Activity\s*4\s*Decisions)/i, hard: true, absent: true,
    trigger: 'TUI_DIFF_C_TRY_OPEN',
  },
  {
    id: 'C-diff-no-regress', wave: 'C', gate: 'C /diff + 内联 diff 无回归',
    desc: '工具结果/diff 默认可读（Added/Removed N lines 族，G1 #258 延续）',
    re: /Added\s*\d+\s*lines?|Removed\s*\d+\s*lines?/i, hard: true, trigger: 'TUI_DIFF_C_DIFF_PROMPT',
  },

  // ===== UA · 用户面走查层（补验收盲区）=====
  {
    id: 'UA-why-no-cjk', wave: 'UA', gate: 'why 行无 CJK',
    desc: '审批 why 行无 CJK（同行为 A4 英文句却混 CJK 翻译尾巴 → 归零）',
    re: /(requires\s+confirmation|Allowed\s+by\s+rule|flagged|Auto-approved)[^\n]*[一-鿿]/i,
    hard: false, absent: true, trigger: 'TUI_DIFF_A4_MASK_ANY',
  },
  {
    id: 'UA-labels-english', wave: 'UA', gate: 'statusline 三标签英文',
    desc: 'statusline 权限段无 CJK（default/automode enabled/bypass enabled 全英文）',
    re: /(权限|模式|绕过|自动)[一-鿿]*/, hard: false, absent: true, trigger: 'TUI_DIFF_A5_SHIFTTAB',
  },
]

// ── 白盒基线（C 波回退目标「尚在?」+ A/B 段当前态）────────────────────────────
function grepLine(path: string, re: RegExp): string[] {
  try {
    const lines = readFileSync(path, 'utf8').split('\n')
    const hits: string[] = []
    lines.forEach((l, i) => { if (re.test(l)) hits.push(`${i + 1}: ${l.trim().slice(0, 100)}`) })
    return hits
  } catch { return [] }
}
function collectTs(dir: string): string[] {
  try {
    const out: string[] = []
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, n.name)
      if (n.isDirectory()) out.push(...collectTs(p))
      else if (/\.tsx?$/.test(n.name)) out.push(p)
    }
    return out
  } catch { return [] }
}

export function whiteboxBaseline(): string[] {
  const L: string[] = []
  const sidePanel = collectTs(join(REPO, 'src/tui/components/SidePanel'))
  L.push(`C 波回退目标【尚在 = 回退待做 / 不在 = 已回退】：`)
  L.push(`  SidePanel 目录文件数（应 15，回退后 0）：${sidePanel.length}`)
  for (const f of sidePanel) L.push(`    - ${f.replace(REPO, '')}`)
  L.push(`  /sidebar 注册（commands.ts:41 import + :231 注册；回退后应无）：${grepLine(join(REPO, 'src/tui/commands.ts'), /sidebar/i).join(' | ') || '(无)'}`)
  L.push(`  defaultBindings 1-5 键（回退后应无 sidePanel:openDiff 等）：${grepLine(join(REPO, 'src/tui/keybindings/defaultBindings.ts'), /sidePanel:|SidePanel/i).join(' | ') || '(无)'}`)
  L.push(`  0.1.23 双 cede（sidePanelHandlers isModalActive）：${grepLine(join(REPO, 'src/tui/components/SidePanel/sidePanelHandlers.ts'), /isModalActive|cede/i).join(' | ') || '(无)'}`)
  L.push(`  留（勿误伤）：useDiffData=${existsSync(join(REPO, 'src/tui/hooks/useDiffData.ts')) ? '在 hooks/useDiffData.ts（/diff Dialog 用，留）' : '异位'} decodeKittyModifier=${grepLine(join(REPO, 'src/tui/ink/parse-keypress.ts'), /decodeKittyModifier/).length ? '在 parse-keypress（留）' : '异位'}`)
  L.push(`A 波当前态：`)
  const whyRule = grepLine(join(REPO, 'src/tui/components/permissions/PermissionRuleExplanation.tsx'), /requires confirmation/).join(' | ') || '(无)'
  L.push(`  why 行（当前=Permission rule/Classifier …requires confirmation，A4 将改写 6 句式）：${whyRule}`)
  L.push(`  auto 标签（当前=PermissionMode shortTitle 'Auto'；A5 → automode enabled）：${grepLine(join(REPO, 'src/tui/utils/permissions/PermissionMode.ts'), /shortTitle:\s*'(Auto|Default|Bypass)'/).join(' | ')}`)
  L.push(`B 波当前态：`)
  L.push(`  RoleFallback 段（当前='已从 X 回退到 Y' CJK；B1 → 折入 model 段 ↦ fast）：${grepLine(join(REPO, 'src/tui/components/StatusLine/segments/RoleFallbackSegment.tsx'), /回退到/).join(' | ') || '(无)'}`)
  L.push(`  AutoCompactWarning 段（当前='将自动压缩' CJK；B2 → 删段折入 context-bar ▲）：${grepLine(join(REPO, 'src/tui/components/StatusLine/segments/AutoCompactWarningSegment.tsx'), /将自动压缩|自动压缩/).join(' | ') || '(无)'}`)
  const kittyTest = collectTs(join(REPO, 'tests')).filter(f => /parse-keypress/i.test(f))
  const curKitty = collectTs(join(REPO, 'tests')).filter(f => /sidepanel.*keychain|keychain/i.test(f)).map(f => f.replace(REPO, ''))
  L.push(`  kitty 解码单测位置（C 波：从 sidepanel 名下迁到 parse-keypress）：当前=${curKitty.join(', ') || '(未找到)'}；迁后文件名应含 parse-keypress=${kittyTest.join(', ') || '(尚未迁)'}`)
  return L
}

// ── 文本基线（探针对现日志误中?）────────────────────────────────────────────
function collectLogs(): string[] {
  const out: string[] = []
  try {
    for (const d of readdirSync(ART)) {
      const p = join(ART, d)
      if (!statSync(p).isDirectory()) continue
      for (const f of readdirSync(p)) {
        if (f.endsWith('.log')) out.push(join(p, f))
      }
    }
  } catch { /* no artifacts */ }
  return out
}
function stripAnsi(t: string): string {
  let out = t.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
  out = out.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  out = out.replace(/\x1b[()][0-2A-B]/g, '')
  return out
}

export function textBaseline(logs: string[]): string[] {
  const L: string[] = []
  if (!logs.length) { L.push('(无 artifacts 日志；跳过文本基线)'); return L }
  const corpus = logs.map(f => ({ f, t: stripAnsi(readFileSync(f, 'utf8')) }))
  L.push(`文本基线：${logs.length} 个日志，逐探针现文本命中数（present 探针 >0 = 措辞假阳性风险；absent 探针 >0 = 旧面尚存【预期，当前未回退】）：`)
  for (const p of PROBES_024) {
    const hits: string[] = []
    for (const c of corpus) {
      const n = (c.t.match(new RegExp(p.re.source, 'gi')) || []).length
      if (n) hits.push(`${c.f.split('/').pop()}:${n}`)
    }
    const flag = p.absent ? (hits.length ? '旧面尚存(预期回退前)' : '已归零(若非触发态即假阴)') : (hits.length ? '⚠️ 现文本命中(假阳性风险)' : '0 命中(判据先行 OK)')
    L.push(`  ${p.id} [${p.wave}]${p.absent ? ' absent' : ''}: ${hits.length ? hits.join(' ') : '0'} → ${flag}`)
  }
  return L
}

// ── 判据文档面（探针表）─────────────────────────────────────────────────────
export function probeTable(): string[] {
  const L: string[] = []
  L.push(`# 0.1.24 逐项探针表（判据，§4b 逐条）`)
  L.push('')
  L.push('| id | 波 | 门禁（§4b 需求语言） | 判定 | absent | 触发 |')
  L.push('|---|---|---|---|---|---|')
  for (const p of PROBES_024) {
    L.push(`| ${p.id} | ${p.wave} | ${p.gate} | ${p.hard ? 'hard' : 'soft'} | ${p.absent ? '✓' : ''} | ${p.trigger ?? '—'} |`)
  }
  L.push('')
  L.push(`- 探针数：${PROBES_024.length}（A 波 ${PROBES_024.filter(p => p.wave === 'A').length} / B 波 ${PROBES_024.filter(p => p.wave === 'B').length} / C 波 ${PROBES_024.filter(p => p.wave === 'C').length} / UA ${PROBES_024.filter(p => p.wave === 'UA').length}）`)
  L.push('- 触发 env：A1-A5/B2/B3 走键位/env 注入（同 S-H 的 `TUI_DIFF_SIDEBAR_OPEN` 模式）；Main 回键位面后填 hex。')
  L.push('- 触发未达 → hard 探针 INCONCLUSIVE（非 FAIL，延续 evalProbe 改进）。')
  return L
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2)
  const want = new Set(argv.filter(a => a.startsWith('--')).map(a => a.slice(2)))
  const doAll = want.size === 0
  const out: string[] = []
  if (doAll || want.has('probes')) out.push(...probeTable())
  if (doAll || want.has('whitebox')) { out.push(''); out.push('## 白盒基线'); out.push(...whiteboxBaseline()) }
  if (doAll || want.has('text')) {
    out.push(''); out.push('## 文本基线')
    const logs = argv.filter(a => !a.startsWith('--')).length
      ? argv.filter(a => !a.startsWith('--')).filter(f => existsSync(f))
      : collectLogs()
    out.push(...textBaseline(logs))
  }
  const report = out.join('\n')
  const runDir = join(ART, `024-baseline-${Date.now()}`)
  mkdirSync(runDir, { recursive: true })
  writeFileSync(join(runDir, 'report.md'), report)
  writeFileSync(join(runDir, 'probes.json'), JSON.stringify(PROBES_024.map(p => ({ id: p.id, wave: p.wave, gate: p.gate, desc: p.desc, re: p.re.source, hard: p.hard, absent: p.absent ?? false, trigger: p.trigger ?? null })), null, 2))
  process.stdout.write(report + `\n\n→ ${runDir}\n`)
}

main()