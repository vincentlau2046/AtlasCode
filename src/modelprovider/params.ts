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
// 0.1.85 Task A（C85-A）：@PDF 引用投影叶子（shared 纯函数，不引 tui/engine）
import { formatPDFReferenceForModel } from '../shared'
// 0.1.93 W-D-A（f4 批复五(c)）：swarm 扩参字段 wire 过滤面 + 门（shared 单源）
import {
  filterSwarmFieldsFromSchema,
  isAgentSwarmsEnabled,
} from '../shared'
// 0.1.89 任务 B（Gap A 余面）：attachment 族登记式处置（本域自含，不引 tui/engine）
import {
  engineAttachmentRejectionMarker,
  resolveEngineAttachmentProjection,
} from './attachmentProjection'
// wave0190 任务 A 层 2（锁面批注 §5.1）：wire 终态数组出口 tool-pairing 防御
import { ensureToolResultPairing } from './toolPairing'
import { zodToJsonSchema } from './schema'
import {
  convertEffortValueToLevel,
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
        // 0.1.85-B（C85-B）防线二（工单 L88/L165）：document 块无 provider 映射，
        // 不静默丢弃——显式提示指引 pages 参读（与 readTool full-PDF 支显式错误
        // 同口径；本波不新增 native document 协议）。
        if (b?.type === 'document')
          return '[document: native document input is not supported by this provider — use Read with the pages parameter to read PDF pages as images]'
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
    } else if (m?.type === 'attachment') {
      // 0.1.85 Task A（C85-A）：attachment 型此前无支整体落空被丢（084 Gap A
      // 根——f4 新鲜探针证真实 pdf_reference 投影为 []，K5-8 四要素 0/3 不可达）。
      // pdf_reference 支 = 恒等锚：投影 = shared 纯叶子（K5-8 四要素文本，与
      // TUI normalizeAttachmentForAPI 同叶子双面恒等，零 I/O、不绕 Read 授权）。
      // 0.1.89 任务 B（Gap A 余面，工单 2026-11-05-p0-wave-0189 §1.B/§6.2）：
      // 余族改三段登记式处置（attachmentProjection.ts 单一事实源）——
      // ① 白名单投影（字段登记式，同叶子文本）② 显式 skip（登记零产物）
      // ③ 未知型/畸形载荷 fail-visible marker（禁静默、禁 spread）。
      // 真集合 = resume JSONL 持久化族 × engine 直达（工单 §6.2 矩阵）。
      const att = (m as any).attachment
      if (
        att?.type === 'pdf_reference' &&
        typeof att.filename === 'string' &&
        att.filename.length > 0
      ) {
        out.push({ role: 'user', content: formatPDFReferenceForModel(att) })
      } else if (att?.type === 'pdf_reference') {
        // C85-A 守卫不过（畸形载荷）→ fail-visible（禁静默）。
        out.push({
          role: 'user',
          content: engineAttachmentRejectionMarker('pdf_reference'),
        })
      } else {
        const d = resolveEngineAttachmentProjection(att)
        if (d.kind === 'project') {
          out.push({ role: 'user', content: d.text })
        } else if (d.kind === 'unknown') {
          out.push({
            role: 'user',
            content: engineAttachmentRejectionMarker(
              (att as { type?: unknown } | null | undefined)?.type,
            ),
          })
        }
        // skip = 登记零产物（attachmentProjection.ts 显式 skip 集，逐组理由）。
      }
    }
  }
  // wave0190 层 2（锁面批注 §5.1）：出口 = 终态数组检查点（上游 claude.ts:1136 同为
  // API 发送前终态数组检查）——attachment 三段处置等下游变换有再破配对绕行风险，
  // 出口对全源孤儿统一兜底。合法全配对零修复零扰动（ensureToolResultPairing 引用
  // 恒等直通）；修复发生由 toolPairing 内部 logForDebugging 留痕（禁静默）。
  return ensureToolResultPairing(out).messages
}

/** Build OpenAI function-tool schemas from Atlas Tool objects. */
/**
 * W3-3d（§8.74.20）：zod v4 实例判别（legacy Tool.inputSchema 形态）。
 * zod v4 实例暴露内部 `_zod` 对象（toJSONSchema 读 `schema._zod.def`）；
 * 纯 JSON schema（新 shared Tool 契约）无此属性 → 原样透传。
 */
function isZodV4Instance(x: unknown): boolean {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as Record<string, unknown>)._zod === 'object'
  )
}

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
          // W3-3d（§8.74.20）：双形 schema 面——legacy zod 实例 → 转换；
          // 新 shared Tool 纯 JSON schema（ToolInputJSONSchema）原样使用
          // （zodToJsonSchema 对非 zod 输入抛 TypeError，活探针 H6 揭出）。
          ? (isZodV4Instance(tool.inputSchema)
              ? (zodToJsonSchema(tool.inputSchema as any) as any)
              : (tool.inputSchema as unknown as Record<string, unknown>))
          : { type: 'object', properties: {} }
    let desc: string
    // 0.1.92（W-opt-3 后续小修）：options 缺省防御——print 车道 chat() 未透传
    // options 实参（undefined）时，此处读 options.isNonInteractiveSession 抛
    // TypeError 被 catch 吞掉 → desc 静默回落 tool.name（wire 描述全量→名字的
    // 「薄化」实为吞异常事故面，非设计面；probe-092 插桩 44/44 证）。
    // `options?.` 兜底后 description() 正常执行，print 车道 wire 恢复全量描述；
    // 摘要侧同函数同形，字节恒等保持（summary ≡ main 车道内恒等不破）。
    // 行为变化登记：print 车道 wire tools 描述由名字 → 全量（摘要请求 input
    // tokens 增量同理，归 CHANGELOG 登记面）。
    try {
      desc = await tool.description(
        {},
        {
          isNonInteractiveSession: options?.isNonInteractiveSession,
          toolPermissionContext,
          tools: (tools ?? []) as Tools,
        },
      )
    } catch {
      desc = tool.name
    }
    // 0.1.93 W-D-A（f4 批复五(c)）：swarm 扩参字段 wire 投影过滤——门 OFF
    // 时剥除 Agent(name/team_name/mode) / ExitPlanMode(launchSwarm/
    // teammateCount)（判据④「门 OFF 缺省不可见」载体；shared 单源，
    // tui/utils/api.ts 同消费）。print + TUI 双车道同经本函数，单点收口。
    const filteredSchema = filterSwarmFieldsFromSchema(
      tool.name,
      schema as Record<string, unknown>,
      isAgentSwarmsEnabled(),
    )
    out.push({
      type: 'function',
      function: {
        name: tool.name,
        description: desc,
        parameters: filteredSchema as typeof schema,
      },
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
  // 0.1.80 K1-F①：按 name 稳定排序 + 同名去重保留首现（@302）——工具
  // 注入序抖动会让 prompt cache 键漂移；同名重复（注册工具 vs
  // extraToolSchemas）部分 provider 直接 400。首现优先 = 注册工具面
  // （含权限描述）压过 extra 裸 schema。
  return stableSortDedupeTools(out)
}

/**
 * 0.1.80 K1-F①：工具 schema 列表按 function.name 稳定排序 + 同名去重
 * （保留首现）。Array.prototype.sort 在各引擎均稳定（ES2019+），同窗内
 * 原相对序保留——去重后首现即"最早声明者"。
 */
export function stableSortDedupeTools(
  tools: ChatCompletionTool[],
): ChatCompletionTool[] {
  // ChatCompletionTool = function 型 ∪ custom 型（openai SDK 判别联合）——
  // name 提取经 type 窄化；本仓两个 push 点恒造 function 型，custom 支为
  // 防御面（custom 型 name 在 .custom.name 非顶层）。
  const nameOf = (t: ChatCompletionTool): string =>
    t.type === 'function' ? t.function.name : t.custom.name
  const sorted = [...tools].sort((a, b) => {
    const an = nameOf(a)
    const bn = nameOf(b)
    return an < bn ? -1 : an > bn ? 1 : 0
  })
  const seen = new Set<string>()
  return sorted.filter(t => {
    const n = nameOf(t)
    if (seen.has(n)) return false
    seen.add(n)
    return true
  })
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
  // 0.1.67 E-2：第三支（无会话单值 + 无 thinking 预算）亦经 resolveAppliedEffort
  // （env → per-model 记忆 → 缺省），而非直落 getDefaultEffortForModel——per-model
  // 记忆应在无显式会话选择时亦生效（切到某模型按该模型记忆值发送）。显式 thinking
  // 预算支不变（更显式，优先于 per-model 记忆）。
  const resolvedEffort =
    effortValue !== undefined
      ? resolveAppliedEffort(model, effortValue)
      : args.thinkingConfig && args.thinkingConfig.type === 'enabled'
        ? mapBudgetToEffort((args.thinkingConfig as any).budgetTokens)
        : resolveAppliedEffort(model, undefined)
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
