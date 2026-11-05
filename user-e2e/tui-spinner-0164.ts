/**
 * 0.1.64 插入波（慢模型流式显示对齐 + 去 IFF 硬编码，双 PR 合一波）· 新活探针
 * （e2e lane，gate 判据⑤；工单 docs/2026-10-13-p0-wave-0164-ticket.md §2/§5）。
 *
 * 判读面（0162/0163 同族纪律）：产品函数活 import（@ 被测面 worktree 源码，
 * 零模型零网络零 8999 竞争；纯函数面 = gate 判别力承载，TUI 活渲染像素面
 * （TTFT 期间 ↑ 字形/省略号实显）= 生产 lane 观察面（同 0162 overlay 先例）。
 *
 * 断言面（全 hard）：
 *   PR1 慢模型流式显示（G1/G2/G3）：
 *     S1 wantsStatusIndicator 门（1s 门 = wantsTimer 同阈值）：elapsed 500→false /
 *        2000→true / verbose 强制显（elapsed 0→true）+ 与 wantsTimer 恒等
 *     S2 computeStallState 判别（G2 守卫）：responseLength=0 + time>3s → 不 stall
 *        （修前红形）/ responseLength>0 + time>3s → stall（原语义保留）/
 *        hasActiveTools 抑制（原语义）/ 严格 > 边界 / 渐变窗 intensity（0.5/clamp 1）
 *     S3 hook 委托面：useStalledAnimation.ts 源级 computeStallState 调用在场
 *        （isStalled 计算委托纯函数，hook 保留平滑插值）
 *     S4 G1 渲染面源级：SpinnerAnimationRow.tsx showStatusIndicator 复合支
 *        （!showTokens && wantsStatusIndicator && mode='requesting'）+
 *        statusGlyph parts 构造 + SpinnerModeGlyph requesting→arrowUp 支在场
 *     S5 G3 省略号源级：requesting 模式动词尾附 '…'（displayMessage 分支在场）
 *     S6 既有时间门零回归恒等：wantsTokens 5s 门原语义（elapsed 4000→false /
 *        6000→true / verbose 强制）+ wantsTokens⊆wantsTimer 单调性
 *   PR2 去 IFF 硬编码（P2-1..P2-5）：
 *     E1 describeEndpointFailure 参数化（本地端口/云 provider 族/通用 host/
 *        缺省+坏 URL fallback 'LLM 端点'；全输出无 IFF 字面）
 *     E2 gatewayUnreachableRemediationHint(error, endpointLabel?) 参数化：
 *        APIConnectionError/errno 族命中 + label → '<label> 不可达：已切人工
 *        确认 —— /doctor 排查'；label 缺省 → 'LLM 端点 不可达：…'
 *     E3 既有连接失败族判别零回归恒等：AbortError/HTTP 状态/非连接错误 → null
 *        （判别逻辑零变更 = 基线同绿守卫）
 *     E4 P2-3/P2-5 导出面：modelprovider/index.ts 导出 getCurrentEndpointLabel +
 *        describeEndpointFailure re-export + REPL.tsx catch 传参面源级在场
 *
 * 基线面（修前红形 @c6c947d）：wantsStatusIndicator/computeStallState 缺席 +
 * hint 固定 'IFF 不可达：…' 串 + describeEndpointFailure/getCurrentEndpointLabel
 * 缺席 → 定向红（S1/S2/S3/S4/S5/E1/E2/E4 红，S6/E3 基线同绿 = 零回归恒等守卫）。
 * 用法：
 *   ATLAS_E2E_SPIN0164_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-spinner-0164.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_SPIN0164_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-064'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function loadMod(p: string): Promise<any> {
  return await import(p).catch(() => ({}))
}
const readSrc = (p: string): string => { try { return readFileSync(p, 'utf8') } catch { return '' } }

async function main(): Promise<void> {
  const probes: Probe[] = []

  // ── PR1 面：spinnerGates 纯函数活 import ─────────────────────────────
  const gates: any = await loadMod(join(REPO, 'src/tui/components/Spinner/spinnerGates.ts'))
  const gfn = gates.getSpinnerDisplayGates
  const csfn = gates.computeStallState

  // S1 wantsStatusIndicator 门（1s 门 = wantsTimer 同阈值）
  if (typeof gfn === 'function') {
    const r500 = gfn({ verbose: false, hasRunningTeammates: false, effectiveElapsedMs: 500 })
    const r2000 = gfn({ verbose: false, hasRunningTeammates: false, effectiveElapsedMs: 2000 })
    const rVerbose = gfn({ verbose: true, hasRunningTeammates: false, effectiveElapsedMs: 0 })
    const s1 = r500.wantsStatusIndicator === false && r2000.wantsStatusIndicator === true
      && rVerbose.wantsStatusIndicator === true
      && r500.wantsStatusIndicator === r500.wantsTimer && r2000.wantsStatusIndicator === r2000.wantsTimer
    probes.push({
      id: 'S1-wants-status-indicator-gate', hard: true, ok: s1,
      detail: s1
        ? `wantsStatusIndicator 门（1s 门 = wantsTimer 同阈值：500ms→false / 2000ms→true / verbose 强制显 + 与 wantsTimer 恒等 = TTFT 状态指示门判别力；修前红形 = 字段缺席）`
        : `wantsStatusIndicator 门缺口（500ms→${r500?.wantsStatusIndicator} / 2000ms→${r2000?.wantsStatusIndicator} / verbose→${rVerbose?.wantsStatusIndicator} = 修前红形活面现形）`,
    })
  } else {
    probes.push({ id: 'S1-wants-status-indicator-gate', hard: true, ok: false, detail: 'getSpinnerDisplayGates 缺席（spinnerGates.ts 缺席 = 修前红形）' })
  }

  // S2 computeStallState 判别（G2 守卫 + 原语义保留）
  if (typeof csfn === 'function') {
    const ttft = csfn({ timeSinceLastToken: 4000, currentResponseLength: 0, hasActiveTools: false })
    const afterStream = csfn({ timeSinceLastToken: 4000, currentResponseLength: 1, hasActiveTools: false })
    const toolActive = csfn({ timeSinceLastToken: 4000, currentResponseLength: 1, hasActiveTools: true })
    const boundary = csfn({ timeSinceLastToken: 3000, currentResponseLength: 1, hasActiveTools: false })
    const clamped = csfn({ timeSinceLastToken: 6000, currentResponseLength: 1, hasActiveTools: false })
    const s2 = !ttft.isStalled && ttft.stalledIntensity === 0
      && afterStream.isStalled && Math.abs(afterStream.stalledIntensity - 0.5) < 1e-9
      && !toolActive.isStalled && !boundary.isStalled && clamped.isStalled && clamped.stalledIntensity === 1
    probes.push({
      id: 'S2-compute-stall-guard', hard: true, ok: s2,
      detail: s2
        ? `computeStallState 判别（G2 守卫：TTFT 期 responseLength=0+4s→不 stall〔修前红形〕/ 流式后中断 4s→stall+intensity 0.5 / hasActiveTools 抑制 / 严格 > 边界 3000→不 stall / 6s→intensity clamp 1 = 原语义保留 + 新增抑制双层）`
        : `computeStallState 判别缺口（TTFT=${JSON.stringify(ttft)} afterStream=${JSON.stringify(afterStream)} tool=${toolActive?.isStalled} boundary=${boundary?.isStalled} clamped=${JSON.stringify(clamped)}）`,
    })
  } else {
    probes.push({ id: 'S2-compute-stall-guard', hard: true, ok: false, detail: 'computeStallState 缺席（纯函数面未抽 = 修前红形活面现形）' })
  }

  // S3 hook 委托面（源级）
  const hookSrc = readSrc(join(REPO, 'src/tui/components/Spinner/useStalledAnimation.ts'))
  const s3 = /computeStallState\s*\(/.test(hookSrc) && /from\s+['"]\.\/spinnerGates/.test(hookSrc)
  probes.push({
    id: 'S3-hook-delegation', hard: true, ok: s3,
    detail: s3
      ? `hook 委托面（useStalledAnimation.ts 源级 computeStallState 调用 + spinnerGates import 在场 = isStalled 计算委托纯函数，hook 保留平滑插值/ref 逻辑 = 抽法裁定承载）`
      : `hook 委托面缺席（computeStallState 调用在场=${/computeStallState\s*\(/.test(hookSrc)} = 修前红形）`,
  })

  // S4 G1 渲染面源级（showStatusIndicator 复合支 + parts 构造 + ↑ 支）
  const rowSrc = readSrc(join(REPO, 'src/tui/components/Spinner/SpinnerAnimationRow.tsx'))
  const s4a = /showStatusIndicator\s*=\s*!showTokens\s*&&\s*wantsStatusIndicator\s*&&\s*mode\s*===\s*['"]requesting['"]/.test(rowSrc)
  const s4b = /showStatusIndicator\s*\?\s*\[<SpinnerModeGlyph/.test(rowSrc)
  const s4c = /case\s+["']requesting["']/.test(rowSrc) && /arrowUp/.test(rowSrc)
  probes.push({
    id: 'S4-g1-render-source', hard: true, ok: s4a && s4b && s4c,
    detail: s4a && s4b && s4c
      ? `G1 渲染面源级（showStatusIndicator 复合支〔!showTokens && wantsStatusIndicator && mode='requesting'〕+ statusGlyph parts 构造 + SpinnerModeGlyph requesting→arrowUp 支在场 = TTFT 期间 ↑ 字形渲染链；活渲染像素面 = 生产 lane 观察面）`
      : `G1 渲染面缺口（复合支=${s4a} parts=${s4b} ↑支=${s4c} = 修前红形活面现形）`,
  })

  // S5 G3 省略号源级
  const s5 = /mode\s*===\s*['"]requesting['"]\s*\?\s*message\s*\+\s*'…'/.test(rowSrc)
  probes.push({
    id: 'S5-g3-ellipsis', hard: true, ok: s5,
    detail: s5
      ? `G3 省略号源级（requesting 模式动词尾附 '…' displayMessage 分支在场 = 对齐 Claude Beboppin'… 视觉，Main 裁定纳入面）`
      : `G3 省略号缺席（displayMessage requesting 分支在场=${s5} = 修前红形）`,
  })

  // S6 既有时间门零回归恒等（基线同绿守卫）
  if (typeof gfn === 'function') {
    const a = gfn({ verbose: false, hasRunningTeammates: false, effectiveElapsedMs: 4000 })
    const b = gfn({ verbose: false, hasRunningTeammates: false, effectiveElapsedMs: 6000 })
    const c = gfn({ verbose: true, hasRunningTeammates: false, effectiveElapsedMs: 0 })
    const d = gfn({ verbose: false, hasRunningTeammates: true, effectiveElapsedMs: 0 })
    const s6 = a.wantsTimer === true && a.wantsTokens === false
      && b.wantsTimer === true && b.wantsTokens === true
      && c.wantsTimer === true && c.wantsTokens === true
      && d.wantsTimer === true && d.wantsTokens === true
    probes.push({
      id: 'S6-time-gates-zero-regression', hard: true, ok: s6,
      detail: s6
        ? `既有时间门零回归恒等（4s→timer 开 tokens 闭 / 6s→双开 / verbose 强制双开 / hasRunningTeammates 强制双开 = 原语义逐点同值 = 基线同绿守卫）`
        : `时间门语义漂移（4s=${JSON.stringify({ t: a?.wantsTimer, k: a?.wantsTokens })} 6s=${JSON.stringify({ t: b?.wantsTimer, k: b?.wantsTokens })} = 原语义破面）`,
    })
  } else {
    probes.push({ id: 'S6-time-gates-zero-regression', hard: true, ok: false, detail: 'getSpinnerDisplayGates 缺席 → 恒等守卫不可执行（修前红形）' })
  }

  // ── PR2 面：modelprovider 纯函数活 import ───────────────────────────
  const mp: any = await loadMod(join(REPO, 'src/modelprovider/modelprovider.ts'))
  const mpIndex: any = await loadMod(join(REPO, 'src/modelprovider/index.ts'))
  const desc = mp.describeEndpointFailure
  const hint = mp.gatewayUnreachableRemediationHint

  // E1 describeEndpointFailure 参数化
  if (typeof desc === 'function') {
    const localPort = desc('http://127.0.0.1:8999')
    const localNoPort = desc('http://localhost')
    const deepseek = desc('https://api.deepseek.com/v1')
    const generic = desc('https://api.example.com/v1')
    const fallbackEmpty = desc(undefined)
    const fallbackBad = desc('not-a-url')
    const noIff = [localPort, localNoPort, deepseek, generic, fallbackEmpty, fallbackBad].every((s) => !s.includes('IFF'))
    const e1 = localPort === '本地端口 8999' && localNoPort === '本地网关'
      && deepseek === 'DeepSeek 服务' && generic === 'api.example.com'
      && fallbackEmpty === 'LLM 端点' && fallbackBad === 'LLM 端点' && noIff
    probes.push({
      id: 'E1-endpoint-label-parameterized', hard: true, ok: e1,
      detail: e1
        ? `describeEndpointFailure 参数化（本地 127.0.0.1:8999→'本地端口 8999' / localhost 无端口→'本地网关' / api.deepseek.com→'DeepSeek 服务' / 通用端点→完整 hostname 'api.example.com' / 缺省+坏 URL→'LLM 端点' fallback + 全输出无 IFF 字面 = 去 IFF 硬编码核心判别）`
        : `describeEndpointFailure 缺口（local=${localPort} noPort=${localNoPort} ds=${deepseek} generic=${generic} empty=${fallbackEmpty} bad=${fallbackBad} noIff=${noIff}）`,
    })
  } else {
    probes.push({ id: 'E1-endpoint-label-parameterized', hard: true, ok: false, detail: 'describeEndpointFailure 缺席（复合端点 label 函数未落 = 修前红形活面现形）' })
  }

  // E2 hint 参数化（连接失败族命中 + label 传参）
  if (typeof hint === 'function') {
    const sdkErr = { name: 'APIConnectionError', message: 'Connection error.' }
    const errnoErr = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    const withLabel = hint(sdkErr, 'api.deepseek.com')
    const errnoHit = hint(errnoErr, 'example.com')
    const noLabel = hint(sdkErr)
    const e2 = withLabel === 'api.deepseek.com 不可达：已切人工确认 —— /doctor 排查'
      && errnoHit === 'example.com 不可达：已切人工确认 —— /doctor 排查'
      && noLabel === 'LLM 端点 不可达：已切人工确认 —— /doctor 排查'
    probes.push({
      id: 'E2-hint-label-parameterized', hard: true, ok: e2,
      detail: e2
        ? `hint 参数化（SDK APIConnectionError + label→'api.deepseek.com 不可达：已切人工确认 —— /doctor 排查' / errno ECONNREFUSED（error.cause.code 链）命中 + label / label 缺省→'LLM 端点 不可达：…' = P2-1/P2-2 签名+返回串参数化；修前红形 = 固定 'IFF 不可达：…' 串）`
        : `hint 参数化缺口（withLabel=${JSON.stringify(withLabel)} errno=${JSON.stringify(errnoHit)} noLabel=${JSON.stringify(noLabel)}）`,
    })
  } else {
    probes.push({ id: 'E2-hint-label-parameterized', hard: true, ok: false, detail: 'gatewayUnreachableRemediationHint 缺席 = 修前红形' })
  }

  // E3 既有判别零回归恒等（不命中 → null 族，基线同绿守卫）
  if (typeof hint === 'function') {
    const abort = hint({ name: 'AbortError', message: 'aborted' }, 'x.com')
    const http500 = hint({ name: 'APIError', message: 'Internal Server Error', status: 500 }, 'x.com')
    const plain = hint(new Error('boom'), 'x.com')
    const e3 = abort === null && http500 === null && plain === null
    probes.push({
      id: 'E3-discrimination-identity', hard: true, ok: e3,
      detail: e3
        ? `既有连接失败族判别零回归恒等（AbortError→null / HTTP 500（拿到状态=网关可达）→null / 非连接错误→null = 判别逻辑零变更仅返回串参数化；基线同绿守卫）`
        : `判别面漂移（abort=${JSON.stringify(abort)} http500=${JSON.stringify(http500)} plain=${JSON.stringify(plain)} → null 支破面）`,
    })
  } else {
    probes.push({ id: 'E3-discrimination-identity', hard: true, ok: false, detail: 'hint 缺席 → 恒等守卫不可执行' })
  }

  // E4 P2-3/P2-5 导出面 + REPL 传参面（源级）
  const indexHasLabel = typeof mpIndex.getCurrentEndpointLabel === 'function'
  const indexHasDesc = typeof mpIndex.describeEndpointFailure === 'function'
  const replSrc = readSrc(join(REPO, 'src/tui/screens/REPL.tsx'))
  const replPass = /getCurrentEndpointLabel\(mainLoopModelParam\)/.test(replSrc) && /gatewayUnreachableRemediationHint\(error,\s*endpointLabel\)/.test(replSrc)
  const e4 = indexHasLabel && indexHasDesc && replPass
  probes.push({
    id: 'E4-export-and-repl-wiring', hard: true, ok: e4,
    detail: e4
      ? `P2-3/P2-5 导出+传参面（index.ts 导出 getCurrentEndpointLabel + describeEndpointFailure re-export + REPL.tsx catch 块 getCurrentEndpointLabel(mainLoopModelParam) → gatewayUnreachableRemediationHint(error, endpointLabel) 传参链在场）`
      : `导出/传参面缺口（index.getCurrentEndpointLabel=${typeof mpIndex.getCurrentEndpointLabel} index.describe=${indexHasDesc} replPass=${replPass}）`,
  })

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const OUT = process.env.ATLAS_E2E_SPIN0164_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-064/spinner-probe'
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-spinner-0164', repo: REPO, verdict, probes }, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-SPINNER-0164 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-SPINNER-0164 ERROR', e); process.exit(1) })
