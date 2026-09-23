/**
 * OpenAI 参数构建器 — 从旧仓 modelprovider/params.ts 迁入
 *
 * 消息/工具/格式转换逻辑，gateway.ts 和直接调用方共享。
 *
 * import 适配：
 *  - Message/SystemPrompt/ThinkingConfig/Tool/Tools → shared（契约冻结）
 *  - effort 函数 → 域内 effort.ts
 *  - zodToJsonSchema → 域内 schema.ts
 */

import { getRoleModel, type ModelRole, type ResolvedModel } from './roles'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { Message, SystemPrompt, ThinkingConfig, Tools } from '../shared'
import { zodToJsonSchema } from './schema'
import {
  convertEffortValueToLevel,
  getDefaultEffortForModel,
  resolveAppliedEffort,
} from './effort'

// ---- Helpers ----

function mapBudgetToEffort(budgetTokens: number): 'low' | 'medium' | 'high' {
  if (!budgetTokens || budgetTokens <= 2048) return 'low'
  if (budgetTokens <= 8192) return 'medium'
  return 'high'
}

function toolResultContentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (b?.type === 'text') return b.text ?? ''
        if (b?.type === 'image') return '[image]'
        if (b?.type === 'tool_result') return toolResultContentToString(b.content)
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content == null) return ''
  return JSON.stringify(content)
}

/** Convert a user message into OpenAI message(s). */
export function toOpenAIMessages(messages: any[]): any[] {
  const out: any[] = []
  for (const m of messages ?? []) {
    if (m && m.role && m.content !== undefined && !m.type) {
      out.push(m)
      continue
    }
    if (m?.type === 'user') {
      // 加固（T-5c F-1）：嵌套（m.message.content）与顶层（m.content）双形态。
      // runAgent/fork 以两种形态构造 user 消息，旧版仅读嵌套形态会静默丢弃顶层
      // user 消息（子代理任务 prompt 在真 provider 路径下被整个丢掉，假 provider
      // 从不序列化故测试不可见）。
      const content = m.message?.content ?? m.content
      if (typeof content === 'string') {
        out.push({ role: 'user', content })
      } else if (Array.isArray(content)) {
        const toolResults = content.filter((b: any) => b?.type === 'tool_result') as any[]
        const textParts: any[] = []
        let textBuf = ''
        for (const b of content as any[]) {
          if (b?.type === 'text') {
            textBuf += (textBuf ? '\n' : '') + (b.text ?? '')
          } else if (b?.type === 'image') {
            const data = b.source?.data
            const url = data
              ? `data:${b.source?.media_type || 'image/png'};base64,${data}`
              : (b.source?.url ?? '')
            if (url) textParts.push({ type: 'image_url', image_url: { url } })
          }
        }
        if (textBuf) textParts.push({ type: 'text', text: textBuf })
        if (textParts.length > 0) {
          out.push({
            role: 'user',
            content: textParts.length === 1 && textParts[0].type === 'text' ? textParts[0].text : textParts,
          })
        }
        for (const tr of toolResults) {
          out.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id ?? '',
            content: toolResultContentToString(tr.content),
          })
        }
      }
    } else if (m?.type === 'assistant') {
      const blocks: any[] = Array.isArray(m.message?.content) ? (m.message.content as any[]) : []
      let text = ''
      const toolCalls: any[] = []
      for (const b of blocks) {
        if (b?.type === 'text') {
          text += (text ? '\n' : '') + (b.text ?? '')
        } else if (b?.type === 'tool_use') {
          toolCalls.push({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          })
        }
      }
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      })
    } else if (m?.type === 'system') {
      // 双形态同 user 分支（T-5c F-1）；仅字符串 system content 进 API（降级为 user
      // role，既有行为——正解需 provider 支持 role:'system'，残留守见 runAgent 头注）。
      const content = (m as any).message?.content ?? (m as any).content
      if (typeof content === 'string') out.push({ role: 'user', content })
    }
  }
  return out
}

/** Build OpenAI function-tool schemas from Atlas Tool objects. */
async function buildOpenAITools(
  tools: Tools,
  options: any,
  emptyPermissionContext?: () => any,
): Promise<ChatCompletionTool[]> {
  const out: ChatCompletionTool[] = []
  let toolPermissionContext: any
  try {
    toolPermissionContext = await options.getToolPermissionContext()
  } catch {
    toolPermissionContext = emptyPermissionContext
      ? emptyPermissionContext()
      : {
          mode: 'default',
          additionalWorkingDirectories: new Map(),
          alwaysAllowRules: {},
          alwaysDenyRules: {},
          isBypassPermissionsModeAvailable: false,
        }
  }
  for (const tool of tools ?? []) {
    const schema =
      'inputJSONSchema' in tool && tool.inputJSONSchema
        ? tool.inputJSONSchema
        : tool.inputSchema
          ? (zodToJsonSchema(tool.inputSchema as any) as any)
          : { type: 'object', properties: {} }
    let desc: string
    try {
      desc = await tool.description(
        {},
        {
          isNonInteractiveSession: options.isNonInteractiveSession,
          toolPermissionContext,
          tools: (tools ?? []) as Tools,
        },
      )
    } catch {
      desc = tool.name
    }
    out.push({
      type: 'function',
      function: { name: tool.name, description: desc, parameters: schema },
    })
  }
  for (const s of options?.extraToolSchemas ?? []) {
    const t = s as any
    if (t && typeof t.name === 'string' && t.type !== 'advisor_20260301') {
      out.push({
        type: 'function',
        function: {
          name: t.name,
          description: typeof t.description === 'string' ? t.description : '',
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      })
    }
  }
  return out
}

export function toResponseFormat(outputFormat: any): any {
  if (!outputFormat) return undefined
  if (outputFormat.type === 'json_object') return { type: 'json_object' }
  if (outputFormat.type === 'json_schema') {
    return {
      type: 'json_schema',
      json_schema: { name: 'output', schema: outputFormat.schema, strict: true },
    }
  }
  return undefined
}

/** Build the full set of OpenAI completion params from Atlas-native types. */
export async function buildOpenAIParams(
  args: {
    messages: Message[]
    systemPrompt: SystemPrompt
    thinkingConfig?: ThinkingConfig
    tools?: Tools
    options: any
    role?: ModelRole
    entry?: ResolvedModel
    betas?: string[]
    thinking?: any
    outputFormat?: any
    stopSequences?: string[]
  },
  role: ModelRole = 'small',
  entry?: ResolvedModel,
  opts?: {
    emptyPermissionContext?: () => any
  },
) {
  const model = entry ? entry.modelId : ((args.options && args.options.model) || getRoleModel(role))
  const openaiMessages = toOpenAIMessages(args.messages)
  const sysText = args.systemPrompt && args.systemPrompt.length > 0
    ? Array.from(args.systemPrompt).join('\n')
    : ''
  const systemParts = sysText ? [sysText] : []
  if (systemParts.length > 0) {
    openaiMessages.unshift({ role: 'system', content: systemParts.join('\n') })
  }
  const toolsPayload = await buildOpenAITools(args.tools, args.options, opts?.emptyPermissionContext)

  let toolChoiceParam: any
  const tc = args.options?.toolChoice
  if (tc && typeof tc === 'object' && tc.type === 'tool' && tc.name) {
    toolChoiceParam = { type: 'function', function: { name: tc.name } }
  } else if (typeof tc === 'string') {
    toolChoiceParam = tc
  }

  const maxTokens = entry
    ? (args.options?.maxOutputTokensOverride ?? entry.maxTokens)
    : (args.options?.maxOutputTokensOverride ?? 8192)
  const temperature = args.options?.temperatureOverride
  const effortValue = args.options?.effortValue
  const resolvedEffort =
    effortValue !== undefined
      ? resolveAppliedEffort(model, effortValue)
      : args.thinkingConfig && args.thinkingConfig.type === 'enabled'
        ? mapBudgetToEffort((args.thinkingConfig as any).budgetTokens)
        : getDefaultEffortForModel(model)
  const reasoningEffort =
    resolvedEffort !== undefined ? convertEffortValueToLevel(resolvedEffort) : undefined

  return {
    model,
    messages: openaiMessages,
    tools: toolsPayload.length > 0 ? toolsPayload : undefined,
    tool_choice: toolChoiceParam,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(args.betas && args.betas.length > 0 ? { betas: args.betas } : {}),
    ...(args.thinking ? { thinking: args.thinking } : {}),
    ...(args.outputFormat ? { output_config: { format: args.outputFormat } } : {}),
    ...(args.stopSequences ? { stop_sequences: args.stopSequences } : {}),
  } as any
}
