/**
 * 0.1.40 slash 命令精简波（W1 删 5 + W2 删 15 + W3 翻 3）· e2e gate 探针（e2e 交付，零产品改动）。
 *
 * 工单：docs/2026-10-07-slash-cmd-slim-and-backfill.md。f4 预置 4 判据（本探针逐条实现）：
 *
 *   cmd                ① 命令表：`getCommands()` 源级（`src/tui/commands.ts` COMMANDS+INTERNAL_ONLY
 *                      + gating + 命令文件存在性，纯 FS 无 PTY）——W1 5 + W2 15 import specifier
 *                      + 命令文件「全不在」；W3 files/tag/version 在场且 `isEnabled: () => true`
 *                      （version 仍在 INTERNAL_ONLY = ATLAS_DEV 门）；voice import 块 +
 *                      `feature('VOICE_MODE')` 仍在（feature 默认关，源级断言——voice
 *                      availability['claude-ai'] de-ANT 恒滤除，永不进运行面输出）。
 *   statusline-default ② StatusLine 默认面（删 /statusline 命令不动显示组件——用户裁定负向保证）：
 *                      sandbox `.atlas` 无 statusline.json → 通道 B 默认 5 段仍显示（footer `⚡`model
 *                      在场，`⌂`cwd 在场）。
 *   statusline-config  ② StatusLine 手动配置面：写 `<sandboxHome>/.atlas/statusline.json`
 *                      （simple.line1 = [model]）→ 通道 B 按配置显示（footer `⚡` 在场 + `⌂` 离场
 *                      = 段集从默认 5 段缩到 1 段，配置被消费非回退）。
 *   help               ③ /help 一致性：tall 窗（ATLAS_E2E_ROWS=360 → visibleCount≥命令总数全量一屏）
 *                      /help → commands tab → `/${name}` label 集 = 0.1.40 期望集（files/tag 在场 +
 *                      控制集在场 + 5 删 + version 不在场；INCONCLUSIVE-tolerant：tab 未达定因非 FAIL）。
 *
 * 判别力（前后 lane 统一，规则②）：pre-0.1.40（0.1.37 态）`--cmd` 必红（20 删项在表 + W3 未翻）；
 * post-0.1.40 必绿。StatusLine 双面 + /help = 用户面负向保证（组件/config 链路 0.1.37/0.1.40 零改动）。
 * FAIL = 产品缺口（fail-closed 不发布）；INCONCLUSIVE 必带定因（面未达：tab 未达 / footer 未捕获，
 * 核 pty.log）；源级 `isEnabled` 字面非 `() => true` = WARN（交 Main 核 W3 口径，非 FAIL）。
 *
 * 拓扑/纪律：PTY（lib/pty，200×50 默认；`ATLAS_E2E_ROWS` 可覆盖）起
 * `bun run <repo>/src/atlascode/cli.ts`（workspace=sandbox ws，HOME=sandbox home，零写真实 ~/.atlas；
 * StatusLine 面经 <sandboxHome>/.atlas/statusline.json）。`cmd` 纯源级 grep 无 PTY/无网关；PTY 场景
 * 同 lane 串行（防网关竞争）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/slashslim-040.ts --repo <worktree-0.1.40> [--all|cmd|statusline-default|statusline-config|help]
 * 产物：artifacts/SC-<stamp>-<rand>/<scen>/{result.json[,pty.log]}（pty.log 为 PTY 全量 raw 日志）
 *
 * 执行时点：0.1.39 收口后（0.1.40 发布 gate 卡 0.1.39；本备料现写不跑；0.1.39 若需 e2e 人力以 0.1.39 优先）。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
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
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? ''
const MODES = ['cmd', 'statusline-default', 'statusline-config', 'help'] as const
type Scen = (typeof MODES)[number]
const runScens: Scen[] = argv.includes('--all') ? [...MODES] : MODES.filter(m => argv.includes(m))
if (runScens.length === 0) runScens.push('cmd') // 缺省 = cmd（源级最快）

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'
const LIVE_GW = 'http://127.0.0.1:8999'

// PTY 面常量
const FOOTER_WAIT_MS = 20_000 // StatusLine footer 渲染窗（`⚡` 现形）
const HELP_OPEN_MS = 30_000 // /help 屏打开窗（Tabs 标题「AtlasCode v」现形）
const HELP_TAB_MS = 30_000 // commands tab 切换 + 渲染窗（键序列 6 键 × 4s 预算 24s + 终局 settle 另计）
const HELP_PTY_ROWS = '360' // tall 窗：visibleCount ≈ floor(floor(360/2 - 10)/2) ≈ 85 ≥ 命令总数（~60）→ 全量一屏

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const RUN_TAG = `SC-${stamp()}-${Math.random().toString(36).slice(2, 5)}`
const RUN_DIR = join(ART, RUN_TAG)
mkdirSync(RUN_DIR, { recursive: true })

// ── 源级命令表 token（0.1.40 目标态；基于当前 master 0.1.37 行号，见 slashslim-040-design.md）──
type Verdict = { id: string; hard: boolean; ok: boolean | null; detail: string; warn?: boolean }

/** 20 删项（W1 5 + W2 15）：import specifier（commands.ts 内）+ 命令文件/目录（src/tui/commands/ 下）目标「全不在」。 */
const DELETED: { name: string; wave: 'W1' | 'W2'; spec: string; path: string }[] = [
  { name: 'statusline', wave: 'W1', spec: "from './commands/statusline.js'", path: 'statusline.tsx' },
  { name: 'output-style', wave: 'W1', spec: "from './commands/output-style/index.js'", path: 'output-style' },
  { name: 'pr-comments', wave: 'W1', spec: "from './commands/pr_comments/index.js'", path: 'pr_comments' },
  { name: 'security-review', wave: 'W1', spec: "from './commands/security-review.js'", path: 'security-review.ts' },
  { name: 'torch', wave: 'W1', spec: "require('src/tui/commands/torch.js')", path: 'torch.ts' },
  { name: 'autofix-pr', wave: 'W2', spec: "from './commands/autofix-pr/index.js'", path: 'autofix-pr' },
  { name: 'backfill-sessions', wave: 'W2', spec: "from './commands/backfill-sessions/index.js'", path: 'backfill-sessions' },
  { name: 'break-cache', wave: 'W2', spec: "from './commands/break-cache/index.js'", path: 'break-cache' },
  { name: 'bughunter', wave: 'W2', spec: "from './commands/bughunter/index.js'", path: 'bughunter' },
  { name: 'ctx_viz', wave: 'W2', spec: "from './commands/ctx_viz/index.js'", path: 'ctx_viz' },
  { name: 'debug-tool-call', wave: 'W2', spec: "from './commands/debug-tool-call/index.js'", path: 'debug-tool-call' },
  { name: 'env', wave: 'W2', spec: "from './commands/env/index.js'", path: 'env' },
  { name: 'good-atlas', wave: 'W2', spec: "from './commands/good-atlas/index.js'", path: 'good-atlas' },
  { name: 'issue', wave: 'W2', spec: "from './commands/issue/index.js'", path: 'issue' },
  { name: 'oauth-refresh', wave: 'W2', spec: "from './commands/oauth-refresh/index.js'", path: 'oauth-refresh' },
  { name: 'onboarding', wave: 'W2', spec: "from './commands/onboarding/index.js'", path: 'onboarding' },
  { name: 'perf-issue', wave: 'W2', spec: "from './commands/perf-issue/index.js'", path: 'perf-issue' },
  { name: 'share', wave: 'W2', spec: "from './commands/share/index.js'", path: 'share' },
  { name: 'summary', wave: 'W2', spec: "from './commands/summary/index.js'", path: 'summary' },
  { name: 'install-slack-app', wave: 'W2', spec: "from './commands/install-slack-app/index.js'", path: 'install-slack-app' },
]
/** 3 翻项（W3）：文件在场 + `isEnabled: () => true`（version 额外须仍在 INTERNAL_ONLY = ATLAS_DEV 门）。 */
const FLIPPED: { name: string; file: string; devGated: boolean }[] = [
  { name: 'files', file: 'files/index.ts', devGated: false },
  { name: 'tag', file: 'tag/index.ts', devGated: false },
  { name: 'version', file: 'version.ts', devGated: true },
]
/** voice = 保留（feature 默认关，源级 import 块断言）。 */
const VOICE = {
  file: 'voice/index.ts',
  featureDecl: "feature('VOICE_MODE')",
  term: 'voiceCommand',
}

const CMD_TS = join(REPO, 'src/tui/commands.ts')
const CMD_ROOT = join(REPO, 'src/tui/commands')

function readCommandsTs(): string | null {
  try {
    return readFileSync(CMD_TS, 'utf8')
  } catch {
    return null
  }
}
function readIfExists(p: string): string | null {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}
function internalOnlyBlock(ts: string): string {
  const s = ts.indexOf('INTERNAL_ONLY_COMMANDS = [')
  if (s < 0) return ''
  const e = ts.indexOf('].filter(Boolean)', s)
  return e > s ? ts.slice(s, e) : ts.slice(s)
}
/** INTERNAL_ONLY 块内是否含某命令绑定（version 保留在 dev 表 = ATLAS_DEV 门）。 */
function inInternalOnly(ts: string, binding: string): boolean {
  return new RegExp('\\b' + binding + '\\b').test(internalOnlyBlock(ts))
}
/** 命令 label 在场（剥净流判据）：`text()` = stripAnsi(pty.log)——SGR + 光标移动序列全剥，
 * 列表行塌缩为「/label␣␣description␣␣/label…」空格分隔表（列偏移 ≥2 空格）。判据 = `/name` + ≥2 空格
 * （列偏移面）：散文「fork / enter」类斜杠（单空格夹斜杠/斜杠后紧接字符）不误配；URL 段（/blob/master 等）
 * 斜杠后紧跟字符非空格亦不误配。词尾边界由 ≥2 空格承载（/session 不会误配 /sessionlist：后接 l 非空格）。 */
function labelPresent(text: string, name: string): boolean {
  return new RegExp('/' + name + '\\s{2,}').test(text)
}
/** commands tab 到达哨兵 = 列表格面（≥1 个「/label␣␣」单元格现形）。
 * 定因链（全探针侧）：r1 旧哨兵 'Browse default commands' = 幻影串（本版 tab 头 = general/commands/custom-commands）；
 * r2/r4 定因：`sinceText()` 走 `text()` = stripAnsi 剥净流——SGR 帧形哨兵（\x1b[39m/…）在剥净流永不存在，
 * 列表实际早已渲染（pty.log 45 标签全量在捕）而哨兵恒假 → 假 INCONCLUSIVE ×3。 */
const HELP_LIST_ROW_RE = /\/[a-z][a-z0-9-]{2,}\s{2,}/

// ── ① 源级命令表（纯 FS，无 PTY）──────────────────────────────────────
function runCmd(): Verdict[] {
  const probes: Verdict[] = []
  const ts = readCommandsTs()
  if (ts === null) {
    // 找不到 commands.ts = 面未达（REPO 非有效 worktree / 路径漂移）→ hard-fail（fail-closed：无法核验=不发布）
    probes.push({
      id: 'cmd-source',
      hard: true,
      ok: false,
      detail: `commands.ts 不在 ${CMD_TS}（REPO=${REPO || '<未设>'}）→ 无法核验命令表（fail-closed）`,
    })
    return probes
  }

  // W1 5 + W2 15 删项：import specifier 不在 commands.ts 且 命令文件/目录不在（双层，任一在=残留）
  for (const d of DELETED) {
    const specIn = ts.includes(d.spec)
    const fileIn = existsSync(join(CMD_ROOT, d.path))
    const residual: string[] = []
    if (specIn) residual.push('import specifier 在')
    if (fileIn) residual.push(`文件 ${d.path} 在`)
    probes.push({
      id: `cmd-del-${d.name}`,
      hard: true,
      ok: !specIn && !fileIn,
      detail:
        !specIn && !fileIn
          ? `${d.wave} 删项 ${d.name}：specifier + 文件均不在（已删）`
          : `${d.wave} 删项 ${d.name} 残留（${residual.join('、')}）→ 未删（pre-0.1.40 判别面）`,
    })
  }

  // W3 3 翻项：文件在场 + `isEnabled: () => true`；version 额外仍在 INTERNAL_ONLY（ATLAS_DEV 门）
  for (const f of FLIPPED) {
    const fp = join(CMD_ROOT, f.file)
    const fileIn = existsSync(fp)
    let bodyOk = false
    let warn = false
    let detail = ''
    if (!fileIn) {
      detail = `W3 ${f.name}：文件 ${f.file} 不在（未翻开/被误删）→ 未达`
    } else {
      const body = readFileSync(fp, 'utf8')
      const enabledTrue = /isEnabled:\s*\(\s*\)\s*=>\s*true/.test(body)
      const enabledFalse = /isEnabled:\s*\(\s*\)\s*=>\s*false/.test(body)
      if (f.devGated && !inInternalOnly(ts, f.name)) {
        detail = `W3 ${f.name}：仍在源但未入 INTERNAL_ONLY（dev 表门丢失）→ ATLAS_DEV 门失效`
      } else if (enabledTrue) {
        detail = `W3 ${f.name}：文件在场 + isEnabled: () => true${f.devGated ? ' + 仍在 INTERNAL_ONLY（ATLAS_DEV 门）' : ''}（已翻开）`
        bodyOk = true
      } else if (enabledFalse) {
        detail = `W3 ${f.name}：isEnabled: () => false（未翻开，W3 未落）→ 未达`
      } else {
        // isEnabled 字面非 `() => true`/`() => false`（Main 落码口径差异）→ WARN（交 Main 核，非 FAIL）
        warn = true
        detail = `W3 ${f.name}：isEnabled 字面非 () => true（现值=${(body.match(/isEnabled:\s*\S[\s\S]{0,30}?\)/)?.[0] ?? '<无>').replace(/\s+/g, ' ')}）→ 交 Main 核 W3 口径`
      }
    }
    probes.push({ id: `cmd-flip-${f.name}`, hard: !warn, ok: warn ? null : bodyOk, warn, detail })
  }

  // voice = 保留（源级 import 块在场：feature 声明 + 展开项 + 文件）
  const voiceFileIn = existsSync(join(CMD_ROOT, VOICE.file))
  const voiceFeatIn = ts.includes(VOICE.featureDecl)
  const voiceTermIn = ts.includes(VOICE.term)
  const voiceResidual = []
  if (!voiceFeatIn) voiceResidual.push('feature 声明缺失')
  if (!voiceTermIn) voiceResidual.push('展开项缺失')
  if (!voiceFileIn) voiceResidual.push('文件缺失')
  probes.push({
    id: 'cmd-voice-kept',
    hard: true,
    ok: voiceFeatIn && voiceTermIn && voiceFileIn,
    detail:
      voiceFeatIn && voiceTermIn && voiceFileIn
        ? `voice 保留（feature('VOICE_MODE') 声明 + voiceCommand 展开项 + 文件均在场，W1 未误删）`
        : `voice 保留面缺口（${voiceResidual.join('、')}）→ W1 误删（用户终裁 voice 全保留）`,
  })

  // W2 E-1P 9 项零码登记（前向缝注释块，落码实态 9 项含 privacy-settings）：marker 在场 + 9 项全命名
  // （char-safe 内容锚：marker「前向缝登记」后 600 字窗内 9 名全含——登记块为 6 行注释）
  const E1P_NAMES = [
    'chrome', 'desktop', 'mobile', 'install-github-app', 'extra-usage',
    'rate-limit-options', 'passes', 'remote-env', 'privacy-settings',
  ]
  // 锚点 = E-1P 专属头「E-1P 9 项零码登记」（唯一；「前向缝登记」泛 marker 文件内 6 处〔§8.74.29 1P 簇 ×5〕，
  // 首现 L36 窗不覆盖 E-1P 块——run1 r1 定因：泛 marker indexOf 命中早段登记块 → 假红）
  const e1pMarker = ts.indexOf('E-1P 9 项零码登记')
  const e1pWindow = e1pMarker >= 0 ? ts.slice(e1pMarker, e1pMarker + 600) : ''
  const e1pMissing = E1P_NAMES.filter(n => !e1pWindow.includes(n))
  probes.push({
    id: 'cmd-e1p-registered',
    hard: true,
    ok: e1pMarker >= 0 && e1pMissing.length === 0,
    detail:
      e1pMarker >= 0 && e1pMissing.length === 0
        ? `E-1P 9 项零码登记注释块在场（E-1P 专属前向缝头 + 9 项全命名：${E1P_NAMES.join('·')}）= 1P 依赖有意不搬（W2 前向缝登记面）`
        : `E-1P 登记面缺口（E-1P 专属头=${e1pMarker >= 0 ? '在场' : '缺席'}；缺项=${e1pMissing.join('/') || '无'}）→ 未登记`,
  })

  // W1 孤儿清理 engine 侧残留面：statuslineSetup 代理文件已删 + TUI 侧 AgentTool 注册清零
  // + engine 侧 builtInAgents 仅注释行残留（活动注册残留 = FAIL）
  const slAgentFileGone = !existsSync(join(REPO, 'src/tui/tools/AgentTool/built-in/statuslineSetup.ts'))
  const tuiAgentTs = readIfExists(join(REPO, 'src/tui/tools/AgentTool/builtInAgents.ts')) ?? ''
  const tuiAgentReg = tuiAgentTs.includes('STATUSLINE_SETUP_AGENT')
  const engineAgentTs = readIfExists(join(REPO, 'src/engine/tools/agent/builtInAgents.ts')) ?? ''
  const engineTokenLines = engineAgentTs.split('\n').filter(l => l.includes('STATUSLINE_SETUP_AGENT'))
  const engineActive = engineTokenLines.filter(l => !/^\s*(\*|\/\/)/.test(l))
  probes.push({
    id: 'cmd-engine-statuslineagent-file',
    hard: true,
    ok: slAgentFileGone,
    detail: slAgentFileGone
      ? `engine 侧残留面核销：AgentTool/built-in/statuslineSetup.ts 已删（孤儿代理文件未留）`
      : `engine 侧残留面缺口：statuslineSetup.ts 代理文件仍在 → W1 孤儿清理未落`,
  })
  probes.push({
    id: 'cmd-engine-builtinagent-reg',
    hard: true,
    ok: !tuiAgentReg && engineActive.length === 0,
    detail:
      !tuiAgentReg && engineActive.length === 0
        ? `engine 侧注册清零：TUI 侧 AgentTool/builtInAgents 零 STATUSLINE_SETUP_AGENT 活动引用 + engine 侧 builtInAgents 仅注释行残留（${engineTokenLines.length} 注释行，零活动注册）`
        : `engine 侧残留面缺口（TUI 侧引用=${tuiAgentReg}；engine 侧活动行=${engineActive.length}）→ STATUSLINE_SETUP_AGENT 注册残留`,
  })

  return probes
}

// ── PTY 场景公共脚手架（独立 ws/sandbox；settings 覆写 LIVE_GW 保 REPL 干净 boot）────────────
async function setupSandbox(scen: Scen) {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', `SC-${scen}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
  const home = join(ROOT, 'home', `SC-${scen}`)
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
  return { scenDir, ws, home }
}

/** 捕获 REPL footer（StatusLine 通道 B）：轮 until `⚡`（model 段 icon）现形或超时。 */
async function captureFooter(pty: any): Promise<string> {
  const t0 = Date.now()
  let text = ''
  while (Date.now() - t0 < FOOTER_WAIT_MS) {
    text = pty.sinceText()
    if (text.includes('⚡')) break
    await sleep(1500)
  }
  return text
}

// ── ② StatusLine 双面（删 /statusline 命令不动显示组件——用户裁定负向保证）────────────────
async function runStatusLine(face: 'default' | 'config'): Promise<Verdict[]> {
  const { scenDir, ws, home } = await setupSandbox(face === 'default' ? 'statusline-default' : 'statusline-config')
  const probes: Verdict[] = []
  const { Pty } = await import('../lib/pty')

  if (face === 'config') {
    // 手动配置面：simple.line1 = [model]（段集缩到 1 段；schema 白名单 type='model' 有效 → degraded=false → 按配置渲染）
    const cfg = JSON.stringify({ simple: { line1: [{ type: 'model' }] } }, null, 2) + '\n'
    writeFileSync(join(home, '.atlas', 'statusline.json'), cfg)
  }
  // 默认面：makeSandboxHome 不建 statusline.json → loadStatusLineConfig 回退默认（degraded=false）→ 默认 5 段

  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
  try {
    const text = await captureFooter(pty)
    writeFileSync(join(scenDir, 'footer-capture.txt'), text)
    const hasModel = text.includes('⚡')
    const hasCwd = text.includes('⌂')
    if (!hasModel) {
      // footer 未捕获 / REPL 未就绪 → INCONCLUSIVE（定因，核 pty.log）
      probes.push({
        id: `sl-${face}-footer`,
        hard: false,
        ok: null,
        detail: `footer 未捕获（⚡ 未现）→ 面未达（REPL 未就绪 / footer 未渲染），核 pty.log`,
      })
    } else if (face === 'default') {
      // 默认面：⚡ 在场 = 默认 5 段线渲染（删 /statusline 命令后组件仍显示）；⌂ 在场为佐证
      probes.push({
        id: 'sl-default-displays',
        hard: true,
        ok: true,
        detail: `默认面（无 statusline.json）通道 B 默认线渲染：⚡(model) 在场${hasCwd ? ' + ⌂(cwd) 在场' : '（cwd 段未捕获，不判 FAIL——model 已证显示）'}（删 /statusline 命令不动显示组件）`,
      })
    } else {
      // 配置面：model-only 段集 → ⚡ 在场 + ⌂ 离场 = 配置被消费（非回退默认 5 段）
      const consumed = !hasCwd
      probes.push({
        id: 'sl-config-consumed',
        hard: true,
        ok: consumed,
        detail: consumed
          ? `配置面（statusline.json simple.line1=[model]）按配置渲染：⚡(model) 在场 + ⌂(cwd) 离场（段集 5→1，配置被消费，组件链路独立于已删 /statusline 命令）`
          : `配置面未消费：⌂(cwd) 仍在场（model-only 段集应无 cwd，仍现 = 回退默认/配置被忽略）→ FAIL`,
      })
    }
  } finally {
    pty.kill()
  }
  return probes
}

// ── ③ /help 一致性（tall 窗全量一屏；INCONCLUSIVE-tolerant，权威表 verdict 由 ① 承载）─────
async function runHelp(): Promise<Verdict[]> {
  const { scenDir, ws, home } = await setupSandbox('help')
  const probes: Verdict[] = []
  const { Pty } = await import('../lib/pty')
  process.env.ATLAS_E2E_ROWS = HELP_PTY_ROWS // tall 窗（harness pty-driver 读 env）

  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
  try {
    // REPL 就绪哨兵 = footer ⚡（StatusLine 通道 B 渲染）；r3 定因（SC-…-062548-5z9）：
    // /help 于 boot 期过早 send 被吞（REPL 未就绪不缓冲输入）→ /help 屏未开而键序已盲发 → 全程无列表
    const tReady = Date.now()
    while (!pty.sinceText().includes('⚡') && Date.now() - tReady < 30_000) await sleep(1000)
    const replReady = pty.sinceText().includes('⚡')
    pty.send('/help')
    // /help 屏打开哨兵 = tab 头「custom-commands」（/help 屏独有字面；旧哨兵 'AtlasCode v' 与启动 banner 撞车假阳）
    const t0 = Date.now()
    while (Date.now() - t0 < HELP_OPEN_MS) {
      if (pty.sinceText().includes('custom-commands')) break
      await sleep(1500)
    }
    const helpOpened = pty.sinceText().includes('custom-commands')
    // 切到 commands tab（默认 tab=general；Tab/→ 切 tab；到达哨兵 = 列表行帧形现形，见 HELP_LIST_ROW_RE）
    // 定因 r2（SC-…-062347-51d）：列表渲染落点晚于键循环边界（help-capture 15.7KB < pty.log 20.5KB，
    // 45 行列表在断言快照后才现形）→ 键序列加量（Tab/→ 各 3 次覆盖 focus 态）+ 终局 settle 复查
    let cmdTab = false
    if (helpOpened) {
      const check = () => {
        if (HELP_LIST_ROW_RE.test(pty.sinceText())) cmdTab = true
      }
      const keys = ['\t', '\x1b[C', '\t', '\x1b[C', '\t', '\x1b[C'] // Tab, →, Tab, →, Tab, →（覆盖 header/content focus 两态 + 逐 tab 步进）
      const tt0 = Date.now()
      for (const k of keys) {
        pty.sendRaw(k)
        const t1 = Date.now()
        while (Date.now() - t1 < 4000 && Date.now() - tt0 < HELP_TAB_MS) {
          check()
          if (cmdTab) break
          await sleep(700)
        }
        if (cmdTab) break
      }
      if (!cmdTab) {
        const st0 = Date.now()
        while (Date.now() - st0 < 10_000) {
          check()
          if (cmdTab) break
          await sleep(1000)
        }
      }
    }
    // 列表 settle（r5 定因 SC-…-063259-h3t：哨兵首命中即快照，45 行列表渲染未完 → files〔第 7〕/tag〔第 33〕假红；
    // 且不完整列表上缺席判据 = 假绿）：等日志静默 3s（全量行 + footer 重渲完）再快照
    if (cmdTab) await pty.settle(3_000, 20_000)
    const text = pty.sinceText()
    writeFileSync(join(scenDir, 'help-capture.txt'), text)

    if (!helpOpened || !cmdTab) {
      // commands tab 未达 = INCONCLUSIVE（定因：/help 未打开 / tab 切换未生效 / 窗口未达，核 pty.log）
      // 非 FAIL——命令表 verdict 由 ① 源级承载，/help 仅用户面 corroboration
      probes.push({
        id: 'help-tab',
        hard: false,
        ok: null,
        detail: `commands tab 未达（replReady=${replReady} helpOpened=${helpOpened} cmdTab=${cmdTab}）→ 面未达（REPL 就绪/屏打开/tab 切换 三段定位），核 pty.log（INCONCLUSIVE，非 FAIL）`,
      })
      return probes
    }

    // commands tab 在场 → 断 0.1.40 期望集：files/tag 在场 + 控制集在场 + 20 删项 + version 不在场
    // 完整性锚（r5 定因后补）：'Space to cancel' = /help 屏 footer（随全量列表重渲）——缺席 = 列表不全，
    // 四判据全 INCONCLUSIVE（不完整列表：在场判据 = 假红、缺席判据 = 假绿，双向无效）
    const listComplete = text.includes('Space to cancel')
    const present = (n: string) => labelPresent(text, n)
    const absent = (n: string) => !labelPresent(text, n)
    const incDetail = '列表未完整（Space to cancel footer 未现）→ 判据双向无效，核 pty.log（INCONCLUSIVE）'
    // 控制集（必在场，证 /help 列表真渲染，缺席断言才有意义）
    const controlOk = present('help') || present('model') || present('clear')
    probes.push({
      id: 'help-present-files',
      hard: true,
      ok: listComplete ? present('files') : null,
      detail: !listComplete ? incDetail : present('files') ? '/files 在场（W3 翻开，渲染集跟随命令表）' : '/files 不在场（W3 未翻/渲染集未跟随）→ FAIL',
    })
    probes.push({
      id: 'help-present-tag',
      hard: true,
      ok: listComplete ? present('tag') : null,
      detail: !listComplete ? incDetail : present('tag') ? '/tag 在场（W3 翻开，渲染集跟随命令表）' : '/tag 不在场（W3 未翻/渲染集未跟随）→ FAIL',
    })
    probes.push({
      id: 'help-control',
      hard: true,
      ok: listComplete ? controlOk : null,
      detail: !listComplete ? incDetail : controlOk ? '控制集（/help|/model|/clear）在场（列表真渲染）' : '控制集全缺（列表未渲染/提取面未达）→ 缺席断言无效',
    })
    // 缺席面（/help 零增减=表断言与活屏一致）：20 删项（W1 5 + W2 15，0.1.40 生产面恒不可见）
    // + version（ATLAS_DEV 门，PTY IS_DEMO=1 恒不在场）= 零残留面（W2 dev 表门若破亦在此现形）
    const deletedNames = [
      'statusline', 'output-style', 'pr-comments', 'security-review', 'torch', 'version',
      'autofix-pr', 'backfill-sessions', 'break-cache', 'bughunter', 'ctx_viz', 'debug-tool-call',
      'env', 'good-atlas', 'issue', 'oauth-refresh', 'onboarding', 'perf-issue', 'share',
      'summary', 'install-slack-app',
    ]
    const leaked = listComplete ? deletedNames.filter(n => !absent(n)) : []
    probes.push({
      id: 'help-absent-deleted',
      hard: true,
      ok: listComplete ? leaked.length === 0 : null,
      detail: !listComplete
        ? incDetail
        : leaked.length === 0
          ? `20 删项 + version 均不在渲染集（W1/W2 删项离场 + version ATLAS_DEV 门 + W2 dev 表门）= /help 零增减缺席面（列表完整 = Space to cancel footer 在场）`
          : `渲染集残留 ${leaked.map(n => '/' + n).join('、')}（删项未离/门未生效）→ FAIL`,
    })
  } finally {
    pty.kill()
    delete process.env.ATLAS_E2E_ROWS
  }
  return probes
}

// ── 场景 dispatch ────────────────────────────────────────────────────
async function runScenario(scen: Scen): Promise<{ probes: Verdict[]; inconclusive: number; hardFail: number }> {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const probes: Verdict[] =
    scen === 'cmd' ? runCmd() : scen === 'help' ? await runHelp() : await runStatusLine(scen === 'statusline-config' ? 'config' : 'default')
  const hardFail = probes.filter(p => p.hard && p.ok === false).length
  const inconclusive = probes.filter(p => p.ok === null).length
  const scenResult = {
    run: RUN_TAG,
    scen,
    repo: REPO || '(unset)',
    probes,
    hardFail,
    inconclusive,
    verdict:
      probes.some(p => p.ok === null) && hardFail === 0
        ? `INCONCLUSIVE=${inconclusive}（定因见各探针）`
        : hardFail === 0
          ? 'PASS'
          : `FAIL（hardFail=${hardFail}）`,
  }
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify(scenResult, null, 2))
  console.log(`\n=== ${scen} ===  ${scenResult.verdict} → ${scenDir}`)
  for (const p of probes) {
    const tag = p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : p.hard ? '?' : 'INC'
    console.log(`  [${tag}${p.warn ? '/WARN' : ''}] ${p.id}: ${p.detail}`)
  }
  return { probes, inconclusive, hardFail }
}

async function main(): Promise<void> {
  console.log(`[SC ${RUN_TAG}] modes=${runScens.join(',')} repo=${REPO || '(unset)'}`)
  if (!REPO) {
    console.error('[SC] REPO 未设（--repo <0.1.40 worktree>）——源级 + PTY 面均需有效 worktree')
    process.exit(2)
  }
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
  console.error(`[SC ${RUN_TAG}] FATAL: ${String(e?.stack ?? e)}`)
  process.exit(2)
})
