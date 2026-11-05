/**
 * 0.1.79 W-C 小件清尾波 · 判别活探针（e2e lane，gate 判据⑤ 新活探针；工单
 * docs/2026-10-23-p0-wave-0179-ticket.md §2⑤：前 23 波探针族零回归 + 新活探针
 * 「#20 '...' guard 红例 + C4-5 /rewind 跨 /clear 核验探针 + C10-6 /permissions
 * 回合中可开核验探针〔二者结果登记不判红除非授权面〕+ hook 事件面不回归」；
 * 活面显式 --model Qwen38-27B-TXT 防 429，harness 活面纪律）。
 *
 * 断言面：
 *   P-791-#20-guard（hard，模块级行为红例）：normalizeNameForMCP 三副本
 *         '...'→'___'（折叠前值回落）+ 纯下划线同回落 + 非空名 0.1.78 折叠语义
 *         恒等（'a.b c'→'a_b_c' 等）+ buildMcpToolName('...','tool')=
 *         'mcp_______tool'（≤0.1.77 身份恒等）+ 三副本活码 guard 行在场
 *         （剥注释后 "normalized === '' ? folded : normalized"）。
 *   P-792-F4-apierror-single-class（hard）：tui re-export 7 类 === modelprovider
 *         定义类 + 跨族 instanceof 修向（tui 构造 abort 被 mp 类检查捕获）+
 *         双构造形状（positional / opts）。
 *   P-793-C8-hook-events-dual-source（hard）：HOOK_EVENTS（src/hooks/hookEvents）
 *         长度 31 + 含 DirectoryAdded/MessageDisplay + 旧锚 PreModelSwitch/
 *         PostModelSwitch；coreSchemas.ts（src/tui/entrypoints/sdk）双源含
 *         DirectoryAdded + MessageDisplay 字面。
 *   P-794-C92-restricted（hard）：真值面（flag fold ?? env）+ 工具剥离面
 *         （getAllBaseTools 收口：Bash/PowerShell/WebFetch/Agent 出、
 *         Read/Write/Edit/Glob/Grep 在、ascend 门控出、MCP 残留守、空 deps 空池）
 *         + bypass 拒（bypassPermissions / dangerouslySkipPermissions 双面）+
 *         settings 忽略面（user/project/local true、policy/flag false）。
 *   P-795-C95-skill-overrides（hard）：resolveSkillOverrides 三档恒等 + 缺席/
 *         非法值宽容降级 'off' + DEFAULT_SKILL_OVERRIDES_MODE='off'。
 *   P-796-C54-mcp-backoff（hard）：getMcpConnectBackoffMs env 解析（缺省 1s /
 *         '' → 1s / 'abc' → 1s / '500' → 500 / '0'→0 / '-5'→0）+
 *         mcpConnectBackoffDelayMs 指数（1→1k/2→2k/3→4k/5→16k/6→30k 封顶/
 *         count≤0→0 / base≤0→0）。
 *   P-797-wave-presence-faces（hard）：C4-3 toolHeartbeat（DEFAULT 30s + 导出）+
 *         C5-3 mcpAutoBackground（DEFAULT 120s + 导出）+ C6-2 memdir
 *         NEAR_LIMIT_FRACTION=0.8 + 'close to the read limit' 活码在场 +
 *         C8-5 hooks/types.ts terminalSequence（≥3）+ continueOnBlock（≥3）。
 *   P-798-deant-dist-identity（hard，dist 级）：dist/cli.js 一方字面 6 件全 0
 *         （0.1.78 清零面不回归）+ A3-1 官方市场锚在场（downloads.claude.ai≥1
 *         + claude-plugins-official≥1）。dist 缺席 = fail-closed。
 *   P-799-D3D5-anchor（hard）：src/tui/contextBodies/compact.ts 活码注 D-3/D-5
 *         在场 + 0.1.69 块 D 判别单测两文件在场。
 *   P-C45-rewind-across-clear（soft，登记不判红）：PTY 活轮（IFF 网关，
 *         HELLO-0179 往返）→ /clear → /rewind → 核 MessageSelector 是否可恢复
 *         pre-/clear 消息（静态推导：clearConversation 清 in-memory messages +
 *         regenerateSessionId → 不可恢复；登记运行时实况）。
 *   P-C106-permissions-mid-round（soft，登记不判红）：回合中 /permissions →
 *         核 PermissionRuleList tab 面（Allow/Deny/Recently denied）浮现实况。
 *
 * 隔离：HOME 沙箱（job-tmp，0 写真产品面）；模块级面 = 纯 import + FS 读
 * （gate worktree src/dist）；soft 面 = IFF 活模型（模型面超时 → INCONCLUSIVE
 * 登记非 hardFail，同 0.1.73/0.1.78 先例）；PTY 串行（双 soft 面 = 同一 PTY 串行）。
 *
 * 用法：
 *   ATLAS_E2E_WC0179_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-wc-small-tail-0179.ts
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from './lib/util.js'
import { GenericPty } from './lib/pty-generic.js'

const REPO =
  process.env.ATLAS_E2E_WC0179_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-079-final'
const OUT =
  process.env.ATLAS_E2E_WC0179_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-079/fam/wc0179'
const IFF_TARGET = 'http://127.0.0.1:8999'
const MODEL = 'Qwen38-27B-TXT'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

/** 剥块注释 + 行注释（三副本活码核用，同判别单测口径）。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
}

function srcOf(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
}

// ════════════════════════════════════════════════════════════════
// hard 模块级面（gate worktree src 动态 import）
// ════════════════════════════════════════════════════════════════
async function hardFaces(): Promise<void> {
  // ── P-791 #20 guard（三副本行为红例）──
  try {
    const engine = await import(join(REPO, 'src/engine/tools/mcp.ts'))
    const tui = await import(join(REPO, 'src/tui/services/mcp/normalization.ts'))
    const rule = await import(join(REPO, 'src/permissions/mcpRuleNames.ts'))
    const faces: Array<[string, (n: string) => string]> = [
      ['engine', engine.normalizeNameForMCP],
      ['tui', tui.normalizeNameForMCP],
      ['rule', rule.normalizeNameForMCP],
    ]
    let bad = ''
    for (const [tag, fn] of faces) {
      if (fn('...') !== '___') bad += `${tag}('...')=${JSON.stringify(fn('...'))} `
      if (fn('___') !== '___') bad += `${tag}('___')=${JSON.stringify(fn('___'))} `
      // 非空名 0.1.78 A3-2 折叠语义恒等
      const expect: Record<string, string> = {
        'a.b c': 'a_b_c',
        'my__server': 'my_server',
        _edge_: 'edge',
        'my-server': 'my-server',
      }
      for (const [n, e] of Object.entries(expect)) {
        if (fn(n) !== e) bad += `${tag}(${n})=${fn(n)}≠${e} `
      }
    }
    // 权限面语义：'...' server 工具名 = ≤0.1.77 逐字一致（身份恢复）
    if (rule.buildMcpToolName('...', 'tool') !== 'mcp_______tool')
      bad += `built=${rule.buildMcpToolName('...', 'tool')} `
    if (rule.mcpInfoFromString('mcp_______tool') !== null) bad += 'mcpInfo non-null '
    // 三副本活码 guard 行在场（剥注释后）
    const liveOk = [
      'src/engine/tools/mcp.ts',
      'src/tui/services/mcp/normalization.ts',
      'src/permissions/mcpRuleNames.ts',
    ].every(
      (rel) => stripComments(srcOf(rel)).includes("normalized === '' ? folded : normalized"),
    )
    if (!liveOk) bad += 'guard 活码行缺席 '
    push('P-791-#20-guard', bad === '', bad === '' ? "三副本 '...'→'___' + 非空名恒等 + 活码 guard 在场" : bad)
  } catch (e) {
    push('P-791-#20-guard', false, `import/执行失败：${e}`)
  }

  // ── P-792 F-4 APIError 单类（双族合并）──
  try {
    const mp = await import(join(REPO, 'src/modelprovider/types.ts'))
    const tui = await import(join(REPO, 'src/tui/types/atlas.js'))
    let bad = ''
    for (const n of [
      'APIError', 'RateLimitError', 'AuthenticationError', 'NotFoundError',
      'APIConnectionError', 'APIConnectionTimeoutError', 'APIUserAbortError',
    ]) {
      if ((mp as any)[n] !== (tui as any)[n]) bad += `${n} 双类 `
    }
    // 跨族 instanceof 修向
    const abort = new (tui as any).APIUserAbortError()
    if (!(abort instanceof (mp as any).APIError)) bad += 'abort instanceof 断裂 '
    // 双构造形状
    const e1 = new (mp as any).APIError('msg', 403, new Error('boom'))
    if (e1.status !== 403 || e1.message !== 'msg') bad += 'positional 形状破 '
    const e2 = new (tui as any).APIError(undefined, { status: 429, code: 'rate_limited' })
    if (e2.status !== 429 || e2.code !== 'rate_limited' || e2.message !== 'API error')
      bad += 'opts 形状破 '
    push('P-792-F4-apierror-single-class', bad === '', bad === '' ? '7 类同引用 + instanceof 修向 + 双构造形状' : bad)
  } catch (e) {
    push('P-792-F4-apierror-single-class', false, `import/执行失败：${e}`)
  }

  // ── P-793 C8 hook 事件面（双源）──
  try {
    const { HOOK_EVENTS } = await import(join(REPO, 'src/hooks/hookEvents.ts'))
    const cs = srcOf('src/tui/entrypoints/sdk/coreSchemas.ts')
    let bad = ''
    if (HOOK_EVENTS.length !== 31) bad += `HOOK_EVENTS=${HOOK_EVENTS.length}≠31 `
    for (const ev of ['DirectoryAdded', 'MessageDisplay', 'PreModelSwitch', 'PostModelSwitch']) {
      if (!HOOK_EVENTS.includes(ev)) bad += `${ev} 缺席 `
    }
    if (!cs.includes("'DirectoryAdded'") || !cs.includes("'MessageDisplay'"))
      bad += 'coreSchemas 双源缺席 '
    push('P-793-C8-hook-events-dual-source', bad === '', bad === '' ? 'HOOK_EVENTS 31 + DirectoryAdded/MessageDisplay 双源在场' : bad)
  } catch (e) {
    push('P-793-C8-hook-events-dual-source', false, `import/执行失败：${e}`)
  }

  // ── P-794 C9-2 restricted（真值 + 剥离 + bypass + settings 忽略）──
  try {
    const rm = await import(join(REPO, 'src/engine/config/restrictedMode.ts'))
    const engine = await import(join(REPO, 'src/engine/index.ts'))
    let bad = ''
    rm.resetRestrictedMode()
    if (rm.isRestrictedMode() !== false) bad += '默认真值≠false '
    rm.setRestrictedMode(true)
    if (rm.isRestrictedMode() !== true) bad += 'set 后真值≠true '
    const poolNames = (o: any) => (engine.getAllBaseTools(o) as any[]).map((t) => t.name)
    const restricted = poolNames({ baseTools: engine.getBaseToolEntities() })
    for (const gone of ['Bash', 'PowerShell', 'WebFetch', 'Agent']) {
      if (restricted.includes(gone)) bad += `${gone} 未剥 `
    }
    for (const kept of ['Read', 'Write', 'Edit', 'Glob', 'Grep']) {
      if (!restricted.includes(kept)) bad += `${kept} 误剥 `
    }
    // ascend 门控出 + MCP 残留守 + 空 deps 空池
    const ascend = { name: 'AscendCompilerBridge' } as any
    if (poolNames({ ascendTools: [ascend] }).includes('AscendCompilerBridge')) bad += 'ascend 未门控 '
    rm.resetRestrictedMode()
    if (!poolNames({ ascendTools: [ascend] }).includes('AscendCompilerBridge')) bad += '非 restricted ascend 误剥 '
    rm.setRestrictedMode(true)
    if (!poolNames({ mcpTools: [{ name: 'mcp__srv__query' } as any] }).includes('mcp__srv__query'))
      bad += 'MCP 误剥 '
    if (engine.getAllBaseTools().length !== 0) bad += '空 deps 非空池 '
    // bypass 拒 + 恒 null 面
    const bypass = rm.restrictedBypassError({ permissionMode: 'bypassPermissions' })
    if (!bypass || !bypass.includes('bypassPermissions')) bad += 'bypassPermissions 未拒 '
    if (!rm.restrictedBypassError({ dangerouslySkipPermissions: true })) bad += 'dangerouslySkip 未拒 '
    if (rm.restrictedBypassError({}) !== null) bad += '无 bypass 面误拒 '
    rm.resetRestrictedMode()
    if (rm.restrictedBypassError({ permissionMode: 'bypassPermissions' }) !== null)
      bad += '非 restricted 误拒 '
    // settings 忽略面（restricted 门控：真值 = restricted + user/project/local）
    rm.setRestrictedMode(true)
    for (const s of ['userSettings', 'projectSettings', 'localSettings']) {
      if (!rm.isSettingsSourceIgnoredInRestricted(s)) bad += `${s} 未忽略 `
    }
    for (const s of ['policySettings', 'flagSettings']) {
      if (rm.isSettingsSourceIgnoredInRestricted(s)) bad += `${s} 误忽略 `
    }
    rm.resetRestrictedMode()
    for (const s of ['userSettings', 'projectSettings', 'localSettings']) {
      if (rm.isSettingsSourceIgnoredInRestricted(s)) bad += `非 restricted ${s} 误忽略 `
    }
    push('P-794-C92-restricted', bad === '', bad === '' ? '真值/剥离/ascend 门控/MCP 残留/bypass 拒/settings 忽略全绿' : bad)
  } catch (e) {
    push('P-794-C92-restricted', false, `import/执行失败：${e}`)
  }

  // ── P-795 C9-5 skillOverrides 三档 ──
  try {
    const cfg = await import(join(REPO, 'src/engine/config/types.ts'))
    let bad = ''
    if (cfg.DEFAULT_SKILL_OVERRIDES_MODE !== 'off') bad += `DEFAULT=${cfg.DEFAULT_SKILL_OVERRIDES_MODE} `
    const ok: Record<string, string> = {
      off: 'off',
      'user-invocable-only': 'user-invocable-only',
      'name-only': 'name-only',
    }
    for (const [raw, e] of Object.entries(ok)) {
      if (cfg.resolveSkillOverrides(raw) !== e) bad += `${raw}≠${e} `
    }
    for (const raw of [undefined, null, 42, 'bogus', '']) {
      if (cfg.resolveSkillOverrides(raw) !== 'off') bad += `非法值 ${JSON.stringify(raw)} 未降级 `
    }
    push('P-795-C95-skill-overrides', bad === '', bad === '' ? "三档恒等 + 缺席/非法宽容降级 'off'" : bad)
  } catch (e) {
    push('P-795-C95-skill-overrides', false, `import/执行失败：${e}`)
  }

  // ── P-796 C5-4 MCP 连接退避 ──
  try {
    const m = await import(join(REPO, 'src/mcp/mcpConnectionManager.ts'))
    let bad = ''
    const env = (v?: string) => ({ ATLAS_MCP_CONNECT_BACKOFF_MS: v })
    if (m.getMcpConnectBackoffMs(env()) !== 1000) bad += '缺省≠1s '
    if (m.getMcpConnectBackoffMs(env('')) !== 1000) bad += "''≠1s "
    if (m.getMcpConnectBackoffMs(env('abc')) !== 1000) bad += 'abc≠1s '
    if (m.getMcpConnectBackoffMs(env('500')) !== 500) bad += '500≠500 '
    if (m.getMcpConnectBackoffMs(env('0')) !== 0) bad += '0≠0（禁用）'
    if (m.getMcpConnectBackoffMs(env('-5')) !== 0) bad += '-5≠0 '
    const exp: Array<[number, number]> = [
      [1, 1000], [2, 2000], [3, 4000], [5, 16000], [6, 30000], [10, 30000],
    ]
    for (const [n, e] of exp) {
      if (m.mcpConnectBackoffDelayMs(n, 1000) !== e)
        bad += `delay(${n})=${m.mcpConnectBackoffDelayMs(n, 1000)}≠${e} `
    }
    if (m.mcpConnectBackoffDelayMs(0, 1000) !== 0) bad += 'count≤0≠0 '
    if (m.mcpConnectBackoffDelayMs(3, 0) !== 0) bad += 'base≤0≠0 '
    push('P-796-C54-mcp-backoff', bad === '', bad === '' ? 'env 解析（1s 缺省/0 禁用）+ 指数 30s 封顶' : bad)
  } catch (e) {
    push('P-796-C54-mcp-backoff', false, `import/执行失败：${e}`)
  }

  // ── P-797 本波在场面（C4-3/C5-3/C6-2/C8-5）──
  try {
    const hb = await import(join(REPO, 'src/engine/pipeline/toolHeartbeat.ts'))
    const ab = await import(join(REPO, 'src/engine/pipeline/mcpAutoBackground.ts'))
    const md = await import(join(REPO, 'src/tui/memdir/memdir.ts'))
    const hooksTypes = srcOf('src/hooks/types.ts')
    let bad = ''
    if (hb.DEFAULT_TOOL_HEARTBEAT_INTERVAL_MS !== 30_000 || typeof hb.runWithToolHeartbeat !== 'function')
      bad += 'C4-3 心跳面缺 '
    if (ab.DEFAULT_MCP_AUTO_BACKGROUND_MS !== 120_000 || typeof ab.callWithMcpAutoBackground !== 'function')
      bad += 'C5-3 自动转后台面缺 '
    if (md.NEAR_LIMIT_FRACTION !== 0.8) bad += 'C6-2 NEAR_LIMIT_FRACTION≠0.8 '
    const memdirSrc = srcOf('src/tui/memdir/memdir.ts')
    if (!memdirSrc.includes('close to the read limit')) bad += 'C6-2 预警活码缺 '
    const cts = (hooksTypes.match(/terminalSequence/g) ?? []).length
    const ccb = (hooksTypes.match(/continueOnBlock/g) ?? []).length
    if (cts < 3 || ccb < 3) bad += `C8-5 类型面 terminalSequence=${cts}/continueOnBlock=${ccb} `
    push('P-797-wave-presence-faces', bad === '', bad === '' ? 'C4-3 心跳/C5-3 转后台/C6-2 容量预警/C8-5 双语义在场' : bad)
  } catch (e) {
    push('P-797-wave-presence-faces', false, `import/执行失败：${e}`)
  }

  // ── P-798 de-ant dist 恒等（0.1.78 清零面不回归）──
  try {
    const distPath = join(REPO, 'dist/cli.js')
    if (!existsSync(distPath)) {
      push('P-798-deant-dist-identity', false, 'dist/cli.js 缺席（四件套 build 前置，fail-closed）')
    } else {
      const dist = readFileSync(distPath, 'utf8')
      const c = (t: string) => dist.split(t).length - 1
      let bad = ''
      for (const lit of [
        'anthropic_beta', 'anthropic-ratelimit', 'anthropic_cloud',
        'claude.ai subscription', 'isFirstPartyGatewayUrl', 'CLAUDEAI_SERVER_PREFIX',
      ]) {
        if (c(lit) !== 0) bad += `${lit}=${c(lit)} `
      }
      if (c('downloads.claude.ai') < 1 || c('claude-plugins-official') < 1)
        bad += 'A3-1 官方市场锚缺席 '
      push('P-798-deant-dist-identity', bad === '', bad === '' ? '一方字面 6 件全 0 + A3-1 锚在场' : bad)
    }
  } catch (e) {
    push('P-798-deant-dist-identity', false, `读 dist 失败：${e}`)
  }

  // ── P-799 D-3/D-5 已落地核验锚 ──
  try {
    const compact = srcOf('src/tui/contextBodies/compact.ts')
    let bad = ''
    if (!compact.includes('D-5') || !compact.includes('D-3')) bad += 'compact.ts 活码注缺席 '
    if (!existsSync(join(REPO, 'tests/unit/compact-git-status-refresh.test.ts')))
      bad += 'D-5 判别单测缺席 '
    if (!existsSync(join(REPO, 'tests/unit/compact-summarize-fallback.test.ts')))
      bad += 'D-3 判别单测缺席 '
    push('P-799-D3D5-anchor', bad === '', bad === '' ? 'compact.ts 活码注 + 0.1.69 块 D 双单测在场' : bad)
  } catch (e) {
    push('P-799-D3D5-anchor', false, `读源失败：${e}`)
  }
}

// ════════════════════════════════════════════════════════════════
// soft PTY 面（C4-5 / C10-6，结果登记不判红除非授权面）
// ════════════════════════════════════════════════════════════════
function sandboxSettings(home: string): void {
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const settings = {
    model: MODEL,
    modelRoles: {
      small: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      fast: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      premium: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
    },
    providers: {
      iff: {
        baseURL: `${IFF_TARGET}/v1`,
        apiKey: 'sk-iff-local',
        api: 'openai-completions',
        defaultContextWindow: 256000,
        defaultMaxTokens: 32000,
        models: [{ id: MODEL, name: MODEL, contextWindow: 256000, maxTokens: 32000 }],
      },
    },
    skipDangerousModePermissionPrompt: true,
    env: { DISABLE_AUTOUPDATER: '1' },
  }
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

function healthOk(): Promise<boolean> {
  return fetch(`${IFF_TARGET}/health`, { signal: AbortSignal.timeout(5_000) })
    .then((r) => r.json() as Promise<{ status?: string }>)
    .then((j) => j.status === 'ok')
    .catch(() => false)
}

/** onboarding 过场（主题选 1 + YOLO 选 2 幂等循环，quota403-0171 先例）→ REPL 就绪。 */
async function toRepl(pty: InstanceType<typeof GenericPty>): Promise<boolean> {
  for (let round = 0; round < 3; round++) {
    const repl = await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      30_000,
    )
    if (repl.ok) return true
    const style = await pty.waitAnySince(
      ['Choose the text style', 'text style that looks best'],
      5_000,
    )
    if (style.ok) {
      await sleep(500)
      pty.sendRaw('1')
      await sleep(300)
      pty.sendRaw('\r')
      continue
    }
    const yolo = await pty.waitAnySince(['Yes, I accept'], 5_000)
    if (yolo.ok) {
      await sleep(500)
      pty.sendRaw('2')
      await sleep(300)
      pty.sendRaw('\r')
      continue
    }
    await sleep(3_000)
  }
  return (
    await pty.waitAnySince(
      ['/help 查看全部命令', '/sessionlist 会话列表'],
      60_000,
    )
  ).ok
}

async function softPtyFaces(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  if (!(await healthOk())) {
    push('P-C45-rewind-across-clear', null, 'IFF 网关不可达（活面 INCONCLUSIVE，非产品面）', false)
    push('P-C106-permissions-mid-round', null, 'IFF 网关不可达（活面 INCONCLUSIVE，非产品面）', false)
    return
  }
  const home = join(OUT, 'home-pty')
  mkdirSync(home, { recursive: true })
  sandboxSettings(home)
  const ws = join(OUT, 'ws-pty')
  mkdirSync(ws, { recursive: true })
  const pty = await GenericPty.start({
    logPath: join(OUT, 'pty-wc0179.log'),
    workspace: ws,
    cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions --model ${MODEL}`,
    home,
    unset: ['CLAUDECODE'],
  })
  try {
    const ready = await toRepl(pty)
    if (!ready) {
      push('P-C45-rewind-across-clear', null, 'TUI 未就绪（活面 INCONCLUSIVE，非产品面）', false)
      push('P-C106-permissions-mid-round', null, 'TUI 未就绪（活面 INCONCLUSIVE，非产品面）', false)
      return
    }
    // ── C4-5：活轮 → /clear → /rewind，核 selector 可否恢复 pre-/clear 消息 ──
    pty.send('Reply with exactly: HELLO-0179. Output nothing else.')
    const hello = await pty.waitAnySince(['HELLO-0179'], 120_000)
    if (!hello.ok) {
      push('P-C45-rewind-across-clear', null, 'HELLO 活轮未达（模型面 INCONCLUSIVE，非产品面）', false)
    } else {
      await sleep(1_500)
      const clearMark = `CLEAR-CUT-${Date.now()}`
      pty.send('/clear')
      await pty.settle(2_500, 30_000)
      pty.send('/rewind')
      const sel = await pty.waitAnySince(
        ['Restore code and conversation', 'Restore conversation', 'No messages', '没有可恢复'],
        20_000,
      )
      await sleep(2_000)
      const t = pty.text()
      // 判读：selector 打开后是否呈现 pre-/clear 消息条目（静态推导 = 不可恢复）
      const selectorOpen = t.includes('Restore code and conversation') || t.includes('Restore conversation')
      // pre-/clear 消息在 /rewind 之后的新增面是否重现（echo 之外）：
      // 记录 selector 面与 pre-clear 轮次的可见性，登记不判红。
      const detail =
        `活轮 HELLO-0179 达成；/clear 后 /rewind → ` +
        (selectorOpen
          ? `MessageSelector 打开（Restore 选项在场）${sel.found ? `〔命中 ${sel.found}〕` : ''}`
          : `MessageSelector 未开或空态（sel.found=${sel.found}）`) +
        `；pre-/clear 轮 ${t.includes('HELLO-0179') ? '文本仍在日志（含 echo）' : '文本离场'}；marker=${clearMark}`
      push('P-C45-rewind-across-clear', null, detail, false)
      pty.sendRaw('\x1b') // esc 关 selector
      await sleep(1_000)
    }
    // ── C10-6：回合中 /permissions 可开 ──
    pty.send('Count from 1 to 30 slowly, one number per line.')
    await sleep(2_000) // 回合进行中
    pty.send('/permissions')
    const perm = await pty.waitAnySince(
      ['Allow', 'Deny', 'Recently denied', 'Ask'],
      25_000,
    )
    await sleep(1_500)
    const t2 = pty.text()
    const detail = perm.ok
      ? `回合中 /permissions → PermissionRuleList 面浮现〔命中 ${perm.found}〕` +
        (t2.includes('Recently denied') ? '（含 Recently denied tab）' : '')
      : '回合中 /permissions 未见面（排队/回合结束态，登记实况）'
    push('P-C106-permissions-mid-round', null, detail, false)
    writeFileSync(join(OUT, 'pty-wc0179.snapshot.txt'), pty.text())
  } finally {
    pty.kill()
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  await hardFaces()
  await softPtyFaces()

  const hard = probes.filter((p) => p.hard)
  const hardFail = hard.filter((p) => p.ok !== true).length
  const soft = probes.filter((p) => !p.hard)
  writeFileSync(
    join(OUT, 'probes.json'),
    JSON.stringify({ repo: REPO, model: MODEL, probes, hardFail }, null, 2),
  )
  for (const p of probes) {
    console.log(
      `[${p.ok === true ? 'PASS' : p.ok === null ? 'SOFT' : 'FAIL'}] ${p.id}: ${p.detail}`,
    )
  }
  console.log(`hard=${hard.length} hardFail=${hardFail} soft=${soft.length}`)
  if (hardFail === 0) {
    console.log(`WC0179 PASS → ${OUT}`)
  } else {
    console.log(`WC0179 FAIL（hardFail=${hardFail}）→ ${OUT}`)
    process.exitCode = 1
  }
}

await main()
