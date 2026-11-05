/**
 * Atlas vs Claude TUI 交互信息量对比（首轮①）：
 * 同一组任务场景（读文件 / 改文件 / 思考 / 调用 skill）在两个 TUI 上各跑一遍，
 * 抓 pty 全量转录（ANSI 剥净）+ 自动抽取「交互信息量」信号，产出对比报告骨架。
 *
 * 用法：
 *   bun run user-e2e/compare/compare.ts [scenarios...] [--tuis both|atlas|claude]
 *   例：bun run user-e2e/compare/compare.ts S2-edit --tuis claude
 *
 * 隔离：所有 I/O 落在 user-e2e/compare/runs/<runId>/ 下（沙箱 HOME + 一次性 workspace）。
 * 两个 TUI 都经本地网关（127.0.0.1:8999）用 Qwen38-27B-TXT，模型面对齐 → 只比 TUI 渲染层。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, cpSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { GenericPty } from '../lib/pty-generic'
import { acceptClaudeStartupDialogs } from './dialogs'
import { countOcc, sleep } from '../lib/util'

const REPO = '/home/vince/projects/AtlasCode'
const FIX = join(REPO, 'user-e2e/compare/fixtures')
const RUNS = join(REPO, 'user-e2e/compare/runs')

// 生产 lane 验收：发布后 `COMPARE_ATLAS_CMD="atlas code --dangerously-skip-permissions"` 覆盖
// 走 npm 安装的 dist（防打包不一致）；默认 src lane（bun run src/）。
const ATLAS_CMD =
  process.env.COMPARE_ATLAS_CMD ??
  `bun run ${REPO}/src/atlascode/cli.ts code --dangerously-skip-permissions`
const CLAUDE_CMD = 'claude --dangerously-skip-permissions'
const UNSET = [
  'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_SESSION_ATTENDED', 'AI_AGENT',
  'CLAUDE_EFFORT', 'CLAUDE_CODE_EXECPATH',
]
/** 对比两侧对齐到同一能力强模型（经本地网关 127.0.0.1:8999）：deepseek-v4-pro。
 *  Qwen38（两侧默认）在 agentic 多工具任务上纪律性差（S2 实测 0 tool call），故对齐到更强的模型，
 *  让「TUI 渲染层对比」聚焦于渲染而非模型能力。claude 侧经 env 覆写（沙箱 HOME 无真 settings env 块）。 */
const CMP_MODEL = 'deepseek-v4-pro'
const CLAUDE_EXTRA = {
  ANTHROPIC_MODEL: CMP_MODEL,
  ANTHROPIC_DEFAULT_SONNET_MODEL: CMP_MODEL,
  CLAUDE_CODE_MAX_CONTEXT_TOKENS: '262144',
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: '32000',
}
const REAL_ATLAS_SETTINGS = process.env.HOME + '/.atlas/settings.json'

interface Scenario {
  id: string
  title: string
  prompt: string
  /** 磁盘落点验证（改文件场景）：返回 true = 目标文件确实被改 */
  diskCheck?: (ws: string) => { ok: boolean; evidence: string }
}

const SCENARIOS: Scenario[] = [
  {
    id: 'S1-read',
    title: '读文件（单 + 多）',
    prompt:
      'Read the files notes.md and data.json in this folder. Tell me (1) the sum of the "values" array in data.json, and (2) what notes.md says calc.js is for. Keep it to a few lines.',
  },
  {
    id: 'S2-edit',
    title: '改文件（diff 面）',
    prompt:
      'In calc.js, change the add() function so it takes a third argument `c` that defaults to 0 and returns a + b + c. Keep the existing console.log lines working and add one more console.log demonstrating the new third argument.',
    diskCheck: (ws: string) => {
      try {
        const src = readFileSync(join(ws, 'calc.js'), 'utf8')
        const ok = /function\s+add\s*\(\s*a\s*,\s*b\s*,\s*c\s*=\s*0\s*\)/.test(src)
        return { ok, evidence: ok ? 'add(a,b,c=0) present' : 'add(a,b,c=0) NOT found in calc.js' }
      } catch (e: any) {
        return { ok: false, evidence: 'read calc.js failed: ' + e?.message }
      }
    },
  },
  {
    id: 'S3-think',
    title: '思考（权衡 + 推荐）',
    prompt:
      'Think through the tradeoffs carefully before answering: for a small team of 3 maintaining two tightly-related services (a web API and a background worker), is a single monorepo or two separate repositories better? Then give a one-line recommendation and the two most important reasons.',
  },
  {
    id: 'S4-skill',
    title: '调用 skill',
    prompt: 'Use the summarize-numbers skill on data.json and report what it returns.',
  },
]

/** 交互信息量信号抽取（对剥净转录跑关键词探针；只作定量参考，定性结论看人工读转录） */
function extractSignals(txt: string): Record<string, number | string> {
  const nonEmptyLines = txt.split('\n').filter(l => l.trim().length > 0).length
  const sig: Record<string, number | string> = {
    chars: txt.length,
    nonEmptyLines,
    // 工具面
    read: countOcc(txt, 'Read'),
    edit: countOcc(txt, 'Update') + countOcc(txt, 'Edit'),
    write: countOcc(txt, 'Wrote') + countOcc(txt, 'Write'),
    bash: countOcc(txt, 'Bash') + countOcc(txt, '$'),
    // diff 面（改文件）。TUI 渲染常把词与数字连排（"Added2lines"），故用宽松正则。
    addedLines: (txt.match(/Added\s*\d+\s*lines?/gi) ?? []).length,
    removedLines: (txt.match(/[Rr]emoved\s*\d+\s*lines?/gi) ?? []).length,
    plusMinus: countOcc(txt, '+') > 0 && countOcc(txt, '-') > 0,
    // 思考面
    thinking: countOcc(txt, 'Thinking') + countOcc(txt, '∴') + countOcc(txt, 'thinking'),
    // skill 面
    skill: countOcc(txt, 'summarize-numbers') + countOcc(txt, 'Skill'),
    // 最终答案面
    finalAnswer: /15|total|recommend|monorepo|separate repos/i.test(txt),
  }
  return sig
}

function seedClaudeHome(home: string, wsPath: string) {
  const claudeJson: Record<string, unknown> = {
    hasCompletedOnboarding: true,
    installMethod: 'global',
    numStartups: 1,
    hasSeenTasksHint: true,
    hasSeenAutoModeEntryWarning: true,
    hasSeenAutoModeOutsideReadPrompt: true,
    hasSeenAutoDefaultNotice: true,
    officialMarketplaceAutoInstallAttempted: true,
    officialMarketplaceAutoInstalled: true,
    lastReleaseNotesSeen: '2.1.288',
    theme: 'dark',
    projects: { [wsPath]: { hasTrustDialogAccepted: true, allowedTools: [], mcpServers: {} } },
  }
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, '.claude.json'), JSON.stringify(claudeJson, null, 2))
}

/** 预置 Atlas 沙箱 HOME 的 .atlas/settings.json：复制真实 settings（含 modelRoles/providers 网关池），
 *  但把三个角色 + 顶层 model 全部指向 CMP_MODEL（deepseek-v4-pro），并裁掉插件/MCP 面（确定性优先，
 *  避免插件同步副作用）。修复「No models configured for role 'small' (empty pool)」。 */
function seedAtlasHome(home: string) {
  const settingsDir = join(home, '.atlas')
  mkdirSync(settingsDir, { recursive: true })
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(readFileSync(REAL_ATLAS_SETTINGS, 'utf8'))
  } catch {
    // 兜底：真实 settings 读不到时给一个最小网关池（deepseek-v4-pro via iff provider）
    raw = {
      defaultRole: 'small',
      providers: {
        iff: {
          baseURL: 'http://127.0.0.1:8999/v1',
          api: 'openai-completions',
          defaultContextWindow: 1000000,
          models: [{ id: CMP_MODEL, contextWindow: 1000000 }],
        },
      },
      modelRoles: {
        small: { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] },
        fast: { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] },
        premium: { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] },
      },
      model: CMP_MODEL,
    }
  }
  delete raw.enabledPlugins
  delete raw.enabledMcpServers
  delete raw.extraKnownMarketplaces
  for (const role of ['small', 'fast', 'premium']) {
    const r = (raw.modelRoles as Record<string, any>)?.[role]
    if (r?.models?.length) r.models[0].model = `iff/${CMP_MODEL}`
  }
  raw.model = CMP_MODEL
  writeFileSync(join(settingsDir, 'settings.json'), JSON.stringify(raw, null, 2))
}

function setupWs(kind: 'atlas' | 'claude', base: string): { ws: string; home: string } {
  const ws = join(base, kind, 'ws')
  const home = join(base, kind, 'home')
  rmSync(ws, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  mkdirSync(home, { recursive: true })
  // 真实项目 = git 仓：Atlas 的 getProjectRoot() = 自 cwd 上探最近 .git，项目级 skill 扫描链
  // 从 projectRoot 起、到 git root 即停。一次性 ws 若嵌在外层 git 仓（本 repo）内，projectRoot
  // 会解析到外层仓根 → ws/.atlas/skills（子目录）按设计不扫 → G2 伪阴性。git init 使 ws 成为
  // 自己的 project root（嵌套 .git 对父仓无影响，ws 本就 untracked）。
  try {
    const r = spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
    if (r.status !== 0) throw new Error('git init failed')
  } catch {
    /* non-fatal：git 不可用时退化为外层仓根语义（真实场景对齐度下降，但 S1/S2/S3 不受影响） */
  }
  for (const f of ['calc.js', 'data.json', 'notes.md']) cpSync(join(FIX, f), join(ws, f))
  if (kind === 'atlas') {
    cpSync(join(FIX, 'atlas-summarize'), join(ws, '.atlas', 'skills', 'summarize-numbers'), { recursive: true })
    seedAtlasHome(home)
  } else {
    cpSync(join(FIX, 'claude-summarize'), join(ws, '.claude', 'skills', 'summarize-numbers'), { recursive: true })
    seedClaudeHome(home, ws)
  }
  return { ws, home }
}

interface TuiResult {
  tui: 'atlas' | 'claude'
  scenario: string
  alive: boolean
  turnSettle: boolean
  signals: Record<string, number | string>
  tail: string[]
  transcript: string
  diskCheck?: { ok: boolean; evidence: string }
  notes?: string
}

async function runTui(
  tui: 'atlas' | 'claude',
  sc: Scenario,
  outBase: string,
): Promise<TuiResult> {
  const { ws, home } = setupWs(tui, outBase)
  const log = join(outBase, tui, 'transcript.log')
  const opts =
    tui === 'atlas'
      ? { logPath: log, workspace: ws, cmd: ATLAS_CMD, home, extraEnv: { IS_DEMO: '1' }, readySubs: ['❯'], readyMs: 120_000 }
      : { logPath: log, workspace: ws, cmd: CLAUDE_CMD, home, extraEnv: CLAUDE_EXTRA, unset: UNSET, readySubs: ['❯'], readyMs: 120_000 }
  const pty = await GenericPty.start(opts)
  if (tui === 'claude') await acceptClaudeStartupDialogs(pty)

  // 发任务 prompt。两侧提交键不同：
  //  - atlas：send(text+'\n') 即可提交（LF 被其 REPL 当作提交）。
  //  - claude（ink REPL）：裸 '\n' 是「多行输入的字面换行」而非提交键 → 全文 sendRaw 后补 '\r'(Enter) 才提交。
  //    （dialog 阶段已验证 \r 是 claude 的确认键。）
  if (tui === 'claude') {
    pty.sendRaw(sc.prompt)
    await sleep(700) // 等输入框把全文渲染进多行缓冲
    pty.sendRaw('\r') // Enter 提交
  } else {
    pty.send(sc.prompt)
  }
  // 等回合完成：spinner 逐帧写字节，回 idle 后字节稳定 12s → 完成。
  // 注：atlas 的常驻 spinner 会持续写字节、难以真正 byte-quiet → 常打到 timeout；
  // 转录是追加日志，timeout 不代表回合失败，转录仍是完整回合内容。简单任务 150s 足够。
  const settle = await pty.settleBytes(12_000, 150_000)

  const txt = pty.text()
  writeFileSync(join(outBase, tui, 'stripped.txt'), txt)
  const res: TuiResult = {
    tui,
    scenario: sc.id,
    alive: pty.alive(),
    turnSettle: settle.ok,
    signals: extractSignals(txt),
    tail: txt.split('\n').filter(l => l.trim()).slice(-40),
    transcript: txt,
  }
  if (sc.diskCheck) res.diskCheck = sc.diskCheck(ws)
  pty.kill()
  return res
}

async function main() {
  const argv = process.argv.slice(2)
  const tuisArg = argv.find(a => a.startsWith('--tuis'))?.split('=')[1] ?? 'both'
  const scenarioArgs = argv.filter(a => !a.startsWith('--'))
  const tuis: ('atlas' | 'claude')[] =
    tuisArg === 'atlas' ? ['atlas'] : tuisArg === 'claude' ? ['claude'] : ['atlas', 'claude']
  const scenarios = scenarioArgs.length
    ? SCENARIOS.filter(s => scenarioArgs.includes(s.id))
    : SCENARIOS
  if (!scenarios.length) {
    console.error('no matching scenarios; valid: ' + SCENARIOS.map(s => s.id).join(', '))
    process.exit(2)
  }

  const runId =
    'cmp-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + Math.random().toString(36).slice(2, 6)
  const root = join(RUNS, runId)
  mkdirSync(root, { recursive: true })
  const results: TuiResult[] = []

  for (const sc of scenarios) {
    mkdirSync(join(root, sc.id), { recursive: true })
    for (const tui of tuis) {
      process.stderr.write(`\n=== ${sc.id} · ${tui} ===\n`)
      const res = await runTui(tui, sc, join(root, sc.id))
      results.push(res)
      writeFileSync(join(root, sc.id, tui, 'result.json'), JSON.stringify(res, null, 2))
      process.stderr.write(
        `[${tui}] alive=${res.alive} turnSettle=${res.turnSettle} disk=${res.diskCheck ? res.diskCheck.ok : 'n/a'}\n` +
          `  signals=${JSON.stringify(res.signals)}\n`,
      )
    }
  }

  // 报告骨架（逐场景对比表 + 各转录尾部）；定性结论由人工读 stripped.txt 后补
  const lines: string[] = []
  lines.push(`# Atlas vs Claude TUI 交互信息量对比（${runId}）\n`)
  lines.push(`模型面：两侧均经 127.0.0.1:8999 网关，对齐到 ${CMP_MODEL}（Qwen38 默认在 agentic 多工具任务上 0 tool-call，故对齐到更强模型以隔离 TUI 渲染层）。只比 TUI 渲染层。\n`)
  for (const sc of scenarios) {
    const a = results.find(r => r.scenario === sc.id && r.tui === 'atlas')
    const c = results.find(r => r.scenario === sc.id && r.tui === 'claude')
    lines.push(`\n## ${sc.id} · ${sc.title}\n`)
    lines.push(`prompt: ${sc.prompt}\n`)
    lines.push(`| 信号 | Atlas | Claude |`)
    lines.push(`|---|---|---|`)
    const keys = new Set<string>([
      ...(a ? Object.keys(a.signals) : []),
      ...(c ? Object.keys(c.signals) : []),
    ])
    for (const k of keys) {
      lines.push(`| ${k} | ${a ? String(a.signals[k]) : '—'} | ${c ? String(c.signals[k]) : '—'} |`)
    }
    if (a?.diskCheck || c?.diskCheck) {
      lines.push(`\ndiskCheck: atlas=${a?.diskCheck?.ok} (${a?.diskCheck?.evidence}) · claude=${c?.diskCheck?.ok} (${c?.diskCheck?.evidence})`)
    }
  }
  writeFileSync(join(root, 'report.md'), lines.join('\n'))
  const summary = results.map(r => ({
    tui: r.tui, scenario: r.scenario, alive: r.alive, turnSettle: r.turnSettle,
    disk: r.diskCheck?.ok ?? null, signals: r.signals,
  }))
  writeFileSync(join(root, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log('\n=== summary ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log('\nartifacts → ' + root)
}

main().catch(e => { console.error(e); process.exit(1) })
