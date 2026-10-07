/**
 * loop 鲁棒性测试 — 网关前注障代理（fault-injection proxy）。
 *
 * 角色：挂在本地 IFF 网关（默认 127.0.0.1:8999）前面，把沙箱 settings 的
 *   `providers.iff.baseURL` 指到本代理（默认 127.0.0.1:8998/v1），路径/查询透传转发。
 * 目的：让 Atlas（及等价 TUI）走「真实产品路径 + 真实进程」，同时可按脚本注入
 *   LLM 请求层故障（5xx / 断连 / 慢 / 空 0-0），测「长时间不中断」的鲁棒性，
 *   而不 mock 掉产品代码路径。全部 I/O 落在 user-e2e/loop-robustness/ 内。
 *
 * 用法（作为子进程起，或 import startFaultProxy 在同进程起）：
 *   ATLAS_E2E_LB_TARGET=http://127.0.0.1:8999 \
 *   ATLAS_E2E_LB_PORT=8998 \
 *   ATLAS_E2E_LB_PLAN='{"kind":"firstN","n":3,"fault":"500"}' \
 *   ATLAS_E2E_LB_LOG=/home/vince/.../loop-robustness/artifacts/xxx/proxy.log \
 *   bun run user-e2e/loop-robustness/fault-proxy.ts
 *
 * PLAN（JSON，经 ATLAS_E2E_LB_PLAN 或 startFaultProxy 参数）：
 *   {"kind":"nominal"}                                  // 只转发
 *   {"kind":"firstN","n":3,"fault":"500"}               // 前 3 次 chat 注 500，之后转发
 *   {"kind":"firstN","n":2,"fault":"drop"}              // 前 2 次断连（socket destroy）
 *   {"kind":"at","at":4,"fault":"empty"}                // 第 4 次注空 0-0
 *   {"kind":"always","fault":"delay","delayMs":1500}    // 每次延迟 1.5s
 *   {"kind":"flaky","prob":0.3,"faults":["500","drop","empty","delay"],"delayMs":800}
 * fault 取值：500 | drop | empty | delay（delay 需 delayMs）。
 *
 * 计数面：仅 POST /chat/completions（及 /completions）计 call 序号；/models 等只转发。
 * 每次调用 + 应用故障 追加写 ATLAS_E2E_LB_LOG（供 harness 关联）。
 */
import * as http from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type FaultKind = '500' | 'drop' | 'empty' | 'delay' | 'ptl'

/**
 * #278 波 A（全确定性，用户 2026-10-05 拍板）：主循环 chat 脚本化。
 * 前 count 次主循环（非 classify_result）chat.completions 回固定 tool_use 完成体，
 * 消除 live 模型「改用 Bash / 拒绝 CWD 外写」的非确定性。分叉顺序：先判分类器
 * （detectClassifier）→ 再判主循环 count 内 → 否则转发 8999 live（spec §3.A）。
 * toolName = wire 工具名（FILE_WRITE_TOOL_NAME='Write'，prompt.ts:3）；arguments 为
 * 工具 input 对象（经 JSON.stringify 进 tool_calls[].function.arguments，
 * modelprovider.ts:370 JSON.parse 还原）。
 */
export interface MainLoopScript {
  toolName: string
  arguments: Record<string, unknown>
  count?: number
}

/**
 * 0.1.37 ③（P2 恢复层）gate V4/V7：compact 摘要调用 + 主循环 413 注障序列态机。
 *
 * 识别面（源级定因，`tui/contextBodies/compact.ts` + `engine/context/compact.ts`
 * + `engine/loopDeps.ts`）：proactive auto-compact（autoCompact.compact → 窄体
 * compactConversation）/ reactive compact（tryReactiveCompact → 富 compactConversation
 * streamCompactSummary）/ headless 窄体（loopDeps reactiveCompact → 窄体 compactConversation）
 * 三支的摘要 LLM 调用请求体都含 `getCompactPrompt` 摘要 prompt（NO_TOOLS_PREAMBLE 首行
 * `CRITICAL: Respond with TEXT ONLY` / BASE_COMPACT_PROMPT 首行 `Your task is to create
 * a detailed summary`），主循环自然对话不含此串 → detectCompact 稳。
 *
 * 序列（V4/V7 判据）：
 *   - compactFailN 次前的 compact 调用 → 500（proactive 3 连败跳断路器，D2 跳闸态）
 *   - 其后 compact 调用 → 脚本化有效摘要（200 + summary 文本；SSE 若 stream=true）
 *     = reactive 恢复成功（D1 回合存活，V4② / V7②）
 *   - mainLoopPtlAt 指定的主循环 call → 413 + "Prompt is too long"（= classifyAPIError
 *     'prompt_too_long' 命中面，D1 反应式消费者触发；同回合二次 413 = 一次性门，V4③/V7③）
 */
export interface CompactPlan {
  /** 前 N 次 compact 调用注 500（跳断路器）；缺省 3 = MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES */
  compactFailN?: number
  /** compactFailN 之后的 compact 调用回脚本化有效摘要（回合存活）；缺省 true（false = 落 fault-plan 转发） */
  compactSucceed?: boolean
  /** 主循环（非 compact 非 classifier）call 序号 → 注 ptl（413 + "Prompt is too long"）；数组或单值。
   *  call 序号 = 非分类器 chat 调用计数（含 mainLoop 脚本化，见下方 handler）。 */
  mainLoopPtlAt?: number[] | number
  /** true = 从 mainLoopPtlAt 最小序号起，其后所有主循环 call 恒 413（"413 持续"模型）。
   *  供一次性门（③）场景：首 413 触发反应式压缩，重试再 413 → hasAttempted 已置 → 不重压 → 回显原 413。
   *  缺省 false（= 仅 mainLoopPtlAt 指定 call 注 413，其余转发 live = "413 单次"存活场景②）。 */
  mainLoopPtlPersist?: boolean
}

export interface FaultPlan {
  kind: 'nominal' | 'firstN' | 'at' | 'always' | 'flaky'
  n?: number
  at?: number
  fault?: FaultKind
  faults?: FaultKind[]
  prob?: number
  delayMs?: number
  /** #278 波 A：主循环前 count 次 chat 脚本化 tool_use（全确定性种子） */
  mainLoop?: MainLoopScript
  /** 0.1.37 ③：compact 摘要 3 连败 + 413 注障序列态机（V4/V7 探针） */
  compact?: CompactPlan
}

/**
 * #278 波 A（live-gateway 分类器 e2e 波）：classify_result 分类器调用注入。
 *
 * auto-mode yolo 分类器（yoloClassifier.ts classifyYoloAction → sideQuery →
 * modelProvider.chat → POST /chat/completions）的请求体携带
 * `tool_choice:{type:'function',function:{name:'classify_result'}}`（params.ts:250
 * 把 Anthropic {type:'tool',name} 翻成 OpenAI {type:'function',function:{name}}）。
 * 本代理识别该请求 → 不转发 8999，直接回脚本化 OpenAI chat.completion（tool_calls
 * 携 classify_result 结果 {thinking,shouldBlock,reason}）。modelprovider.ts:367-374
 * 把 tool_calls 翻成 tool_use block → classifyYoloAction 解析 shouldBlock。
 *
 * **全确定性（用户 2026-10-05 拍板，修正早期「主循环仍转发 8999 live」）**：
 * 波 A 种子（S-024O #4）把两处 LLM 输出都脚本化——
 *   ① 主循环前 count 次 chat → 固定 `Write` tool_use（plan.mainLoop，见 MainLoopScript），
 *      消除 live 模型「改用 Bash echo / 拒绝 CWD 外写」的非确定性；
 *   ② classify_result 调用 → shouldBlock（本 ClassifierInjection）。
 * 产品码 100% 真实（引擎执行 Write + classifyYoloAction 解析 + permissions.ts:770-778
 * allow + useCanUseTool.tsx setYoloClassifierApproval + UI 成功卡），仅两处 LLM 输出脚本化。
 * 计数面：classifier 调用不计入 fault-plan call 序号；mainLoop 脚本化调用计入（前 count 次）。
 *
 * shouldBlock=false → permissions.ts:770-778 allow + decisionReason
 * {type:'classifier',classifier:'auto-mode',reason} → useCanUseTool setYoloClassifierApproval
 * → 成功卡「Auto-approved by classifier: <reason>.」（#4 自动放行，波 A）。
 * shouldBlock=true → permissions.ts:755-763 deny（#3 危险句，波 C 产品波改 deny→ASK 后复验）。
 */
export interface ClassifierInjection {
  shouldBlock: boolean
  reason?: string
  thinking?: string
}

export interface ProxyHandle {
  port: number
  plan: FaultPlan
  stop: () => void
  /** 当前 call 序号（测试断言用） */
  calls: () => number
}

const env = (k: string, d: string): string => process.env[k] ?? d

function pickFault(plan: FaultPlan, call: number): { fault: FaultKind | null; why: string } {
  switch (plan.kind) {
    case 'nominal':
      return { fault: null, why: 'nominal' }
    case 'firstN':
      return call <= (plan.n ?? 1) ? { fault: plan.fault ?? '500', why: `firstN<=${plan.n}` } : { fault: null, why: 'after-firstN' }
    case 'at':
      return call === (plan.at ?? 1) ? { fault: plan.fault ?? '500', why: `at=${plan.at}` } : { fault: null, why: 'not-at' }
    case 'always':
      return { fault: plan.fault ?? '500', why: 'always' }
    case 'flaky': {
      if (Math.random() < (plan.prob ?? 0)) {
        const kinds = plan.faults && plan.faults.length ? plan.faults : ['500']
        const f = kinds[Math.floor(Math.random() * kinds.length)]
        return { fault: f, why: `flaky p=${plan.prob}` }
      }
      return { fault: null, why: 'flaky-miss' }
    }
  }
}

/**
 * 识别 classify_result 分类器调用（识别面 = tool_choice.function.name；tools 数组
 * 含 classify_result 为兜底——该 tool 名仅分类器用，主循环不携）。body 非 JSON 或无
 * tool_choice → false（主循环正常转发）。
 */
function detectClassifier(body: Buffer): boolean {
  try {
    const j: any = JSON.parse(body.toString('utf8'))
    const tc: any = j?.tool_choice
    if (tc && typeof tc === 'object') {
      const name = tc.function?.name ?? tc.name
      if (name === 'classify_result') return true
    }
    if (Array.isArray(j?.tools)) {
      for (const t of j.tools) {
        const tn = t?.function?.name ?? t?.name
        if (tn === 'classify_result') return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * 0.1.37 ③：识别 compact 摘要 LLM 调用（vs 主循环）。识别面 = 请求体 messages 含
 * compact-prompt marker（getCompactPrompt 两支通用串，源级定因见 CompactPlan 头注）。
 * 主循环自然对话不会逐字含此串 → 识别稳。body 非 JSON 或无 messages → false（主循环正常转发）。
 */
function detectCompact(body: Buffer): boolean {
  try {
    const j: any = JSON.parse(body.toString('utf8'))
    const msgs = j?.messages
    if (!Array.isArray(msgs)) return false
    for (const m of msgs) {
      const c = m?.content
      if (typeof c === 'string') {
        if (c.includes('CRITICAL: Respond with TEXT ONLY') || c.includes('Your task is to create a detailed summary')) return true
      } else if (Array.isArray(c)) {
        for (const b of c) {
          if (typeof b?.text === 'string' && (b.text.includes('CRITICAL: Respond with TEXT ONLY') || b.text.includes('Your task is to create a detailed summary'))) return true
        }
      }
    }
    return false
  } catch {
    return false
  }
}

/** 0.1.37 ③：ptl（413/400 输入超窗）故障响应体。message 必含 "Prompt is too long"
 *  = engine classifyAPIError 'prompt_too_long' 命中面（message-based 非 status-based）。 */
const PTL_ERROR_MESSAGE = 'Prompt is too long: request exceeds context window'
function ptlBody(): string {
  return JSON.stringify({
    error: { message: PTL_ERROR_MESSAGE, type: 'invalid_request_error', code: 'prompt_too_long' },
  })
}

/** 0.1.37 ③：脚本化有效 compact 摘要（200 + summary 文本；stream=true 回 SSE 单帧 + [DONE]）。
 *  文本非空且不以 "Prompt is too long" 起（避开 compact 内建 PTL 重试环），供 D1 反应式恢复重建。 */
function scriptedCompactSummary(model: string, stream: boolean): string {
  const text = [
    'Summary:',
    '1. Primary Request and Intent: e2e ③ P2 reactive-compact probe — fill context past the auto-compact threshold, verify breaker trip + 413 reactive recovery.',
    '2. Key Technical Concepts: auto-compact circuit breaker (3-consecutive-failure trip), D1 413/PTL reactive compact consumer (one-shot gate), buildPostCompactMessages rebuild.',
    '3. Files and Code Sections: (compact summary injected by fault-proxy for V4/V7 gate).',
  ].join('\n')
  const json = JSON.stringify({
    id: 'chatcmpl-compact-injected',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      { index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 4096, completion_tokens: 96, total_tokens: 4192 },
  })
  if (!stream) return json
  // SSE 单帧 + [DONE]（流式兜底支 modelProvider.chatStream 消费）
  const frame = `data: ${json}\n\n`
  return frame + 'data: [DONE]\n\n'
}

/** 脚本化 OpenAI chat.completion（classify_result tool_call 结果）。modelprovider.ts:367-374 翻 tool_use。 */
function scriptedClassifierCompletion(inj: ClassifierInjection, model: string): string {
  const thinking = inj.thinking ?? 'e2e scripted classifier reasoning'
  const reason = inj.reason ?? (inj.shouldBlock
    ? 'e2e scripted block (shouldBlock=true)'
    : 'Action matches no hard-block condition and stays within expected scope')
  const args = JSON.stringify({ thinking, shouldBlock: inj.shouldBlock, reason })
  return JSON.stringify({
    id: 'chatcmpl-classifier-injected',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_classify_result_injected',
              type: 'function',
              function: { name: 'classify_result', arguments: args },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 128, completion_tokens: 24, total_tokens: 152 },
  })
}

/**
 * 脚本化主循环 OpenAI chat.completion（固定 tool_use 完成体，全确定性种子）。
 * tool_calls 携 {name: toolName, arguments: JSON.stringify(arguments)}；
 * modelprovider.ts:367-374 把 tool_calls 翻 tool_use block（JSON.parse arguments），
 * 引擎 findToolByName(toolName) 命中后执行（FILE_WRITE_TOOL_NAME='Write' 已核）。
 */
function scriptedMainLoopCompletion(ml: MainLoopScript): string {
  const args = JSON.stringify(ml.arguments ?? {})
  return JSON.stringify({
    id: 'chatcmpl-mainloop-injected',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'injected-mainloop',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_mainloop_injected',
              type: 'function',
              function: { name: ml.toolName, arguments: args },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 512, completion_tokens: 48, total_tokens: 560 },
  })
}

/** 起注障代理。listen 失败（端口占用）reject；调用方负责 stop()。 */
export function startFaultProxy(opts: {
  port?: number
  target?: string
  plan?: FaultPlan
  logPath?: string
  /** #278 波 A：classify_result 分类器调用注入（不转发 8999，回脚本化完成体） */
  classifier?: ClassifierInjection
}): Promise<ProxyHandle> {
  const port = opts.port ?? Number(env('ATLAS_E2E_LB_PORT', '8998'))
  const target = (opts.target ?? env('ATLAS_E2E_LB_TARGET', 'http://127.0.0.1:8999')).replace(/\/$/, '')
  const plan: FaultPlan = opts.plan ?? (process.env.ATLAS_E2E_LB_PLAN ? JSON.parse(process.env.ATLAS_E2E_LB_PLAN) : { kind: 'nominal' })
  const classifier: ClassifierInjection | undefined = opts.classifier ?? (process.env.ATLAS_E2E_LB_CLASSIFIER ? JSON.parse(process.env.ATLAS_E2E_LB_CLASSIFIER) : undefined)
  const mainLoop: MainLoopScript | undefined = plan.mainLoop // #278 波 A 全确定性：主循环前 count 次脚本化 tool_use
  const compactPlan: CompactPlan | undefined = plan.compact // 0.1.37 ③：compact 3 连败 + 413 注障序列态机
  const logPath = opts.logPath ?? process.env.ATLAS_E2E_LB_LOG
  let call = 0
  let compactCalls = 0 // 0.1.37 ③：compact 摘要调用计数（detectCompact 命中）
  let mainCalls = 0 // 0.1.37 ③：主循环调用计数（非 compact 非 classifier 的 chat 调用）
  const ptlAt = new Set<number>(Array.isArray(compactPlan?.mainLoopPtlAt)
    ? compactPlan.mainLoopPtlAt
    : compactPlan?.mainLoopPtlAt != null ? [compactPlan.mainLoopPtlAt] : [])
  const ptlPersist = !!compactPlan?.mainLoopPtlPersist // ③ 一次性门：从最小 ptl 序号起恒 413
  const ptlSeedMin = ptlAt.size > 0 ? Math.min(...ptlAt) : Infinity

  const log = (line: string): void => {
    if (!logPath) return
    try {
      mkdirSync(dirname(logPath), { recursive: true })
      appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      /* log 失败不致命 */
    }
  }

  const openaiErr = (msg: string): string =>
    JSON.stringify({ error: { message: msg, type: 'invalid_request_error', code: 'injected_fault' } })

  const server = http.createServer((req, res) => {
    const isChat = /\/(chat\/)?completions$/.test(new URL(req.url ?? '/', 'http://x').pathname)
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', async () => {
      const body = Buffer.concat(chunks)
      // e2e 诊断（#278 波 C gate 复核，零 src/ 影响）：每个 chat 请求记录 model +
      // tool_choice 名 + tools 是否含 classify_result。用于判别分类器 LLM 调用是否
      // 真经本代理（若出现 REQ tool_choice=classify_result 但下方未 classifier=inject，
      // = detectClassifier 漏检；若无任何 classify_result REQ，= 分类器未 fire）。
      // 纯日志，不改分叉逻辑。
      if (isChat) {
        try {
          const jj: any = JSON.parse(body.toString('utf8'))
          const tcv = jj?.tool_choice
          const tcName =
            (typeof tcv === 'object' && tcv?.function?.name) ? tcv.function.name
            : (typeof tcv === 'object' ? tcv?.name : (tcv === undefined ? 'none' : String(tcv)))
          const toolsHasCls = Array.isArray(jj?.tools)
            ? jj.tools.some((t: any) => (t?.function?.name ?? t?.name) === 'classify_result')
            : false
          // BR-8 品牌 e2e wire 面（0.1.29 验收）：捕获 LLM 出网请求的 user-agent 头，
          // 断言品牌串无字面 `+`（五面①②经本代理；③④⑤ 由单测 5/5 + grep gate 坐实）。
          // 纯日志加性，零 src/ 影响，不改分叉逻辑。
          const ua = String(req.headers['user-agent'] ?? '(none)')
          log(`${req.method} ${req.url} REQ model=${jj?.model ?? '?'} tool_choice=${tcName} toolsHasClassifyResult=${toolsHasCls} ua="${ua}"`)
        } catch { /* 非 JSON body（非 chat 帧）不记录 */ }
      }
      // #278 波 A 分叉（spec §3.A 顺序：先分类器 → 再主循环 count 内 → 否则 fault-plan + 转发）。
      // ① classify_result 分类器调用注入（识别面 tool_choice.function.name）。
      // 先于 fault-plan 计数——分类器调用非主循环调用，不计入 firstN/at 的 call 序号，
      // 也不受 500/drop/empty/delay 故障计划影响。
      if (isChat && classifier && detectClassifier(body)) {
        const scripted = scriptedClassifierCompletion(classifier, 'injected-classifier')
        log(`${req.method} ${req.url} classifier=inject shouldBlock=${classifier.shouldBlock} bodyBytes=${body.length}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(scripted)
        return
      }
      if (isChat) call++
      // ② 主循环前 count 次 chat 脚本化（全确定性种子：固定 tool_use，消除 live 模型非确定性）。
      // call 已计入（非分类器），前 count 次命中 → 回脚本化完成体；超过 count 落 fault-plan + 转发。
      if (isChat && mainLoop && call <= (mainLoop.count ?? 1)) {
        const scripted = scriptedMainLoopCompletion(mainLoop)
        log(`${req.method} ${req.url} mainloop=scripted call=${call} tool=${mainLoop.toolName}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(scripted)
        return
      }
      // ③ 0.1.37 ③（P2 恢复层）：compact 摘要 3 连败 + 413 注障序列态机（V4/V7 探针）。
      // 识别面 = detectCompact（请求体 compact-prompt marker，源级定因）。分两支：
      //   compact 调用（detectCompact 命中）→ compactFailN 次前注 500（跳断路器，D2 跳闸态），
      //     其后回脚本化有效摘要（D1 反应式恢复成功，回合存活）；
      //   主循环调用（非 compact）→ mainLoopPtlAt 指定 call 注 413 "Prompt is too long"
      //     （= classifyAPIError 'prompt_too_long'，D1 反应式消费者触发；同回合二次 413 = 一次性门）。
      if (isChat && compactPlan) {
        if (detectCompact(body)) {
          compactCalls++
          const failN = compactPlan.compactFailN ?? 3
          const succeed = compactPlan.compactSucceed ?? true
          if (compactCalls <= failN) {
            log(`${req.method} ${req.url} compact=FAIL compactCalls=${compactCalls}/${failN} → 500（跳断路器，D2）`)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(openaiErr(`injected compact 500 (${compactCalls}/${failN})`))
            return
          }
          if (succeed) {
            let stream = false
            try { stream = !!(JSON.parse(body.toString('utf8') || '{}')?.stream) } catch { /* 非 JSON 不流式 */ }
            log(`${req.method} ${req.url} compact=SUCCESS compactCalls=${compactCalls} stream=${stream} → 有效摘要（D1 反应式恢复）`)
            res.writeHead(200, { 'Content-Type': stream ? 'text/event-stream' : 'application/json' })
            res.end(scriptedCompactSummary('injected-compact', stream))
            return
          }
          // compactSucceed=false → 落下方 fault-plan 转发
        } else {
          mainCalls++
          const ptlNow = ptlAt.has(mainCalls) || (ptlPersist && mainCalls >= ptlSeedMin)
          if (ptlNow) {
            log(`${req.method} ${req.url} mainloop=PTL mainCalls=${mainCalls} persist=${ptlPersist} → 413 "Prompt is too long"（D1 触发/一次性门）`)
            res.writeHead(413, { 'Content-Type': 'application/json' })
            res.end(ptlBody())
            return
          }
        }
      }
      const { fault, why } = isChat ? pickFault(plan, call) : { fault: null, why: 'non-chat' }
      const tag = isChat ? `call=${call}` : 'no-call'
      log(`${req.method} ${req.url} ${tag} fault=${fault ?? 'none'} (${why}) bodyBytes=${body.length}`)

      // 断连：直接 destroy（不写响应）
      if (fault === 'drop') {
        res.destroy()
        return
      }
      // 500：OpenAI 错误形
      if (fault === '500') {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(openaiErr('injected 500 (fault proxy)'))
        return
      }
      // 空 0-0：200 + 空 content（触发 engine R1 emptyContent 面）
      if (fault === 'empty') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'injected-empty', object: 'chat.completion', model: 'injected',
          choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }))
        return
      }
      if (fault === 'delay') {
        const ms = plan.delayMs ?? 1000
        await new Promise(r => setTimeout(r, ms))
      }
      // 转发（nominal / delay 后 / 无故障）：用 http.request 原样透传字节（保留网关的
      // content-encoding/content-length 框架），**不用 fetch**——fetch 会自动解 gzip，但
      // 我若原样转发 content-encoding 头就框架不匹配 → tool_calls（在 content 之后）被截断
      // → 引擎误判「空响应」。原始字节透传是反向代理正确做法（下游自解压）。
      try {
        const u = new URL(target + (req.url ?? '/'))
        const fwdHeaders: Record<string, string> = { ...(req.headers as Record<string, string>) }
        fwdHeaders.host = u.host // host 改写成 target（否则网关按 host 误路由）
        delete fwdHeaders.connection
        delete fwdHeaders['proxy-connection']
        const fwdReq = http.request(u, { method: req.method ?? 'GET', headers: fwdHeaders, timeout: 600_000 }, fwdRes => {
          res.writeHead(fwdRes.statusCode ?? 502, fwdRes.headers as unknown as Record<string, string>)
          fwdRes.pipe(res) // 原样透传（含原始编码/长度框架）
        })
        fwdReq.on('error', e => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(openaiErr(`fault proxy forward failed: ${e.message}`))
        })
        fwdReq.on('timeout', () => fwdReq.destroy(new Error('forward timeout')))
        if (['POST', 'PUT'].includes(req.method ?? '')) fwdReq.write(body)
        fwdReq.end()
      } catch (e) {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(openaiErr(`fault proxy forward fatal: ${String(e)}`))
      }
    })
    req.on('error', () => res.destroy())
  })

  return new Promise((resolve, reject) => {
    server.once('error', e => reject(new Error(`fault proxy listen :${port} 失败: ${String(e)}`)))
    server.listen(port, () => {
      log(`fault proxy UP on :${port} → ${target} plan=${JSON.stringify(plan)}`)
      resolve({
        port,
        plan,
        stop: () => {
          try { server.close() } catch { /* ignore */ }
        },
        calls: () => call,
      })
    })
  })
}

// 作为独立进程直接跑（CLI 形态，供 spawn 起）
if (import.meta.main) {
  startFaultProxy({}).then(h => {
    process.stderr.write(`[fault-proxy] UP on :${h.port} → target plan=${JSON.stringify(h.plan)}\n`)
  }).catch(e => {
    process.stderr.write(`[fault-proxy] FATAL: ${String(e)}\n`)
    process.exit(1)
  })
}
