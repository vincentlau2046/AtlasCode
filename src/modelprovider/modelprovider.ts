/**
 * unified LLM provider 模块 — 从旧仓 modelprovider/modelprovider.ts 迁入
 *
 * 单一 ModelProvider（OpenAIProvider）是所有 LLM 调用入口。
 * 持有 per-role 模型池（modelRoles registry），role 内水平 fallback。
 *
 * import 适配：
 *  - Message/SystemPrompt → shared（契约冻结）
 *  - logForDebugging → shared（C1 单一 no-op 占位，logging port 定案后整文件替换）
 *  - StreamEvent/LLMErrorCode → 域内 types.ts
 *  - buildOpenAIParams → 域内 params.ts
 *  - getClientForEntry → 域内 clients.ts
 *  - roles 函数 → 域内 roles.ts
 */

import { randomUUID } from 'crypto'
import OpenAI from 'openai'
import { getClientForEntry } from './clients'
import { LLM_TIMEOUT_DEFAULT_MS } from './constants'
import { getRoleModels, getRoleModel, resolveModel, getRoleConfig, type ModelRole } from './roles'
import { asSystemPrompt, type Message, type SystemPrompt, type ThinkingConfig, type Tools } from '../shared'
import { buildUserAgent, logForDebugging } from '../shared'
import type { LLMErrorCode, StreamDelta, StreamEvent } from './types'
import { buildOpenAIParams } from './params'
import { APIConnectionTimeoutError } from './types'
import { LLM_TIMEOUT_CAP_MS, LLM_TIMEOUT_UNIT_WARN_THRESHOLD_MS } from './constants'
import { isQuotaExhaustedMessage } from './modelErrors'

export type ModelUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type { StreamDelta, StreamEvent }
export type ProviderStreamEvent = StreamEvent

function mapOpenAIUsage(u: any): ModelUsage {
  return {
    input_tokens: u?.prompt_tokens ?? 0,
    output_tokens: u?.completion_tokens ?? 0,
    cache_read_input_tokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    cache_creation_input_tokens: 0,
  }
}

/**
 * #271 #5（2026-10-04，e2e loop-robustness「empty 0-0 有界重试判据」）：
 * provider 合成占位块文案——网关 0/0 占位响应（无 text / 无 tool_call /
 * 无 reasoning）经 OpenAI 协议映射后无真实内容块，合成此占位 text 块供
 * 渲染面有可见产出。单一定义 = 单一事实源：engine loop 空判定
 * （queryOneRound isEmptyContent）据此把占位块排除出「非空」判据（占位 ≠
 * 模型产出），0/0 占位响应走 R1 有界重试 + 空终止提示，不再伪装非空
 * 内容静默穿过。
 */
export const PROVIDER_EMPTY_CONTENT_PLACEHOLDER = '(provider: empty response)'

/**
 * 0.1.71 A-1：池轮询单 ref 失败记账。
 * code = 分类标签（进聚合错误 .message，供 TUI 提示面 A-3 判别）；raw = 原始
 * 错误文案（仅存 .failures 结构化字段供调试，不进 .message——避免
 * isRetryableError 的 /timeout|ECONN|EPIPE|fetch failed|socket|aborted/i 正则
 * 误判可重试，守 403 非重试锚）。
 */
export interface ModelPoolRefFailure {
  ref: string
  code: string
  raw?: string
}

/**
 * 0.1.71 A-1：模型池全失败聚合可行动错误。
 *
 * 池轮询（chat 非流式 / chatWithDelta 流式）逐 ref 重试预算耗尽仍全败时，替代
 * 旧的 `if (lastErr) throw lastErr`（只抛末 ref 末错，用户只见最后一跳、不知其余
 * 模型也败 / 败因）→ 聚合「模型列表 + 逐模型失败分类 + 处置建议（充值配额 / 切换
 * provider 或 model）」（用户主诉①「所有模型额度没有了，但提示有问题」）。
 *
 * 判别锚（零回归设计）：
 *  - 非 APIError（无 .status / 无 .cause）→ shouldRetryModelError 判不可重试
 *    （isRetryableError 三判据全 miss）→ withTurnRecovery 不重试（守 403 非重试
 *    锚，不放大 13 次重试）。
 *  - .message 只含 ref 名 + 分类标签 + 建议（不含原始错误文案）→ 免 /timeout|
 *    ECONN|.../ 正则命中（原始文案隔离在 .failures[i].raw）。
 *  - 混合失败（某 ref 成功）= 循环内已 return，不触发本错误（既有行为恒等锚）；
 *    零模型池（refs.length===0）既有错误零变更（不经过本聚合）。
 */
export class ModelPoolExhaustedError extends Error {
  readonly role: ModelRole
  readonly failures: readonly ModelPoolRefFailure[]
  constructor(role: ModelRole, failures: readonly ModelPoolRefFailure[]) {
    const lines = failures.map(f => `  - ${f.ref}: ${f.code}`).join('\n')
    const hasQuota = failures.some(f => f.code === 'quota_exhausted')
    const fix = hasQuota
      ? 'Top up your provider quota, or switch to another provider/model (settings.json modelRoles/providers, or --model), then retry.'
      : 'Check provider credentials/quota, or switch to another provider/model (settings.json modelRoles/providers, or --model), then retry.'
    super(
      `All ${failures.length} model(s) in pool for role '${role}' failed:\n` +
        lines +
        `\nFix: ${fix}`,
    )
    this.name = 'ModelPoolExhaustedError'
    this.role = role
    this.failures = failures
  }
}

/**
 * 0.1.71 A-1：池轮询单 ref 末错 → 分类标签。duck-type（不依赖 instanceof
 * APIError——池轮询 catch 到的是 openai SDK 错误 / 本域 APIError 混面，.status /
 * .message 双通道判别最稳）。403+配额签名 → 'quota_exhausted'（A-2
 * isQuotaExhaustedMessage 单一事实源）；401/403 → 'auth_error'；未知 ref →
 * 'unknown_reference'；有 status → 'api_error_<status>'；其余 → 'error'。
 */
export function classifyRefFailure(err: any): string {
  const status = err?.status ?? err?.response?.status
  const msg: string = typeof err?.message === 'string' ? err.message : ''
  if (status === 403 && isQuotaExhaustedMessage(msg)) return 'quota_exhausted'
  if (status === 401 || status === 403) return 'auth_error'
  if (/^unknown provider\/model reference/.test(msg)) return 'unknown_reference'
  if (typeof status === 'number') return `api_error_${status}`
  return 'error'
}

function isRetryableError(err: any): boolean {
  const status = err?.status ?? err?.response?.status
  if (status) {
    return status === 400 || status === 408 || status === 429 || (status >= 500 && status < 600)
  }
  // #271 #4（2026-10-04，e2e loop-robustness「drop 断连穿越」判据）：openai SDK
  // APIConnectionError 顶层 message 是固定文案 "Connection error."（无 errno 子串），
  // 连接期 errno（ECONNRESET 等）在 error.cause.code 上——旧门只查顶层
  // message/code → drop 断连判「不可重试」直接穿越给用户。检索面扩展：
  // ① SDK 连接错误类名（APIConnectionError，连接期错误 = 定义可重试；用户 abort
  //    是 APIUserAbortError 不同类，且 shouldRetryModelError 入口先判 signal.aborted）
  // ② cause 链 code/message（同 gatewayUnreachableRemediationHint 的 #4 盲区同款面）。
  // 超时 fail-fast 不受影响：APIConnectionTimeoutError/APITimeoutError 类族在
  // shouldRetryModelError 入口被 isClientRequestTimeout 先拦（#260 语义保留）。
  const name =
    (typeof err?.name === 'string' && err.name) || err?.constructor?.name || ''
  if (name === 'APIConnectionError') return true
  const cause = err?.cause
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code ?? '')
      : ''
  const causeMsg =
    cause && typeof cause === 'object' && 'message' in cause
      ? String((cause as { message?: unknown }).message ?? '')
      : ''
  const msg = `${String(err?.message || err?.code || '')} ${causeCode} ${causeMsg}`
  return /timeout|ECONN|EPIPE|fetch failed|socket|aborted/i.test(msg)
}

/**
 * #260 P0（2026-10-03 斗兽棋 "Request timed out"）：客户端请求超时判别
 * （SDK 超时类族：本仓 APIConnectionTimeoutError 实例 / openai SDK 命名
 * 变体 APITimeoutError / 类名判别兜底）。仅认 SDK 超时类——连接期错误
 * （ECONN/EPIPE/socket 断）不在其列。
 *
 * C3（0.1.50，工单 §2.1）：openai SDK v7 超时实例形状 = 实例 name 属性
 * 被 SDK APIError 构造函数置为 'Error'，超时类名只在 constructor.name
 * 上存活（探针实证：name='Error' | ctor.name='APIConnectionTimeoutError'
 * | message='Request timed out.' | cause=AbortError code 20）。旧门
 * 只查 instanceof（本仓自有类）+ 实例 name → SDK 生成超时双漏 → 滑入
 * isRetryableError /timeout/i 正则误判可重试（4 refs × 3 attempts =
 * 12-call 吸收 ≈96s + 超时终态行 llmTimeoutRemediationHint 不现形，
 * #260 fail-fast 语义回归）→ 补 constructor.name 类族判别。
 */
export function isClientRequestTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; constructor?: { name?: string } }
  if (err instanceof APIConnectionTimeoutError) return true
  if (e.name === 'APIConnectionTimeoutError' || e.name === 'APITimeoutError') return true
  // C3：SDK 实例形状下类名的唯一承载位（实例 name 恒 'Error'，见头注）。
  // 仅认超时类族两个类名——连接类族（APIConnectionError 等）不在此列，
  // 连接期错误仍归 isRetryableError（#271 #4 cause 链面保留）。
  const ctorName = e.constructor?.name
  if (ctorName === 'APIConnectionTimeoutError' || ctorName === 'APITimeoutError') return true
  return false
}

/**
 * #260 P0：模型请求错误重试门（isRetryableError 之上加超时 fail-fast 层）。
 * 判别点 = 旧门 /timeout/ 正则命中 SDK 生成超时 → 整段长生成重做 3 次
 * （斗兽棋观察值 ≈4m5s）；生成超时重试零收益（网关已掐断，重发再等一个
 * 超时窗）→ fail-fast。连接期错误（fetch failed / ECONN / 429 / 5xx）仍
 * 重试（旧语义保留）；signal aborted 不重试（旧判别保留）。
 */
export function shouldRetryModelError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false
  if (isClientRequestTimeout(err)) return false
  return isRetryableError(err as any)
}

/**
 * #260 P0：LLM 超时错误行的 remediation 提示面（REPL 错误行消费）。
 * 非超时错误 → null（不打扰）；超时 → 给修复旋钮（env ATLAS_LLM_TIMEOUT /
 * settings llmTimeoutMs，上限 30min）。currentTimeoutMs 未给时不造数字
 * （不假绿）。
 */
/**
 * 0.1.67 A-2：单位误配提示纯函数（毫秒自明）。有效 LLM 超时 < 60s（阈值
 * LLM_TIMEOUT_UNIT_WARN_THRESHOLD_MS）时返回一句「单位=毫秒，若按秒填写请 ×1000」
 * 提示（不阻断，调用方 stderr/debug + 错误行面消费）；≥ 阈值 → undefined（不误报）。
 * 用户「配 1800 极易超时」根因 = 把 1800 当秒（30min=cap）但系统按毫秒解析 = 1.8s。
 * 纯函数（判别单测直接断言 触发/不触发 双面）。
 */
export function llmTimeoutUnitHint(ms: number): string | undefined {
  // ms > 0 守卫：0（= 未设档 / 回落缺省）非单位误配，不提示；仅真实配置的小值触发。
  if (!(Number.isFinite(ms) && ms > 0 && ms < LLM_TIMEOUT_UNIT_WARN_THRESHOLD_MS)) return undefined
  return `⚠ llmTimeoutMs/ATLAS_LLM_TIMEOUT 单位是毫秒，当前 ${ms}ms ≈ ${(ms / 1000).toFixed(1)}s；若按秒填写请 ×1000（如 ${ms}s 应填 ${ms * 1000}）`
}

export function llmTimeoutRemediationHint(
  error: unknown,
  currentTimeoutMs?: number,
): string | null {
  if (!isClientRequestTimeout(error)) return null
  const head =
    typeof currentTimeoutMs === 'number' && currentTimeoutMs > 0
      ? `当前超时 ${Math.round(currentTimeoutMs / 1000)}s（${currentTimeoutMs}ms）`
      : '慢模型长生成可能超过缺省超时'
  // 0.1.67 A-3：单位显形 + 上限换算 + <1min 误配提示（毫秒自明）。
  const unitNote = '单位=毫秒'
  const capNote = `上限 ${Math.round(LLM_TIMEOUT_CAP_MS / 60000)}min（${LLM_TIMEOUT_CAP_MS}ms）`
  const misconfigNote = llmTimeoutUnitHint(
    typeof currentTimeoutMs === 'number' && currentTimeoutMs > 0 ? currentTimeoutMs : 0,
  )
  const misconfig = misconfigNote ? ` ${misconfigNote}` : ''
  return `LLM 请求超时（${head}，${unitNote}）。可调大：env ATLAS_LLM_TIMEOUT（${unitNote}）或 settings.json llmTimeoutMs 键（${capNote}）。${misconfig}`.trimEnd()
}

/**
 * 0.1.64 PR2（去 IFF 硬编码）：端点失败描述纯函数（复合逻辑）。
 *
 * 根据 baseURL 分类产生上下文相关描述（替代旧硬编码 "IFF"）：
 *   - 本地 URL（localhost/127.x/0.0.0.0/[::1]）→ 按端口提示本地端口状态
 *     （`本地端口 {port}`；无 port → `本地网关`）
 *   - 已知云 provider host → 提示对应 provider 异常（`{ProviderName} 服务`）
 *   - 通用/自定义端点 → 报 host（`{host}`）
 *   - baseURL 缺失/URL 解析失败 → `LLM 端点`（generic fallback）
 *
 * 纯函数（无 config 读取/无网络）：判别单测 tests/unit/modelprovider-gateway-unreachable.test.ts。
 * `getCurrentEndpointLabel()`（index.ts）读 endpoint config source 取 baseURL 后调本函数。
 */
export function describeEndpointFailure(baseURL?: string): string {
  if (!baseURL) return 'LLM 端点'
  let host: string
  let port: string
  try {
    const u = new URL(baseURL)
    host = u.hostname
    port = u.port
  } catch {
    return 'LLM 端点'
  }
  // 本地网关：localhost / 127.x / 0.0.0.0 / [::1]
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.startsWith('127.')
  ) {
    return port ? `本地端口 ${port}` : '本地网关'
  }
  // 已知云 provider（国产 + 国际常见）→ 提示对应 provider 异常
  const knownProviders: ReadonlyArray<readonly [RegExp, string]> = [
    [/api\.deepseek\.com$/i, 'DeepSeek'],
    [/api\.openai\.com$/i, 'OpenAI'],
    [/^(dashscope|api)\.aliyuncs\.com$/i, '阿里百炼'],
    [/api\.moonshot\.cn$/i, 'Kimi'],
    [/api\.minimax\.chat$/i, 'MiniMax'],
    [/api\.baichuan-ai\.com$/i, '百川'],
    [/api\.01\.ai$/i, '零一万物'],
    [/api\.siliconflow\.cn$/i, '硅基流动'],
    [/api\.lkeap\.com$/i, '腾讯混元'],
  ]
  for (const [re, name] of knownProviders) {
    if (re.test(host)) return `${name} 服务`
  }
  // 通用/自定义端点 → 报 host（经模型配置解析，提示排查或诊断）
  return host
}

/**
 * P0b③ 网关不可达错误行的方向性 remediation 提示面（llmTimeoutRemediationHint 姊妹，
 * REPL 错误行消费）。给方向不给 mood：LLM 端点（网关）连接失败 → 指引"已切人工
 * 确认 + /doctor 排查"；其余（超时归 llmTimeout 面 / 用户主动 abort / 拿到 HTTP
 * 状态的业务·鉴权错误 = 网关可达）→ null（零行为变更，不打扰）。
 *
 * 0.1.64 PR2：去 IFF 硬编码——签名加 endpointLabel（复合逻辑描述，由
 * getCurrentEndpointLabel() 传入；缺省 → 'LLM 端点'）。S-C 三锚点保留：
 *   gwDown = `{endpointLabel} 不可达`（参数化，旧 "IFF 不可达" 移除）
 *   gwManual = `已切人工确认`（不变）
 *   gwDoctor = `/doctor 排查`（不变 = 排查/诊断提示）
 *
 * 连接失败族判别：SDK APIConnectionError（openai "Connection error." 固定文案）+
 * 网络层 errno（fetch/undici 连接族；errno 常在 error.cause.code 上——loop-robustness
 * #4 ECONNRESET 链同款盲区，本函数据此覆盖）。
 */
export function gatewayUnreachableRemediationHint(
  error: unknown,
  endpointLabel?: string,
): string | null {
  if (!error || typeof error !== 'object') return null
  const e = error as {
    name?: string
    message?: string
    status?: number
    response?: { status?: number }
    cause?: unknown
  }
  // 用户主动 abort（Ctrl+C / 用户掐）≠ 网关不可达（非端点问题）
  if (e.name === 'AbortError' || e.name === 'APIUserAbortError') return null
  // 生成超时归 llmTimeoutRemediationHint（避免两提示叠加误导）
  if (isClientRequestTimeout(error)) return null
  // 拿到 HTTP 状态 = 网关可达（业务/鉴权错误），非"不可达"
  const status = e.status ?? e.response?.status
  if (typeof status === 'number') return null
  const causeCode =
    e.cause && typeof e.cause === 'object' && 'code' in (e.cause as object)
      ? String((e.cause as { code?: unknown }).code ?? '')
      : ''
  const haystack = `${e.message ?? ''} ${causeCode}`
  const isSdkConnection =
    e.name === 'APIConnectionError' || e.message === 'Connection error.'
  const isNetworkErrno =
    /ECONNREFUSED|ECONNRESET|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|fetch failed|socket hang up/i.test(
      haystack,
    )
  if (!isSdkConnection && !isNetworkErrno) return null
  // spec §4 P0b③ 精确串（S-C 三锚点：gwDown「{label} 不可达」参数化 / gwManual「已切人工确认」/
  // gwDoctor「/doctor 排查」）。endpointLabel 由 getCurrentEndpointLabel() 复合逻辑传入
  //（本地端口 / 云 provider / 通用 host / 缺省 'LLM 端点'）。
  return `${endpointLabel ?? 'LLM 端点'} 不可达：已切人工确认 —— /doctor 排查`
}

/**
 * 0.1.58 C4-2（CC 2.1.198）：provider 重试指数退避缺省基/封顶（Main 裁量：
 * 500ms/8s 量级，避免会话挂起感——3 次重试最坏 500+1000=1.5s）。确定性无
 * jitter（测试可复现；jitter 归后续波，同 turnRecoveryBackoffMs 先例）。
 */
export const MODEL_RETRY_BACKOFF_BASE_MS = 500
export const MODEL_RETRY_BACKOFF_CAP_MS = 8_000

/**
 * 0.1.58 C4-2：provider 重试指数退避（base×2^attempt 封顶 cap；deterministic 无
 * jitter）。attempt = 失败 attempt 序号（0 = 首发失败后首段退避 = base）。
 * 消费面 = OpenAIProvider 重试循环（chat / chatStream 同面）——仅「仍可重试」
 * （shouldRetryModelError 单一事实源：ECONNRESET/socket/5xx/429 瞬断族）在重试
 * 间退避；非可重试（403 等）不重试 = 零退避（既有行为恒等）。
 */
export function modelRetryBackoffMs(
  attempt: number,
  baseMs: number = MODEL_RETRY_BACKOFF_BASE_MS,
  capMs: number = MODEL_RETRY_BACKOFF_CAP_MS,
): number {
  const base = Math.max(0, baseMs)
  const cap = Math.max(base, capMs)
  if (attempt <= 0) return Math.min(base, cap)
  return Math.min(base * 2 ** attempt, cap)
}

/** signal 感知退避 sleep：到期 resolve；signal 已/将 aborted → 立即 resolve（不睡满）；ms<=0 = 立即。 */
function sleepSignalAware(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise<void>(resolve => {
    if (signal?.aborted) {
      resolve()
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** 0.1.58 C4-2：退避注入面（测试可注录制 fake sleep / 短基封顶；缺省 = 真 signal 感知 sleep）。 */
export interface ModelRetryBackoffOptions {
  baseMs?: number
  capMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** 0.1.58 C4-1：streamOneAttempt 终态结果（yield* 返回值捕获面）。 */
interface StreamAttemptOutcome {
  /** partial 已作 assistant 轮次内容 yield（interrupted 标记）→ 调用方不再整流重试（防双内容）。 */
  partialRetained: boolean
}

/**
 * 流终态错误事件（chatStream 尾 error 支 + 0.1.58 C4-1 partial 保留支 单一事实源）：
 * 超时类族 = TIMEOUT 码（C3 门控 isClientRequestTimeout），其余 = API_ERROR；
 * retryable = shouldRetryModelError 单一事实源（消费方据此决定续接/重试支）。
 */
function buildStreamErrorEvent(err: unknown, signal?: AbortSignal): StreamEvent {
  const message = err instanceof Error ? err.message || err.name : String(err)
  const code: LLMErrorCode = isClientRequestTimeout(err) ? 'TIMEOUT' : 'API_ERROR'
  return { type: 'error', code, message, retryable: shouldRetryModelError(err, signal) }
}

/** 流式 assistant 轮次内容块组装（成功终态 + 0.1.58 C4-1 partial 保留支 共用，防漂移）。 */
function buildStreamContentBlocks(
  reasoningText: string,
  fullText: string,
  toolCalls: Map<number, { id: string; name: string; args: string }>,
): any[] {
  const blocks: any[] = []
  if (reasoningText) blocks.push({ type: 'thinking', thinking: reasoningText, signature: 'first-party' })
  if (fullText) blocks.push({ type: 'text', text: fullText })
  blocks.push(
    ...[...toolCalls.values()]
      .filter((t) => t.name)
      .map((t) => {
        let input: any = {}
        if (t.args) {
          try {
            input = JSON.parse(t.args)
          } catch {
            input = { _raw_arguments: t.args }
          }
        }
        return { type: 'tool_use', id: t.id || `toolu_${randomUUID()}`, name: t.name, input }
      }),
  )
  return blocks
}

export interface ModelProvider {

  /** #260：当前生效请求超时读面（实现 = OpenAIProvider.timeoutMs）。 */
  getTimeoutMs(): number
  chat(args: {
    messages?: Message[]
    systemPrompt?: SystemPrompt
    role: ModelRole
    sessionModel?: string
    signal?: AbortSignal
    options?: any
    openaiParams?: any
    // W3-3d（§8.74.20）：工具 schema 注入面（shared Tool[] → buildOpenAITools
    // OpenAI function schema；未传 = tools 键不出现，窄 spine 缺省行为不变。
    // 消费方 = engine queryOneRound 活链（活探针 H6 揭出的未登记缺面））。
    tools?: Tools
    // D-5b（S-4，§8.73.2）：headless 真消费三槽——thinkingConfig → buildOpenAIParams
    // effort 派生；responseFormat = 结构化输出（toResponseFormat 产物 → response_format）；
    // fallbackModel = role 池末位（getRoleModels 追加）。未传 = 窄 spine 缺省，行为不变。
    thinkingConfig?: ThinkingConfig
    responseFormat?: unknown
    fallbackModel?: string
    // 0.1.70 G-1（composing token 回归修，D-2a 切端断 per-token 事件流根修；
    // 逆转 §8.74.2「streaming chatStream 不入引擎面」裁定——per-token 事件现入
    // 引擎面，React-free 红线不破：纯数据回调不引 React）。per-token delta
    // 回调槽：传入 = 流式路径（内部消费 streamOneAttempt，逐 delta 同步转发
    // delta 类事件，返回完整 assistant message = Promise 契约不变）；未传 =
    // 非流式路径零行为（headless / 测试 fixture / 非 TUI 调用方恒等锚）。
    onStreamDelta?: (delta: StreamDelta) => void
  }): Promise<{
    type: 'assistant'
    uuid: string
    timestamp: string
    message: {
      id: string
      model: string
      role: 'assistant'
      content: any[]
      stop_reason: string
      usage: ModelUsage
    }
  }>
  chatStream(args: {
    role: ModelRole
    sessionModel?: string
    messages?: any[]
    system?: string
    tools?: any[]
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
    toolChoice?: any
    reasoningEffort?: string
  }): AsyncGenerator<StreamEvent | Record<string, unknown>, void>
  healthCheck(role: ModelRole): Promise<{ ok: boolean; model: string; latencyMs: number }>
  countTokens(
    role: ModelRole,
    sessionModel?: string,
    messages?: Message[],
    tools?: any[],
  ): Promise<number>
  listModels(): Promise<Array<{
    id: string
    object?: string
    created?: number
    owned_by?: string
    max_input_tokens?: number
    max_tokens?: number
  }>>
  transcribeAudio(pcm: Buffer, model?: string, language?: string): Promise<string>
  synthesizeSpeech(text: string, model?: string, voice?: string): Promise<Buffer>
  verifyKey(apiKey: string, baseURL?: string): Promise<boolean>
}

function startLlmWaitHeartbeat(
  modelId: string,
  attempt: number,
  totalRetries: number,
): () => void {
  const startedAt = Date.now()
  const id = setInterval(() => {
    const waited = Math.floor((Date.now() - startedAt) / 1000)
    logForDebugging(
      `[QUERY] awaiting LLM response: model=${modelId}, waited=${waited}s, attempt=${attempt + 1}/${totalRetries}`,
    )
  }, 5_000)
  ;(id as unknown as { unref?: () => void }).unref?.()
  return () => clearInterval(id)
}

export class OpenAIProvider implements ModelProvider {
  private readonly maxRetriesPerModel: number
  private readonly timeoutMs: number
  /**
   * #262 缺口③（llmTimeoutMs 死键 + headless 设置源缝未接，live 复现铁证）：
   * 可选活态超时读面（缺省 = 构造期快照 timeoutMs，兼容直构测试面）。单例
   * getModelProvider 注 resolveLlmTimeoutMs(env, llmTimeoutSettingsSource?.())
   * 活读器——settings 源缝注入 / 值变更 / env 翻转后每次请求现读，非构造期
   * 一次性快照（修 provider 构造快照 vs getCurrentLlmTimeoutMs 现读 两车道
   * 分裂：TUI 提示说 8s 实际 600s；headless 未注源缝 llmTimeoutMs 死键）。
   */
  private readonly timeoutResolver?: () => number
  /** 0.1.58 C4-2：重试指数退避（瞬断类错误族；base/cap + sleep 注入面，见 ModelRetryBackoffOptions）。 */
  private readonly retryBackoffBaseMs: number
  private readonly retryBackoffCapMs: number
  private readonly retryBackoffSleep: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(
    maxRetriesPerModel: number = 3,
    timeoutMs: number = LLM_TIMEOUT_DEFAULT_MS,
    timeoutResolver?: () => number,
    retryBackoff?: ModelRetryBackoffOptions,
  ) {
    this.maxRetriesPerModel = maxRetriesPerModel
    this.timeoutMs = timeoutMs
    this.timeoutResolver = timeoutResolver
    this.retryBackoffBaseMs = retryBackoff?.baseMs ?? MODEL_RETRY_BACKOFF_BASE_MS
    this.retryBackoffCapMs = retryBackoff?.capMs ?? MODEL_RETRY_BACKOFF_CAP_MS
    this.retryBackoffSleep =
      retryBackoff?.sleep ?? ((ms, signal) => sleepSignalAware(ms, signal))
  }

  /**
   * #260：当前生效请求超时读面（REPL remediation 提示 / 单测断言用）。
   * #262 缺口③：活态——timeoutResolver 现读（settings 源缝 / env 变即生效）；
   * 未注 = 构造期快照（直构测试面零行为变更）。
   */
  getTimeoutMs(): number {
    return this.timeoutResolver ? this.timeoutResolver() : this.timeoutMs
  }

  async chat(args: {
    messages?: Message[]
    systemPrompt?: SystemPrompt
    role: ModelRole
    sessionModel?: string
    signal?: AbortSignal
    options?: any
    openaiParams?: any
    // W3-3d（§8.74.20）：工具 schema 注入面（shared Tool[] → buildOpenAITools
    // OpenAI function schema；未传 = tools 键不出现，窄 spine 缺省行为不变。
    // 消费方 = engine queryOneRound 活链（活探针 H6 揭出的未登记缺面））。
    tools?: Tools
    thinkingConfig?: ThinkingConfig
    responseFormat?: unknown
    fallbackModel?: string
    onStreamDelta?: (delta: StreamDelta) => void
  }) {
    // 0.1.70 G-1：onStreamDelta 传入面 = 流式路径（per-token delta 转发，
    // 复用 streamOneAttempt 单一事实源）；未传面 = 下方非流式路径原样
    // （headless / 测试 fixture / 非 TUI 调用方恒等锚，零行为变更）。
    if (args.onStreamDelta) {
      return await this.chatWithDelta(args)
    }
    // 0.1.70 H-2（de-ant 核验守卫，零行为变更）：attemptRefs = settings 模型池
    // 水平轮询单一事实源（getRoleModels = modelRoles.<role>.models 池 + providers
    // 表 normalizeRef，零 anthropic 硬编码 ref 注入；fallbackModel 参数 = 用户显式
    // --fallback-model CLI 透传，非硬编码）。chatWithDelta（G-1）/ chatStream 同面。
    const refs = getRoleModels(args.role, args.sessionModel, args.fallbackModel)
    if (refs.length === 0) {
      throw new Error(
        `No models configured for role '${args.role}' (empty pool). ` +
          `Add modelRoles/providers to ~/.atlas/settings.json, or set ATLAS_${args.role.toUpperCase()}_MODEL, then restart.`,
      )
    }
    const attemptRefs: string[] = refs
    // 0.1.71 A-1：per-ref 失败记账（全败 → 聚合可行动错误，替代 raw lastErr 抛；
    // 混合失败 = 某 ref 成功循环内已 return，不触发聚合 = 既有行为恒等锚）。
    const failures: ModelPoolRefFailure[] = []
    const acc = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    for (const ref of attemptRefs) {
      const entry = resolveModel(ref)
      if (!entry) {
        failures.push({ ref, code: 'unknown_reference', raw: `unknown provider/model reference: ${ref}` })
        continue
      }
      const client = getClientForEntry(entry)
      let params: any
      if (args.openaiParams) {
        params = { ...args.openaiParams, model: entry.modelId, stream: false }
      } else {
        params = {
          ...(await buildOpenAIParams(
            {
              messages: args.messages ?? [],
              systemPrompt: (args.systemPrompt ?? asSystemPrompt([])) as SystemPrompt,
              // W3-3d（§8.74.20）：工具 schema 面透传（buildOpenAITools 消费；
              // 未传 = params.tools 键不出现，零行为）。
              tools: args.tools,
              // D-5b（S-4）：thinkingConfig 真消费（effort 派生：enabled+budget →
              // mapBudgetToEffort；否则回落 options.effortValue / 模型缺省）。
              thinkingConfig: args.thinkingConfig,
              options: args.options,
            },
            args.role,
            entry,
          )),
          // D-5b（S-4）：结构化输出（--json-schema 经 toResponseFormat 产物 →
          // OpenAI response_format；未设 = 非结构化，键不出现）。
          ...(args.responseFormat ? { response_format: args.responseFormat } : {}),
          stream: false,
        }
      }

      let refErr: any = null
      for (let attempt = 0; attempt < this.maxRetriesPerModel; attempt++) {
        if (args.signal?.aborted) throw args.signal.reason ?? new Error('aborted')
        try {
          const stopWait = startLlmWaitHeartbeat(entry.modelId, attempt, this.maxRetriesPerModel)
          let res: any
          try {
            res = await client.chat.completions.create(params, { signal: args.signal, timeout: this.getTimeoutMs() } as any)
          } finally {
            stopWait()
          }
          const usage = mapOpenAIUsage(res?.usage)
          acc.input_tokens += usage.input_tokens
          acc.output_tokens += usage.output_tokens
          acc.cache_read_input_tokens += usage.cache_read_input_tokens
          const choice = res?.choices?.[0]
          const toolUseBlocks = (choice?.message?.tool_calls || []).map((tc: any) => {
            let input: any = {}
            try {
              input = JSON.parse(tc.function?.arguments || '{}')
            } catch {
              input = { _raw_arguments: tc.function?.arguments }
            }
            return { type: 'tool_use', id: tc.id, name: tc.function?.name || 'unknown', input }
          })
          const content: any[] = []
          const msg: any = choice?.message
          const reasoningText = msg?.reasoning_content || ''
          if (reasoningText) content.push({ type: 'thinking', thinking: reasoningText, signature: 'first-party' })
          const text = typeof msg?.content === 'string' ? msg.content : ''
          if (text) content.push({ type: 'text', text })
          content.push(...toolUseBlocks)
          if (content.length === 0) content.push({ type: 'text', text: PROVIDER_EMPTY_CONTENT_PLACEHOLDER })
          const stopReason =
            toolUseBlocks.length > 0
              ? 'tool_use'
              : choice?.finish_reason === 'length'
                ? 'max_tokens'
                : 'end_turn'
          return {
            type: 'assistant' as const,
            uuid: randomUUID(),
            timestamp: new Date().toISOString(),
            message: {
              id: randomUUID(),
              container: null,
              model: entry.modelId,
              role: 'assistant' as const,
              stop_sequence: '',
              type: 'message' as const,
              content,
              stop_reason: stopReason,
              usage: acc,
            },
          }
        } catch (err: any) {
          refErr = err
          // #260：生成超时 fail-fast（shouldRetryModelError 内判 aborted）
          if (!shouldRetryModelError(err, args.signal)) break
          // 0.1.58 C4-2（CC 2.1.198）：瞬断类错误（ECONNRESET/socket hang up/5xx/429 族，
          // 既有 shouldRetryModelError 分类面不变）重试间指数退避（base×2^attempt 封顶）——
          // 修前 = 重试间零间隔紧贴重发（hammer 抖动网关）；非瞬断类已在上方 break
          // （零退避，既有行为恒等）。末次 attempt 后无后续 attempt = 不退避。
          if (attempt < this.maxRetriesPerModel - 1) {
            await this.retryBackoffSleep(
              modelRetryBackoffMs(attempt, this.retryBackoffBaseMs, this.retryBackoffCapMs),
              args.signal,
            )
          }
        }
      }
      // 0.1.71 A-1：本 ref 重试预算耗尽（末错 = refErr）→ 记账，进下一 ref
      // （maxRetriesPerModel=0 边界 = 零 attempt，refErr 恒 null 不记账 = 旧行为恒等）。
      if (refErr) {
        failures.push({ ref, code: classifyRefFailure(refErr), raw: refErr.message ?? String(refErr) })
      }
    }

    if (failures.length > 0) {
      // 0.1.71 A-1：全败（无一 ref 成功）→ 聚合可行动错误（替代 raw lastErr 抛；
      // 零模型池 refs.length===0 既有错误在上方 throw，不经过此支）。
      throw new ModelPoolExhaustedError(args.role, failures)
    }
    throw new Error(`No models configured for role '${args.role}'.`)
  }

  /**
   * 0.1.70 G-1（composing token 回归波）：onStreamDelta 传入面 = 流式路径。
   *
   * 复用 streamOneAttempt 作 per-token 事件面单一事实源（与 chatStream 同源：
   * delta 类事件 / C4-1 partial 保留语义 / C4-2 瞬断退避）；params 构造与
   * 非流式路径同款（openaiParams 覆写 / buildOpenAIParams thinkingConfig+tools
   * +options + responseFormat + 3 参 getRoleModels fallbackModel 池末位）。
   * 错误契约 = 抛原始错误（与非流式面 create() 抛同族，withTurnRecovery /
   * shouldRetryModelError 分类语义不变）；C4-1 partial 保留面 = interrupted
   * assistant 即该轮内容（不整流重发，与 chatStream 同）。
   */
  private async chatWithDelta(args: {
    messages?: Message[]
    systemPrompt?: SystemPrompt
    role: ModelRole
    sessionModel?: string
    signal?: AbortSignal
    options?: any
    openaiParams?: any
    tools?: Tools
    thinkingConfig?: ThinkingConfig
    responseFormat?: unknown
    fallbackModel?: string
    onStreamDelta?: (delta: StreamDelta) => void
  }) {
    const refs = getRoleModels(args.role, args.sessionModel, args.fallbackModel)
    if (refs.length === 0) {
      throw new Error(
        `No models configured for role '${args.role}' (empty pool). ` +
          `Add modelRoles/providers to ~/.atlas/settings.json, or set ATLAS_${args.role.toUpperCase()}_MODEL, then restart.`,
      )
    }
    const attemptRefs: string[] = refs
    // 0.1.71 A-1：per-ref 失败记账（全败 → 聚合可行动错误；混合失败 = 某 ref
    // 成功循环内已 return，不触发聚合 = 既有行为恒等锚）。
    const failures: ModelPoolRefFailure[] = []
    // 0.1.70 H-2 同面（G-1 流式路径复用 settings 池轮询 refs，零 anthropic 硬编码 ref）。
    const onDelta = args.onStreamDelta!

    for (const ref of attemptRefs) {
      const entry = resolveModel(ref)
      if (!entry) {
        failures.push({ ref, code: 'unknown_reference', raw: `unknown provider/model reference: ${ref}` })
        continue
      }
      const client = getClientForEntry(entry)
      let params: any
      if (args.openaiParams) {
        params = { ...args.openaiParams, model: entry.modelId, stream: true }
      } else {
        params = {
          ...(await buildOpenAIParams(
            {
              messages: args.messages ?? [],
              systemPrompt: (args.systemPrompt ?? asSystemPrompt([])) as SystemPrompt,
              tools: args.tools,
              thinkingConfig: args.thinkingConfig,
              options: args.options,
            },
            args.role,
            entry,
          )),
          ...(args.responseFormat ? { response_format: args.responseFormat } : {}),
          stream: true,
        }
      }

      let refErr: any = null
      for (let attempt = 0; attempt < this.maxRetriesPerModel; attempt++) {
        if (args.signal?.aborted) throw args.signal.reason ?? new Error('aborted')
        let assistant: {
          type: 'assistant'
          uuid: string
          timestamp: string
          message: {
            id: string
            model: string
            role: 'assistant'
            content: any[]
            stop_reason: string
            usage: ModelUsage
          }
        } | null = null
        try {
          for await (const ev of this.streamOneAttempt(
            client,
            params,
            entry,
            args.signal,
            attempt,
            this.maxRetriesPerModel,
          )) {
            const t = (ev as { type?: string }).type
            // 0.1.70 G-1 定项②：逐 delta 同步回调（yield 点内调用不阻塞流；
            // 回调契约 = 同步观察者，抛 = 消费方 bug，传播不 catch 不吞）。
            if (
              t === 'text_delta' ||
              t === 'tool_use_start' ||
              t === 'tool_use_delta' ||
              t === 'tool_use_end'
            ) {
              onDelta(ev as StreamDelta)
            } else if (t === 'assistant') {
              assistant = ev as typeof assistant
            }
          }
          // assistant 在场（正常终态 / C4-1 partial interrupted）= 该轮内容，返回；
          // 全零 partial（streamOneAttempt throw 面 = 下方 catch）= 进下一 attempt。
          if (assistant) return assistant
        } catch (err: any) {
          refErr = err
          // #260 生成超时 fail-fast + 0.1.58 C4-2 瞬断类退避（同非流式面，恒等）。
          if (!shouldRetryModelError(err, args.signal)) break
          if (attempt < this.maxRetriesPerModel - 1) {
            await this.retryBackoffSleep(
              modelRetryBackoffMs(attempt, this.retryBackoffBaseMs, this.retryBackoffCapMs),
              args.signal,
            )
          }
        }
      }
      // 0.1.71 A-1：本 ref 重试预算耗尽（末错 = refErr）→ 记账，进下一 ref。
      if (refErr) {
        failures.push({ ref, code: classifyRefFailure(refErr), raw: refErr.message ?? String(refErr) })
      }
    }

    if (failures.length > 0) {
      // 0.1.71 A-1：全败（无一 ref 成功）→ 聚合可行动错误（替代 raw lastErr 抛；
      // 零模型池 refs.length===0 既有错误在上方 throw，不经过此支）。
      throw new ModelPoolExhaustedError(args.role, failures)
    }
    throw new Error(`No models configured for role '${args.role}'.`)
  }

  async *chatStream(args: {
    role: ModelRole
    sessionModel?: string
    messages?: any[]
    system?: string
    tools?: any[]
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
    toolChoice?: any
    reasoningEffort?: string
  }): AsyncGenerator<StreamEvent | Record<string, unknown>, void> {
    const refs = getRoleModels(args.role, args.sessionModel)
    if (refs.length === 0) {
      throw new Error(
        `No models configured for role '${args.role}' (empty pool). ` +
          `Add modelRoles/providers to ~/.atlas/settings.json, or set ATLAS_${args.role.toUpperCase()}_MODEL, then restart.`,
      )
    }
    const attemptRefs: string[] = refs
    let lastErr: any = null
    let succeeded = false
    // 0.1.58 C4-1：mid-stream partial 已作 assistant 轮次内容 yield（interrupted 标记）→
    // 终止不重发（整流重试将产第二条 assistant 消息 = 双内容；partial 即该轮内容）。
    let partialRetained = false

    for (const ref of attemptRefs) {
      const entry = resolveModel(ref)
      if (!entry) {
        lastErr = new Error(`unknown provider/model reference: ${ref}`)
        continue
      }
      const client = getClientForEntry(entry)
      const params: any = {
        model: entry.modelId,
        messages: args.messages?.length ? args.messages : [{ role: 'user', content: '' }],
        max_tokens: args.maxTokens ?? entry.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }
      if (args.system) params.messages = [{ role: 'system', content: args.system }, ...(args.messages ?? [])]
      if (args.tools?.length) params.tools = args.tools
      if (args.temperature != null) params.temperature = args.temperature
      if (args.toolChoice) params.tool_choice = args.toolChoice
      if (args.reasoningEffort) params.reasoning_effort = args.reasoningEffort

      for (let attempt = 0; attempt < this.maxRetriesPerModel; attempt++) {
        if (args.signal?.aborted) return
        try {
          const outcome = yield* this.streamOneAttempt(client, params, entry, args.signal, attempt, this.maxRetriesPerModel)
          if (outcome.partialRetained) {
            partialRetained = true
            break
          }
          succeeded = true
          break
        } catch (err: any) {
          lastErr = err
          // #260：生成超时 fail-fast（shouldRetryModelError 内判 aborted）
          if (!shouldRetryModelError(err, args.signal)) break
          // 0.1.58 C4-2（CC 2.1.198）：瞬断类错误重试间指数退避（同 chat() 面，
          // 流式断连族 = ECONNRESET 主诉面）；非瞬断零退避 / 末次不退避。
          if (attempt < this.maxRetriesPerModel - 1) {
            await this.retryBackoffSleep(
              modelRetryBackoffMs(attempt, this.retryBackoffBaseMs, this.retryBackoffCapMs),
              args.signal,
            )
          }
        }
      }
      if (succeeded || partialRetained || args.signal?.aborted) return
    }

    if (lastErr) {
      // 尾 error 支（零 partial 面 = 既有行为恒等；partial 保留支的 error 事件在
      // streamOneAttempt 内已 yield，partialRetained 时上方已 return 不进此支）。
      yield buildStreamErrorEvent(lastErr, args.signal)
      return
    }
    throw new Error(`No models configured for role '${args.role}'.`)
  }

  private async *streamOneAttempt(
    client: any,
    params: any,
    entry: { modelId: string; baseURL?: string; apiKey?: string; contextWindow: number; maxTokens: number },
    signal?: AbortSignal,
    attempt = 0,
    totalRetries = 3,
  ): AsyncGenerator<StreamEvent | Record<string, unknown>, StreamAttemptOutcome> {
    const stopWait = startLlmWaitHeartbeat(entry.modelId, attempt, totalRetries)
    let stream: any
    try {
      stream = await client.chat.completions.create(
        { ...params, stream: true, stream_options: { include_usage: true } },
        { signal, timeout: this.getTimeoutMs() } as any,
      )
    } finally {
      stopWait()
    }

    let currentToolCall: { id: string; name: string; args: string } | null = null
    let fullText = ''
    let reasoningText = ''
    const toolCalls = new Map<number, { id: string; name: string; args: string }>()
    let finishReason: string | null = null
    let usage: any = null
    let streamError: unknown = null

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0]
        const delta = choice?.delta
        if (delta?.content) {
          fullText += delta.content
          yield { type: 'text_delta', text: delta.content }
        }
        if (delta?.reasoning_content) reasoningText += delta.reasoning_content

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls as any[]) {
            const idx = tc.index ?? 0
            const cur = toolCalls.get(idx) ?? { id: '', name: '', args: '' }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) {
              cur.name = tc.function.name
              if (currentToolCall) {
                let input: Record<string, unknown> = {}
                if (currentToolCall.args) {
                  try { input = JSON.parse(currentToolCall.args) } catch { input = { _raw_arguments: currentToolCall.args } }
                }
                yield { type: 'tool_use_end', id: currentToolCall.id, name: currentToolCall.name, input }
              }
              currentToolCall = { id: cur.id, name: cur.name, args: cur.args }
              yield { type: 'tool_use_start', id: cur.id, name: cur.name }
            }
            if (tc.function?.arguments) {
              cur.args += tc.function.arguments
              if (currentToolCall && cur.name) {
                currentToolCall.args = cur.args
                yield { type: 'tool_use_delta', id: cur.id, inputJsonDelta: tc.function.arguments }
              }
            }
            toolCalls.set(idx, cur)
          }
        }

        if (choice?.finish_reason) {
          if (currentToolCall) {
            let input: Record<string, unknown> = {}
            if (currentToolCall.args) {
              try { input = JSON.parse(currentToolCall.args) } catch { input = { _raw_arguments: currentToolCall.args } }
            }
            yield { type: 'tool_use_end', id: currentToolCall.id, name: currentToolCall.name, input }
            currentToolCall = null
          }
          finishReason = choice.finish_reason
        }
        if (chunk.usage) usage = mapOpenAIUsage(chunk.usage as any)
        if (signal?.aborted) break
      }
    } catch (err) {
      streamError = err
    }

    if (streamError !== null) {
      // 0.1.58 C4-1（CC 2.1.199）：流中途错误（5xx / 断流）→ 已产出内容时保留
      // partial 为 assistant 轮次内容（interrupted 语义标记——模型可见上下文不丢
      // 已完成段，非整体丢弃 / 裸抛吞内容）；错误处理走既有错误面（error 事件，
      // 消费方经 retryable 判续接支）。零 partial 面（错误在首 token 前 / 内容块
      // 为空）= 既有行为恒等（throw → 调用方重试面，不进 partial 保留支）。
      const partialBlocks = buildStreamContentBlocks(reasoningText, fullText, toolCalls)
      if (partialBlocks.length === 0) throw streamError
      yield {
        type: 'message_stop',
        stopReason: 'interrupted',
        usage: usage ? {
          input_tokens: usage.input_tokens ?? 0,
          output_tokens: usage.output_tokens ?? 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        } : undefined,
      }
      const emptyUsage = mapOpenAIUsage(null)
      const partialMsg = {
        uuid: randomUUID(),
        timestamp: new Date().toISOString(),
        message: {
          id: randomUUID(),
          container: null,
          model: entry.modelId,
          role: 'assistant',
          // interrupted 语义标记（工单 §0 C4-1，Main 裁定标记面）：stop_reason =
          // 'interrupted' + 事件级 interrupted: true（加性字段，不读的消费方零影响）
          stop_reason: 'interrupted',
          stop_sequence: '',
          type: 'message',
          usage: usage || emptyUsage,
          content: partialBlocks,
        },
      }
      yield {
        type: 'assistant',
        uuid: partialMsg.uuid,
        timestamp: partialMsg.timestamp,
        message: partialMsg.message,
        interrupted: true,
      }
      yield buildStreamErrorEvent(streamError, signal)
      return { partialRetained: true }
    }

    yield {
      type: 'message_stop',
      stopReason: finishReason,
      usage: usage ? {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      } : undefined,
    }

    const contentBlocks = buildStreamContentBlocks(reasoningText, fullText, toolCalls)
    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'text', text: PROVIDER_EMPTY_CONTENT_PLACEHOLDER })
    }

    const stopReason =
      contentBlocks.some((b) => b.type === 'tool_use')
        ? 'tool_use'
        : finishReason === 'length'
          ? 'max_tokens'
          : 'end_turn'

    const emptyUsage = mapOpenAIUsage(null)
    const finalMsg = {
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
      message: {
        id: randomUUID(),
        container: null,
        model: entry.modelId,
        role: 'assistant',
        stop_reason: stopReason,
        stop_sequence: '',
        type: 'message',
        usage: usage || emptyUsage,
        content: contentBlocks,
      },
    }
    yield { type: 'assistant', uuid: finalMsg.uuid, timestamp: finalMsg.timestamp, message: finalMsg.message }
    return { partialRetained: false }
  }

  async healthCheck(role: ModelRole): Promise<{ ok: boolean; model: string; latencyMs: number }> {
    const refs = getRoleModels(role)
    const entry = refs.length ? resolveModel(refs[0]) : undefined
    if (!entry) {
      return { ok: false, model: '', latencyMs: 0 }
    }
    const client = getClientForEntry(entry)
    const t0 = Date.now()
    try {
      const list = await client.models.list()
      const model = list?.data?.[0]?.id ?? entry.modelId
      return { ok: true, model, latencyMs: Date.now() - t0 }
    } catch {
      return { ok: false, model: entry.modelId, latencyMs: Date.now() - t0 }
    }
  }

  async countTokens(role: ModelRole, sessionModel?: string, messages?: Message[], tools?: any[]): Promise<number> {
    void role
    void sessionModel
    const parts: any[] = []
    if (messages?.length) parts.push(...messages)
    if (tools?.length) parts.push(...tools)
    const serialized = JSON.stringify(parts)
    return Math.max(1, Math.ceil(serialized.length / 4))
  }

  async listModels(): Promise<Array<{
    id: string
    object?: string
    created?: number
    owned_by?: string
    max_input_tokens?: number
    max_tokens?: number
  }>> {
    const refs = getRoleModels('small')
    const entry = refs.length ? resolveModel(refs[0]) : undefined
    if (!entry) return []
    const client = getClientForEntry(entry)
    try {
      const list = await client.models.list()
      return (list?.data ?? []).map((m: any) => ({
        id: m.id,
        object: m.object,
        created: m.created,
        owned_by: m.owned_by,
        max_input_tokens: m.max_input_tokens,
        max_tokens: m.max_tokens,
      }))
    } catch {
      return []
    }
  }

  async transcribeAudio(pcm: Buffer, model?: string, language?: string): Promise<string> {
    const refs = getRoleModels('small')
    const entry = refs.length ? resolveModel(refs[0]) : undefined
    if (!entry) return ''
    const dataLen = pcm.length
    const header = Buffer.alloc(44)
    header.write('RIFF', 0, 'ascii')
    header.writeUInt32LE(36 + dataLen, 4)
    header.write('WAVE', 8, 'ascii')
    header.write('fmt ', 12, 'ascii')
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(16000, 24)
    header.writeUInt32LE(32000, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36, 'ascii')
    header.writeUInt32LE(dataLen, 40)
    const wav = Buffer.concat([header, pcm])
    const file = new File([wav], 'audio.wav', { type: 'audio/wav' })
    const client = getClientForEntry(entry)
    const resp: any = await client.audio.transcriptions.create(
      { file, model, ...(language ? { language } : {}) } as any,
      { timeout: this.getTimeoutMs() } as any,
    )
    return resp?.text ?? ''
  }

  async synthesizeSpeech(text: string, model?: string, voice?: string): Promise<Buffer> {
    const refs = getRoleModels('small')
    const entry = refs.length ? resolveModel(refs[0]) : undefined
    if (!entry) return Buffer.alloc(0)
    const client = getClientForEntry(entry)
    const resp: any = await client.audio.speech.create(
      {
        model,
        voice: voice || 'alloy',
        input: text,
        response_format: 'mp3',
      } as any,
      { timeout: this.getTimeoutMs() } as any,
    )
    const buf = await resp.arrayBuffer()
    return Buffer.from(buf)
  }

  async verifyKey(apiKey: string, baseURL?: string): Promise<boolean> {
    const cfg = getRoleConfig('fast')
    const client = new OpenAI({
      baseURL: baseURL ?? cfg.baseURL,
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      maxRetries: 2,
      timeout: 30_000,
      // #272：出站 UA 品牌串（同 clients.ts），经 shared 叶子取，覆盖 SDK 默认 OpenAI/JS
      defaultHeaders: { 'User-Agent': buildUserAgent() },
    })

    try {
      await client.models.list()
    } catch {
      // liveness 端点不可用——落到下面的 1-token 判据
    }

    const model = getRoleModel('fast')
    try {
      await client.chat.completions.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      })
      return true
    } catch (errorFromRetry) {
      const status = (errorFromRetry as { status?: number })?.status
      if (status === 401 || status === 403) {
        return false
      }
      throw errorFromRetry
    }
  }
}

// 前向缝登记（§8.74.30 S1 遗留清理，#201）：ProviderLifecycle（provider 健康
// 轮询 + isAlive 门控）已裁——0 consumer（healthCheck 直用即可，无轮询调用方）。
// 回流 = 若未来需 role-model 调用前 liveness ping 门控。
