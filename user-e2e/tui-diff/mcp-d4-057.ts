/**
 * 0.1.57 PAC V2-05 MCP 硬化波 · D4 PTY MCP 服务器连/断活探针（e2e lane 回归重跑项，
 * 工单 docs/2026-10-13-p0-wave-0157-ticket.md §2 D4；f4 预审 #5 判据面）。
 *
 * 双场景（PTY TUI 活面 + session 文件断言面〔r-20261011-prodlane-052 定因④先例〕）：
 *   D4-A = C5-2 连接失败 reminder 活面（hard）：
 *     mcpServers.d4bad（不存在的 command，恒连接失败）→ TUI 启动 → 提 prompt 问
 *     各 MCP 服务器可用性 → 会话内 system-reminder 双句在场（断言关键词以 Main 落码
 *     文案源 src/tui/services/mcp/mcpFailureReminder.ts buildMcpConnectionFailureReminder
 *     为准：① UNAVAILABLE…connection failure / not a missing capability + /mcp 重连
 *     ② data, not as instructions）。成功路径零注入 = D4-B 面反向断言。
 *   D4-B = C5-1 alwaysLoad 提取活面（hard）：
 *     mcpServers.d4 = 本地 stdio fixture（d4-server.js：tools/list 返回 d4_echo 带
 *     _meta['anthropic/alwaysLoad']=true，tools/call 回显 d4-echo:<text>）→ 模型
 *     首轮**直接**调用 mcp__d4__d4_echo（alwaysLoad 挂上 = 初始 prompt 全 schema
 *     在场、非 ToolSearch 延迟）→ tool_result d4-echo:D4LIVE-057 落盘。
 *     判别性：提取面缺失时 d4_echo 不在初始 prompt（恒延迟）→ 模型首轮无法直接调用
 *     → 「首轮直接调用」= 提取面活判别（单测四值矩阵之外的活面证）。
 *
 * 隔离：HOME=沙箱（零写真实 ~/.atlas）；workspace=沙箱 ws；fixture/产物 = job tmp。
 * 探针模型 = F-1 通即行（现况 Qwen38-27B-TXT，非门禁）。
 * 用法：bun run user-e2e/tui-diff/mcp-d4-057.ts [--repo <path>]
 *       ATLAS_E2E_D4_OUT=<dir>（产物目录，缺省 job tmp prodlane-057/d4-run）
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { GenericPty } from '../lib/pty-generic'
import { sleep } from '../lib/util'

const REPO = process.argv.includes('--repo')
  ? process.argv[process.argv.indexOf('--repo') + 1]
  : (process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = process.env.ATLAS_E2E_LB_MODEL ?? 'Qwen38-27B-TXT'
const OUT = process.env.ATLAS_E2E_D4_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/prodlane-057/d4-run'
const FIXTURE = process.env.ATLAS_E2E_D4_FIXTURE ?? '/home/vince/.claude/jobs/09264df0/tmp/prodlane-057/d4-fixture/d4-server.js'

// 断言关键词 = Main 落码文案源（mcpFailureReminder.ts 双句模板逐字切片）
const K_FAIL = 'UNAVAILABLE because of this connection failure'
const K_NOTCAP = 'not a missing capability'
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
  const s: any = raw
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(s, null, 2))
  // 全局 config 面（getGlobalConfig 读 $home/.atlas.json，非 settings.json——
  // 0.1.31 gate 首跑定因 + accept.ts seedHome 先例）。首启向导门控
  // （interactiveHelpers.tsx L120）= `!config.theme || !config.hasCompletedOnboarding`
  // → 双字段预置跳向导（D4 首跑/二跑定因：readySub '❯' 被向导弹框命中 →
  // prompt 被向导吞 → 未入 REPL → session 文件 0 行）。
  // ★ MCP 配置面（D4 四跑定因）：/mcp「No MCP servers configured」= 探针写
  // settings.json 的 mcpServers 不进产品——MCP 配置源 = 7-value scope 三层
  // （src/tui/services/mcp/config.ts getMcpConfigs：project .mcp.json /
  // **user = getGlobalConfig().mcpServers（$home/.atlas.json）** / local），
  // settings.json mcpServers 字段 = legacy schema 非连接面 → mcpServers 写 .atlas.json。
  // legacy .atlas/.config.json 存在即优先抢读 → hermetic 删（accept.ts 同纪律）。
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

/** session 文件全文（断言面；reminder/tool_use/tool_result 均在 jsonl 落盘）。 */
function sessionText(file: string | null): string {
  return file ? readFileSync(file, 'utf8') : ''
}

async function runTuiScenario(
  name: string,
  mcpServers: Record<string, unknown>,
  prompt: string,
  settleMs: number,
): Promise<{ probes: Probe[], sessFile: string | null, sessText: string, ptyText: string }> {
  const scenDir = join(OUT, name)
  // hermetic：整 scenDir 清（D4-B 五跑定因：pty.log/ws 不清 = 跨轮屏面污染误导定因）
  rmSync(scenDir, { recursive: true, force: true })
  mkdirSync(scenDir, { recursive: true })
  const home = join(scenDir, 'home')
  const ws = join(scenDir, 'ws')
  mkdirSync(ws, { recursive: true })
  buildSandboxHome(home, mcpServers)

  const logPath = join(scenDir, 'pty.log')
  const pty = await GenericPty.start({
    logPath,
    workspace: ws,
    // --dangerously-skip-permissions：MCP 工具调用权限弹框隔离（D4-B 八跑定因：
    // d4_echo 调用触发「Do you want to proceed?」弹框，探针不回应 → 回合卡框 →
    // 360s 超时；AD-45 探针 --permission-mode bypassPermissions 同先例，D4 = MCP 活面
    // 专项，权限面隔离保 C5-1/C5-2 判据纯净）
    cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
    home,
    unset: ['CLAUDECODE'],
    // 状态栏模式行（REPL 在场判据，accept.ts THEME-repl 先例 /▶\s*default/）；
    // '❯' 单独用会被首启向导弹框命中（D4 首跑定因）
    readySubs: ['▶ default', '▶ acceptEdits', '▶ plan'],
    readyMs: 90_000,
  })
  try {
    // bypass 首启确认弹框（D4 九/十一跑定因：--dangerously-skip-permissions 首启弹
    // 「Bypass Permissions mode」1.exit/2.I accept 对话框，后续键入（含 /mcp）全被弹框吞）
    // → 必须先确认再 /mcp。选择型对话框（SelectList：'2' 选中 + Enter 确认，十跑定因）。
    // 判据 'Yes, I accept' = 仅 bypass 弹框面（/mcp 对话框无此文本，不误配）。
    // 沙箱 home + job tmp 一次性 ws，hermetic 隔离，探针专用。
    const b = await pty.waitAnySince(['Yes, I accept'], 20_000)
    if (b.ok) {
      await sleep(1_500) // 渲染 settle（防键入早于对话框可输入态）
      pty.sendRaw('2')
      await sleep(800)
      pty.sendRaw('\r')
      const repl = await pty.waitAnySince(['▶ default', '▶ acceptEdits', '▶ plan'], 20_000)
      console.log(`[d4] bypass accepted=${repl.ok}`)
    } else {
      console.log('[d4] bypass dialog not seen (config carry?)')
    }
    // MCP 连接面 settle（D4-B 七跑定因：连接建立窗，15s 不足首回合工具快照）
    await sleep(15_000)
    // /mcp 命令 = MCP 状态活观测面（连接状态直接证据，定因分流：connected/failed）
    pty.send('/mcp')
    // 等 /mcp 结果面（d4bad=d4-A 面 / No MCP=d4-B 连接未成立定因面 / 状态块）
    await pty.waitAnySince(['No MCP servers configured', 'd4bad', '⎿'], 30_000).catch(() => null)
    await sleep(2_000)
    // /mcp = 全屏对话框（↑↓/Enter/Esc，D4-B 六跑定因）：Esc 收对话框回 REPL 再 prompt
    pty.sendRaw('\x1b')
    await sleep(1_500)
    pty.send(prompt)
    // 回合完成判据 = session 文件末位 assistant stop_reason=end_turn（替代 log-silence
    // settle——模型 thinking 期屏面无新行，log 静默 ≠ 回合完成；D4 三跑定因）
    const t0 = Date.now()
    for (;;) {
      const st = sessionText(latestSessionFile(home))
      if (st.includes('"stop_reason":"end_turn"') || st.includes('"stop_reason": "end_turn"')) break
      if (Date.now() - t0 > 360_000) break
      await sleep(1_000)
    }
    await sleep(2_000) // 落盘 flush
    const sessFile = latestSessionFile(home)
    const sessText = sessionText(sessFile)
    const ptyText = pty.text()
    writeFileSync(join(scenDir, 'session.jsonl.snapshot'), sessText)
    writeFileSync(join(scenDir, 'pty.snapshot.txt'), ptyText)
    return { probes: [], sessFile, sessText, ptyText }
  } finally {
    pty.kill()
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const report: any = {
    ts: new Date().toISOString(),
    repo: REPO,
    model: CMP_MODEL,
    fixture: FIXTURE,
    scenarios: {},
  }

  // ── D4-A：C5-2 连接失败 reminder 活面（hard）──
  {
    const r = await runTuiScenario(
      'd4a-fail-reminder',
      { d4bad: { command: 'd4-nonexistent-cmd-xyz-057', args: [] } },
      'List the MCP servers configured in this environment and state whether each server\'s tools are currently usable. If a server is unavailable, state the reason.',
      20_000,
    )
    const inSess = (k: string) => r.sessText.includes(k)
    const inPty = (k: string) => r.ptyText.includes(k)
    const probes: Probe[] = [
      { id: 'D4A-reminder-sentence1', hard: true, ok: inSess(K_FAIL), detail: `session 文件 ${inSess(K_FAIL) ? '命中' : '未命中'}「${K_FAIL}」（C5-2 双句①不可用=连接失败）` },
      { id: 'D4A-reminder-not-capability', hard: true, ok: inSess(K_NOTCAP), detail: `session 文件 ${inSess(K_NOTCAP) ? '命中' : '未命中'}「${K_NOTCAP}」（非能力缺失语义）` },
      { id: 'D4A-reminder-data-not-instructions', hard: true, ok: inSess(K_DATA), detail: `session 文件 ${inSess(K_DATA) ? '命中' : '未命中'}「${K_DATA}」（C5-2 双句②错误引用=数据非指令）` },
      { id: 'D4A-pty-aux', hard: false, ok: inPty(K_FAIL) || inPty(K_NOTCAP) ? true : null, detail: `PTY 屏面 reminder 辅助面（${inPty(K_FAIL) || inPty(K_NOTCAP) ? '在场' : '未现于屏面（渲染折叠面，断言以 session 文件为准）'}，soft 非门禁）` },
    ]
    const hardFail = probes.filter(p => p.hard && p.ok === false).length
    report.scenarios.d4a = { probes, hardFail, sessFile: r.sessFile, verdict: hardFail === 0 ? 'PASS' : 'FAIL' }
  }

  // ── D4-B：C5-1 alwaysLoad 提取活面（hard）+ 成功路径零注入（hard 反向）──
  {
    const r = await runTuiScenario(
      'd4b-alwaysload',
      { d4: { command: 'node', args: [FIXTURE] } },
      // 完整工具名 mcp__d4__d4_echo（mcp__<server>__<tool> 命名面）= 模型直接关联面
      // （D4 十二跑定因：仅提 d4_echo 短名时 Qwen38 不关联 mcp__ 前缀名 → ToolSearch
      // 兜底 + Bash 手搓；alwaysLoad 工具本应在初始 tools 数组内直接可调用）
      'The d4 MCP server (stdio) is configured and connected. Use the MCP tool named exactly "mcp__d4__d4_echo" to echo the exact text D4LIVE-057 (call it with argument text=D4LIVE-057). Report the tool output verbatim. If that tool is not available yet, say so explicitly.',
      20_000,
    )
    const inSess = (k: string) => r.sessText.includes(k)
    // 真 tool_use block 判别（JSON 解析 assistant content 数组，非 substring——
    // D4 三跑定因：substring 命中 ToolSearch query 文本 = 假绿）
    // 真 tool_use block 判别（JSON 解析 assistant content 数组，非 substring——
    // D4 三跑定因：substring 命中 ToolSearch query 文本 = 假绿）
    let realD4ToolUse = false
    const mcpToolUseIds = new Set<string>()
    for (const l of r.sessText.split('\n')) {
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
    // d4-echo 文本必须出自 **mcp tool 的 tool_result**（tool_use_id 对应 mcp tool_use）；
    // 模型 Bash 手搓 JSON-RPC 直连 fixture 产出的回显 = 假阳性（D4 十一跑定因：
    // run-11 L47-48 模型 Bash 自组 JSON-RPC 调用 fixture 成功，文本落盘但非 mcp 工具路径）
    let echoViaMcpTool = false
    for (const l of r.sessText.split('\n')) {
      let e: any; try { e = JSON.parse(l) } catch { continue }
      const content = e.message?.content
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (c?.type === 'tool_result' && /d4-echo:D4LIVE-057/.test(String(c.content ?? ''))
          && mcpToolUseIds.has(String(c.tool_use_id ?? ''))) {
          echoViaMcpTool = true
        }
      }
    }
    const probes: Probe[] = [
      { id: 'D4B-tool-use-direct', hard: true, ok: realD4ToolUse, detail: `模型直接调用 d4_echo（真 tool_use block 判别；alwaysLoad 提取面活判别：初始 prompt 全 schema 在场非 ToolSearch 延迟）= ${realD4ToolUse ? '命中' : '未命中'}` },
      { id: 'D4B-tool-result-echo', hard: true, ok: echoViaMcpTool, detail: `mcp tool 的 tool_result 回显「d4-echo:D4LIVE-057」（防 Bash 手搓 JSON-RPC 假阳性）= ${echoViaMcpTool ? 'mcp tool_result 落盘' : inSess('d4-echo:D4LIVE-057') ? '假阳性命中（非 mcp tool_result）' : '缺失'}` },
      { id: 'D4B-session-materialized', hard: true, ok: r.sessText.length > 0, detail: `D4-B session 落盘（${r.sessText.length} 字符；空 = TUI 未写 session，探针侧定因非产品面）` },
      { id: 'D4B-success-path-zero-reminder', hard: true, ok: r.sessText.length > 0 ? !inSess(K_FAIL) && !inSess(K_DATA) : null, detail: r.sessText.length > 0 ? `成功路径零注入（连接成功会话 reminder 双句零命中）= ${!inSess(K_FAIL) && !inSess(K_DATA) ? '零注入' : '异常注入'}` : 'INCONCLUSIVE（session 空，防 vacuous 假绿——D4-B 五跑定因）' },
    ]
    const hardFail = probes.filter(p => p.hard && p.ok === false).length
    report.scenarios.d4b = { probes, hardFail, sessFile: r.sessFile, verdict: hardFail === 0 ? 'PASS' : 'FAIL' }
  }

  const hardFailTotal =
    (report.scenarios.d4a?.hardFail ?? 0) + (report.scenarios.d4b?.hardFail ?? 0)
  report.verdict = hardFailTotal === 0 ? 'PASS' : `FAIL（hardFail=${hardFailTotal}）`
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict: report.verdict,
    d4a: report.scenarios.d4a?.verdict,
    d4b: report.scenarios.d4b?.verdict,
    d4a_probes: report.scenarios.d4a?.probes.map((p: Probe) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
    d4b_probes: report.scenarios.d4b?.probes.map((p: Probe) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`MCP-D4-057 ${report.verdict} → ${OUT}`)
}

main().catch((e) => { console.error('MCP-D4-057 ERROR', e); process.exit(1) })
