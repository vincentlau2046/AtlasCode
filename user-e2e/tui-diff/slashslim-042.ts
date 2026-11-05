/**
 * 0.1.42 fast 波 · e2e gate 探针（e2e 交付，零产品改动；基于 0.1.41 封口版探针扩展）。
 * 被测体 = master @ **7806035**（bump 前状态；基线 9564e63 = v0.1.41 release）。0.1.42 波两提交：
 *   b25b1d7  W-B：main.tsx `--advisor` 双重死 flag 裁除（4 落点：advisor import 5 名 / 死名 /
 *            advisorModel 链 / addOption 注册；零用户行为变化——flag 从未注册，裁前/裁后均
 *            commander unknown option 拒；advisor.ts 模块本体不动）
 *   7806035  E-1P#11：commands.ts 前向缝登记 10→11 项零码（#11 fast/fastMode 1P 服务端 fast
 *            变体不搬〔D2 全仓 11 处墓碑〕，选项 A = fast 能力由 Atlas P3 fast 角色池承载
 *            〔settings modelRoles.fast / ATLAS_FAST_MODEL / /model Fast 行 + auto-mode 三角色池〕；
 *            用户裁定未来不做 Claude 相关模型特性）
 *
 * 判据（Main 同步 5 项，本探针承载 ②③④⑤ + 源级回归；① 四件套独立复跑 = gate 执行侧）：
 *
 *   cmd                ⑤ E-1P 11 项登记面（专属头锚「E-1P 11 项零码登记」+ 11 名全命名 + #11 选项 A
 *                      裁定 + O-adv-1 执行注「0.1.42 W-B 裁除」，900 字窗实测覆盖）+ W-B 源级离场
 *                      （main.tsx 0 活动 addOption/option('--advisor') 行 + advisor import 裁除，
 *                      残留仅 2 注释行）+ fast 角色零改动源级锚（ATLAS_FAST_MODEL / model.ts 解析链
 *                      / modelRoles schema）+ 0.1.40/0.1.41 波 27 探针零增减回归。
 *   statusline-default ②' StatusLine 默认面（删 /statusline 命令不动显示组件——用户裁定负向保证）。
 *   statusline-config  ②' StatusLine 手动配置面（simple.line1 = [model] 被消费）。
 *   help               ② /help 50 标签集恒等：渲染集 = 0.1.41 权威集（SC-…-073045-j2s，= 0.1.40 r6
 *                      集合恒等）双向 diff 空集（零增减）+ 21 删项零残留 + 完整锚。
 *   model              ④ /model 选择器 Fast 行在场（modelRoles 配置面 = 三角色池合并行
 *                      「Premium/Small/Fast」label + 快速 CN 描述 = fast 角色池完好渲染）。
 *   flag-advisor       ③ `bun run cli.ts --advisor x` → exit≠0 + unknown option 拒（与裁前同拒法；
 *                      非 PTY 短命 CLI spawn，秒级；flag 被接受〔TUI 起〕= 超时 FAIL）。
 *
 * 判别力（前后 lane 统一，规则②）：pre-0.1.42（0.1.41 态）`cmd-e1p-registered` 必红（11 项头锚/
 * #11 名缺席）+ `cmd-advisor-flag-removed` 必红（addOption 注册在场）；post-0.1.42 必绿。
 * /help 集恒等 + /model Fast 行 = 用户面零改动负向保证（W-B 零行为 + E-1P#11 零码）。
 * FAIL = 产品缺口（fail-closed 不发布）；INCONCLUSIVE 必带定因（面未达：tab 未达 / footer 未捕获，
 * 核 pty.log）；源级 `isEnabled` 字面非 `() => true` = WARN（交 Main 核 W3 口径，非 FAIL）。
 *
 * 0.1.60 适配（PAC V2-11 TUI 小波 = /output-style + /cd + /reload-skills，工单
 * docs/2026-10-13-p0-wave-0160-ticket.md §4「/help 新基线 + cmd 32」；Main gate 信号 ①②）：
 *   cmd 探针集 30→32 总（数据探针 29→31 + cmd-source guard 1）：① output-style（原 W1 5 删项）
 *      0.1.60 TUI-1 重加 → DELETED 表退役（cmd-del-output-style 离场，20 删项→19）+ NEW_CMD
 *      3 项在场探针（cmd-add-output-style/cd/reload-skills = import specifier + 文件 +
 *      COMMANDS 注册绑定 三层，pre-0.1.60 判别面必红）；② ATLAS_E2E_HELP_SET=060 = 54 标签
 *      （= 051 权威 51 + output-style/cd/reload-skills，/help 基线 51→54）。
 *   help 缺席面 deletedNames 21→20 名（output-style 出缺席列表，在场面 = help-set-identity-060
 *      集恒等承载；「21 删项」头注 = 0.1.42 历史口径，本波起 = 19 删项 + version = 20 缺席名）。
 *
 * 拓扑/纪律：PTY（lib/pty，200×50 默认；`ATLAS_E2E_ROWS` 可覆盖）起
 * `bun run <repo>/src/atlascode/cli.ts`（workspace=sandbox ws，HOME=sandbox home，零写真实 ~/.atlas；
 * StatusLine 面经 <sandboxHome>/.atlas/statusline.json）。`cmd` 纯源级 grep 无 PTY/无网关；
 * `flag-advisor` 短命 CLI spawn 无 PTY 列表面；PTY 场景同 lane 串行（防网关竞争）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/slashslim-042.ts --repo <master 7806035 worktree> [--all|cmd|statusline-default|statusline-config|help|model|flag-advisor]
 * 产物：artifacts/SC-<stamp>-<rand>/<scen>/{result.json[,pty.log]}（pty.log 为 PTY 全量 raw 日志）
 *
 * 执行时点：Main verify worktree 四件套全绿后触发（2026-10-08，Main 单信号开跑）。
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
const MODES = ['cmd', 'statusline-default', 'statusline-config', 'help', 'model', 'flag-advisor'] as const
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

// 0.1.41 权威 /help 50 标签集（SC-20261008-073045-j2s help-capture.txt 提取，= 0.1.40 gate r6 集合恒等
// 已在 gate 侧双向 diff 空集实证）——0.1.42 W-B 零行为 + E-1P#11 零码 → 渲染集必须与该集精确一致。
const HELP_SET_041 = [
  'add-dir', 'agents', 'autocompact', 'branch', 'btw', 'clear', 'color', 'compact', 'config', 'context',
  'copy', 'cost', 'diff', 'doctor', 'effort', 'exit', 'export', 'feedback', 'files', 'help',
  'hooks', 'ide', 'init', 'insights', 'login', 'logout', 'mcp', 'memory', 'model', 'permissions',
  'plan', 'plugin', 'release-notes', 'reload-plugins', 'rename', 'resume', 'review', 'rewind', 'session',
  'sessionlist', 'skills', 'stats', 'status', 'stickers', 'tag', 'tasklist', 'tasks', 'terminal-setup',
  'theme', 'vim',
]

// 0.1.51 权威 /help 51 标签集（= 0.1.41 权威 50 + /tui〔C-2 AD-14 新命令〕；ticket §3 原口径 50→51）。
// ★ 定因（2026-10-11 gate 实证，SC-20261011-165450-feh/help help-capture.txt）：Main 回执 #308 曾订正「52 = 50 + tui
// + less-permission-prompts（userInvocable bundled skill → /help 可见）」，但 /help commands tab 实况 = 仅
// "general commands" 列表（51 标签 = 50 + tui，「Space to cancel」footer 在场 = 列表完整），bundled skill
// 不进 /help commands tab 渲染集 → 52 订正不成立，权威集回 ticket 原口径 51。skill 可调用面 ≠ /help 列表面
// （/less-permission-prompts 可调用性 = AD-11 allowlist 契约 7 测单测覆盖，green-state 全绿）。
// 探针面经 ATLAS_E2E_HELP_SET=051 启用（默认 041 = 历史面 50 标签恒等，向后兼容 0.1.50 及更早 gate 重跑）。
const HELP_SET_051 = [...HELP_SET_041, 'tui']
// 0.1.60 权威 /help 54 标签集（= 0.1.51 权威 51 + 0.1.60 TUI 小波 3 新命令 output-style/cd/reload-skills；
// 工单 §3 基线 51→54，Main gate 信号 ①）。探针面经 ATLAS_E2E_HELP_SET=060 启用（0.1.60 gate 面；
// 041/051 向后兼容更早波重跑）。
const HELP_SET_060 = [...HELP_SET_051, 'output-style', 'cd', 'reload-skills']
// 0.1.62 权威 /help 55 标签集（= 0.1.60 54 + /goal 〔双形态注册 local-jsx+local 同 name 去重计 1 项〕；
// 工单 §3 基线 54→55，Main gate 信号 ①）。探针面经 ATLAS_E2E_HELP_SET=062 启用（0.1.62 gate 面；
// 041/051/060 向后兼容更早波重跑）。
const HELP_SET_062 = [...HELP_SET_060, 'goal']
const HELP_SET_VER: '041' | '051' | '060' | '062' =
  process.env.ATLAS_E2E_HELP_SET === '062'
    ? '062'
    : process.env.ATLAS_E2E_HELP_SET === '060'
      ? '060'
      : process.env.ATLAS_E2E_HELP_SET === '051'
        ? '051'
        : '041'
const HELP_SET_ACTIVE =
  HELP_SET_VER === '062'
    ? HELP_SET_062
    : HELP_SET_VER === '060'
      ? HELP_SET_060
      : HELP_SET_VER === '051'
        ? HELP_SET_051
        : HELP_SET_041

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

/** 19 删项（W1 4 + W2 15）：import specifier（commands.ts 内）+ 命令文件/目录（src/tui/commands/ 下）目标「全不在」。
 *  ★ output-style（原 W1 第 5 删项）= 0.1.60 TUI-1 重加 → 本波自删表退役（cmd-del-output-style 离场，
 *  在场判据迁 NEW_CMD = cmd-add-output-style，Main gate 信号 ②「retire/repurpose」）。 */
const DELETED: { name: string; wave: 'W1' | 'W2'; spec: string; path: string }[] = [
  { name: 'statusline', wave: 'W1', spec: "from './commands/statusline.js'", path: 'statusline.tsx' },
  // output-style = 0.1.60 TUI-1 重加（见 NEW_CMD；原 W1 5 删项退役）
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
/** 0.1.60 TUI 小波 3 项（PAC V2-11 TUI-1/2/3）：import specifier（commands.ts 内）+ 命令文件 +
 *  COMMANDS 注册绑定在场（pre-0.1.60 判别面必红）。output-style = 0.1.40 W1 裁除后本波重加；
 *  cd/reload-skills = 新增（CC 2.1.169 / 2.1.152）。binding = COMMANDS memoize 数组内注册行标识。 */
const NEW_CMD: { name: string; spec: string; path: string; binding: string; wave: string }[] = [
  { name: 'output-style', spec: "from './commands/output-style/index.js'", path: 'output-style', binding: 'outputStyle', wave: '0.1.60' },
  { name: 'cd', spec: "from './commands/cd/index.js'", path: 'cd', binding: 'cd', wave: '0.1.60' },
  { name: 'reload-skills', spec: "from './commands/reload-skills/index.js'", path: 'reload-skills', binding: 'reloadSkills', wave: '0.1.60' },
  // 0.1.62 /goal 双形态注册（local-jsx goal + local goalNonInteractive，/context 先例同 name 去重）
  { name: 'goal', spec: "from './commands/goal/index.js'", path: 'goal', binding: 'goal', wave: '0.1.62' },
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

  // 0.1.60 TUI 小波 3 项（output-style 重加 + cd/reload-skills 新增）：import specifier 在场
  // + 命令文件在场 + COMMANDS 注册绑定行在场（三层，任一缺 = 未落；pre-0.1.60 判别面必红）
  for (const c of NEW_CMD) {
    const specIn = ts.includes(c.spec)
    const fileIn = existsSync(join(CMD_ROOT, c.path, 'index.ts'))
    const regIn = new RegExp('^\\s*' + c.binding + '\\s*,\\s*$', 'm').test(ts)
    const residual: string[] = []
    if (!specIn) residual.push('import specifier 不在')
    if (!fileIn) residual.push(`文件 ${c.path}/index.ts 不在`)
    if (!regIn) residual.push(`COMMANDS 注册行（${c.binding},）不在`)
    probes.push({
      id: `cmd-add-${c.name}`,
      hard: true,
      ok: specIn && fileIn && regIn,
      detail:
        specIn && fileIn && regIn
          ? `${c.wave} 新项 ${c.name}：import specifier + 文件 + COMMANDS 注册绑定（${c.binding}）全在场（重加/新增已落）`
          : `${c.wave} 新项 ${c.name} 未落（${residual.join('、')}）→ 本波未达（pre-${c.wave} 判别面）`,
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

  // 0.1.42 波 E-1P 11 项零码登记（前向缝注释块，落码实态 11 项 = 0.1.41 10 项 + #11 fast/fastMode）：
  // marker 在场 + 11 项全命名 + #11 fast/fastMode 选项 A 裁定 + O-adv-1 执行注「0.1.42 W-B 裁除」（char-safe 内容锚：
  // 头锚后 900 字窗内 11 名 + fast/fastMode + O-adv-1 + W-B 裁除注 全含——已实测覆盖）
  const E1P_NAMES = [
    'chrome', 'desktop', 'mobile', 'install-github-app', 'extra-usage',
    'rate-limit-options', 'passes', 'remote-env', 'privacy-settings', 'advisor', 'fast/fastMode',
  ]
  // 锚点 = E-1P 专属头「E-1P 11 项零码登记」（0.1.42 落码；0.1.41 版头「E-1P 10 项零码登记」已被本波替换，
  // 文件内唯一；「前向缝登记」泛 marker 仍 6 处——0.1.40 r1 定因先例：必须用专属头锚）
  const e1pMarker = ts.indexOf('E-1P 11 项零码登记')
  const e1pWindow = e1pMarker >= 0 ? ts.slice(e1pMarker, e1pMarker + 900) : ''
  const e1pMissing = E1P_NAMES.filter(n => !e1pWindow.includes(n))
  const oAdv1In = e1pWindow.includes('O-adv-1')
  const wBExecNote = e1pWindow.includes('0.1.42 W-B 裁除') // O-adv-1 执行注（--advisor flag 已裁除）
  // #11 选项 A 裁定（1P fastMode 不搬，fast 能力由 Atlas fast 角色承载）——窗内字面量实测：
  // 'fastMode' + '选项 A' 均在 900 字窗（'P3 fast 角色池' 在窗外，不入判据）
  const fastModeAIn = e1pWindow.includes('fastMode') && e1pWindow.includes('选项 A')
  probes.push({
    id: 'cmd-e1p-registered',
    hard: true,
    ok: e1pMarker >= 0 && e1pMissing.length === 0 && oAdv1In && wBExecNote && fastModeAIn,
    detail:
      e1pMarker >= 0 && e1pMissing.length === 0 && oAdv1In && wBExecNote && fastModeAIn
        ? `E-1P 11 项零码登记注释块在场（E-1P 专属前向缝头 + 11 项全命名：${E1P_NAMES.join('·')} + #11 fast/fastMode 选项 A 裁定〔1P fastMode 有意不搬，fast 能力由 Atlas P3 fast 角色池承载〕+ O-adv-1 执行注「0.1.42 W-B 裁除」）= 1P 依赖有意不搬（0.1.42 封口登记面）`
        : `E-1P 11 项登记面缺口（专属头=${e1pMarker >= 0 ? '在场' : '缺席'}；缺项=${e1pMissing.join('/') || '无'}；O-adv-1=${oAdv1In}；W-B 执行注=${wBExecNote}；#11 选项 A=${fastModeAIn}）→ 未登记`,
  })

  // 0.1.42 W-B：--advisor 双重死 flag 裁除（main.tsx 源级 离场断言）——4 落点全裁，
  // 允许残留 = 仅注释行（「0.1.42 W-B（O-adv-1 核销）」记录）；活动 addOption/option('--advisor') = FAIL。
  const mainTs = readIfExists(join(REPO, 'src/tui/main.tsx')) ?? ''
  const advisorActiveLines = mainTs.split('\n').filter(l =>
    /addOption|\.option\s*\(/.test(l) && l.includes('advisor') && !/^\s*(\*|\/\/)/.test(l))
  const advisorImportGone = !/import.*\badvisor\b/.test(mainTs.split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n'))
  probes.push({
    id: 'cmd-advisor-flag-removed',
    hard: true,
    ok: advisorActiveLines.length === 0 && advisorImportGone,
    detail:
      advisorActiveLines.length === 0 && advisorImportGone
        ? `W-B --advisor 裁除核销（main.tsx 源级：0 活动 addOption/option('--advisor') 行 + advisor import 裁除；残留仅 O-adv-1 注释 2 处）= flag 从未注册，裁前/裁后均 commander unknown option 拒（行为面 = flag-advisor 场景承载）`
        : `W-B --advisor 裁除面缺口（活动 addOption/option 行=${advisorActiveLines.length}；import 在场=${!advisorImportGone}）→ 双重死 flag 未裁`,
  })

  // 0.1.42 负向断言：fast 角色池零改动（用户裁定 fast 能力由 Atlas P3 fast 角色池承载，1P fastMode 不搬）——
  // 解析锚点在场 = fast 角色解析链路完好（2 提交仅碰 main.tsx + commands.ts，不碰下列文件 → 快角色池字节级不变）。
  const fastAnchors = {
    'ATLAS_FAST_MODEL': readIfExists(join(REPO, 'src/tui/utils/managedEnvConstants.ts')) ?? '',
    'modelRoles.fast-resolve': readIfExists(join(REPO, 'src/tui/utils/model/model.ts')) ?? '',
    'modelRoles schema': readIfExists(join(REPO, 'src/tui/utils/settings/types.ts')) ?? '',
  }
  const fastRoleOk =
    fastAnchors['ATLAS_FAST_MODEL'].includes('ATLAS_FAST_MODEL') &&
    fastAnchors['modelRoles.fast-resolve'].includes("process.env.ATLAS_FAST_MODEL || getRoleModel('fast')") &&
    fastAnchors['modelRoles schema'].includes('modelRoles')
  probes.push({
    id: 'cmd-fast-role-unchanged',
    hard: true,
    ok: fastRoleOk,
    detail:
      fastRoleOk
        ? `fast 角色零改动负向断言（ATLAS_FAST_MODEL 在 managedEnvConstants + model.ts 解析链 'process.env.ATLAS_FAST_MODEL || getRoleModel(fast)' 完好 + modelRoles schema 在场）= fast 角色池未受 0.1.42 波影响（/model Fast 行 user-face = 报告 corroboration，2 提交不碰 model selector）`
        : `fast 角色零改动面缺口（ATLAS_FAST_MODEL/model.ts 解析链/modelRoles schema 任一缺失）→ fast 角色池被 0.1.42 波误改`,
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
    // 缺席面（/help 零增减=表断言与活屏一致）：19 删项（W1 4 + W2 15，0.1.40 生产面恒不可见）
    // + version（ATLAS_DEV 门，PTY IS_DEMO=1 恒不在场）= 零残留面（W2 dev 表门若破亦在此现形）。
    // ★ 0.1.60：output-style（原 W1 删项）重加 → 出缺席列表（在场判据 = help-set-identity-060
    // 54 标签集恒等承载，Main gate 信号 ①）
    const deletedNames = [
      'statusline', 'pr-comments', 'security-review', 'torch', 'version',
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
          ? `19 删项 + version 均不在渲染集（W1/W2 删项离场〔output-style = 0.1.60 重加，出缺席面〕+ version ATLAS_DEV 门 + W2 dev 表门）= /help 零增减缺席面（列表完整 = Space to cancel footer 在场）`
          : `渲染集残留 ${leaked.map(n => '/' + n).join('、')}（删项未离/门未生效）→ FAIL`,
    })
    // ② 集恒等（Main 判据 2：/help 权威集双向 diff ∅）：提取法 = gate-041 先例同 regex + 同 raw 文本
    // （规则②「测的=发布的」：权威集提取面与本探针同口径）
    // 权威集参数化：默认 041 = 50 标签（0.1.41 权威集，0.1.42–0.1.50 面）；ATLAS_E2E_HELP_SET=051 = 51 标签
    // （0.1.51 面 = 50 + tui〔C-2 AD-14 新命令〕；task #308「52」订正实证不成立〔bundled skill 不进
    // /help commands tab，SC-20261011-165450-feh 定因〕）；ATLAS_E2E_HELP_SET=060 = 54 标签（0.1.60 面 =
    // 51 + output-style/cd/reload-skills 3 新命令，工单 §3 基线 51→54，Main gate 信号 ①）
    // ★ 0.1.60 探针侧缺口（定因登记②）：0.1.42 时代提取 regex `{2,}`（≥3 字符 label）= 50 标签
    // 权威集最小 label 长度设计；'cd' = 权威集首个 2 字符 label（0.1.54 面「缺=cd」假 FAIL 定因：
    // /cd 实渲染在场〔help-capture 行实证〕但 `{2,}` 结构不可提取）。条件加宽：仅当权威集含
    // 2 字符 label（= 060 面）时用 `{1,}`（≥2 字符）提取——本 capture 加宽面 zero 额外标签实证
    // （无假阳）；041/051 面（无 2 字符 label）= 原 regex 字节级不变（前波重跑零漂移）。
    const hasShortLabel = HELP_SET_ACTIVE.some(l => l.length === 2)
    const extracted = new Set(
      [...text.matchAll(hasShortLabel ? /\/([a-z][a-z0-9-]{1,})\s{2,}/g : /\/([a-z][a-z0-9-]{2,})\s{2,}/g)].map(m => m[1]),
    )
    const setMissing = HELP_SET_ACTIVE.filter(l => !extracted.has(l))
    const setExtra = [...extracted].filter(l => !HELP_SET_ACTIVE.includes(l))
    const setLabel = HELP_SET_VER === '062'
      ? `/help ${HELP_SET_062.length} 标签集恒等 = 0.1.62 权威集（54 + goal，工单 §3 基线 54→55，双形态注册 name 去重计 1 项；双向 diff ∅：缺 0 / 多 0）= /goal 命令标签在场 + 0.1.60 基线 54 标签零增减`
      : HELP_SET_VER === '060'
        ? `/help ${HELP_SET_060.length} 标签集恒等 = 0.1.60 权威集（51 + output-style/cd/reload-skills，工单 §3 基线 51→54；双向 diff ∅：缺 0 / 多 0）= TUI 小波 3 新命令标签在场 + 0.1.51 基线 51 标签零增减`
      : HELP_SET_VER === '051'
        ? `/help ${HELP_SET_051.length} 标签集恒等 = 0.1.51 权威集（50 + tui，ticket §3 原口径；task #308「52」订正实证不成立〔bundled skill 不进 /help commands tab，SC-20261011-165450-feh 定因〕；双向 diff ∅：缺 0 / 多 0）= C 簇新增面 /tui 标签在场 + 0.1.41 基线 50 标签零增减`
        : `/help ${HELP_SET_041.length} 标签集恒等 = 0.1.41 权威集（双向 diff ∅：缺 0 / 多 0）= /help 零增减（W-B 零行为 + E-1P#11 零码，用户面渲染集不变）`
    probes.push({
      id: `help-set-identity-${HELP_SET_VER}`,
      hard: true,
      ok: listComplete ? setMissing.length === 0 && setExtra.length === 0 : null,
      detail: !listComplete
        ? incDetail
        : setMissing.length === 0 && setExtra.length === 0
          ? setLabel
          : `集 diff 非空（缺=${setMissing.join('/') || '无'}；多=${setExtra.join('/') || '无'}）→ /help 集变化（期望集 = ${HELP_SET_VER} 权威集 ${HELP_SET_ACTIVE.length} 标签）→ FAIL`,
    })
  } finally {
    pty.kill()
    delete process.env.ATLAS_E2E_ROWS
  }
  return probes
}

// ── ④ /model 选择器 Fast 行（fast 角色零改动负向断言，用户面佐证）─────────────────────────
// 沙箱 settings 恒配 modelRoles（small/fast/premium）→ modelOptions P3 分支：三角色池按 model 合并
// 单行「Premium/Small/Fast · <model>」label + 「最强/日常主力/快速 (iff)」CN 描述——Fast 组件在场
// = fast 角色池完好渲染（E-1P#11 裁定：fast 能力由 Atlas fast 角色池承载，1P fastMode 不搬）。
const MODEL_OPEN_MS = 30_000
const MODEL_HEADER = 'Switch between Atlas models'
async function runModel(): Promise<Verdict[]> {
  const { scenDir, ws, home } = await setupSandbox('model')
  const probes: Verdict[] = []
  const { Pty } = await import('../lib/pty')
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
  try {
    const tReady = Date.now()
    while (!pty.sinceText().includes('⚡') && Date.now() - tReady < 30_000) await sleep(1000)
    pty.send('/model')
    const t0 = Date.now()
    while (Date.now() - t0 < MODEL_OPEN_MS) {
      if (pty.sinceText().includes(MODEL_HEADER)) break
      await sleep(1500)
    }
    const opened = pty.sinceText().includes(MODEL_HEADER)
    if (!opened) {
      probes.push({
        id: 'model-picker-open',
        hard: false,
        ok: null,
        detail: `/model 选择器未达（header「${MODEL_HEADER}」未现）→ 面未达（REPL 就绪/命令展开），核 pty.log（INCONCLUSIVE，非 FAIL）`,
      })
      return probes
    }
    await pty.settle(2_000, 15_000)
    const raw = pty.sinceText()
    writeFileSync(join(scenDir, 'model-capture.txt'), raw)
    // 探针侧 ANSI 剥净（SGR 拆字防误判；产品面判据不受影响）
    const text = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    const controlOk = text.includes('Default (recommended)')
    probes.push({
      id: 'model-control',
      hard: true,
      ok: controlOk,
      detail: controlOk ? `控制行「Default (recommended)」在场（/model 列表真渲染）` : `控制行缺席（列表未渲染/提取面未达）→ FAIL`,
    })
    const fastRowOk = text.includes('Fast') && text.includes('快速')
    probes.push({
      id: 'model-fast-row',
      hard: true,
      ok: fastRowOk,
      detail: fastRowOk
        ? `/model Fast 行在场（三角色池合并行「Fast」label + 「快速」CN 描述）= fast 角色池完好渲染（fast 零改动负向断言用户面佐证）`
        : `Fast 行缺席（「Fast」label / 「快速」CN 描述未现）→ fast 角色池被改或未渲染 → FAIL`,
    })
  } finally {
    pty.kill()
  }
  return probes
}

// ── ③ --advisor 离场 CLI 探针（非 PTY 短命 spawn；裁前/裁后同拒法 = commander unknown option）──
// 判据（Main 判据 3）：`bun run cli.ts --advisor x` → exit≠0 + unknown option 拒。flag 从未注册
// （W-B 裁除的是从未生效的双重死 flag），裁前/裁后拒法一致 = 零用户行为变化。超时（TUI 起）= flag 被接受 = FAIL。
async function runFlagAdvisor(): Promise<Verdict[]> {
  const { scenDir, ws, home } = await setupSandbox('flag-advisor')
  const probes: Verdict[] = []
  const r = spawnSync('bun', ['run', join(REPO, 'src/atlascode/cli.ts'), '--advisor', 'x'], {
    timeout: 25_000,
    cwd: ws,
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  })
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  writeFileSync(join(scenDir, 'flag-advisor-output.txt'), out)
  const timedOut = r.status === null && r.signal === 'SIGTERM'
  const rejMsg = /unknown option/i.test(out) && out.includes('advisor')
  if (timedOut) {
    probes.push({
      id: 'flag-advisor-rejected',
      hard: true,
      ok: false,
      detail: `--advisor x 未拒（25s 超时进程未退 = TUI 起）→ flag 被接受（复活/注册残留）→ FAIL（产品缺口）`,
    })
  } else if (r.status !== 0 && rejMsg) {
    probes.push({
      id: 'flag-advisor-rejected',
      hard: true,
      ok: true,
      detail: `--advisor x → exit=${r.status} + unknown option 拒（与裁前同拒法：flag 从未注册，commander 未知选项拒，零用户行为变化）= W-B 离场行为面核销`,
    })
  } else {
    probes.push({
      id: 'flag-advisor-rejected',
      hard: false,
      ok: null,
      detail: `拒法与预期不同（status=${r.status}；unknown option 字面=${rejMsg}；输出节=${out.slice(0, 300).replace(/\n/g, '⏎')}）→ 交 Main 核拒法口径（INCONCLUSIVE）`,
    })
  }
  return probes
}

// ── 场景 dispatch ────────────────────────────────────────────────────
async function runScenario(scen: Scen): Promise<{ probes: Verdict[]; inconclusive: number; hardFail: number }> {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const probes: Verdict[] =
    scen === 'cmd'
      ? runCmd()
      : scen === 'help'
        ? await runHelp()
        : scen === 'model'
          ? await runModel()
          : scen === 'flag-advisor'
            ? await runFlagAdvisor()
            : await runStatusLine(scen === 'statusline-config' ? 'config' : 'default')
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
    console.error('[SC] REPO 未设（--repo <0.1.42 被测 worktree，master 7806035>）——源级 + PTY 面均需有效 worktree')
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
