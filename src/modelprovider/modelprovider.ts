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
import { getRoleModels, getRoleModel, resolveModel, getRoleConfig, type ModelRole } from './roles'
import { asSystemPrompt, type Message, type SystemPrompt, type ThinkingConfig } from '../shared'
import { logForDebugging } from '../shared'
import type { LLMErrorCode, StreamEvent } from './types'
import { buildOpenAIParams } from './params'

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

function isRetryableError(err: any): boolean {
  const status = err?.status ?? err?.response?.status
  if (status) {
    return status === 400 || status === 408 || status === 429 || (status >= 500 && status < 600)
  }
  const msg = String(err?.message || err?.code || '')
  return /timeout|ECONN|EPIPE|fetch failed|socket|aborted/i.test(msg)
}

export interface ModelProvider {
  chat(args: {
    messages?: Message[]
    systemPrompt?: SystemPrompt
    role: ModelRole
    sessionModel?: string
    signal?: AbortSignal
    options?: any
    openaiParams?: any
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

  constructor(maxRetriesPerModel: number = 3, timeoutMs: number = 120_000) {
    this.maxRetriesPerModel = maxRetriesPerModel
    this.timeoutMs = timeoutMs
  }

  async chat(args: {
    messages?: Message[]
    systemPrompt?: SystemPrompt
    role: ModelRole
    sessionModel?: string
    signal?: AbortSignal
    options?: any
    openaiParams?: any
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
            res = await client.chat.completions.create(params, { signal: args.signal, timeout: this.timeoutMs } as any)
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
          if (reasoningText) content.push({ type: 'thinking', thinking: reasoningText, signature: 'iff-gateway' })
          const text = typeof msg?.content === 'string' ? msg.content : ''
          if (text) content.push({ type: 'text', text })
          content.push(...toolUseBlocks)
          if (content.length === 0) content.push({ type: 'text', text: '(provider: empty response)' })
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
          if (!isRetryableError(err) || args.signal?.aborted) break
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
          if (!isRetryableError(err) || args.signal?.aborted) break
        }
      }
      if (succeeded || args.signal?.aborted) return
    }

    if (lastErr) {
      const message = lastErr instanceof Error ? lastErr.message || lastErr.name : String(lastErr)
      const code: LLMErrorCode = lastErr?.name === 'TimeoutError' ? 'TIMEOUT' : 'API_ERROR'
      yield { type: 'error', code, message, retryable: isRetryableError(lastErr) }
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
        { signal, timeout: this.timeoutMs } as any,
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
    if (reasoningText) contentBlocks.push({ type: 'thinking', thinking: reasoningText, signature: 'iff-gateway' })
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
      contentBlocks.push({ type: 'text', text: '(provider: empty response)' })
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
      { timeout: this.timeoutMs } as any,
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
      { timeout: this.timeoutMs } as any,
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

// ── ProviderLifecycle ─────────────────────────────────────────────────

export interface ProviderLifecycleOptions {
  probeRole: ModelRole
  intervalMs: number
  baseBackoffMs?: number
  maxBackoffMs?: number
}

export class ProviderLifecycle {
  private readonly provider: ModelProvider
  private timer: ReturnType<typeof setInterval> | null = null
  private alive = true
  _backoffMs = 1000
  private readonly baseBackoffMs: number
  private readonly maxBackoffMs: number
  private probeRole: ModelRole
  private probeCount = 0

  constructor(provider: ModelProvider, options?: Partial<ProviderLifecycleOptions>) {
    this.provider = provider
    this.baseBackoffMs = options?.baseBackoffMs ?? 1000
    this.maxBackoffMs = options?.maxBackoffMs ?? 60000
    this._backoffMs = this.baseBackoffMs
    this.probeRole = options?.probeRole ?? 'small'
  }

  start(intervalMs: number): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.probe()
    }, intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  isAlive(): boolean {
    return this.alive
  }

  async probe(): Promise<void> {
    this.probeCount++
    const res = await this.provider.healthCheck(this.probeRole)
    if (res.ok) {
      this.alive = true
      this._backoffMs = this.baseBackoffMs
    } else {
      this.alive = false
      this._backoffMs = Math.min(this._backoffMs * 2, this.maxBackoffMs)
    }
  }
}
