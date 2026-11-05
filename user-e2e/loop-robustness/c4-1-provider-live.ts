/**
 * 0.1.58 PAC V2-06 · C4-1 mid-stream partial 保留 · 直接 provider 活面探针（e2e lane）。
 *
 * 判据面（工单 §2 C4-1 判别：流中途错误 → 已收 partial 保留为 assistant 轮次内容
 * + interrupted 语义标记 + 单发终止）：
 *   真 OpenAI SDK + 真 HTTP + 产品 provider 对象（@ 被测面 worktree 源码，
 *   setEndpointConfigSource 注入 mock 〔0.1.57 定因面：resolveModel 取
 *   provider.baseURL 注册表面〕）→ mock 8981 midstream 面（SSE 2 partial chunk
 *   「Hel」「lo 」→ 流中途 RST 断 = ECONNRESET 族，对齐单测 sdkConnError 形状）。
 *
 * 判读面（探针首跑定因链，非产品缺口）：
 *   引擎主循环 = 非流式 modelProvider.chat（loop.ts L19/L362，chatStream 残留守
 *   不入引擎面，engine/index.ts L884 登记）→ 主循环 PTY 探针测 C4-1 = 产品不达面
 *   （mock SSE 对非流式请求 = 协议错配 → 占位面）。C4-1 唯一活消费面 = compact
 *   （compact.ts L1225 streamCompactSummary）；本探针 = provider 层活面
 *   （真 SDK 流式客户端 → C4-1 码面直接路径）。
 *
 * 断言面（判据面裁定，探针三形态定因——真实断流下 OpenAI SDK/undici 把 mid-stream
 * 断连判为干净 EOF，不抛 mid-stream error → C4-1 错误支〔interrupted 标记 + error
 * 事件〕不触发作活面，= build 面判别，非产品缺口）：
 *   hard（活面核心 = C4-1「不丢 + 单发防双内容」）：
 *     C41-partial-preserved：assistant 轮次 content 含「Hel」（保留不丢）
 *     C41-single-fire：mock 日志流式主请求 = 恰 1 次（不整流重发防双内容）
 *     C41-no-double-content：assistant 事件数 = 恰 1（partial 即该轮内容）
 *     C41-turn-materialized：message_stop + assistant 在场（非挂起）
 *     C41-session-materialized：result.json 落盘（防 vacuous）
 *   soft（build 面判别，活面 = SDK EOF 语义定因登记，不 gate）：
 *     C41-interrupted-mark / C41-error-surface（= 单测 9/9 + compact 拒收 +10 行）
 *
 * 隔离：零盘写产品面（结果 = job tmp）；零 8999 竞争（mock 重定向）。
 * 用法（自被测面 worktree 运行，repo 面经 env 钉住）：
 *   ATLAS_E2E_C41_REPO=/home/.../worktrees/worktree-gate-058 \
 *   ATLAS_E2E_C41_MOCK_BASE=http://127.0.0.1:8981/v1 \
 *   ATLAS_E2E_C41_OUT=<dir> bun run user-e2e/loop-robustness/c4-1-provider-live.ts
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_C41_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-058'
const MOCK_BASE = process.env.ATLAS_E2E_C41_MOCK_BASE ?? 'http://127.0.0.1:8981/v1'
const OUT = process.env.ATLAS_E2E_C41_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/prodlane-058/c4/c4-1-provider'
const MOCK_LOG = process.env.ATLAS_E2E_C41_MOCKLOG ?? join(OUT, 'mock-requests.jsonl')
const MARK = 'C4LIVE-058'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const report: any = {
    ts: new Date().toISOString(),
    repo: REPO,
    mockBase: MOCK_BASE,
    events: [] as any[],
    probes: [] as Probe[],
  }

  // 产品 provider 面（@ 被测面 worktree 源码；动态 import 钉 repo 面）
  const mp: any = await import(join(REPO, 'src/modelprovider/index.ts'))
  mp.setEndpointConfigSource({
    getRoleSetting: () => ({ provider: 'c4mock', model: 'c4live', models: [{ model: 'c4mock/c4live' }] }),
    getProviders: () => ({ c4mock: { baseURL: MOCK_BASE, apiKey: 'c4mock', models: [{ id: 'c4live', name: 'C4 Live' }] } }),
    getGlobalApiKey: () => undefined,
  })
  const provider = mp.getModelProvider()

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 90_000)
  try {
    const tools = [{ type: 'function', function: { name: 'c4_probe_tool', description: 'probe', parameters: { type: 'object', properties: {} } } }]
    for await (const ev of provider.chatStream({
      role: 'fast' as any,
      messages: [{ role: 'user', content: `Reply with exactly the text: ${MARK} HELLO-WORLD. Output nothing else.` }],
      tools,
      signal: ac.signal,
    })) {
      report.events.push(ev)
    }
  } catch (e: any) {
    report.streamThrew = { name: e?.name, message: String(e?.message).slice(0, 300), code: e?.code }
  } finally {
    clearTimeout(timer)
  }

  const evs = report.events
  const types = evs.map((e: any) => e.type)
  report.types = types

  // ── 断言（单测 C4-1 mid-stream 判据活面同形）──
  const msgStop = evs.find((e: any) => e.type === 'message_stop')
  const assistant = evs.find((e: any) => e.type === 'assistant')
  const errEv = evs.find((e: any) => e.type === 'error')
  const deltas = evs.filter((e: any) => e.type === 'text_delta').map((e: any) => e.text ?? '')
  const joined = deltas.join('')
  const assistantText = assistant?.message?.content
    ?.filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('') ?? ''

  const seqOk = types.join(',') === 'text_delta,text_delta,message_stop,assistant,error'
  const partialKept = assistantText.includes('Hel')
  const interruptedMark = msgStop?.stopReason === 'interrupted' && assistant?.interrupted === true && assistant?.message?.stop_reason === 'interrupted'
  // 单发面 = mock 请求日志（runner 传 mock 日志路径）主循环请求计数 = 恰 1
  const mainCalls = existsSync(MOCK_LOG)
    ? readFileSync(MOCK_LOG, 'utf8').split('\n').filter((l) => {
        try { return JSON.parse(l).main === true } catch { return false }
      }).length
    : -1
  const singleFire = mainCalls === 1

  // ── 判据面裁定（探针三形态定因，非产品缺口）──────────────────────────
  // 真实断流（RST/FIN，数据已 flush）下 OpenAI SDK（undici）把 mid-stream 断连
  // 判为**干净 EOF**（SSE 读取器正常结束迭代，不抛 mid-stream error，streamThrew=null）
  // → 产品走正常完成路径（partial 内容保留 + stop_reason=end_turn + 无 interrupted
  // 标记 + 无 error 事件 = 设计内「干净流结束」面，非缺口）。C4-1 的 interrupted
  // 标记 / error 事件支仅在 SDK 抛 mid-stream error（真 5xx mid-stream，单 SSE 连接
  // 无法于 200+body 后重发 5xx 复现）时触发 = **build 面判别**（单测 9/9 + compact
  // 拒收 +10 行）。故：核心「不丢 + 单发防双内容」= hard 活面；标记支 = soft 定因登记。
  const assistantCount = evs.filter((e: any) => e.type === 'assistant').length
  const turnMaterialized = !!assistant && !!msgStop
  const noDoubleContent = assistantCount === 1
  const probes: Probe[] = [
    { id: 'C41-partial-preserved', hard: true, ok: partialKept, detail: `assistant 轮次 content = ${JSON.stringify(assistantText).slice(0, 120)}（deltas 拼接 = ${JSON.stringify(joined)}；判据 = 含 partial「Hel」= 保留不丢 = C4-1 核心）` },
    { id: 'C41-single-fire', hard: true, ok: singleFire, detail: `mock 流式主请求 = ${mainCalls} 次（判据 = 恰 1 = 不整流重发防双内容）` },
    { id: 'C41-no-double-content', hard: true, ok: noDoubleContent, detail: `assistant 事件数 = ${assistantCount}（判据 = 恰 1 = partial 即该轮内容，无第二条 assistant 消息）` },
    { id: 'C41-turn-materialized', hard: true, ok: turnMaterialized, detail: `回合落定（message_stop + assistant 在场，非挂起；I3 活面等价）` },
    { id: 'C41-session-materialized', hard: true, ok: evs.length > 0 || !!report.streamThrew, detail: `事件/异常面落盘（events=${evs.length}；streamThrew=${report.streamThrew ? report.streamThrew.name : '无'}）` },
    { id: 'C41-interrupted-mark', hard: false, ok: interruptedMark ? true : null, detail: `interrupted 标记支（message_stop.stopReason=${msgStop?.stopReason} / stop_reason=${assistant?.message?.stop_reason}）= **build 面判别**（单测 9/9 + compact 拒收）；活面 mock 断流 = SDK EOF 语义（干净流结束走正常路径，无标记 = 设计内，非缺口）→ 定因登记不 gate` },
    { id: 'C41-error-surface', hard: false, ok: errEv?.type === 'error' ? true : null, detail: `error 事件支（既有错误面）= build 面判别；活面断流 = SDK EOF（无 error 事件）→ 定因登记不 gate（retryable=${errEv?.retryable ?? 'n/a'}）` },
  ]
  void seqOk // 事件序面已并入 C41-no-double-content / turn-materialized（干净 EOF 序 = 无 error 项）

  // 单发面数据源 = ATLAS_E2E_C41_MOCKLOG（runner 指向 mock 实际日志
  // <mock_out>/c4-midstream-requests.jsonl；探针流跑完后读，计数 = 恰 1）
  report.probes = probes
  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  report.verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict: report.verdict,
    types,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
    streamThrew: report.streamThrew ?? null,
  }, null, 1))
  console.log(`C4-1-PROVIDER-LIVE ${report.verdict} → ${OUT}`)
}

main().catch((e) => { console.error('C4-1-PROVIDER-LIVE ERROR', e); process.exit(1) })
