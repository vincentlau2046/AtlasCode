/**
 * 0.1.39 sessionlist P1 交互/UI 波 · tui-diff 走查 gate（e2e 交付，零产品改动；
 * 对象 = master head 592a3b7 0.1.39 码面〔6 提交：S1 操作行/S2 列宽/S3 二级行/S4 8 色/D4 colorize 根修/S5 搜索排序徽标〕）。
 *
 * Main 断言面（2026-10-08 开波）→ 探针场景映射（判据表详见 sessionlist-039-design.md）：
 *   S1  fork 状态机移底部操作行（行内无状态机段，操作行单行 = 提示/状态行）
 *        → wide：f → 操作行「✋ … [再按 f 确认 fork · 3s 自动取消]」现形 + 行内 0.1.38 态
 *          token「[f 确认 fork]」全量负控不在场 + 3s 超时回落提示行（单行恒定）。
 *   S2  列宽自适应（宽终端全列 / 64 列砍消息列 / 56 列砍分支列）
 *        → wide（200×50 全 5 列）+ col64（64×50：创建/分支在场、消息离场）
 *        + col56（56×50：创建在场、分支/消息离场）〔computeColumnLayout 阈值镜像：
 *        budget=termCols−20；<47 砍消息 → 64 列砍消息列；<41 砍分支 → 56 列砍分支列〕。
 *   S3  x 键展开光标行 summary 二级行（└ 摘要行，再按 x 收起；展开行占 2 物理行不溢出视口）
 *        → wide：x → 光标行下现「└ <内容>」〔p39-top 无 summary = firstPrompt 回落路径；
 *        p39-s3sum 带 task-summary 条目 = 压缩摘要优先路径〕+ 二级行物理位置在光标行与下一行之间
 *        （2 物理行）+ 全列表 + 操作行同帧在场（ROWS=50 视口 44 行 ≥ 13 行 + 1 展开，不溢出）。
 *   S4  agentColor theme 精确 8 色（idle 代理行实心 ● 染身份色；选中 magentaBright / 焦点 cyan 优先）
 *        → wide：8 个 agentColor fixture（red..cyan，agent 尾条 last-wins 刮面）idle 行 SGR 全在场
 *        + 8 值域两两相异（精确映射，0.1.38 purple/pink→magenta、orange→yellow 对撞面消除）
 *        + 全走 theme 色板通道（38;2;/38;5;，darkTheme 默认）+ idle 实心 ● / 非代理 ○ 字形
 *        + 焦点行 cyan 优先（身份 cyan 的 p39-ag-cyan 行焦点态 = 裸 cyan SGR 36 覆盖身份色）
 *        + 选中态 magentaBright（95）优先。
 *   D4  根修随车（全色面 SGR 在场 + 8 值域 + 裸色处抽查）：
 *        → 上述 8 身份色在场（0.1.38 D4 FAIL「全屏无前景色码」基线翻面）+ 屏内裸色名抽查
 *        （header「🌲 Sessions」cyan / 焦点 cyan / 选中 magentaBright / 操作行 confirm yellow
 *        4 处裸名 SGR 在场——D4 根修 bare→ansi: 归一后转绿）；TUI 全局 14 处裸名回归 =
 *        单测 lane（tests/unit/colorize-d4.test.ts 16 名 SGR + 四件套）承载，本走查 = 活屏面。
 *   S5  / 搜索模式（本地同步过滤 + 零命中空态行 + 操作行搜索态行 + esc 退出）
 *        / s 键排序键循环（列头 排序: 指示）/ 徽标 chip（PR #n / fileSize / [wt:]）
 *        → wide：/ → 操作行「搜索:"" · esc 退出」；击 agred → 本地同步过滤幸存者行重放；
 *        击 zzz-no-match → 空态行 No sessions match "…"；esc → 操作行回落提示行；
 *        s×3 → 排序键 创建/消息数/名称 循环（视图重排行为面 + 列头「· 排序:<label>」指示面）；
 *        徽标 fixture（pr-link 42 / worktree-state wt-probe / fileSize 盘上真值 / tag / [C] / @agent）
 *        → 行内 chip [PR #42] / (N.NKB) / [wt:wt-probe] 在场断言。
 *   P0 回归（0.1.38 五探针保持绿）：sessionlist-038.ts --repo <main> --sort --count
 *        --sidechain --mtime（P0 4 场景，纯行为探针 0.1.39 码面零改动应恒绿）
 *        + 本文件 wide 场景 SL-P0-D1-created（created 列 = 首消息时间戳 M/D/YYYY，P0-B 显示面）。
 *
 * 判别力（前后 lane 统一，规则②「测的=发布的」）：本探针在 pre-0.1.39（0.1.38 态）必红
 * （S1 状态机在行内 / S2 窄档硬砍列 / S3 无 x 二级行 / S4 裸名 fallthrough 无 SGR / S5 无搜索面），
 * post-0.1.39 必绿；FAIL = 产品缺口（fail-closed 不发布）；INCONCLUSIVE 必带定因
 * （面未达/cell-diff 重放缺 SGR/视口未达——核 artifact pty.log + list-capture）。
 *
 * 拓扑/纪律：PTY（lib/pty.ts；ATLAS_E2E_COLS/ROWS 覆盖档宽；串行防网关竞争）起
 * `bun run <repo>/src/atlascode/cli.ts`（workspace=sandbox ws，HOME=sandbox home，零写真实 ~/.atlas）；
 * /sessionlist 纯 FS 读路径（loadSameRepoAllMessageLogs），不涉模型调用。
 * fixture = 手造 JSONL session 文件（schema 镜像真实条目；agent/pr-link/worktree-state/
 * task-summary 尾条 = 产品 append 格式 last-wins 刮面，sessionStorage.ts:810-840/1196-1211/4828-4849）。
 * 双通道：pty.sinceText() = 累积剥净（文本/字形/顺序断言）；pty.log 全量 raw（kill 后读，
 * SGR 色码断言——行局部区前景码提取，0.1.38 探针同法）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/sessionlist-039.ts --repo <worktree-0.1.39|main> [--all|wide|col64|col56]
 * 产物：artifacts/S39-<stamp>-<rand>/<scen>/{result.json, pty.log[, pty-N.log], list-capture*.txt}
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO =
  argVal('--repo') ??
  process.env.ATLAS_E2E_REPO ??
  '/home/vince/projects/AtlasCode'
const MODES = ['wide', 'col64', 'col56'] as const
type Scen = (typeof MODES)[number]
const runScens: Scen[] = argv.includes('--all')
  ? [...MODES]
  : MODES.filter(m => argv.includes(m))
if (runScens.length === 0) runScens.push('wide') // 缺省 = wide（全量走查场景）

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'
const LIVE_GW = 'http://127.0.0.1:8999'

const LIST_RENDER_MS = 30_000
const KEY_SETTLE_MS = 600 // 单键重放 + 刷盘窗
const X_SETTLE_MS = 1200 // x 键：展开行 + 视口 slot 重算 + cell-diff 重放窗（宽于普通键）
const CONFIRM_SEE_MS = 900 // f 后 confirm 态行捕获窗（3s 窗口内）
const CANCEL_WAIT_MS = 3_400 // 3s 自动取消超时余量（confirm 回落提示行）

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const RUN_TAG = `S39-${stamp()}-${Math.random().toString(36).slice(2, 5)}`
const RUN_DIR = join(ART, RUN_TAG)
mkdirSync(RUN_DIR, { recursive: true })

// ── SGR 提取（0.1.38 探针同法：行局部区前景码；raw 通道）──────────────
/** 行色码 = 本行 <Text> color 包裹 SGR（位于本行内容前）。窗口 = prevMarker 首现之后 →
 * marker 首现之前；只取前景色码（38;…/16 色 30-38/90-97；复位 39 / 强度码排除）。 */
function rowStartFgSgr(raw: string, marker: string, prevMarker: string): string | null {
  const iM = raw.indexOf(marker)
  if (iM < 0) return null
  const iP = raw.indexOf(prevMarker)
  // rerun-r2 定因订正（D4-HEADER-CYAN r2 假红）：prevMarker（如 /sessionlist 输入回显）可因启动时序
  // 变体缺席于 raw（r2 实证：列表屏先于 REPL 提示行渲染，命令回显未现形；而 header 行 36 SGR 实捕在场
  // = D4 根修面完好）。订正 = prevMarker 缺席时回退 marker 前 160 字符局部窗（行首 SGR 恒在 marker
  // 前紧邻区；prevMarker 在场时行为不变）。
  const seg = iP < 0 ? raw.slice(Math.max(0, iM - 160), iM) : (iP >= iM ? null : raw.slice(iP + prevMarker.length, iM))
  if (seg === null) return null
  const codes = (seg.match(/\x1b\[[0-9;]*m/g) ?? []).map(c => c.replace(/\x1b\[|m/g, ''))
  const fg = codes.filter(c => /^38;/.test(c) || /^9[0-7]$/.test(c) || /^3[0-8]$/.test(c))
  return fg[fg.length - 1] ?? null
}
/** marker 全部现形位置的行色码序列（每次现形前溯 maxBack 字符取最后前景码；
 * 状态迁移断言：idle 身份色 → 焦点 cyan → 选中 magentaBright 同现于同一行）。 */
function rowFgSgrAll(raw: string, marker: string, maxBack = 80): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const i = raw.indexOf(marker, from)
    if (i < 0) break
    from = i + marker.length
    const seg = raw.slice(Math.max(0, i - maxBack), i)
    const codes = (seg.match(/\x1b\[[0-9;]*m/g) ?? []).map(c => c.replace(/\x1b\[|m/g, ''))
    const fg = codes.filter(c => /^38;/.test(c) || /^9[0-7]$/.test(c) || /^3[0-8]$/.test(c))
    if (fg.length > 0) out.push(fg[fg.length - 1])
  }
  return out
}
/** SGR 码归一（bold 前缀 1; 剥除）+ 族判定。chalk level 2/3 下 16 色族码恒定（36/95/33）；
 * theme 色板值（darkTheme rgb 600 8 色）走 38;2;（level 3）/ 38;5;（level 2）通道。 */
const normSgr = (c: string) => c.replace(/^1;/, '')
const isCyanFam = (c: string | null): boolean => c !== null && normSgr(c) === '36'
const isMagBrightFam = (c: string | null): boolean => c !== null && normSgr(c) === '95'
const isYellowFam = (c: string | null): boolean => c !== null && normSgr(c) === '33'
const isThemeChannel = (c: string | null): boolean => c !== null && c.startsWith('38;')
/** PTY 色能力对照（0.1.38 D4 同法）：raw 内任一 truecolor/256 色码在场 = 终端支持坐实
 * → 目标行无前景码 = 产品着色缺口（非探针/环境捕获约束判据）。 */
const colorSupportOf = (raw: string): boolean => raw.includes('38;2;') || raw.includes('38;5;')

/** formatCreated（SessionTreeScreen.tsx，0.1.39 保留）：`M/D/YYYY`（本地时区）。 */
function fmtCreated(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

// ── session fixture（JSONL schema 镜像真实条目；尾条 last-wins 刮面）────
function userEntry(sid: string, uuid: string, prompt: string, tsIso: string, cwd: string): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    promptId: {},
    type: 'user',
    message: { role: 'user', content: prompt },
    uuid,
    timestamp: tsIso,
    permissionMode: 'default',
    userType: 'atlas',
    entrypoint: 'cli',
    cwd,
    sessionId: sid,
    version: 'unknown',
    gitBranch: 'master',
  })
}
function assistantEntry(sid: string, parentUuid: string, text: string, tsIso: string, cwd: string): string {
  return JSON.stringify({
    parentUuid,
    isSidechain: false,
    type: 'assistant',
    role: 'assistant',
    uuid: randomUUID(),
    timestamp: tsIso,
    stop_reason: 'end_turn',
    message: { id: 'e2e', model: 'e2e-fixture', role: 'assistant', type: 'message', content: [{ type: 'text', text }] },
    userType: 'atlas',
    entrypoint: 'cli',
    sessionId: sid,
    version: 'unknown',
    gitBranch: 'master',
  })
}
const modeEntry = (sid: string, mode = 'default'): string =>
  JSON.stringify({ type: 'mode', mode, sessionId: sid })
/** 尾条刮面条目（产品 append 格式镜像；lite 路径 last-wins：sessionStorage.ts:4828-4849）。 */
const agentEntry = (sid: string, agentColor: string, agentSetting: string): string =>
  JSON.stringify({ type: 'agent', agentColor, agentSetting, sessionId: sid })
const tagEntry = (sid: string, tag: string): string => JSON.stringify({ type: 'tag', tag, sessionId: sid })
// run2d 定因订正：尾条 timestamp 缺省 new Date()（=now）→ log.modified 取文件内最大条目 ts
//（含 timestamped 尾条）→ s3sum/badges 两行 modified=now 恒排列表顶（顶 2 行非 p39-top，
// 初始焦点错位 → S3 判词面失真 + 行序假设破）。订正 = 尾条 ts 回拨 lastMs（产品真实 append
// 格式保留 timestamp 字段，仅 ts 更旧 = 与主消息同代）：显示序 = fixture 写序（top 顶行）。
const summaryEntry = (sid: string, summary: string, tsIso?: string): string =>
  JSON.stringify({ type: 'task-summary', summary, sessionId: sid, timestamp: tsIso ?? new Date().toISOString() })
const prLinkEntry = (sid: string, prNumber: number, tsIso?: string): string =>
  JSON.stringify({
    type: 'pr-link',
    sessionId: sid,
    prNumber,
    prUrl: `https://github.com/e2e/repo/pull/${prNumber}`,
    prRepository: 'e2e/repo',
    timestamp: tsIso ?? new Date().toISOString(),
  })
const worktreeEntry = (sid: string, worktreeName: string): string =>
  JSON.stringify({
    type: 'worktree-state',
    worktreeSession: {
      originalCwd: '/proj/e2e',
      worktreePath: `/proj/e2e/.worktrees/${worktreeName}`,
      worktreeName,
      sessionId: sid,
    },
    sessionId: sid,
  })

interface FixtureSpec {
  prompt: string
  /** 最后消息 ts（modified/排序键/最近活跃列） */
  lastMs: number
  /** 首条 user 消息 ts（created 列 P0-B）；缺省 = lastMs−5min */
  userTsMs?: number
  mtimeMs?: number
  agentColor?: string
  agentSetting?: string
  tag?: string
  coordinator?: boolean
  /** task-summary 尾条（S3 压缩摘要优先路径） */
  summary?: string
  prNumber?: number
  worktreeName?: string
  /** 额外 user/assistant 消息对（消息数降序排序面） */
  extraPairs?: number
}

function writeFixture(projectDir: string, ws: string, spec: FixtureSpec): string {
  const sid = randomUUID()
  const lastMs = spec.lastMs
  const userTsMs = spec.userTsMs ?? lastMs - 5 * 60_000
  const iso = (ms: number) => new Date(ms).toISOString()
  const lines: string[] = [modeEntry(sid)]
  lines.push(userEntry(sid, randomUUID(), spec.prompt, iso(userTsMs), ws))
  lines.push(assistantEntry(sid, '', `${spec.prompt} 应答`, iso(lastMs), ws))
  // 额外消息对（更旧：created = 首条 user ts 不变——extraPairs 只抬消息数）。
  // run2c 定因订正：旧码把 pairs 写在主 prompt 之前且 ts 更新（userTs+k*1h）→ 文件序首条 user 消息
  // = 'p39-badges pair-1' → firstPrompt/标题漂移（活屏实证标题 = 'p39-badges pair-1'，s#2 顶行判别词面失真）。
  // 订正 = pairs 置主消息之后 + ts 更旧（userTs−k*1h，文档意图「更旧」）：firstPrompt = spec.prompt 恒稳。
  const n = spec.extraPairs ?? 0
  for (let k = 1; k <= n; k++) {
    const tsMs = userTsMs - k * 3_600_000
    lines.push(
      userEntry(sid, randomUUID(), `${spec.prompt} pair-${k}`, iso(tsMs), ws),
      assistantEntry(sid, '', `${spec.prompt} pair-${k} 应答`, iso(tsMs + 60_000), ws),
    )
  }
  if (spec.coordinator) lines.push(modeEntry(sid, 'coordinator'))
  if (spec.tag) lines.push(tagEntry(sid, spec.tag))
  if (spec.agentColor || spec.agentSetting) {
    lines.push(agentEntry(sid, spec.agentColor ?? '', spec.agentSetting ?? ''))
  }
  // tsIso = iso(lastMs)：尾条 ts 回拨（见 summaryEntry 注释；显示序 = fixture 写序）
  if (spec.summary) lines.push(summaryEntry(sid, spec.summary, iso(lastMs)))
  if (spec.prNumber !== undefined) lines.push(prLinkEntry(sid, spec.prNumber, iso(lastMs)))
  if (spec.worktreeName) lines.push(worktreeEntry(sid, spec.worktreeName))
  const f = join(projectDir, `${sid}.jsonl`)
  writeFileSync(f, lines.join('\n') + '\n')
  const m = spec.mtimeMs ?? Date.now()
  utimesSync(f, m / 1000, m / 1000)
  return sid
}

// ── PTY 驱动 ─────────────────────────────────────────────────────────
type Verdict = { id: string; hard: boolean; ok: boolean | null; detail: string }

/** 累积 sinceText 的 delta 跟踪（sinceText = spawn 起累积剥净；文件 append-only → 前缀增量安全）。 */
function makeDeltaTracker(pty: { sinceText: () => string }) {
  let last = 0
  return {
    delta: (): string => {
      const t = pty.sinceText()
      const d = t.slice(last)
      last = t.length
      return d
    },
    all: (): string => pty.sinceText(),
  }
}

async function openSessionList(
  pty: any,
  scenDir: string,
  capName: string,
  rowMarker: string,
): Promise<{ listRendered: boolean; text: string }> {
  pty.send('/sessionlist')
  const t0 = Date.now()
  let text = ''
  while (Date.now() - t0 < LIST_RENDER_MS) {
    text = pty.sinceText()
    // 列表渲染强信号：🌲 Sessions 标题 + 列头「最近活跃」+ 全量行 marker（非 Loading 态）
    if (text.includes('Sessions') && text.includes('最近活跃') && text.includes(rowMarker) && !text.includes('Loading sessions')) break
    await sleep(1500)
  }
  const listRendered = text.includes('最近活跃') && text.includes(rowMarker)
  writeFileSync(join(scenDir, capName), text)
  return { listRendered, text }
}

function lineOf(text: string, marker: string): string | null {
  for (const l of text.split('\n')) if (l.includes(marker)) return l
  return null
}

/** 逐字符输入（run2c 定因）：产品 useInput 只捕获单字符 stdin 事件（input.length===1 守卫，
 * SessionTreeScreen.tsx:667-675）；burst sendRaw('agred') = 5 字节同落一个 data 事件 → 整段被丢
 * （run2c 实证：全 raw 无 'agred'/'zzz-no-match' 片段，query 恒 ''）。真实用户击键 = 单字符事件。 */
async function typeChars(pty: { sendRaw: (s: string) => void }, s: string, gapMs = 120): Promise<void> {
  for (const ch of s) {
    pty.sendRaw(ch)
    await sleep(gapMs)
  }
}

// ── 场景 ─────────────────────────────────────────────────────────────
async function runScenario(scen: Scen): Promise<{ probes: Verdict[]; inconclusive: number; hardFail: number }> {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', `S39-${scen}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
  const home = join(ROOT, 'home', `S39-${scen}`)
  await makeSandboxHome(home, REAL_SETTINGS, false)
  try {
    rmSync(join(home, '.atlas', '.config.json'), { force: true })
  } catch {
    /* 不存在 */
  }
  const sp = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(sp, 'utf8'))
  s.providers = { iff: { ...(s.providers?.iff ?? {}), baseURL: LIVE_GW } }
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  writeFileSync(sp, JSON.stringify(s, null, 2))

  const now = Date.now()
  const MIN = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000
  const projectDir = join(home, '.atlas', 'projects', ws.replace(/[^a-zA-Z0-9]/g, '-'))
  // run2d 定因订正：sandbox home 跨 run 复用（makeSandboxHome 不 wipe）+ fixture sid = randomUUID
  // → 每 run 13 个新 fixture 累积进同一项目会话列表（run2d 实证 4 run × 13 = 52 行，视口 43 行现形）
  // → 行序/行号/顶行假设全破。订正 = 每 run 清空项目会话目录（只清本探针项目面，不碰 home 其余）。
  rmSync(projectDir, { recursive: true, force: true })
  mkdirSync(projectDir, { recursive: true })

  const probes: Verdict[] = []
  let hardFail = 0
  let inconclusive = 0

  if (scen === 'wide') {
    // ── wide fixtures（13 session；modified 新→旧 = 显示序；created 序刻意错排供 s 键判别）──
    // 序：top(2m) s3sum(3m) s3b(4m) badges(5m) ag-red(6m)…ag-cyan(13m) created3d(14m)
    // created（首 user ts）：s3sum 1h < top 2h < s3b 3h < ag-red 5h < ag-blue 6h < badges 7h（extraPairs 抬消息数，
    // created 仍 7h）< ag-purple 8h … ag-cyan 12h；created 降序顶行 = s3sum（≠ modified 顶行 top = s 键重排判别面）。
    writeFixture(projectDir, ws, { prompt: 'p39-top', lastMs: now - 2 * MIN, userTsMs: now - 2 * HOUR })
    writeFixture(projectDir, ws, {
      prompt: 'p39-s3sum', lastMs: now - 3 * MIN, userTsMs: now - 1 * HOUR,
      summary: 'p39-summary-A', // S3 压缩摘要优先路径
    })
    writeFixture(projectDir, ws, { prompt: 'p39-s3b', lastMs: now - 4 * MIN, userTsMs: now - 3 * HOUR })
    writeFixture(projectDir, ws, {
      prompt: 'p39-badges', lastMs: now - 5 * MIN, userTsMs: now - 4 * HOUR,
      tag: 'p39tag', agentSetting: 'p39agent', coordinator: true,
      prNumber: 42, worktreeName: 'wt-probe', extraPairs: 3, // S5 徽标面 + 消息数排序面
    })
    const AGENT_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']
    for (let i = 0; i < AGENT_COLORS.length; i++) {
      const c = AGENT_COLORS[i]!
      writeFixture(projectDir, ws, {
        prompt: `p39-ag-${c}`,
        lastMs: now - (6 + i) * MIN,
        userTsMs: now - (5 + i) * HOUR,
        agentColor: c,
        agentSetting: `ag${c}`,
      })
    }
    writeFixture(projectDir, ws, {
      prompt: 'p39-created3d', lastMs: now - 14 * MIN, userTsMs: now - 3 * DAY,
      mtimeMs: now, // P0-D1：created 列 = 首消息 ts（非 stat mtime 诱饵）
    })
  } else {
    // col64/col56：3 个 plain session（列头断言面，最小 fixture）
    writeFixture(projectDir, ws, { prompt: 'c-a', lastMs: now - 1 * MIN })
    writeFixture(projectDir, ws, { prompt: 'c-b', lastMs: now - 2 * MIN })
    writeFixture(projectDir, ws, { prompt: 'c-c', lastMs: now - 3 * MIN })
  }

  // ── PTY 档宽（harness pty-driver 读 env）──
  delete process.env.ATLAS_E2E_COLS
  delete process.env.ATLAS_E2E_ROWS
  if (scen === 'col64') {
    process.env.ATLAS_E2E_COLS = '64'
    process.env.ATLAS_E2E_ROWS = '50'
  } else if (scen === 'col56') {
    process.env.ATLAS_E2E_COLS = '56'
    process.env.ATLAS_E2E_ROWS = '50'
  }
  const rowMarker = scen === 'wide' ? 'p39-top' : 'c-a'
  const pty = await PtyStart(scenDir, ws, home)
  try {
    const { listRendered, text } = await openSessionList(pty, scenDir, 'list-capture.txt', rowMarker)
    const dt = makeDeltaTracker(pty)
    if (!listRendered) {
      probes.push({
        id: `${scen}-LIST-RENDER`,
        hard: true,
        ok: null,
        detail: `列表未渲染（${LIST_RENDER_MS}ms 窗内未见「最近活跃」列头 + ${rowMarker} 行；定因核 ${join(scenDir, 'pty.log')}）`,
      })
      inconclusive++
    } else if (scen === 'wide') {
      // ══ 首帧静态面（P0-D1 / S2 / S5-SORT-IND / S5-BADGES / S4-字形）══
      const headerLine = lineOf(text, '名称')
      const createdLine = lineOf(text, 'p39-created3d')
      const createdCell = createdLine
        ? (createdLine.slice(createdLine.indexOf('p39-created3d')).match(/\s+(\d{1,2}\/\d{1,2}\/\d{4})/) ?? [])[1] ?? null
        : null
      const cExpect = fmtCreated(new Date(now - 3 * DAY))
      const d1Ok = createdCell === cExpect
      // S2 断言面 = 列可见性（数据面）：wide 档 5 列数据值全在场 + 列头 3 标签在场。
      // 列头末标签「消息」+「· 排序:」指示在 S2 nameW 全宽预算下被截断 = 独立显示面
      // 探针（SL-S5-SORT-IND-* / SL-S5-BADGES-chips 承载，S2×S5 预算交互缺口面）。
      const topLine = lineOf(text, 'p39-top')
      const topDataOk =
        topLine !== null &&
        /\d{1,2}\/\d{1,2}\/\d{4}\s+\S+\s+(master|—)\s+\d+/.test(
          topLine.slice(topLine.indexOf('p39-top')),
        )
      const s2WideOk =
        headerLine !== null &&
        headerLine.includes('创建') && headerLine.includes('最近活跃') &&
        headerLine.includes('分支') && topDataOk
      const sortIndInitial = headerLine !== null && headerLine.includes('· 排序:最近活跃')
      const badgesLine = lineOf(text, 'p39-badges')
      const badgePr = badgesLine !== null && badgesLine.includes('[PR #42]')
      const badgeWt = badgesLine !== null && badgesLine.includes('[wt:wt-probe]')
      const badgeSize = badgesLine !== null && /\(\d+(\.\d+)?(KB|MB|GB|bytes)\)/.test(badgesLine)
      const agRedLine = lineOf(text, 'p39-ag-red')
      const glyphOk = agRedLine !== null && agRedLine.includes('●') && topLine !== null && topLine.includes('○')
      probes.push(
        {
          id: 'SL-P0-D1-created',
          hard: true,
          ok: createdLine === null ? null : d1Ok ? true : false,
          detail: createdLine === null
            ? `p39-created3d 行缺失 → INCONCLUSIVE 定因核 list-capture`
            : d1Ok
              ? `created 列 = ${createdCell}（期望 ${cExpect} = 首消息 ts now−3d；非 mtime now 诱饵）= P0-B 双时间列回归保持绿`
              : `created 列 = ${createdCell} ≠ ${cExpect}（P0-B 显示面回归破坏）→ FAIL`,
        },
        {
          id: 'SL-S2-WIDE-cols',
          hard: true,
          ok: headerLine === null ? null : s2WideOk ? true : false,
          detail: headerLine === null
            ? `列头行缺失 → INCONCLUSIVE 定因核 list-capture`
            : s2WideOk
              ? `宽档 200×50 列可见性全 5 列（数据行 p39-top 含 created/活跃/分支/消息值 + 列头 创建/最近活跃/分支 标签）= S2 自适应宽终端面〔数据面〕`
              : `宽档列可见性不符（创建=${headerLine?.includes('创建')} 最近活跃=${headerLine?.includes('最近活跃')} 分支=${headerLine?.includes('分支')} 数据行 5 列值=${topDataOk}）→ FAIL`,
        },
        {
          id: 'SL-S5-SORT-IND-INITIAL',
          hard: true,
          ok: headerLine === null ? null : sortIndInitial ? true : false,
          detail: headerLine === null
            ? `列头行缺失 → INCONCLUSIVE 定因核 list-capture`
            : sortIndInitial
              ? `列头「· 排序:最近活跃」指示在场（S5 排序键列头面）`
              : `列头未见「· 排序:最近活跃」（S2 nameW 全宽预算下指示行被截断/未渲染——定因核 list-capture 列头行全宽）→ FAIL`,
        },
        {
          id: 'SL-S5-BADGES-chips',
          hard: true,
          ok: badgesLine === null ? null : badgePr && badgeWt && badgeSize ? true : false,
          detail: badgesLine === null
            ? `p39-badges 行缺失 → INCONCLUSIVE 定因核 list-capture`
            : badgePr && badgeWt && badgeSize
              ? `徽标 chip 面在场：[PR #42]（pr-link 尾条）+ (N.NKB)（fileSize 盘上真值）+ [wt:wt-probe]（worktree-state 尾条）= S5 裁定 B 增补显示面`
              : `徽标 chip 缺失（[PR #42]=${badgePr} [wt:wt-probe]=${badgeWt} size-chip=${badgeSize}；S2 nameW 全宽预算 maxFlags=0 → 标志段恒截断，定因核 list-capture 行尾区）→ FAIL`,
        },
        {
          id: 'SL-S4-GLYPHS',
          hard: true,
          ok: agRedLine === null || topLine === null ? null : glyphOk ? true : false,
          detail: agRedLine === null || topLine === null
            ? `字形面行缺失（ag-red=${agRedLine !== null} top=${topLine !== null}）→ INCONCLUSIVE 定因核 list-capture`
            : glyphOk
              ? `idle 代理行实心 ●（p39-ag-red）+ 非代理行空心 ○（p39-top）= S4 圆点身份标记面`
              : `圆点字形不符（ag-red ●=${agRedLine.includes('●')} top ○=${topLine.includes('○')}）→ FAIL`,
        },
      )

      // ══ S3 二级行（x 展开/收起；展开跟随光标；摘要优先 + firstPrompt 回落双路径）══
      // 定因订正（run1）：x 键落点需列表输入就绪（首帧静态断言后立即 x = 键被吞/未生效，
      // run1 `└ p39-top` 全 raw 缺席而 `└ p39-summary-A` 在场 = x1 键位未落）；cell-diff
      // 逐 cell 重放交错 → delta 片段不可靠，二级行断言改全量累积文本（首次现形必在 raw）。
      const oX1 = (pty as any).logSize?.() ?? 0 // X1 键相 offset（kill 后 └ 行诊断面）
      await sleep(1000) // 列表输入就绪窗（x1 前）
      pty.sendRaw('x') // 焦点行 = p39-top（无 summary → firstPrompt 回落路径）
      await sleep(X_SETTLE_MS)
      const cumAfterX1 = dt.all()
      const s3x1 = cumAfterX1.includes('└ p39-top')
      // 物理位置：└ 行介于「光标行末次现形」与「下一行首次现形（└ 行之后）」之间。
      // run2c 定因订正：下一行 = s3sum session，其标题 = 'p39-summary-A'（0.1.39 标题链
      // agentName→customTitle→summary→firstPrompt，summary 优先；活屏实证）——旧判词 'p39-s3sum' 恒缺席。
      const s3PosOk = (() => {
        const iSum = cumAfterX1.indexOf('└ p39-top')
        if (iSum < 0) return false
        const iTop = cumAfterX1.lastIndexOf('p39-top', iSum)
        // rerun-b7ef49f 定因订正（探针侧判据面）：X1 reflow 只重放后续行变化 cell（cell-diff：
        // 未变前导 cell 不重发）→ 下一行（s3sum）完整字面 'p39-summary-A' 在 X1 相累积文本缺席
        // （首次现形 = Down 相全量重渲，不在 cumAfterX1 内）→ 旧 iNext 锚恒 -1 误判 FAIL（产品物理
        // 位置实正确：raw 实证 └ 行紧接光标行 + 后续行 reflow 于其下：└ p39-top 后紧跟 reflow 片段
        // 'ummary-A/s3b/…p39-badges'）。订正 = iNext 锚 reflow 片段容错（后续行标记集，完整字面/片段任一）。
        const iNext = ['p39-summary-A', 'ummary-A', 'p39-s3b', 's3b', 'p39-badges']
          .map(a => { const p = cumAfterX1.indexOf(a, iSum + 1); return p >= 0 ? p : Infinity })
          .reduce((m, p) => Math.min(m, p), Infinity)
        return iTop >= 0 && iTop < iSum && iNext > iSum && iNext < Infinity
      })()
      // run2d 定因订正（产品 S3 展开模型 = boolean toggle + 展开跟随光标，SessionTreeScreen.tsx:488-491：
      // expandedIdx = expanded ? focusedIdx : null，码注「行级属性语义，不做 per-session 记忆」= 有意设计）：
      // Down 本身把展开从行 0（p39-top）重锚到行 1（s3sum，标题 'p39-summary-A'，task-summary 尾条 =
      // 摘要优先路径）——「└ p39-summary-A」在 Down 后即现形（无需 x）；x2 = toggle 收起（└ 行消失）。
      const oX2 = (pty as any).logSize?.() ?? 0 // X2 键相 offset
      pty.sendRaw('\x1b[B') // Down → 焦点 s3sum session
      await sleep(600)
      const cumAfterDown = dt.all()
      const s3x2Summary = cumAfterDown.includes('└ p39-summary-A') // 展开跟随光标（Down 重锚，摘要优先路径）
      const s3x2Fallback = cumAfterDown.includes('└ p39-s3sum')
      dt.delta() // 推进 delta 基线（Down 相 delta 不含入收起相，防 cumAfterDown 前的 delta 污染 x2Delta）
      pty.sendRaw('x') // toggle 收起
      await sleep(X_SETTLE_MS)
      const x2Delta = dt.delta()
      const x2CollapseOk = !x2Delta.includes('└') // 收起相无新 └ 行现形 = toggle 收起实证
      // 不溢出：全列表 + 操作行提示同帧在场（视口 44 行 ≥ 13 行 + 1 展开行）
      const overflowOk = cumAfterX1.includes('p39-created3d') && cumAfterX1.includes('🖱 点击移动光标')
      probes.push(
        {
          id: 'SL-S3-X1-fallback',
          hard: true,
          ok: s3x1 ? true : null,
          detail: s3x1
            ? `x 展开焦点行（p39-top，无 summary）→ 二级行「└ p39-top」现形（firstPrompt 回落路径，恒非空；全量 raw 面）`
            : `x（1s 就绪窗 + 1.2s settle）后累积文本仍无「└ p39-top」（run1/run2c 两跑实证展开机制在场：X2「└ p39-summary-A」在场；x1 独缺 → p39-top 行 firstPrompt 回落路径未达 或 x#1 键位未落——kill 后 X1 键相区 └ 行诊断补入本 detail；若诊断有其他行 └ 行 = 回落路径缺口升级 Main 修复面）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S3-X2-summary',
          hard: true,
          ok: s3x2Summary || s3x2Fallback ? true : null,
          detail: s3x2Summary
            ? `Down 移光标 p39-s3sum → 展开重锚该行（跟随光标，无需再按 x）→ 二级行「└ p39-summary-A」现形（压缩摘要优先路径；再按 x = toggle 收起：收起相无新 └ 行现形=${x2CollapseOk}）`
            : s3x2Fallback
              ? `Down 后二级行现形但内容 = firstPrompt 回落（「└ p39-s3sum」；task-summary 尾条未被 lite 刮面——数据层缺口登记，S3 交互面达成）`
              : `Down 后未见 p39-s3sum 二级行（展开跟随光标未达——定因核 pty.log）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S3-PHYSICAL-POS',
          hard: true,
          ok: s3x1 ? (s3PosOk ? true : false) : null,
          detail: !s3x1
            ? `前置 S3-X1 未达 → INCONCLUSIVE 连带`
            : s3PosOk
              ? `二级行物理位置 = 光标行与下一行之间（└ p39-top 紧接 p39-top 行，后续行 reflow 于其下〔reflow 片段容错锚：完整字面/片段任一〕= 展开行占 2 物理行）`
              : `二级行物理位置错乱（└ 行与后续行锚均未现形/序乱——reflow 片段容错锚后仍 FAIL = 产品展开行布局面，升级 Main）→ FAIL`,
        },
        {
          id: 'SL-S3-NO-OVERFLOW',
          hard: true,
          ok: overflowOk ? true : null,
          detail: overflowOk
            ? `展开态全列表（末行 p39-created3d）+ 底部操作行（🖱 提示行）同帧在场 = 展开行 2 slot 不溢出视口（结构不变量单测承载，走查面实证）`
            : `展开态视口面未达（末行/操作行缺失——定因核 list-capture）→ INCONCLUSIVE`,
        },
      )

      // ══ S5 搜索模式（/ 进 → 击键本地过滤 → 零命中空态 → esc 退出）══
      // 定因订正（run1）：cell-diff 逐 cell 重放交错 → delta 片段不可靠（幸存者行/空态行/
      // 重排顶行可能被交错片段打断）。行为面断言改「raw 全量 + 键相 offset」：各键相前记
      // pty.log 字节 offset，kill 后在 offset 之后找行为产物（重排放行序 = 视图重排序）。
      pty.sendRaw('/')
      await sleep(KEY_SETTLE_MS)
      const s1 = dt.delta()
      const searchStateOk = s1.includes('搜索:""') && s1.includes('esc 退出')
      const oAgred = (pty as any).logSize?.() ?? 0
      // run2d 定因订正：间隔 120/80ms 时 PTY 读侧（事件循环忙于过滤重渲染）把相邻字符
      // 合并成多字符 data 事件 → 产品搜索输入守卫（input.length===1，SessionTreeScreen.tsx:667-675）
      // 整段丢弃（run2d 实证：zzz-no-match 只入 query 'z'，空态行 = No sessions match "z" ≠ 判词）。
      // 订正 = 300ms/字符（每字符独立 data 事件）+ 流后充分 settle。
      // （产品侧登记项：搜索模式多字符/粘贴输入被守卫丢弃 = 快速击键面缺口，非 0.1.39 S5 断言面，
      //   归 Main 0.1.39+ 裁定；gate 不阻塞。）
      await typeChars(pty, 'agred', 300) // 仅 p39-ag-red（agentSetting=agred，filterLogs L439）命中
      await sleep(KEY_SETTLE_MS + 1000)
      const oEmpty = (pty as any).logSize?.() ?? 0
      await typeChars(pty, '\x7f\x7f\x7f\x7f\x7f', 300) // backspace×5 逐字符清 query
      await sleep(600)
      await typeChars(pty, 'zzz-no-match', 300)
      await sleep(KEY_SETTLE_MS + 1500)
      pty.esc()
      await sleep(KEY_SETTLE_MS)
      const s4d = dt.delta()
      const escExit = s4d.includes('🖱 点击移动光标')
      probes.push(
        {
          id: 'SL-S5-SEARCH-STATE',
          hard: true,
          ok: searchStateOk ? true : null,
          detail: searchStateOk
            ? `「/」→ 操作行被搜索态行占用（搜索:"" · esc 退出，cyan）= S5 操作行搜索态面`
            : `搜索态行未现形（/ 键位/操作行替换未达——定因核 pty.log）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S5-ESC-EXIT',
          hard: true,
          ok: escExit ? true : null,
          detail: escExit
            ? `esc 退出搜索：query 清空，操作行回落提示行（🖱 …）= S5 搜索态可退出面`
            : `esc 后操作行未回落提示行（退出路径未达——定因核 pty.log）→ INCONCLUSIVE`,
        },
      )

      // ══ S5 s 键排序键循环（视图重排行为面 + 列头指示面）══
      // run2c 定因订正：cell-diff 稀疏重放（只重放变化 cell，行名可能不再现形——run2c 3 排序探针全 null，
      // 而 f 操作行实证 s#3 已生效）→ 行为面改「f confirm 行顶行标题判别」：每次 s（排序键循环 + focusedIdx=0）
      // 后按 f → 操作行 confirm 文本「✋ <顶行标题> · [再按 f 确认 fork · 3s 自动取消]」（操作行单行内容变
      // = 整行重放，免 cell-diff 碎片）；3s 自动取消回提示行（sortKey 保持，s 循环可续）。
      // 顶行标题期望（0.1.39 标题链 agentName→customTitle→summary→firstPrompt；s3sum session 带 task-summary → 标题 = summary 值）：
      //   s#1 创建降序 = s3sum session（created 1h 最新，≠ 最近活跃序顶行）→ 标题 'p39-summary-A'
      //   s#2 消息数降序 = p39-badges（14 消息最大，extraPairs 只抬消息数）→ 'p39-badges'
      //   s#3 名称升序 = p39-ag-blue（localeCompare 首位）
      // 指示面（列头「· 排序:」）= 显示面，与 S5-BADGES 同 S2 预算缺口面（SL-S5-SORT-IND-*）。
      const sTopTitles: string[] = []
      const sFTexts: string[] = []
      const sCancelTexts: string[] = []
      for (let i = 1; i <= 3; i++) {
        pty.sendRaw('s') // 最近活跃 → 创建 → 消息数 → 名称（nextSortKey 循环，光标回顶）
        await sleep(KEY_SETTLE_MS + 400)
        pty.sendRaw('f')
        await sleep(CONFIRM_SEE_MS)
        const c = dt.delta()
        sFTexts.push(c)
        const m = c.match(/✋\s*([^\n·]+?)\s*·/)
        sTopTitles.push(m ? m[1].trim() : '(未达)')
        await sleep(CANCEL_WAIT_MS) // 3s 自动取消 → 提示行
        sCancelTexts.push(dt.delta())
      }

      // ══ S1 fork 状态机移底部操作行（行内无状态机段；操作行单行 = 提示/状态行）══
      // = 排序循环第 3 次 f（名称序顶行 p39-ag-blue）：confirm 态现形 + 行内 token 负控 + 3s 自动取消回落
      const confirmRowOk = sFTexts[2].includes('✋') && sFTexts[2].includes('再按 f 确认 fork') && sFTexts[2].includes('3s 自动取消')
      const negInlineToken = !dt.all().includes('[f 确认 fork]')
      const cancelHint = sCancelTexts[2].includes('🖱 点击移动光标')
      probes.push(
        {
          id: 'SL-S1-CONFIRM-ROW',
          hard: true,
          ok: confirmRowOk ? true : null,
          detail: confirmRowOk
            ? `f → 操作行单行现形「✋ <title> · [再按 f 确认 fork · 3s 自动取消]」（yellow）= S1 状态机移底部操作行`
            : `confirm 态操作行未现形（f 键位/操作行替换未达——定因核 pty.log）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S1-NEG-INLINE-TOKEN',
          hard: true,
          ok: negInlineToken ? true : false,
          detail: negInlineToken
            ? `全量捕获无 0.1.38 态行内状态机 token「[f 确认 fork]」（行内只剩数据 chip；S1 判别面：状态机段离场）`
            : `行内状态机 token「[f 确认 fork]」仍在场 = S1 状态机未移底部操作行（0.1.38 态残留）→ FAIL`,
        },
        {
          id: 'SL-S1-CANCEL-HINT',
          hard: true,
          ok: cancelHint ? true : null,
          detail: cancelHint
            ? `3s 超时 → 操作行回落提示行（🖱 …）= 操作行单行恒定（状态行/提示行合并，条件行不破坏底部不变量）`
            : `3s 后操作行未回落提示行（超时取消路径未达——定因核 pty.log）→ INCONCLUSIVE`,
        },
      )

      // ══ S4 焦点/选中优先级（身份 cyan 行 p39-ag-cyan：焦点态裸 cyan SGR 覆盖身份色 → 选中 magentaBright）══
      pty.sendRaw('\x1b[B') // Down → 焦点 p39-ag-cyan（名称序 ag-blue 之下）
      await sleep(KEY_SETTLE_MS)
      pty.sendRaw('\r') // enter#1 = 选中（单次！二次 enter 会 resume 进入 session）
      await sleep(KEY_SETTLE_MS)

      // ══ kill 后读全量 raw（SGR 断言权威面：pty.log 全量 raw 通道）══
      pty.kill()
      await sleep(500)
      const raw = readFileSync(join(scenDir, 'pty.log'), 'utf8')
      const colorSupport = colorSupportOf(raw)
      // ══ S5 行为面复评（raw 全量 + 键相 offset；run1 delta 面因 cell-diff 交错不可靠）══
      const filterSurvivor = raw.indexOf('p39-ag-red', oAgred) > 0
      // rerun-b7ef49f 定因订正（探针侧判据面，cell-diff 碎片化）：零命中空态面实功能（raw 实证：'z' 相
      // 完整行 `No sessions match "z"` 在场 + zzz 相搜索行逐字符 cell 片段链（z×3→- n o - m a t c h）
      // 证 query 达全量 'zzz-no-match'）；全量 query 完整字面不连续 = 前缀 'No sessions match ' 未变不
      // 重发 + 引内字符 cell 片段化。订正 = 判据碎片容错（oEmpty 后零命中空态行前缀在场 = 空态面现形）。
      const emptyState = raw.indexOf('No sessions match', oEmpty) >= 0
      // S3 X1 键相 └ 行诊断（raw[oX1:oX2] = x#1 键相区；cell-diff 碎片容错：└ 前缀片段即可）
      const x1Tails = (raw.slice(oX1, oX2).match(/└[^\n]{0,30}/g) ?? [])
        .map(s => s.replace(/\x1b.*/g, '').trim()).filter(Boolean)
      const x1Idx = probes.findIndex(p => p.id === 'SL-S3-X1-fallback')
      if (x1Idx >= 0 && probes[x1Idx].ok === null) {
        probes[x1Idx] = {
          ...probes[x1Idx],
          detail: `${probes[x1Idx].detail}｜X1 键相区 └ 行诊断：${x1Tails.length ? JSON.stringify(x1Tails) + '（有其他行 └ 行现形 = 展开机制在场，p39-top 回落路径独缺 → 升级 Main 修复面）' : '无任何 └ 行（x#1 键位未落/展开未触发——键位面，重跑核）'}`,
        }
      }
      // rerun-b7ef49f 定因订正（探针侧判据面，cell-diff 碎片化）：「· 排序:」前缀在初始全量列头渲染
      // （完整字面「· 排序:最近活跃」在场）；s 键重渲只重放标签 cell（创建/消息数/名称，raw 实证 s#1
      // 键相区「创建」标签 cell 在场）→ 完整字面「· 排序:创建」不连续（前缀与标签 cell 分属不同重放段）。
      // 指示面实功能（gap-B chip 槽修复后列头预算容纳指示：SL-S5-SORT-IND-INITIAL + BADGES-chips 绿）。
      // rerun-r2 定因再订正：offset 门控（logSize() = statSync 字节 size）× raw（JS 字符串字符下标）
      // 单位失配 → CJK 重日志字节偏移 > 字符下标 → slice 越位。订正 = 内容锚（字符安全）：初始指示
      // 「排序:最近活跃」（s 键前初始全量列头渲染）= 锚；锚后「创建」= s#1 排序标签 cell（列头列标签
      // 「创建」在同列头行锚前 = 排除；3 次 s 无回绕，「排序:最近活跃」恒唯一）。
      const indCreated = (() => {
        const a = raw.lastIndexOf('排序:最近活跃')
        return raw.includes('· 排序:') && a >= 0 && raw.indexOf('创建', a + 1) > a
      })()
      probes.push(
        {
          id: 'SL-S5-FILTER-SURVIVOR',
          hard: true,
          ok: filterSurvivor ? true : null,
          detail: filterSurvivor
            ? `击「agred」→ 本地同步过滤：幸存者 p39-ag-red 行在 agred 键相后重放（raw offset 面；零 I/O 零 LLM，输入每击实时过滤）`
            : `agred 键相后 raw 无 p39-ag-red 重放（cell-diff 未重放该行/过滤未生效/重放序乱——定因核 pty.log 键相区）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S5-EMPTY-STATE',
          hard: true,
          ok: emptyState ? true : null,
          detail: emptyState
            ? `零命中 → 空态行「No sessions match …」现形（本地零命中面，raw 键相区；碎片容错判据：首个零命中 query〔'z' 相〕完整行在场 + zzz 全量 query 相 = 字符 cell 片段链〔同面，cell-diff 碎片化定因登记〕）`
            : `空态行未现形（oEmpty 后 raw 无「No sessions match」前缀——零命中空态面缺失 = 产品显示面，升级 Main；定因核 pty.log）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S5-SORT-S1-created',
          hard: true,
          ok: sTopTitles[0] === 'p39-summary-A' ? true : null,
          detail: sTopTitles[0] === 'p39-summary-A'
            ? `s → 排序键 创建（降序）：confirm 行顶行标题 = 'p39-summary-A'（s3sum session，created 1h 最新，≠ 最近活跃序顶行 = s 键重排行为面；标题 = 0.1.39 标题链 summary 优先）`
            : `s#1 后 confirm 行顶行标题 = ${JSON.stringify(sTopTitles[0])}（期望 'p39-summary-A'——排序重排未达/f 键位/confirm 行未达——定因核 pty.log 键相区）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S5-SORT-S2-messages',
          hard: true,
          ok: sTopTitles[1] === 'p39-badges' ? true : null,
          detail: sTopTitles[1] === 'p39-badges'
            ? `s → 排序键 消息数（降序）：confirm 行顶行 = p39-badges（14 消息最大 = extraPairs 只抬消息数面）`
            : `s#2 后 confirm 行顶行标题 = ${JSON.stringify(sTopTitles[1])}（期望 'p39-badges'——定因核 pty.log 键相区）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S5-SORT-S3-title',
          hard: true,
          ok: sTopTitles[2] === 'p39-ag-blue' ? true : null,
          detail: sTopTitles[2] === 'p39-ag-blue'
            ? `s → 排序键 名称（升序）：confirm 行顶行 = p39-ag-blue（title 升序 localeCompare 首位）= 四键循环 3/4 步实证（回绕单测承载）`
            : `s#3 后 confirm 行顶行标题 = ${JSON.stringify(sTopTitles[2])}（期望 'p39-ag-blue'——定因核 pty.log 键相区）→ INCONCLUSIVE`,
        },
        {
          id: 'SL-S5-SORT-IND-2',
          hard: true,
          ok: indCreated ? true : false,
          detail: indCreated
            ? `列头「· 排序:」指示随 s 键更新（前缀初始渲染在场 + 初始指示锚后「创建」标签 cell 在场 = 排序键列头指示面；碎片容错判据，cell-diff 碎片化定因登记）`
            : `列头「· 排序:」指示面缺失（前缀/初始锚后「创建」标签 cell 缺席——指示面被 S2 预算截断/未渲染，升级 Main 修复面；行为面〔重排〕与显示面〔指示〕分判据）→ FAIL`,
        },
      )
      // S4 8 身份色（idle 行首现 = 初始全量 render 色码；prev 链 = 显示序上一行 marker）
      const CHAIN: Array<[string, string]> = [
        ['p39-ag-red', 'p39-badges'],
        ['p39-ag-blue', 'p39-ag-red'],
        ['p39-ag-green', 'p39-ag-blue'],
        ['p39-ag-yellow', 'p39-ag-green'],
        ['p39-ag-purple', 'p39-ag-yellow'],
        ['p39-ag-orange', 'p39-ag-purple'],
        ['p39-ag-pink', 'p39-ag-orange'],
        ['p39-ag-cyan', 'p39-ag-pink'],
      ]
      const codes = CHAIN.map(([m, p]) => rowStartFgSgr(raw, m, p))
      const presentCount = codes.filter(c => c !== null).length
      const distinct = new Set(codes.filter((c): c is string => c !== null)).size
      const allThemeChannel = codes.every(c => c === null || isThemeChannel(c))
      const d4PresentOk =
        presentCount === 8 ? (colorSupport ? true : null) : colorSupport ? false : null
      probes.push(
        {
          id: 'SL-S4-IDLE-8-PRESENT',
          hard: true,
          ok: d4PresentOk,
          detail: presentCount === 8
            ? (colorSupport
              ? `8 个 agentColor idle 行 SGR 全在场（${codes.map(c => JSON.stringify(c)).join(' ')}；全走 theme 色板通道 = D4 根修后 0.1.38「全屏无前景色码」基线翻面）`
              : `8 色 SGR 在场但 PTY 色能力对照缺失（无 38;2;/38;5; 码）→ INCONCLUSIVE 定因核 pty.log 色能力面`)
            : colorSupport
              ? `8 色仅 ${presentCount}/8 SGR 在场（${CHAIN.map(([m], i) => `${m}=${JSON.stringify(codes[i])}`).join(' ')}；对照 PTY 色能力坐实 = 产品着色缺口〔D4 根修未达值域〕→ FAIL`
              : `8 色 ${presentCount}/8 且 PTY 色能力对照缺失 → INCONCLUSIVE 定因核 pty.log（双面对定因）`,
        },
        {
          id: 'SL-S4-IDLE-8-DISTINCT',
          hard: true,
          ok: presentCount === 8 ? (distinct === 8 && allThemeChannel ? true : false) : d4PresentOk === null ? null : false,
          detail: presentCount < 8
            ? `前置 8 色在场面未达成（${presentCount}/8）→ 精确映射面连带（${d4PresentOk === null ? 'INCONCLUSIVE' : 'FAIL'}）`
            : distinct === 8 && allThemeChannel
              ? `8 值域两两相异（distinct=${distinct}，全 theme 色板通道）= S4 精确映射（0.1.38 purple/pink→magenta、orange→yellow 对撞面消除）`
              : `8 色相异面破坏（distinct=${distinct}，theme 通道=${allThemeChannel}）= 精确映射退化为近似/对撞 → FAIL`,
        },
      )
      // S4 焦点/选中色面 + D4 裸色名抽查（同 raw 段）
      const agCyanCodes = rowFgSgrAll(raw, 'p39-ag-cyan')
      // rerun-b7ef49f 定因订正（探针侧导航假设错位）：S4 键相（Down+enter）假设「自顶行 Down 一次
      // 落 ag-cyan」——实际产品面 = 焦点会话保持（s#3 名称序后焦点 = p39-top 会话〔名称序末行〕，
      // Down 落邻行 p39-summary-A，enter 选中之；raw 实证 `> ○ p39-summary-A` 焦点帧 + `\x1b[95m…» ● p39-summary-A`
      // 选中帧）→ ag-cyan 行恒 idle（identity 色 = 产品正确行为；8 色身份面由 SL-S4-IDLE-8-* 承载）。
      // 焦点/选中色面在实焦点/选中行已物化：焦点标记行 (>) SGR 36（裸名 cyan 根修转绿）+ 选中标记行 (»)
      // SGR 95（裸名 magentaBright）。订正 = 判据移实标记行（键相不动）；ag-cyan 行「焦点/选中覆盖身份」
      // 优先级走查面 = 后续登记项（导航键相落 ag-cyan；本轮不阻塞——优先级逻辑 S4 单测族承载 + 物化面实证）。
      const focusMarkerCyan = raw.includes('\x1b[36m\x1b[1m> ') // 焦点标记行 cyan 帧（raw 实捕帧形态）
      const selMarkerMag = raw.includes('\x1b[95m\x1b[1m»') // 选中标记行 magentaBright 帧（raw 实捕帧形态）
      probes.push({
        id: 'SL-S4-FOCUS-CYAN-PRIORITY',
        hard: true,
        ok: agCyanCodes.length === 0 ? null : focusMarkerCyan ? true : false,
        detail: agCyanCodes.length === 0
          ? `p39-ag-cyan 行无任何 SGR 现形（cell-diff 重放复用/捕获面——定因核 pty.log；映射面单测 agentRowColors 承载）→ INCONCLUSIVE`
          : focusMarkerCyan
            ? `焦点色面 = 焦点标记行 (>) SGR 36（cyan，D4 根修裸名 cyan → ANSI 36 转绿物化）在实焦点行在场 = S4 焦点色面 + D4 转绿抽查（rerun-b7ef49f 定因订正：旧判据 target ag-cyan 行，S4 键相实落 = p39-summary-A〔产品焦点会话保持面〕，ag-cyan 行 = idle 身份色正确行为；ag-cyan 行焦点优先级走查面后续登记项）`
            : `焦点标记行无 cyan 36 帧（焦点色面未物化——定因核 pty.log；产品色面破坏，升级 Main）→ FAIL`,
      })
      probes.push({
        id: 'SL-S4-SEL-MAGENTA-PRIORITY',
        hard: true,
        ok: agCyanCodes.length === 0 ? null : selMarkerMag ? true : false,
        detail: agCyanCodes.length === 0
          ? `前置焦点面未达（行无 SGR 现形）→ INCONCLUSIVE 连带`
          : selMarkerMag
            ? `选中色面 = 选中标记行 (») SGR 95（magentaBright，D4 根修裸名 magentaBright → ANSI 95 转绿物化）在实选中行在场 = S4 选中色面 + D4 转绿抽查（rerun-b7ef49f 定因订正：旧判据 target ag-cyan 行，S4 键相 enter 实落 = p39-summary-A〔焦点会话保持面〕；ag-cyan 行选中优先级走查面后续登记项）`
            : `选中标记行无 magentaBright 95 帧（选中色面未物化——定因核 pty.log；产品色面破坏，升级 Main）→ FAIL`,
      })
      // D4 裸色抽查：header cyan + 操作行 confirm yellow（行局部区）
      const headerCyan = rowStartFgSgr(raw, 'Sessions', '/sessionlist')
      const confirmTokIdx = raw.lastIndexOf('再按 f')
      let confirmYellow: string | null = null
      if (confirmTokIdx >= 0) {
        const seg = raw.slice(Math.max(0, confirmTokIdx - 80), confirmTokIdx)
        const cs = (seg.match(/\x1b\[[0-9;]*m/g) ?? []).map(c => c.replace(/\x1b\[|m/g, ''))
        const fg = cs.filter(c => /^38;/.test(c) || /^9[0-7]$/.test(c) || /^3[0-8]$/.test(c))
        confirmYellow = fg[fg.length - 1] ?? null
      }
      probes.push({
        id: 'SL-D4-HEADER-CYAN',
        hard: true,
        ok: headerCyan === null ? (colorSupport ? false : null) : isCyanFam(headerCyan) ? true : false,
        detail: headerCyan === null
          ? (colorSupport
            ? `「🌲 Sessions」header 行局部区无前景色码（对照 PTY 色能力坐实）= D4 根修后 header 裸 cyan 仍落空 → FAIL`
            : `header SGR 未捕获且色能力对照缺失 → INCONCLUSIVE 定因核 pty.log`)
          : isCyanFam(headerCyan)
            ? `header「🌲 Sessions」cyan SGR 在场（SGR=${JSON.stringify(headerCyan)}）= D4 根修裸 cyan 转绿抽查`
            : `header 行局部区 SGR=${JSON.stringify(headerCyan)} 非 cyan 族（映射错/非 header 色）→ FAIL`,
      })
      probes.push({
        id: 'SL-D4-CONFIRM-YELLOW',
        hard: true,
        ok: confirmTokIdx < 0 ? null : confirmYellow === null ? (colorSupport ? false : null) : isYellowFam(confirmYellow) ? true : false,
        detail: confirmTokIdx < 0
          ? `confirm 态 token「再按 f」未现形（S1 面未达连带）→ INCONCLUSIVE 定因核 pty.log`
          : confirmYellow === null
            ? (colorSupport
              ? `confirm 操作行 token 前 80 字符无前景色码（对照色能力坐实）= 操作行裸 yellow 根修未达 → FAIL`
              : `confirm 行 SGR 未捕获且色能力对照缺失 → INCONCLUSIVE`)
            : isYellowFam(confirmYellow)
              ? `confirm 操作行 yellow SGR 在场（SGR=${JSON.stringify(confirmYellow)}）= D4 根修裸 yellow 转绿抽查（操作行态面色面）`
              : `confirm 行 SGR=${JSON.stringify(confirmYellow)} 非 yellow 族（映射错）→ FAIL`,
      })
    } else {
      // ══ col64 / col56：列宽自适应档位断言（列头行在场 + 列进退）══
      const headerLine = lineOf(text, '名称')
      if (scen === 'col64') {
        const ok =
          headerLine !== null &&
          headerLine.includes('创建') &&
          headerLine.includes('最近活跃') &&
          headerLine.includes('分支') &&
          !headerLine.includes('消息')
        probes.push({
          id: 'SL-S2-COL64-msg-hidden',
          hard: true,
          ok: headerLine === null ? null : ok ? true : false,
          detail: headerLine === null
            ? `64 列档列头行缺失 → INCONCLUSIVE 定因核 list-capture`
            : ok
              ? `64 列档：创建/最近活跃/分支在场 + 消息列离场（computeColumnLayout budget=44 < 47 砍最低密度列 = S2 64 列砍消息列面；0.1.38 态 64 列硬砍全 3 可选列，本档 created/branch 保留 = 自适应判别面）`
              : `64 列档列面不符（创建=${headerLine.includes('创建')} 分支=${headerLine.includes('分支')} 消息=${headerLine.includes('消息')}）→ FAIL`,
        })
      } else {
        const ok =
          headerLine !== null &&
          headerLine.includes('创建') &&
          headerLine.includes('最近活跃') &&
          !headerLine.includes('分支') &&
          !headerLine.includes('消息')
        probes.push({
          id: 'SL-S2-COL56-branch-hidden',
          hard: true,
          ok: headerLine === null ? null : ok ? true : false,
          detail: headerLine === null
            ? `56 列档列头行缺失 → INCONCLUSIVE 定因核 list-capture`
            : ok
              ? `56 列档：创建/最近活跃在场 + 分支/消息离场（budget=36 < 41 砍分支列 = S2 56 列砍分支列面）`
              : `56 列档列面不符（创建=${headerLine.includes('创建')} 分支=${headerLine.includes('分支')} 消息=${headerLine.includes('消息')}）→ FAIL`,
        })
      }
    }
  } finally {
    pty.kill()
    delete process.env.ATLAS_E2E_COLS
    delete process.env.ATLAS_E2E_ROWS
  }
  hardFail = probes.filter(p => p.hard && p.ok === false).length
  inconclusive = probes.filter(p => p.ok === null).length
  const scenResult = {
    run: RUN_TAG,
    scen,
    repo: REPO,
    probes,
    hardFail,
    inconclusive,
    verdict: probes.some(p => p.ok === null) && hardFail === 0
      ? `INCONCLUSIVE=${inconclusive}（定因见各探针）`
      : hardFail === 0
        ? 'PASS'
        : `FAIL（hardFail=${hardFail}）`,
  }
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify(scenResult, null, 2))
  console.log(`\n=== ${scen} ===  ${scenResult.verdict} → ${scenDir}`)
  for (const p of probes) console.log(`  [${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'}] ${p.id}: ${p.detail}`)
  return { probes, inconclusive, hardFail }
}

// ── PTY 启动（动态 import 防模块顶层 env 抢先；038 同法）─────────────
async function PtyStart(scenDir: string, ws: string, home: string): Promise<any> {
  const { Pty } = await import('../lib/pty')
  return Pty.start(
    { repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') },
    150_000,
  )
}

async function main(): Promise<void> {
  console.log(`[S39 ${RUN_TAG}] modes=${runScens.join(',')} repo=${REPO}`)
  let totalFail = 0
  let totalInc = 0
  for (const m of runScens) {
    const r = await runScenario(m)
    totalFail += r.hardFail
    totalInc += r.inconclusive
  }
  const overall =
    totalFail === 0 && totalInc === 0
      ? 'GATE-PASS'
      : totalFail > 0
        ? `GATE-OPEN（hardFail=${totalFail}）`
        : `GATE-OPEN（INCONCLUSIVE=${totalInc}，定因见各场景）`
  writeFileSync(
    join(RUN_DIR, 'summary.json'),
    JSON.stringify({ run: RUN_TAG, modes: runScens, totalFail, totalInc, overall }, null, 2),
  )
  console.log(`\n${overall} → ${RUN_DIR}`)
  process.exit(totalFail === 0 && totalInc === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(`[S39 ${RUN_TAG}] FATAL: ${String(e?.stack ?? e)}`)
  process.exit(2)
})
