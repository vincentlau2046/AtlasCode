/**
 * 0.1.38 sessionlist P0 正确性波 · 4 行为探针（e2e 交付，零产品改动；Main 回 0.1.38 hash 后开跑 gate）。
 *
 * 工单：docs/2026-10-06-sessionlist-implement.md（P0-A load-all / P0-B 排序键回消息时间戳〔B-lite〕
 * / P0-C1 删列表打开回写 / P0-C2 isSidechain 首行判定）。判据 = 工单「回归判别」P0 四条：
 *
 *   SL-SORT      ① P0-B：造「文件 mtime 旧、最后消息 timestamp 新」样例 A + 反向样例 B
 *                → 列表按最后消息时间戳排（非 mtime）；「最近活跃」列显示消息时间
 *                （0.1.38 随车显示面 55b5aa5：formatActive 混合——≤7d 相对 now/5m/2h/6d、
 *                >7d 绝对 `M/D HH:mm`，SessionTreeScreen.tsx:154；A=now−3h 取相对面 "3h"、
 *                B=now−30d 取绝对面，两面各断言一，避 7d 边界与分钟漂移）。
 *   SL-COUNT     ② P0-A：造 60 个有效 session（磁盘有效数 > 50 硬截断线）
 *                → 列表全量可达：200 行视口一屏全量现形（最旧行 cnt-59 在场；
 *                pre-fix 50 截断 → 最旧 10 行不可达）。
 *   SL-SIDECACHE ③ P0-C2：session 文件含 sidechain 内容（head 内 `"isSidechain":true` 条目，
 *                非首行）但本身非 sidechain（首行无 isSidechain 字段）→ 不再被误滤（pre-fix
 *                readLiteMetadata 整 64KB head 扫 `"isSidechain":true` → 整条被 enrichLog 过滤）。
 *   SL-MTIME     ④ P0-C1：打开 /sessionlist 前后各 seed session 文件 mtime 不变
 *                （列表打开回写循环 deriveAutoTitle+saveCustomTitle('auto') 已删；pre-fix
 *                fire-and-forget append 顶 mtime）。
 *
 * 判别力（前后 lane 统一，规则②）：四探针在 pre-fix（0.1.37）必 FAIL（判别基线）、post-fix
 * （0.1.38）必 PASS；FAIL = 产品缺口（fail-closed 不发布），INCONCLUSIVE 必带定因
 * （探针/面未达：列表未渲染 / REPL 未就绪 / PageDown 未生效——核 artifact pty.log）。
 *
 * 拓扑/纪律：PTY（lib/pty.ts，200×50 默认；`ATLAS_E2E_COLS/ROWS` 可覆盖）起
 * `bun run <repo>/src/atlascode/cli.ts`（workspace=sandbox ws，HOME=sandbox home，零写真实 ~/.atlas）；
 * /sessionlist 打开 = 纯 FS 读路径（loadSameRepoAllMessageLogs），不涉模型调用 → 无网关竞争
 * （同 lane 串行仍守：与本 lane 其他 PTY 探针互斥）。fixture = 手造 JSONL session 文件
 * （schema 镜像真实 session 条目：mode 头 + user/assistant 消息条目〔含 timestamp/isSidechain:false〕
 * + 元数据条目；mtime 经 fs.utimesSync 精确造「mtime 旧/新」解耦面）。
 *
 * 显示面断言（用户裁定 B：55b5aa5 随车面行为断言拉进 0.1.38 gate；场景 `display`，双 PTY）：
 *   D1 created 列（双时间）：fixture 首消息 ts 已知（now−3d / 2025-12-25 固定）→ created 列 =
 *                formatCreated `M/D/YYYY` 且值 = 首消息时间戳（非 stat mtime/birthtime 脏值面）。
 *   D2 [C] 徽标：尾条 metadata mode=coordinator（last-wins tail scrape，enrichLog mode 校验域）
 *                → 行内 `[C]` token 在场。
 *   D3 chip：fixture tag=e2etag → `#e2etag`；agentSetting=e2eagent → `@e2eagent`（行尾 token 形保留）。
 *   D4 agentColor 着色基线（Main 裁定③ 0.1.38 态，chalk 保守映射）：fixture agentColor=orange
 *                → idle 行 raw ANSI 黄族（`AGENT_ROW_COLOR.orange='yellow'`）；purple → 紫族
 *                （'magenta'）；plain 对照行行首区不现族码（核 pty.log 全量 raw 通道的**行局部区**
 *                前景码：上一行 title 后 → 本行 title 前；只取 38;/16 色 fg 码，复位/强度码排除）。
 *   D5 状态机前置态（Main 裁定④ 0.1.38 前置面）：聚焦行按 f → 3s confirm 窗口内
 *                「[f 确认 fork]」token 现形（宽档）+ **窄档截断核**（窄档 maxFlags < 标志段全宽 →
 *                尾部截断：状态机 token 幸存、尾部数据 chip 被截 = 前置防截断现形）；不 assert 底部
 *                操作行（0.1.39 面）。源级序锚 = flags 拼接状态机先于数据 chip。
 *   D6 列宽基线快照（0.1.38 现状，供 0.1.39 自适应 diff）：宽档 200×50 全列（名称/创建/最近活跃/
 *                分支/消息）在场；窄档 70×30（ATLAS_E2E_COLS=70 ROWS=30）= 0.1.38 硬砍创建/分支/
 *                消息列基线（走查记录为基线，非 FAIL）。
 *   不进 0.1.38 gate（0.1.39 面，不断言）：summary 二级行（裁定①）/ agentName 独立 chip（裁定②）
 *   / PR/fileSize/worktree 徽标 / agentColor 精确 theme 映射 / 搜索过滤排序切换 / 底部操作行。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/sessionlist-038.ts --repo <worktree-0.1.38> [--all|sort|count|sidechain|mtime|display]
 * 产物：artifacts/SL-<stamp>-<rand>/<scen>/{result.json,pty.log[,pty-narrow.log]}（pty.log 为 PTY 全量 raw 日志）
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, statSync, utimesSync, readdirSync } from 'node:fs'
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
// rerun-b7ef49f 卫生订正：旧默认 = 0.1.38 lane worktree（prodlane-038 @ d15c416）→ 0.1.39+ face 重跑
// 忘传 --repo 时误测 0.1.38 face（display 判据 face 漂移假红）。订正 = 默认 cwd（probe 惯例自 repo root
// 执行 = 当前 master face）；lane 重跑仍显式 --repo 指 lane worktree。
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? process.cwd()
const MODES = ['sort', 'count', 'sidechain', 'mtime', 'display'] as const
type Scen = (typeof MODES)[number]
const runScens: Scen[] = argv.includes('--all') ? [...MODES] : MODES.filter(m => argv.includes(m))
if (runScens.length === 0) runScens.push('sort') // 缺省 = sort（单跑最快场景）

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'
const LIVE_GW = 'http://127.0.0.1:8999'

const LIST_RENDER_MS = 25_000 // 列表渲染窗（load-all 全读 60×128KB 量级）
const MTIME_OBSERVE_MS = 12_000 // 列表打开后观察窗（pre-fix fire-and-forget 回写窗）
const MTIME_POST_MS = 3_000 // 关列表（q）后回写余量
// count 场景 200 行视口（ATLAS_E2E_ROWS=200，harness pty-driver 读 env）：visibleRows = 200−4−2 = 194 ≥ 60
// → 全量 60 行初始全量 emit 一屏现形（新屏全量 emit 非 cell-diff）→ 免滚动到底。
// run1/run2 探针缺陷定因（均非产品缺口）：① run1 误发 ESC[5~（= PageUp，顶行 focus no-op）当 PageDown
// （xterm PageDown = ESC[6~；parse-keypress.ts:357-358 '[5~'→pageup/'[6~'→pagedown）② run2 正确
// PageDown 后滚动屏为 cell 级 diff 重绘（TUI 只重发变化 cell，标题 cell 不再 emit）→ sinceText 底区
// 捕获缺 cnt-59（pty.log 实捕 cnt-59 已渲染 = 数据层 load-all 已生效，探针捕获面缺陷）。全视口消两缺陷。
const COUNT_PTY_ROWS = '200'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const RUN_TAG = `SL-${stamp()}-${Math.random().toString(36).slice(2, 5)}`
const RUN_DIR = join(ART, RUN_TAG)
mkdirSync(RUN_DIR, { recursive: true })

// ── 镜像产品源（断言锚点，源级定因）──────────────────────────────────
/** formatShortActive（SessionTreeScreen.tsx:143，0.1.38 保留）：绝对时间 `M/D HH:mm`（本地时区）。 */
function fmtShort(d: Date): string {
  const m = d.getMonth() + 1
  const dd = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${dd} ${h}:${mi}`
}
/** formatActive（SessionTreeScreen.tsx:154，0.1.38 随车面 55b5aa5）：≤7d 相对（now/5m/2h/6d）、>7d 绝对。
 * 探针侧镜像（A=now−3h 渲染时 elapsed≈3h+启动期 <1h → 稳定落 "3h" 桶；B=now−30d → 绝对支走 fmtShort）。 */
function fmtActive(date: Date, nowMs: number): string {
  const ageMs = nowMs - date.getTime()
  const m = Math.floor(ageMs / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return fmtShort(date)
}
/** formatCreated（SessionTreeScreen.tsx:160，0.1.38 随车面 55b5aa5）：`M/D/YYYY`（数据源 = 首消息时间戳 P0-B）。 */
function fmtCreated(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}
/** D4：行局部区 SGR 提取——窗口 = 上一行 title marker 之后 → 本行 title marker 之前（本行行首区）。
 * 只取前景色码（38;…/16 色 30-38；复位 39 / 粗体 1 / 强度 22 等排除——run1 定因：最后码取到 focus 行
 * 强度复位 `22` 而非行色码）。行色码 = 本行 <Text> color 包裹的 SGR（位于本行内容前）。 */
function rowStartFgSgr(raw: string, marker: string, prevMarker: string): string | null {
  const iM = raw.indexOf(marker)
  const iP = raw.indexOf(prevMarker)
  if (iM < 0 || iP < 0 || iP >= iM) return null
  const seg = raw.slice(iP + prevMarker.length, iM)
  const codes = (seg.match(/\x1b\[[0-9;]*m/g) ?? []).map(c => c.replace(/\x1b\[|m/g, ''))
  const fg = codes.filter(c => /^38;/.test(c) || /^3[0-8]$/.test(c))
  return fg[fg.length - 1] ?? null
}
// D4 色族锚（AGENT_ROW_COLOR 0.1.38 基线：orange→yellow / purple·pink→magenta，chalk level 自适应）：
// 24-bit（PTY 实捕 level 3 主路径）`38;2;255;255;0` / `38;2;255;0;255`；256 色（level 2）cube 索引
// 206=(255,255,0)/201=(255,0,255) + xterm 16 色 3/11/13；16 色 level 1 裸 33/35 兜底。
// 对照：品牌主题色 38;2;255;184;0（accent 橙）不在族内 → 不冲突。
const YELLOW_FAM_RE = /38;2;255;255;0$|38;5;(206|11|3)$|^33$/
const MAGENTA_FAM_RE = /38;2;255;0;255$|38;5;(201|13)$|^35$/
/** sanitizePath（src/shared/path.ts:89，MAX=200）：非字母数字→'-'（e2e workspace 路径 < 200，无截断支）。 */
function slug(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-')
}

// ── session fixture（JSONL schema 镜像真实条目；mtime 经 utimes 解耦造面）────────────
/** 真实 user 消息条目（首行之后；timestamp = 该消息墙钟 ISO；isSidechain 显式 false）。 */
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
/** 真实 assistant 消息条目（消息流末条 = 最后消息时间戳源；B-lite 排序键取此 timestamp）。 */
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
const modeEntry = (sid: string): string => JSON.stringify({ type: 'mode', mode: 'default', sessionId: sid })
/** sidechain 内容条目（P0-C2 误伤触发面：head 内 `"isSidechain":true`，但非首行）。 */
const sidechainContentEntry = (sid: string, tsIso: string): string =>
  JSON.stringify({
    type: 'task',
    isSidechain: true,
    agentId: 'worker-1',
    sessionId: sid,
    timestamp: tsIso,
    task: 'e2e sidechain content marker (非首行 sidechain 内容，P0-C2 判别触发面)',
  })

interface Fixture {
  sid: string
  lines: string[]
  /** 文件 mtime（ms epoch）；缺省 = 写盘时刻 */
  mtimeMs?: number
  /** 最后消息 timestamp（ISO）——排序键/最近活跃列断言源 */
  lastTs?: Date
  prompt?: string
}

function writeSession(projectDir: string, fx: Fixture): string {
  const f = join(projectDir, `${fx.sid}.jsonl`)
  writeFileSync(f, fx.lines.join('\n') + '\n')
  const m = fx.mtimeMs ?? Date.now()
  utimesSync(f, m / 1000, m / 1000)
  return f
}

/** fixture 自检（探针 bug 非产品缺口：seed 后 JSONL 逐行可解析 + 含 user 条目，否则 PTY 前 ERROR）。 */
function selfCheckFixture(projectDir: string): string | null {
  for (const f of readdirSafe(projectDir)) {
    if (!f.endsWith('.jsonl')) continue
    const lines = readFileSync(join(projectDir, f), 'utf8').split('\n').filter(Boolean)
    for (const l of lines) {
      try {
        JSON.parse(l)
      } catch {
        return `${f} 存在不可解析行（fixture 缺陷）`
      }
    }
    if (!lines.some(l => l.includes('"type":"user"'))) return `${f} 无 user 条目（firstPrompt 提取将空 → enrich '(session)' 兜底，标题断言失效）`
  }
  return null
}
function readdirSafe(d: string): string[] {
  try {
    return readdirSync(d)
  } catch {
    return []
  }
}

// ── PTY 驱动（lib/pty：REPL 就绪 → /sessionlist → 渲染窗 → 场景断言面）──────────────
type Verdict = { id: string; hard: boolean; ok: boolean | null; detail: string }

async function openSessionList(pty: any, scenDir: string, capName = 'list-capture.txt'): Promise<{ listRendered: boolean; text: string }> {
  pty.send('/sessionlist')
  const t0 = Date.now()
  let text = ''
  while (Date.now() - t0 < LIST_RENDER_MS) {
    text = pty.sinceText()
    // 列表渲染强信号：🌲 Sessions 标题 + 列头「最近活跃」（非 Loading 态）
    if (text.includes('Sessions') && text.includes('最近活跃') && !text.includes('Loading sessions')) break
    await sleep(1500)
  }
  const listRendered = text.includes('最近活跃')
  writeFileSync(join(scenDir, capName), text)
  return { listRendered, text }
}

function lineOf(text: string, marker: string): string | null {
  for (const l of text.split('\n')) if (l.includes(marker)) return l
  return null
}
/** 行内「最近活跃」列绝对值（>7d 面 `M/D HH:mm`；标题后第一时间列；pad 折叠 \s+）。 */
function activeCellOf(line: string | null, marker: string): string | null {
  if (!line) return null
  const m = line.slice(line.indexOf(marker)).match(/\s+(\d{1,2}\/\d{1,2} \d{2}:\d{2})/)
  return m ? m[1] : null
}
/** 行内「最近活跃」列相对值（≤7d 面 now/5m/2h/6d，0.1.38 随车面）：marker 后第一个相对 token。
 * 行内其余列（创建 M/D/YYYY、分支 master、消息数裸数字）均无 m/h/d 后缀 → 不误匹配；
 * 提取失败（null）= 面未达（列布局变化/未渲染相对面）→ INCONCLUSIVE 定因核 list-capture。 */
function relCellOf(line: string | null, marker: string): string | null {
  if (!line) return null
  const rest = line.slice(line.indexOf(marker) + marker.length)
  const m = rest.match(/(now|\d+[mhd])\b/)
  return m ? m[1] : null
}

async function runScenario(scen: Scen): Promise<{ probes: Verdict[]; inconclusive: number; hardFail: number }> {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', `SL-${scen}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
  const home = join(ROOT, 'home', `SL-${scen}`)
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
  const iso = (ms: number) => new Date(ms).toISOString()
  const projectDir = join(home, '.atlas', 'projects', slug(ws))
  // run2d 定因订正（038 同面）：sandbox home 跨 run 复用 + fixture randomUUID sid → 每 run 累积
  // 进同一项目会话目录（039 走查实证 52 行污染行序/顶行假设）→ 每 run 清空（场景面自重建）。
  rmSync(projectDir, { recursive: true, force: true })
  mkdirSync(projectDir, { recursive: true })

  // ── 场景 fixtures（每场景独立 project dir：列表态互不污染）──
  const mtimesBefore = new Map<string, number>()
  let sortA: Date | null = null // seed 时刻基准（断言期望用 seed 时刻，非断言时刻——避免 PTY 启动期分钟漂移）
  let sortB: Date | null = null
  let sortAMtime: Date | null = null
  if (scen === 'sort') {
    // A：最后消息时间新（now−3h → 0.1.38 活跃列相对面 "3h"；elapsed 3h+启动期 <4h，桶内稳定）、
    //     文件 mtime 旧（now−2d → 若仍 mtime 面：排序面 B 在上 + 活跃列显 "2d"/绝对 mtime）
    // B：反向（最后消息 ts 旧 30d → 活跃列绝对面 M/D HH:mm、文件 mtime 新 = now → pre-fix mtime 排序顶到最上）
    const A = new Date(now - 3 * 3_600_000)
    const B = new Date(now - 30 * 86_400_000)
    sortA = A
    sortB = B
    sortAMtime = new Date(now - 2 * 86_400_000)
    // session 文件名须为 UUID（getSessionFilesWithMtime validateUuid 8-4-4-4-12 滤面；
    // 非 UUID 文件名 = 磁盘无效 session 静默排除）；显示标题 = firstPrompt（sl-sort-A/B 不变）
    const uidA = randomUUID()
    const uidB = randomUUID()
    writeSession(projectDir, {
      sid: uidA,
      prompt: 'sl-sort-A',
      lastTs: A,
      mtimeMs: now - 2 * 86_400_000,
      lines: [
        modeEntry(uidA),
        userEntry(uidA, randomUUID(), 'sl-sort-A', iso(A.getTime() - 60_000), ws),
        assistantEntry(uidA, '', 'sl-sort-A 应答', A.toISOString(), ws),
      ],
    })
    writeSession(projectDir, {
      sid: uidB,
      prompt: 'sl-sort-B',
      lastTs: B,
      mtimeMs: now,
      lines: [
        modeEntry(uidB),
        userEntry(uidB, randomUUID(), 'sl-sort-B', iso(B.getTime() - 60_000), ws),
        assistantEntry(uidB, '', 'sl-sort-B 应答', B.toISOString(), ws),
      ],
    })
  } else if (scen === 'count') {
    // 60 有效 session：最后消息 ts = now − NN×60s（NN 00..59；NN 越大越旧），mtime 同 ts（解耦排序变量）
    for (let nn = 0; nn < 60; nn++) {
      const lastTs = new Date(now - nn * 60_000)
      const sid = randomUUID() // 文件名 UUID（validateUuid）；显示标题 = prompt cnt-NN
      writeSession(projectDir, {
        sid,
        prompt: `cnt-${String(nn).padStart(2, '0')}`,
        lastTs,
        mtimeMs: lastTs.getTime(),
        lines: [
          modeEntry(sid),
          userEntry(sid, randomUUID(), `cnt-${String(nn).padStart(2, '0')}`, iso(lastTs.getTime() - 30_000), ws),
          assistantEntry(sid, '', `cnt-${String(nn).padStart(2, '0')} 应答`, lastTs.toISOString(), ws),
        ],
      })
    }
  } else if (scen === 'sidechain') {
    const tsA = new Date(now - 3_600_000)
    const sidS = randomUUID()
    const sidT = randomUUID()
    // S：含 sidechain 内容（非首行 `"isSidechain":true` 条目）但本身非 sidechain（首行无该字段）
    writeSession(projectDir, {
      sid: sidS,
      prompt: 'sl-side-S',
      lastTs: tsA,
      mtimeMs: tsA.getTime(),
      lines: [
        modeEntry(sidS),
        userEntry(sidS, randomUUID(), 'sl-side-S', iso(tsA.getTime() - 60_000), ws),
        sidechainContentEntry(sidS, tsA.toISOString()),
        assistantEntry(sidS, '', 'sl-side-S 应答', tsA.toISOString(), ws),
      ],
    })
    // T：纯主 session 对照（必列）
    const tsB = new Date(now - 2 * 3_600_000)
    writeSession(projectDir, {
      sid: sidT,
      prompt: 'sl-side-T',
      lastTs: tsB,
      mtimeMs: tsB.getTime(),
      lines: [
        modeEntry(sidT),
        userEntry(sidT, randomUUID(), 'sl-side-T', iso(tsB.getTime() - 60_000), ws),
        assistantEntry(sidT, '', 'sl-side-T 应答', tsB.toISOString(), ws),
      ],
    })
  } else if (scen === 'display') {
    // 显示面 6 session（D1 双时间 / D2 [C] / D3 chip / D4 agentColor 着色基线 / D5 状态机前置 / D6 宽窄基线）。
    // 排序（新→旧）：disp-top(2m) > disp-created3d(2h) > disp-orange(8h) > disp-purple(12h)
    // > disp-plain(14h) > disp-created2025(5d)。顶行 = disp-top（focus 行，D5 触发面）；
    // agentColor 行（orange/purple）非顶行 = 非 focus → idle 行按 AGENT_ROW_COLOR 着色（focus cyan 不干扰 D4）。
    // 文件名 UUID（validateUuid 滤面）；title = firstPrompt（user 条目 content）。
    const mk = (prompt: string, lastMs: number, mtimeMs: number, extraLines: string[], userTsMs: number) => {
      const sid = randomUUID()
      writeSession(projectDir, {
        sid,
        prompt,
        lastTs: new Date(lastMs),
        mtimeMs,
        lines: [
          modeEntry(sid),
          userEntry(sid, randomUUID(), prompt, new Date(userTsMs).toISOString(), ws),
          assistantEntry(sid, '', `${prompt} 应答`, new Date(lastMs).toISOString(), ws),
          ...extraLines,
        ],
      })
      return sid
    }
    // disp-top：D5+D2+D3 面——tag chip + agentSetting chip + coordinator [C]（尾条 mode 条目 = last-wins tail scrape）
    mk('disp-top', now - 2 * 60_000, now, [
      JSON.stringify({ type: 'tag', tag: 'e2etag', sessionId: 'x' }),
      JSON.stringify({ type: 'agent', agentSetting: 'e2eagent', sessionId: 'x' }),
      JSON.stringify({ type: 'mode', mode: 'coordinator', sessionId: 'x' }),
    ], now - 5 * 60_000)
    // disp-created3d：D1-a——首消息 ts = now−3d → created 列 = 10/4/2026（消息时间戳，非 stat 脏值）；
    // mtime 造 now−10d 诱饵（若 created 列走 stat mtime → 9/27/2026；birthtime → 10/7/2026，均 ≠ 期望）
    mk('disp-created3d', now - 2 * 3_600_000, now - 10 * 86_400_000, [], now - 3 * 86_400_000)
    // disp-created2025：D1-b——首消息 ts = 2025-12-25T10:00Z（固定无漂移）→ created 列 = 12/25/2025；mtime = now 诱饵
    mk('disp-created2025', now - 5 * 86_400_000, now, [], Date.parse('2025-12-25T10:00:00.000Z'))
    // disp-orange / disp-purple：D4——agentColor 尾条 last-wins scrape → idle 行色码。
    // 0.1.39 随车面（S4）：theme 精确映射 orange→rgb(234,88,12)=38;2;234;88;12 / purple→rgb(147,51,234)=38;2;147;51;234
    // （0.1.38 基线 = chalk 保守近似 orange→yellow 族 / purple→magenta 族，S4 已故意替换；断言面随更新，见 D4 段）。
    mk('disp-orange', now - 8 * 3_600_000, now - 8 * 3_600_000, [
      JSON.stringify({ type: 'agent', agentColor: 'orange', sessionId: 'x' }),
    ], now - 9 * 3_600_000)
    mk('disp-purple', now - 12 * 3_600_000, now - 12 * 3_600_000, [
      JSON.stringify({ type: 'agent', agentColor: 'purple', sessionId: 'x' }),
    ], now - 13 * 3_600_000)
    // disp-plain：D4 对照（无 agentColor/chip → 行 = 主题默认色，不现黄/紫族码）
    mk('disp-plain', now - 14 * 3_600_000, now - 14 * 3_600_000, [], now - 15 * 3_600_000)
  } else {
    // mtime：8 个无 customTitle session（pre-fix 回写触发面最大化：deriveAutoTitle→saveCustomTitle('auto')）
    for (let nn = 0; nn < 8; nn++) {
      const lastTs = new Date(now - (nn + 1) * 86_400_000)
      const sid = randomUUID() // 文件名 UUID（validateUuid）；显示标题 = prompt mt-NN
      const f = writeSession(projectDir, {
        sid,
        prompt: `mt-${String(nn).padStart(2, '0')}`,
        lastTs,
        mtimeMs: lastTs.getTime(),
        lines: [
          modeEntry(sid),
          userEntry(sid, randomUUID(), `mt-${String(nn).padStart(2, '0')}`, iso(lastTs.getTime() - 60_000), ws),
          assistantEntry(sid, '', `mt-${String(nn).padStart(2, '0')} 应答`, lastTs.toISOString(), ws),
        ],
      })
      mtimesBefore.set(f, statSync(f).mtimeMs)
    }
  }

  const fixtureErr = selfCheckFixture(projectDir)
  const probes: Verdict[] = []
  const { Pty } = await import('../lib/pty')
  if (scen === 'count') process.env.ATLAS_E2E_ROWS = COUNT_PTY_ROWS // 全视口（harness pty-driver 读 env）；其余场景缺省 50 行
  if (scen === 'display') { // 主屏缺省 200×50（D6 宽档基线）——显式清 env 防跨场景残留
    delete process.env.ATLAS_E2E_COLS
    delete process.env.ATLAS_E2E_ROWS
  }
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
  let hardFail = 0
  let inconclusive = 0
  try {
    if (fixtureErr) {
      probes.push({ id: `${scen}-fixture`, hard: true, ok: false, detail: fixtureErr })
      hardFail++
    } else {
      const { listRendered, text } = await openSessionList(pty, scenDir)
      if (!listRendered) {
        // 面未达 = INCONCLUSIVE 定因（核 pty.log：REPL 未就绪 / /sessionlist 未注册 / 加载挂起）
        probes.push({
          id: `${scen}-LIST-RENDER`,
          hard: true,
          ok: null,
          detail: `列表未渲染（${LIST_RENDER_MS}ms 窗内未见「最近活跃」列头；定因核 ${join(scenDir, 'pty.log')}）`,
        })
        inconclusive++
      } else if (scen === 'sort') {
        const aLine = lineOf(text, 'sl-sort-A')
        const bLine = lineOf(text, 'sl-sort-B')
        // 0.1.38 活跃列 = formatActive 混合（55b5aa5 随车面）：A=now−3h → 相对面 "3h"（消息时间，
        // 非 mtime now−2d → 若 mtime 面会显 "2d"）；B=now−30d → 绝对面 fmtShort（seed 时刻基准，
        // 非 mtime now → 若 mtime 面会显 "now"）。排序核心断言（A 在 B 上）与格式面无关。
        const aActive = relCellOf(aLine, 'sl-sort-A')
        const bActive = activeCellOf(bLine, 'sl-sort-B')
        // A 期望 = 镜像 formatActive（渲染时与断言时 A elapsed 均落 3h 桶：3h+启动期 <4h，1h 桶余量
        // 覆盖渲染/断言时差）；B 期望 = 绝对面 fmtShort（seed 时刻基准，分钟漂移安全）。
        const aExpect = fmtActive(sortA!, Date.now())
        const bExpect = fmtShort(sortB!)
        // run1 探针缺陷定因：TUI 原地重绘使整列表为单行 capture → 两 marker 同行 →
        // 行 indexOf 比较退化（aLine===bLine 恒等）。改 marker 串位置比较：
        // 列表自上而下重绘 → A 在上 ⇔ A marker 先现（多次重绘同序，首现位置即序）。
        const aPos = text.indexOf('sl-sort-A')
        const bPos = text.indexOf('sl-sort-B')
        const orderOk = aPos >= 0 && bPos >= 0 && aPos < bPos
        const probesSort: Verdict[] = [
          {
            id: 'SL-SORT-order',
            hard: true,
            ok: orderOk ? true : aLine === null || bLine === null ? null : false,
            detail: orderOk
              ? `A（最后消息新/mtime 旧）行在 B（最后消息旧/mtime 新）之上 = 按消息时间戳排序（非 mtime）`
              : aLine === null || bLine === null
                ? `行缺失（A=${aLine !== null} B=${bLine !== null}）→ INCONCLUSIVE 定因核 list-capture`
                : `B 行在 A 之上 = 仍按 mtime 排序（pre-fix 判别面未修）`,
          },
          {
            id: 'SL-SORT-active-A',
            hard: true,
            ok: aActive === aExpect ? true : aActive === null ? null : false,
            detail:
              aActive === aExpect
                ? `A「最近活跃」="${aActive}"（formatActive 相对面 = 消息时间 3h；非 mtime 2d 面，P0-B 数据层 + 随车混合格式）`
                : aActive === null
                  ? `A 行未见相对活跃值（期望 "${aExpect}"）→ INCONCLUSIVE 定因核 list-capture（列布局/相对面未渲染）`
                  : `A「最近活跃」="${aActive}" ≠ "${aExpect}"（格式面未对齐/仍 mtime 面）→ FAIL`,
          },
          {
            id: 'SL-SORT-active-B',
            hard: true,
            ok: bActive === bExpect ? true : bActive === null ? null : false,
            detail:
              bActive === bExpect
                ? `B「最近活跃」="${bActive}"（>7d 绝对面 = 消息时间 30d；非 mtime now 面 "${'now'}"，P0-B 数据层 + 随车混合格式）`
                : bActive === null
                  ? `B 行未见绝对活跃值（期望 "${bExpect}"）→ INCONCLUSIVE 定因核 list-capture`
                  : `B「最近活跃」="${bActive}" ≠ "${bExpect}"（格式面未对齐/仍 mtime 面）→ FAIL`,
          },
        ]
        probes.push(...probesSort)
      } else if (scen === 'count') {
        // 200 行视口一屏全量呈现（COUNT_PTY_ROWS；60 行 < visibleRows 194，免滚动）：
        // 初始列表渲染 = 新屏全量 emit（非 cell-diff）→ cnt-00..59 全在首次捕获。
        // 50 截断未消时数据层只 50 条 → 最旧 10 条（cnt-50..59）不在场 → cnt-59 缺失 = FAIL（pre-fix 判别面）。
        const topHasNewest = text.includes('cnt-00')
        const bottomHasOldest = text.includes('cnt-59')
        probes.push(
          {
            id: 'SL-COUNT-top-newest',
            hard: true,
            ok: topHasNewest ? true : null,
            detail: topHasNewest
              ? `cnt-00（60 中最新）顶区现形`
              : `顶区未见 cnt-00 → INCONCLUSIVE 定因核 list-capture（行截断/渲染面）`,
          },
          {
            id: 'SL-COUNT-bottom-oldest',
            hard: true,
            ok: bottomHasOldest,
            detail: bottomHasOldest
              ? `最旧行 cnt-59 一屏全量现形（200 行视口免滚动）= 60 session 全量可达（消 50 截断，P0-A load-all）`
              : `全量视口下未见 cnt-59（列表已渲染）= 50 硬截断未消（pre-fix 判别面；P0-A 未落）→ FAIL`,
          },
        )
      } else if (scen === 'sidechain') {
        const sLine = lineOf(text, 'sl-side-S')
        const tLine = lineOf(text, 'sl-side-T')
        probes.push(
          {
            id: 'SL-SIDECACHE-S-listed',
            hard: true,
            ok: sLine ? true : null,
            detail: sLine
              ? `含 sidechain 内容（非首行 "isSidechain":true）的 session 在场 = 首行判定不誤滤（P0-C2）`
              : `S 行缺失（列表已渲染）= 仍整 head 扫误滤（pre-fix 判别面；P0-C2 未落）→ FAIL`,
          },
          {
            id: 'SL-SIDECACHE-T-control',
            hard: true,
            ok: tLine ? true : null,
            detail: tLine ? 'T 纯主 session 对照在场（列表非恒空）' : 'T 行缺失 → INCONCLUSIVE 定因核 list-capture',
          },
        )
        if (sLine === null) probes[probes.length - 2] = { ...probes[probes.length - 2], ok: false }
      } else if (scen === 'display') {
        // ── D1/D2/D3/D5/D6-宽档 @ 主屏（200×50）+ D4（pty 结束后读全量 raw 日志）+ D6-窄档（第二 PTY 70×30）──
        const wideHeaderLine = lineOf(text, '名称')
        const d1cCell = (() => { const l = lineOf(text, 'disp-created3d'); if (!l) return null; const m = l.slice(l.indexOf('disp-created3d')).match(/\s+(\d{1,2}\/\d{1,2}\/\d{4})/); return m ? m[1] : null })()
        const d1dCell = (() => { const l = lineOf(text, 'disp-created2025'); if (!l) return null; const m = l.slice(l.indexOf('disp-created2025')).match(/\s+(\d{1,2}\/\d{1,2}\/\d{4})/); return m ? m[1] : null })()
        const cExpect = fmtCreated(new Date(now - 3 * 86_400_000)) // seed 时刻基准（日期粒度，分钟漂移安全）
        const dExpect = '12/25/2025' // 固定 ts 2025-12-25（无漂移）
        const topLine = lineOf(text, 'disp-top')
        const d2Ok = topLine !== null && topLine.includes('[C]')
        const d3Ok = topLine !== null && topLine.includes('#e2etag') && topLine.includes('@e2eagent')
        // D6 宽档：0.1.39 随车面（S2）判据 = 数据面 5 列数据全可见（0.1.38 五列基线数据面零变化）；
        // 列头标签面 = S5 排序/过滤指示追加满宽行尾 → 「消息」标签截为「消…」= S2×S5 预算缺口（gap-B）证据，
        // 判据由 039 SL-S5-SORT-IND-* 承载（本探针不作 FAIL 判据，仅记录面）。
        const d6wideDataOk = (() => { const l = lineOf(text, 'disp-top'); if (!l) return false; return /\d{1,2}\/\d{1,2}\/\d{4}\s+\S+\s+(master|—)\s+\d+/.test(l.slice(l.indexOf('disp-top'))) })()
        const d6wideLabelCut = wideHeaderLine !== null && !wideHeaderLine.includes('消息')
        // D5：0.1.39 随车面（S1）= fork 状态机移底部操作行（0.1.38 行内「[f 确认 fork]」token 已移除，
        // 039 SL-S1-NEG-INLINE-TOKEN 负控承载）：f → 操作行「✋ <title> · [再按 f 确认 fork · 3s 自动取消]」（yellow）现形。
        // run2 更新（0.1.39 随车）：断言面 = 操作行 confirm 文本（0.1.38 行内 token 面被 S1 故意作废；
        // 回归判据 = 操作行 confirm 现形 + 行内 token 负控 + f 前操作行 confirm 文本负控〔状态机前置面，非常驻〕）
        const d5Neg = !text.includes('再按 f 确认 fork') // 负控：f 前操作行 confirm 文本不得在场
        await sleep(500) // f 键就绪窗（run1 键位教训：首键可丢）
        pty.sendRaw('f')
        await sleep(800) // 3s confirm 窗口内捕获（窗口超时回 idle）
        const fText = pty.sinceText()
        const d5Seen = fText.includes('再按 f 确认 fork')
        const d5InlineAbs = !fText.includes('[f 确认 fork') // S1 负控：0.1.38 行内 token 不在场（状态机已移操作行）
        probes.push(
          {
            id: 'SL-DISP-D1-created-col',
            hard: true,
            ok: d1cCell === cExpect && d1dCell === dExpect ? true : d1cCell === null || d1dCell === null ? null : false,
            detail: `created 列 = [${d1cCell}（期望 ${cExpect}，首消息 ts now−3d）, ${d1dCell}（期望 ${dExpect}，固定 2025-12-25）]（formatCreated M/D/YYYY，值 = 首消息时间戳非 stat 脏值，P0-B 数据层 + 随车双时间列）`,
          },
          {
            id: 'SL-DISP-D2-coordinator-badge',
            hard: true,
            ok: topLine === null ? null : d2Ok ? true : false,
            detail: topLine === null ? `disp-top 行缺失 → INCONCLUSIVE 定因核 list-capture` : d2Ok
              ? `mode=coordinator session 行内 [C] 徽标在场（随车徽标面）`
              : `disp-top 行未见 [C]（coordinator 徽标未渲染）→ FAIL`,
          },
          {
            id: 'SL-DISP-D3-chips',
            hard: true,
            ok: topLine === null ? null : d3Ok ? true : false,
            detail: topLine === null ? `disp-top 行缺失 → INCONCLUSIVE 定因核 list-capture` : d3Ok
              ? `行尾 token chip 形保留：#e2etag（tag）+ @e2eagent（agentSetting）在场（随车 chip 面）`
              : `disp-top 行 #e2etag/@e2eagent 缺失（chip 未渲染）→ FAIL`,
          },
          {
            id: 'SL-DISP-D4-orange-yellow',
            hard: true,
            ok: null, // pty 结束后填（D4 段）
            detail: 'pending',
          },
          {
            id: 'SL-DISP-D4-purple-magenta',
            hard: true,
            ok: null,
            detail: 'pending',
          },
          {
            id: 'SL-DISP-D4-control-plain',
            hard: true,
            ok: null,
            detail: 'pending',
          },
          {
            id: 'SL-DISP-D5-confirm-token',
            hard: true,
            ok: d5Seen && d5Neg && d5InlineAbs ? true : null,
            detail: d5Seen && d5Neg && d5InlineAbs
              ? `f → 操作行 confirm 文本「再按 f 确认 fork」现形（f 前负控不在场 = 状态机前置面非常驻；0.1.38 行内 token「[f 确认 fork]」缺席 = S1 状态机移底部操作行 0.1.39 随车面，回归判据由 039 SL-S1-CONFIRM-ROW 承载）`
              : `操作行 confirm 面未达（现形=${d5Seen} f 前负控=${d5Neg} 行内 token 负控=${d5InlineAbs}）→ INCONCLUSIVE 定因核 list-capture/fText（渲染/键位面）`,
          },
          {
            id: 'SL-DISP-D5-pre-truncation',
            hard: true,
            ok: null, // 窄档 PTY 段填（D5 前置防截断面）
            detail: 'pending',
          },
          {
            id: 'SL-DISP-D6-wide-header',
            hard: true,
            ok: wideHeaderLine === null ? null : d6wideDataOk ? true : false,
            detail: wideHeaderLine === null
              ? `宽档列头行缺失 → INCONCLUSIVE 定因核 list-capture`
              : d6wideDataOk
                ? `宽档 200×50 数据面 5 列值全可见（0.1.38 五列基线数据面零变化，0.1.39 随车面）${d6wideLabelCut ? '｜列头「消息」标签截为「消…」（S2×S5 预算缺口 gap-B 证据：S5 排序/过滤指示追加满宽行尾 → 末标签恒截；判据由 039 SL-S5-SORT-IND-* 承载，非本探针 FAIL 判据）' : ''}`
                : `宽档数据面缺创建/分支/消息值（S2 数据面回归）→ FAIL`,
          },
        )
        // D4：pty 结束读全量 raw（pty.log 全量 raw 通道；行局部区 = 上一行 title 后 → 本行 title 前）。
        // 行序（新→旧 = lastTs 降序；run2 定因订正：旧注释误置 created2025 于 purple 前——created2025 lastTs=now−5d
        // 为最旧末行；list-capture 实证序 = top > created3d > orange > purple > plain > created2025）：
        // disp-top > disp-created3d > disp-orange > disp-purple > disp-plain > disp-created2025
        pty.kill()
        const raw = readFileSync(join(scenDir, 'pty.log'), 'utf8')
        const sOrange = rowStartFgSgr(raw, 'disp-orange', 'disp-created3d')
        const sPurple = rowStartFgSgr(raw, 'disp-purple', 'disp-orange') // run2 定因：prevMarker 旧值 'disp-created2025' 行序颠倒（created2025 在 purple 之后）→ 窗口空 → SGR=null 假象；实证 38;2;147;51;234 在场
        const sPlain = rowStartFgSgr(raw, 'disp-plain', 'disp-purple')
        // dimColor 真色值（主题解析 truecolor 灰 153;153;153）在场 = 本 PTY truecolor 支持坐实 →
        // 行无前景色码 = 产品着色缺口（非探针/环境捕获约束判据）。
        const dimColorPresent = raw.includes('153;153;153')
        // D4 0.1.39 随车面（S4）= agentColor theme 精确 8 色映射：orange→theme rgb(234,88,12)=38;2;234;88;12 /
        // purple→rgb(147,51,234)=38;2;147;51;234（level 2 = 256 色通道 38;5;N）。0.1.38 基线（chalk 保守近似
        // orange→yellow 族 / purple→magenta 族）已被 S4 故意替换；判据 = 通道码在场（^38;）且非旧近似族
        // （YELLOW_FAM_RE/MAGENTA_FAM_RE = 0.1.38 基线族，现作 S4 映射回归负控）。
        // sX = 行局部区前景色码（rowStartFgSgr）：null = 行无前景色码。
        // 无色码 + dimColor 真色在场 = 产品着色缺口（非探针/环境捕获约束判据）。
        const d4O: boolean | null = sOrange !== null ? (/^38;/.test(sOrange) && !YELLOW_FAM_RE.test(sOrange)) : (dimColorPresent ? false : null)
        const d4P: boolean | null = sPurple !== null ? (/^38;/.test(sPurple) && !MAGENTA_FAM_RE.test(sPurple)) : (dimColorPresent ? false : null)
        // 对照行（无 agentColor）：无色码 = 与全屏缺口一致（屏级 bare 色名均被丢弃，非 agentColor 特有）；有色码 = 着色调漏（FAIL）
        const d4X = sPlain === null ? true : !YELLOW_FAM_RE.test(sPlain) && !MAGENTA_FAM_RE.test(sPlain)
        const d4Idx = probes.findIndex(p => p.id === 'SL-DISP-D4-orange-yellow')
        probes[d4Idx] = {
          id: 'SL-DISP-D4-orange-yellow', hard: true, ok: d4O,
          detail: sOrange !== null
            ? (d4O
                ? `agentColor=orange idle 行 S4 精确映射达成（SGR=${JSON.stringify(sOrange)} = theme 真色 orange rgb(234,88,12) 通道码；0.1.38 基线 chalk 保守黄族已被 S4 精确映射替换 = 0.1.39 随车面达成）`
                : `orange 行 SGR=${JSON.stringify(sOrange)} = 旧 0.1.38 保守族或非 theme 通道（S4 精确映射回归）→ 产品缺口（修复面 = S4 agentRowColors theme 映射面）`)
            : (dimColorPresent
                ? `agentColor=orange idle 行无前景色码（SGR=null；对照 dimColor 真色值 38;2;153;153;153 在场 = PTY truecolor 支持坐实，非探针/环境约束）→ 0.1.39 S4「idle 行现 theme 真色码」未达成 = 产品着色缺口（theme 值活屏物化面，归 Main 修复面）`
                : `raw 日志 disp-orange 行 SGR 未捕获且 dimColor 真色值亦缺 → INCONCLUSIVE 定因核 pty.log（捕获/环境面）`),
        }
        const d4pIdx = probes.findIndex(p => p.id === 'SL-DISP-D4-purple-magenta')
        probes[d4pIdx] = {
          id: 'SL-DISP-D4-purple-magenta', hard: true, ok: d4P,
          detail: sPurple !== null
            ? (d4P
                ? `agentColor=purple idle 行 S4 精确映射达成（SGR=${JSON.stringify(sPurple)} = theme 真色 purple rgb(147,51,234) 通道码；0.1.38 基线 chalk 保守 magenta 族已被 S4 精确映射替换 = 0.1.39 随车面达成）`
                : `purple 行 SGR=${JSON.stringify(sPurple)} = 旧 0.1.38 保守族或非 theme 通道（S4 精确映射回归）→ 产品缺口（修复面 = S4 agentRowColors theme 映射面）`)
            : (dimColorPresent
                ? `agentColor=purple idle 行无前景色码（SGR=null；对照 dimColor 真色值 38;2;153;153;153 在场 = PTY truecolor 支持坐实，非探针/环境约束）→ 0.1.39 S4「idle 行现 theme 真色码」未达成 = 产品着色缺口（theme 值活屏物化面，归 Main 修复面）`
                : `raw 日志 disp-purple 行 SGR 未捕获且 dimColor 真色值亦缺 → INCONCLUSIVE 定因核 pty.log（捕获/环境面）`),
        }
        const d4xIdx = probes.findIndex(p => p.id === 'SL-DISP-D4-control-plain')
        probes[d4xIdx] = {
          id: 'SL-DISP-D4-control-plain', hard: true, ok: d4X,
          detail: d4X
            ? `对照行（无 agentColor）行首区前景码=${JSON.stringify(sPlain)} = 无 S4 theme 身份色码（对照有效，无色调漏）｜屏级观察：裸色名（header cyan 等）活屏不现 SGR = D4 根修活路径缺口（gap-A）证据（0.1.39 colorize 入口归一未覆盖活 cell-diff 代 Text color prop 物化面；判据由 039 SL-D4-HEADER-CYAN / SL-D4-CONFIRM-YELLOW 承载）`
            : `对照行行首区前景码=${JSON.stringify(sPlain)} 现黄/紫族（着色调漏/对照失效）→ FAIL`,
        }
        // D6 窄档基线：第二 PTY 70×30（ATLAS_E2E_COLS/ROWS；harness pty-driver 读 env）
        process.env.ATLAS_E2E_COLS = '70'
        process.env.ATLAS_E2E_ROWS = '30'
        let narrowRendered = false
        const pty2 = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty-narrow.log') }, 150_000)
        try {
          const narrowRes = await openSessionList(pty2, scenDir, 'list-capture-narrow.txt')
          narrowRendered = narrowRes.listRendered
          const narrowText = narrowRes.text
          const narrowHeader = lineOf(narrowText, '名称')
          // 0.1.39 随车面（S2）：70 列 budget=70−20=50 ≥ 47 → 消息列不隐藏（S2 阈值 <47 砍消息 / <41 砍分支），
          // 5 列数据面全可见；0.1.38 硬降级基线（名称+最近活跃双列）已被 S2 自适应故意替换（快照面随更新）。
          const nTopLine = lineOf(narrowText, 'disp-top')
          const d6narrowDataOk = nTopLine !== null && /\d{1,2}\/\d{1,2}\/\d{4}\s+\S+\s+(master|—)\s+\d+/.test(nTopLine.slice(nTopLine.indexOf('disp-top')))
          const d6NarrowOk = narrowHeader !== null
            && narrowHeader.includes('最近活跃') && narrowHeader.includes('创建')
            && d6narrowDataOk
          probes.push({
            id: 'SL-DISP-D6-narrow-baseline',
            hard: true,
            ok: !narrowRendered ? null : d6NarrowOk ? true : false,
            detail: !narrowRendered
              ? `窄档（70×30）列表未渲染 → INCONCLUSIVE 定因核 list-capture-narrow.txt`
              : d6NarrowOk
                ? `窄档 70×30 = 0.1.39 S2 自适应面（budget=50 ≥ 47 → 5 列数据面全可见，创建/最近活跃标签在场；0.1.38 硬降级双列基线被 S2 故意替换）${narrowHeader && !narrowHeader.includes('消息') ? '｜「消息」标签截为「消…」（S2×S5 预算缺口 gap-B 证据，判据由 039 SL-S5-SORT-IND-* 承载）' : ''}`
                : `窄档面与 0.1.39 S2 判据（5 列数据 + 创建/最近活跃标签在场）不符 → FAIL`,
          })
          // D5 窄档面（0.1.39 随车，S1）：confirm 态 = 独立底部操作行（0.1.38「状态机先于数据 chip 拼接」前置面
          // 被 S1 操作行拆分作废）。窄档（70 列）判据 = 操作行 confirm 文本现形（操作行独立单行，不受数据行
          // 行尾截断影响；若 70 列下操作行 confirm 文本被截 = S1 操作行预算新面，报 Main）。
          // 全量 pty-narrow.log 在 kill 后读（cell-diff-safe，免 sinceText delta 混入初渲染假象）。
          if (narrowRendered) {
            await sleep(500) // f 键就绪窗（首键可丢）
            pty2.sendRaw('f')
            await sleep(1200) // confirm 态操作行 emit + flush 到 pty-narrow.log（3s confirm 窗口内）
          }
        } finally {
          pty2.kill()
          delete process.env.ATLAS_E2E_COLS
          delete process.env.ATLAS_E2E_ROWS
        }
        // D5-pre-truncation（0.1.39 随车面更名语义）：读全量 pty-narrow.log（authoritative 窄档 confirm 面）。
        // 0.1.39 S1 = confirm 态在独立底部操作行（「再按 f 确认 fork」文本）；窄档判据 = 该文本现形
        // （raw 内 cursor-move 拆词，核前缀「再按 f 确认」即可）。
        if (narrowRendered) {
          const narrowRaw = readFileSync(join(scenDir, 'pty-narrow.log'), 'utf8')
          const cIdx = narrowRaw.lastIndexOf('再按 f 确认') // S1 操作行 confirm 文本前缀
          const nTok = cIdx >= 0
          const d5Pre: boolean | null = nTok ? true : null
          const d5PreIdx = probes.findIndex(p => p.id === 'SL-DISP-D5-pre-truncation')
          probes[d5PreIdx] = {
            id: 'SL-DISP-D5-pre-truncation', hard: true, ok: d5Pre,
            detail: d5Pre === true
              ? `窄档（70 列）操作行 confirm 文本「再按 f 确认…」现形 = S1 操作行拆分窄档面（confirm 提示不受数据行行尾截断影响；0.1.38「状态机先于数据 chip」前置防截断面被 S1 操作行拆分取代）`
              : `窄档操作行 confirm 态未现形（f 键位未落/列表未渲染/操作行 70 列预算截断）→ INCONCLUSIVE 定因核 pty-narrow.log（若 confirm 文本被 70 列截断 = S1 操作行预算新面，报 Main 裁）`,
          }
        }
      } else {
        // mtime：观察窗（pre-fix fire-and-forget 回写窗）→ q 关列表 → 回写余量 → 复量
        await sleep(MTIME_OBSERVE_MS)
        pty.sendRaw('q')
        await sleep(MTIME_POST_MS)
        let bumped = 0
        const bumpedNames: string[] = []
        for (const [f, before] of mtimesBefore) {
          const after = statSync(f).mtimeMs
          if (after !== before) {
            bumped++
            bumpedNames.push(`${f.split('/').pop()}（${new Date(before).toISOString().slice(5, 16)}→${new Date(after).toISOString().slice(5, 16)}）`)
          }
        }
        probes.push({
          id: 'SL-MTIME-invariant',
          hard: true,
          ok: bumped === 0,
          detail:
            bumped === 0
              ? `8 seed 文件 mtime 全不变（列表打开回写已删，无静默 append；P0-C1）`
              : `${bumped}/8 文件 mtime 被顶（${bumpedNames.slice(0, 3).join('，')}）= 列表打开回写未删（pre-fix 判别面；P0-C1 未落）→ FAIL`,
        })
      }
    }
  } finally {
    pty.kill()
    if (scen === 'count') delete process.env.ATLAS_E2E_ROWS
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
    verdict: probes.some(p => p.ok === null) && hardFail === 0 ? `INCONCLUSIVE=${inconclusive}（定因见各探针）` : hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`,
  }
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify(scenResult, null, 2))
  console.log(`\n=== ${scen} ===  ${scenResult.verdict} → ${scenDir}`)
  for (const p of probes) console.log(`  [${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'}] ${p.id}: ${p.detail}`)
  return { probes, inconclusive, hardFail }
}

async function main(): Promise<void> {
  console.log(`[SL ${RUN_TAG}] modes=${runScens.join(',')} repo=${REPO}`)
  let totalFail = 0
  let totalInc = 0
  for (const m of runScens) {
    const r = await runScenario(m)
    totalFail += r.hardFail
    totalInc += r.inconclusive
  }
  const overall = totalFail === 0 && totalInc === 0 ? 'GATE-PASS' : totalFail > 0 ? `GATE-OPEN（hardFail=${totalFail}）` : `GATE-OPEN（INCONCLUSIVE=${totalInc}，定因见各场景）`
  writeFileSync(join(RUN_DIR, 'summary.json'), JSON.stringify({ run: RUN_TAG, modes: runScens, totalFail, totalInc, overall }, null, 2))
  console.log(`\n${overall} → ${RUN_DIR}`)
  process.exit(totalFail === 0 && totalInc === 0 ? 0 : 1)
}

main().catch(e => {
  console.error(`[SL ${RUN_TAG}] FATAL: ${String(e?.stack ?? e)}`)
  process.exit(2)
})
