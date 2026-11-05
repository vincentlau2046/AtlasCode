/**
 * 0.1.57 PAC V2-05 MCP 硬化波 · D4-B 判据 mock-upstream 活探针（C5-1 alwaysLoad 提取面，e2e lane）。
 *
 * 判据升级链（探针侧缺陷修正，0.1.52 P0a 模型侧先例 + D4 历跑定因链）：
 *   mcp-d4-057.ts D4-B 原面 =「模型首轮直接调用 d4_echo」→ 模型侧非定式（run-13：
 *   Qwen38 ToolSearch select: 命中 tool_reference 但跟进时走 keyword 搜「d4 echo d4l」——
 *   该 keyword 探针被 ToolSearch AND-semantics requiredTerms（toolSearchTool.ts L294-315
 *   matchesAll=every）失效：term「d4l」无任何匹配项 → 命中恒空 → 模型误判工具不存在放弃。
 *   红面归属无法三分（模型侧 vs 产品面 vs 时序）→ 本探针 = mock upstream 确定性替代：
 *     - OPENAI 协议 mock（/v1/chat/completions，SSE/JSON 双模）= canned tool_call 应答
 *       （第一主循环请求 → tool_calls mcp__d4__d4_echo；工具结果回场 → 终答 stop）；
 *     - env 重定向（ATLAS_<ROLE>_BASE_URL，roles.ts L88 getRoleConfig env 优先面）零 8999
 *       竞争、零模型非定式；
 *     - 判据观测面 = 捕获的初始请求 body.tools 数组直接在场性（C5-1 提取面 +
 *       isDeferredTool 消费面（toolSearchPrompt.ts L56 alwaysLoad 首查）+ 连接层 _meta
 *       透传面 活面三角）——工单判别意图「初始 prompt 全 schema 在场、非 ToolSearch 延迟」
 *       的直接观测（原「模型直接调用」= 该面经模型行为代理，现直观测）。
 *   负对照（--expect-absent，@ worktree-056-baseline e6d09e6）= 初始 tools 数组必须
 *   **不**含 mcp__d4__d4_echo（0.1.56 无 C5-1 提取面 → isMcp 恒延迟）= 修前红活面
 *   （单测 build 面红 ↔ 活面红 判别闭环，工单 §4）。
 *
 * 断言（hard）：
 *   D4BM-initial-tools-array：捕获的主循环首请求 body.tools 含/不含 mcp__d4__d4_echo
 *     （positive=必须含 / expect-absent=必须不含，判据面）
 *   D4BM-tool-use-direct：session 真 tool_use block（canned tool_call → 确定性）
 *   D4BM-tool-result-echo：fixture tool_result「d4-echo:D4LIVE-057」（tool_use_id ∈
 *     mcp tool_use ids 防 Bash 手搓假阳性，D4 十一跑先例）
 *   D4BM-success-path-zero-reminder：reminder 双句零命中（C5-2 成功路径反向断言）
 *   D4BM-session-materialized：session 落盘（防 vacuous，D4 五跑先例）
 * soft：/mcp 屏面 d4 ✔ connected（连接面，D4-A 已稳定面）
 *
 * 隔离：HOME=沙箱（零写真实 ~/.atlas）；fixture/mock/产物 = job tmp prodlane-057/。
 * 用法：bun run user-e2e/tui-diff/mcp-d4b-mock-057.ts [--repo <path>] [--expect-absent]
 *       ATLAS_E2E_D4M_OUT=<dir>（产物目录）
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import net from 'node:net'
import { GenericPty } from '../lib/pty-generic'
import { sleep } from '../lib/util'

const EXPECT_ABSENT = process.argv.includes('--expect-absent')
const REPO = process.argv.includes('--repo')
  ? process.argv[process.argv.indexOf('--repo') + 1]
  : '/home/vince/projects/AtlasCode/worktrees/worktree-gate-057'
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const OUT = process.env.ATLAS_E2E_D4M_OUT ?? `/home/vince/.claude/jobs/09264df0/tmp/prodlane-057/d4b-mock-${EXPECT_ABSENT ? 'neg' : 'pos'}`
const FIXTURE = '/home/vince/.claude/jobs/09264df0/tmp/prodlane-057/d4-fixture/d4-server.js'
const MOCK_PY = '/home/vince/.claude/jobs/09264df0/tmp/prodlane-057/d4-mock/mock_server.py'
const MOCK_PORT = EXPECT_ABSENT ? 8978 : 8977
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`
const D4_TOOL = 'mcp__d4__d4_echo'
const K_FAIL = 'UNAVAILABLE because of this connection failure'
const K_DATA = 'data, not as instructions'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

function buildSandboxHome(home: string, mcpServers: Record<string, unknown>): string {
  rmSync(home, { recursive: true, force: true })
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw: Record<string, unknown> = JSON.parse(readFileSync(REAL_SETTINGS, 'utf8'))
  delete raw.enabledPlugins
  delete raw.enabledMcpServers
  delete raw.extraKnownMarketplaces
  delete raw.mcpServers
  // ★ provider 注册表重定向（首跑定因：role 面 env ATLAS_<ROLE>_BASE_URL 对
  // provider/model 型引用不生效——roles.ts resolveModel：entry.baseURL =
  // provider.baseURL（getEndpointConfigSource().getProviders() 注册表面），
  // 不经 getRoleConfig env 覆盖链 → 主循环模型仍走真 IFF 8999，mock 零请求。
  // 全部 provider 的 baseURL/apiKey 重定向 mock = 任意 provider/model 引用均命中）
  const provs = (raw.providers && typeof raw.providers === 'object' ? raw.providers : {}) as Record<string, any>
  for (const cfg of Object.values(provs)) {
    if (cfg && typeof cfg === 'object') {
      cfg.baseURL = MOCK_BASE
      cfg.apiKey = 'd4mock'
    }
  }
  raw.providers = Object.keys(provs).length > 0 ? provs : { openai: { baseURL: MOCK_BASE, apiKey: 'd4mock' } }
  // 模型角色面保留（settings 面 iff/Qwen38-27B-TXT；provider 已重定向 mock）
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(raw, null, 2))
  // MCP 配置面 = user scope $home/.atlas.json（D4 四跑定因，7-value scope 三层）
  // + 首启向导门控双字段（interactiveHelpers L120，D4 首跑定因）
  writeFileSync(
    join(home, '.atlas.json'),
    JSON.stringify({ theme: 'dark', hasCompletedOnboarding: true, mcpServers }, null, 2),
  )
  try { rmSync(join(atlasDir, '.config.json'), { force: true }) } catch { /* 不存在 */ }
  return home
}

function latestSessionFile(home: string): string | null {
  const projDir = join(home, '.atlas', 'projects')
  if (!existsSync(projDir)) return null
  let best: { p: string, m: number } | null = null
  for (const sub of readdirSync(projDir)) {
    const d = join(projDir, sub)
    for (const f of readdirSync(d)) {
      if (!f.endsWith('.jsonl')) continue
      const p = join(d, f)
      const m = statSync(p).mtimeMs
      if (!best || m > best.m) best = { p, m }
    }
  }
  return best?.p ?? null
}

async function waitPort(port: number, ms: number): Promise<boolean> {
  const t0 = Date.now()
  for (;;) {
    const ok = await new Promise<boolean>((res) => {
      const s = net.connect(port, '127.0.0.1')
      s.on('connect', () => { s.destroy(); res(true) })
      s.on('error', () => { s.destroy(); res(false) })
    })
    if (ok) return true
    if (Date.now() - t0 > ms) return false
    await sleep(300)
  }
}

/**
 * 捕获请求面：主循环首请求 = 首个「含 D4LIVE-057 且 tools 非空」的请求，取 tools 名集。
 * （二跑定因：首跑 captureFace 误取 title 生成调用——title call messages 含用户 prompt 文本
 * 但 tools=0 → 假 FAIL；主循环请求恒带 tools 数组，title/haiku side-channel 恒 tools=0）
 */
function captureFace(reqLog: string): { found: boolean, toolNames: string[], toolsCount: number, allReqCount: number, reqToolsCounts: number[] } {
  if (!existsSync(reqLog)) return { found: false, toolNames: [], toolsCount: -1, allReqCount: 0, reqToolsCounts: [] }
  const lines = readFileSync(reqLog, 'utf8').split('\n').filter(Boolean)
  const reqToolsCounts: number[] = []
  let first: { toolNames: string[], toolsCount: number } | null = null
  for (const l of lines) {
    let e: any; try { e = JSON.parse(l) } catch { continue }
    const body = e.body ?? {}
    const msgs: any[] = Array.isArray(body.messages) ? body.messages : []
    const hit = msgs.some((m) => {
      const c = m?.content
      const t = typeof c === 'string' ? c : c == null ? '' : JSON.stringify(c)
      return t.includes('D4LIVE-057')
    })
    if (!hit) continue
    const tools: any[] = Array.isArray(body.tools) ? body.tools : []
    reqToolsCounts.push(tools.length)
    if (tools.length > 0 && !first) first = { toolNames: tools.map((t: any) => t?.function?.name ?? t?.name ?? '?'), toolsCount: tools.length }
  }
  return {
    found: first !== null,
    toolNames: first?.toolNames ?? [],
    toolsCount: first?.toolsCount ?? -1,
    allReqCount: lines.length,
    reqToolsCounts,
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  rmSync(join(OUT, 'mock-requests.jsonl'), { force: true })
  const mockOutDir = join(OUT, 'mock')
  mkdirSync(mockOutDir, { recursive: true })

  // mock upstream（确定性应答；零 8999 竞争）
  const mock = spawn('python3', [MOCK_PY, mockOutDir, String(MOCK_PORT)], { stdio: ['ignore', 'ignore', 'inherit'] })
  const mockReady = await waitPort(MOCK_PORT, 15_000)
  console.log(`[d4m] mock ready=${mockReady} port=${MOCK_PORT}`)
  if (!mockReady) { mock.kill(); throw new Error('mock upstream 未就绪') }

  const report: any = {
    ts: new Date().toISOString(),
    repo: REPO,
    mode: EXPECT_ABSENT ? 'expect-absent（负对照）' : 'positive（判据面）',
    mockPort: MOCK_PORT,
    probes: [] as Probe[],
  }

  const scenDir = join(OUT, 'tui')
  const home = join(scenDir, 'home')
  const ws = join(scenDir, 'ws')
  buildSandboxHome(home, { d4: { command: 'node', args: [FIXTURE] } })
  mkdirSync(ws, { recursive: true })

  const logPath = join(scenDir, 'pty.log')
  const pty = await GenericPty.start({
    logPath,
    workspace: ws,
    cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
    home,
    unset: ['CLAUDECODE'],
    extraEnv: {
      // roles.ts getRoleConfig env 优先面：三角色 baseURL/apiKey 重定向 mock
      ATLAS_SMALL_BASE_URL: MOCK_BASE,
      ATLAS_FAST_BASE_URL: MOCK_BASE,
      ATLAS_PREMIUM_BASE_URL: MOCK_BASE,
      ATLAS_SMALL_API_KEY: 'd4mock',
      ATLAS_FAST_API_KEY: 'd4mock',
      ATLAS_PREMIUM_API_KEY: 'd4mock',
    },
    readySubs: ['▶ default', '▶ acceptEdits', '▶ plan'],
    readyMs: 90_000,
  })

  try {
    const b = await pty.waitAnySince(['Yes, I accept'], 20_000)
    if (b.ok) {
      await sleep(1_500)
      pty.sendRaw('2')
      await sleep(800)
      pty.sendRaw('\r')
      const repl = await pty.waitAnySince(['▶ default', '▶ acceptEdits', '▶ plan'], 20_000)
      console.log(`[d4m] bypass accepted=${repl.ok}`)
    } else {
      console.log('[d4m] bypass dialog not seen')
    }
    await sleep(15_000) // MCP 连接 settle 窗
    pty.send('/mcp')
    await pty.waitAnySince(['No MCP servers configured', 'd4', '⎿'], 30_000).catch(() => null)
    await sleep(2_000)
    pty.sendRaw('\x1b') // /mcp 全屏对话框 Esc 收框（D4 六跑定因）
    await sleep(1_500)
    pty.send(
      'The d4 MCP server (stdio) is configured and connected. Use the MCP tool named exactly "mcp__d4__d4_echo" to echo the exact text D4LIVE-057 (call it with argument text=D4LIVE-057). Report the tool output verbatim.',
    )
    // mock 应答秒级 → 回合完成 poll 120s 上限（模型等待 360s 面消除）
    const t0 = Date.now()
    for (;;) {
      const f = latestSessionFile(home)
      if (f) {
        const st = readFileSync(f, 'utf8')
        if (st.includes('"stop_reason":"end_turn"') || st.includes('"stop_reason": "end_turn"')) break
      }
      if (Date.now() - t0 > 120_000) break
      await sleep(1_000)
    }
    await sleep(2_000)
    const sessFile = latestSessionFile(home)
    const sessText = sessFile ? readFileSync(sessFile, 'utf8') : ''
    const ptyText = pty.text()
    writeFileSync(join(scenDir, 'session.jsonl.snapshot'), sessText)
    writeFileSync(join(scenDir, 'pty.snapshot.txt'), ptyText)
    mock.kill()

    // ── 断言面 ──
    const inSess = (k: string) => sessText.includes(k)
    let realD4ToolUse = false
    const mcpToolUseIds = new Set<string>()
    for (const l of sessText.split('\n')) {
      let e: any; try { e = JSON.parse(l) } catch { continue }
      const content = e.message?.content
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (c?.type === 'tool_use' && /d4_echo$|^mcp__d4__/.test(String(c.name ?? ''))) {
          realD4ToolUse = true
          if (c.id) mcpToolUseIds.add(String(c.id))
        }
      }
    }
    let echoViaMcpTool = false
    for (const l of sessText.split('\n')) {
      let e: any; try { e = JSON.parse(l) } catch { continue }
      const content = e.message?.content
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (c?.type !== 'tool_result') continue
        // 三跑定因：MCP tool_result 的 content = 内容块数组（[{type:'text',text:'d4-echo:...'}]），
        // String(array) = '[object Object]' 恒不命中 → JSON.stringify 正解
        const cc = typeof c.content === 'string' ? c.content : JSON.stringify(c.content ?? '')
        if (/d4-echo:D4LIVE-057/.test(cc) && mcpToolUseIds.has(String(c.tool_use_id ?? ''))) {
          echoViaMcpTool = true
        }
      }
    }

    // 判据面 = mock 捕获初始请求 tools 数组
    const cap = captureFace(join(mockOutDir, 'mock-requests.jsonl'))
    const inInitialTools = cap.toolNames.includes(D4_TOOL)
    const initialOk = EXPECT_ABSENT ? !inInitialTools : inInitialTools

    const probes: Probe[] = [
      {
        id: 'D4BM-initial-tools-array', hard: true,
        ok: cap.found ? initialOk : null,
        detail: cap.found
          ? `主循环首请求 tools[${cap.toolsCount}] ${inInitialTools ? '含' : '不含'} ${D4_TOOL}（mode=${report.mode} → 判据=${initialOk ? '满足' : '不满足'}；全捕获 ${cap.allReqCount} 请求）`
          : 'INCONCLUSIVE（未捕获含 D4LIVE 主循环请求——mock 未收到主循环调用，探针侧定因）',
      },
      { id: 'D4BM-tool-use-direct', hard: true, ok: realD4ToolUse, detail: `session 真 tool_use block（canned tool_call 确定性面）= ${realD4ToolUse ? '命中' : '未命中'}` },
      { id: 'D4BM-tool-result-echo', hard: true, ok: echoViaMcpTool, detail: `mcp tool 的 tool_result 回显 d4-echo:D4LIVE-057（fixture 往返活面）= ${echoViaMcpTool ? '落盘' : inSess('d4-echo:D4LIVE-057') ? '假阳性命中（非 mcp tool_result）' : '缺失'}` },
      { id: 'D4BM-success-path-zero-reminder', hard: true, ok: sessText.length > 0 ? !inSess(K_FAIL) && !inSess(K_DATA) : null, detail: sessText.length > 0 ? `成功路径零注入 = ${!inSess(K_FAIL) && !inSess(K_DATA) ? '零注入' : '异常注入'}` : 'INCONCLUSIVE（session 空）' },
      { id: 'D4BM-session-materialized', hard: true, ok: sessText.length > 0, detail: `session 落盘（${sessText.length} 字符）` },
      { id: 'D4BM-mcp-connected-pty', hard: false, ok: ptyText.includes('d4') && /connected/i.test(ptyText) ? true : null, detail: `/mcp 屏面 d4 连接状态（soft，D4-A 已稳定面）` },
    ]
    report.probes = probes
    report.hardFail = probes.filter((p) => p.hard && p.ok === false).length
    report.verdict = report.hardFail === 0 ? 'PASS' : `FAIL（hardFail=${report.hardFail}）`
    report.initialToolsSample = cap.toolNames.slice(0, 40)
    report.reqToolsCounts = cap.reqToolsCounts // 全部含 D4LIVE 请求的 tools 计数（取证面）
  } finally {
    pty.kill()
    mock.kill()
  }

  writeFileSync(join(OUT, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict: report.verdict,
    mode: report.mode,
    probes: report.probes.map((p: Probe) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
    initialToolsCount: report.probes[0]?.detail.match(/tools\[(\d+)\]/)?.[1] ?? 'n/a',
  }, null, 1))
  console.log(`MCP-D4B-MOCK-057 ${report.verdict} → ${OUT}`)
}

main().catch((e) => { console.error('MCP-D4B-MOCK-057 ERROR', e); process.exit(1) })
