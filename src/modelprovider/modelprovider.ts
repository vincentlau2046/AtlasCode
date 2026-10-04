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
import type { LLMErrorCode, StreamEvent } from './types'
import { buildOpenAIParams } from './params'
import { APIConnectionTimeoutError } from './types'
import { LLM_TIMEOUT_CAP_MS } from './constants'

export type ModelUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type { StreamEvent }
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
 */
export function isClientRequestTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; constructor?: { name?: string } }
  if (err instanceof APIConnectionTimeoutError) return true
  if (e.name === 'APIConnectionTimeoutError' || e.name === 'APITimeoutError') return true
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
export function llmTimeoutRemediationHint(
  error: unknown,
  currentTimeoutMs?: number,
): string | null {
  if (!isClientRequestTimeout(error)) return null
  const head =
    typeof currentTimeoutMs === 'number' && currentTimeoutMs > 0
      ? `当前超时 ${Math.round(currentTimeoutMs / 1000)}s`
      : '慢模型长生成可能超过缺省超时'
  return `LLM 请求超时（${head}）。可调大：env ATLAS_LLM_TIMEOUT=<毫秒> 或 settings.json llmTimeoutMs 键（上限 ${Math.round(LLM_TIMEOUT_CAP_MS / 60000)}min）。`
}

/**
 * P0b③ 网关不可达错误行的方向性 remediation 提示面（llmTimeoutRemediationHint 姊妹，
 * REPL 错误行消费）。给方向不给 mood：LLM 端点（网关）连接失败 → 指引"已切人工
 * 确认 + /doctor 排查"；其余（超时归 llmTimeout 面 / 用户主动 abort / 拿到 HTTP
 * 状态的业务·鉴权错误 = 网关可达）→ null（零行为变更，不打扰）。
 *
 * 连接失败族判别：SDK APIConnectionError（openai "Connection error." 固定文案）+
 * 网络层 errno（fetch/undici 连接族；errno 常在 error.cause.code 上——loop-robustness
 * #4 ECONNRESET 链同款盲区，本函数据此覆盖）。
 */
export function gatewayUnreachableRemediationHint(error: unknown): string | null {
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
  // spec §4 P0b③ 精确串（S-C 三锚点：gwDown「IFF 不可达」/ gwManual「已切人工确认」/
  // gwDoctor「/doctor 排查」）
  return 'IFF 不可达：已切人工确认 —— /doctor 排查'
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

  constructor(
    maxRetriesPerModel: number = 3,
    timeoutMs: number = LLM_TIMEOUT_DEFAULT_MS,
    timeoutResolver?: () => number,
  ) {
    this.maxRetriesPerModel = maxRetriesPerModel
    this.timeoutMs = timeoutMs
    this.timeoutResolver = timeoutResolver
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
  }) {
    const refs = getRoleModels(args.role, args.sessionModel, args.fallbackModel)
    if (refs.length === 0) {
      throw new Error(
        `No models configured for role '${args.role}' (empty pool). ` +
          `Add modelRoles/providers to ~/.atlas/settings.json, or set ATLAS_${args.role.toUpperCase()}_MODEL, then restart.`,
      )
    }
    const attemptRefs: string[] = refs
    let lastErr: any = null
    const acc = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

    for (const ref of attemptRefs) {
      const entry = resolveModel(ref)
      if (!entry) {
        lastErr = new Error(`unknown provider/model reference: ${ref}`)
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
          lastErr = err
          // #260：生成超时 fail-fast（shouldRetryModelError 内判 aborted）
          if (!shouldRetryModelError(err, args.signal)) break
        }
      }
    }

    if (lastErr) throw lastErr
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
          yield* this.streamOneAttempt(client, params, entry, args.signal, attempt, this.maxRetriesPerModel)
          succeeded = true
          break
        } catch (err: any) {
          lastErr = err
          // #260：生成超时 fail-fast（shouldRetryModelError 内判 aborted）
          if (!shouldRetryModelError(err, args.signal)) break
        }
      }
      if (succeeded || args.signal?.aborted) return
    }

    if (lastErr) {
      const message = lastErr instanceof Error ? lastErr.message || lastErr.name : String(lastErr)
      const code: LLMErrorCode = lastErr?.name === 'TimeoutError' ? 'TIMEOUT' : 'API_ERROR'
      yield { type: 'error', code, message, retryable: shouldRetryModelError(lastErr, args.signal) }
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
  ): AsyncGenerator<StreamEvent | Record<string, unknown>, void> {
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

    const contentBlocks: any[] = []
    if (reasoningText) contentBlocks.push({ type: 'thinking', thinking: reasoningText, signature: 'first-party' })
    if (fullText) contentBlocks.push({ type: 'text', text: fullText })
    const toolUseBlocks = [...toolCalls.values()]
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
      })
    contentBlocks.push(...toolUseBlocks)
    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'text', text: PROVIDER_EMPTY_CONTENT_PLACEHOLDER })
    }

    const stopReason =
      toolUseBlocks.length > 0
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
