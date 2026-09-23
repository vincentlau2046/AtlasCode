/**
 * engine/context — time-based microcompact（§8.23 E-1b T-4b，旧仓 microCompact.ts 507L 裁剪版真核心）
 *
 * 语义：距上次 assistant 消息的 gap 超阈值（服务端 prompt cache 大概率过期）时，
 * 把最旧的可压缩 tool_result 内容清空（保留最近 keepRecent 个）→ 缩小下次全量重写的 prefix。
 * 白名单 = COMPACTABLE_TOOLS（旧仓：FileRead/Shell/Grep/Glob/WebFetch/WebSearch 类只读工具，
 * 其 tool_result 体量大且可再取——clear 后模型可重调工具恢复）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - cached microcompact 路径（cache_edits API 层 + GrowthBook 计数配置 + forked-agent
 *     隔离）→ 残留守（cache 面归 modelprovider 域 + Port 8 配置）。
 *   - COMPACTABLE_TOOLS 白名单 → deps.compactableTools 注入接缝（新仓工具域未移植，
 *     由调用方传「注册工具名 ∩ 可压缩类」；未注入 = 空集 = 不 clear，安全默认）。
 *   - compactWarning 抑制态 / querySource main-thread 判定 → 残留守（warning 面 + source
 *     语义随 hooks/query 面回填）。
 *   - 本版 content-clear 路径无 I/O → 同步返回（旧仓 async 签名因 cache 路径保留；残留守
 *     cache 路径落时恢复 async）。
 */
import type { Message, ToolResultBlockParam } from '../../shared'

export const TIME_BASED_MC_CLEARED_MESSAGE = '[Old tool result content cleared]'

export type TimeBasedMCConfig = {
  /** 总开关。false 时 time-based microcompact 为 no-op（旧仓默认 false，显式启用才跑）。 */
  enabled: boolean
  /** 距上次 assistant 消息超该分钟数触发（默认 60 = 服务端 1h cache TTL 保证过期）。 */
  gapThresholdMinutes: number
  /** 保留最近 N 个可压缩 tool_result（旧仓默认 5；floor 1 防全清零上下文）。 */
  keepRecent: number
}

export const TIME_BASED_MC_CONFIG_DEFAULTS: TimeBasedMCConfig = {
  enabled: false,
  gapThresholdMinutes: 60,
  keepRecent: 5,
}

/** 单 image/document 块 token 估值上限（旧仓常量）。 */
const IMAGE_MAX_TOKEN_SIZE = 2000

/** 粗略 token 估算（旧仓 roughTokenCountEstimation 等价：chars/4 上取整）。 */
function roughTokens(s: unknown): number {
  return Math.ceil(String(s ?? '').length / 4)
}

/** tool_result 块 token 估值（旧仓 calculateToolResultTokens 等价）。 */
function toolResultTokens(block: ToolResultBlockParam): number {
  const content = block.content
  if (typeof content === 'string') return roughTokens(content)
  if (Array.isArray(content)) {
    return content.reduce((sum, b) => sum + roughTokens(JSON.stringify(b)), 0)
  }
  return 0
}

/**
 * 消息序列 token 粗略估算（旧仓 estimateMessageTokens 裁剪：block 类型分档 + 4/3 保守 padding）。
 * 非 user/assistant 消息（system/compact 边界）跳过（旧仓同语义）。
 */
export function estimateMessageTokens(messages: Message[]): number {
  let totalTokens = 0
  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
      continue
    }
    const content = (message.message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const block of content as Array<{ type?: string; [k: string]: unknown }>) {
      switch (block.type) {
        case 'text':
          totalTokens += roughTokens(block.text)
          break
        case 'tool_result':
          totalTokens += toolResultTokens(block as unknown as ToolResultBlockParam)
          break
        case 'image':
        case 'document':
          totalTokens += IMAGE_MAX_TOKEN_SIZE
          break
        case 'thinking':
          totalTokens += roughTokens(block.thinking)
          break
        case 'redacted_thinking':
          totalTokens += roughTokens(block.data)
          break
        case 'tool_use':
          totalTokens += roughTokens(
            String(block.name) + JSON.stringify(block.input ?? {}),
          )
          break
        default:
          totalTokens += roughTokens(JSON.stringify(block))
      }
    }
  }
  // 4/3 保守 padding（旧仓同语义：估算是近似，宁高勿低）。
  return Math.ceil(totalTokens * (4 / 3))
}

export interface MicrocompactDeps {
  config: TimeBasedMCConfig
  /** 可压缩工具名集合（旧仓 COMPACTABLE_TOOLS 注入接缝；空集 = 不 clear，安全默认）。 */
  compactableTools: Set<string>
  /** 时间源注入（可测性；默认 Date.now()）。 */
  now?: number
}

export interface MicrocompactOutcome {
  messages: Message[]
  /** 被清空的 tool_use_id（调用方断言/遥测）。 */
  clearedToolIds: string[]
  tokensSaved: number
}

/**
 * 触发判定（旧仓 evaluateTimeBasedTrigger 裁剪：config 门 + gap 阈值）。
 * main-thread/querySource 判定残留守（见头注）。
 */
export function evaluateTimeBasedTrigger(
  messages: Message[],
  deps: MicrocompactDeps,
): { gapMinutes: number; config: TimeBasedMCConfig } | null {
  const { config } = deps
  if (!config.enabled) {
    return null
  }
  const lastAssistant = messages.findLast((m) => m.type === 'assistant')
  if (!lastAssistant) {
    return null
  }
  const lastTs = new Date(String(lastAssistant.timestamp)).getTime()
  const gapMinutes = (Number.isFinite(lastTs) ? lastTs : 0) === 0
    ? Number.POSITIVE_INFINITY
    : ((deps.now ?? Date.now()) - lastTs) / 60_000
  if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
    return null
  }
  return { gapMinutes, config }
}

/** 收集序列中属于可压缩工具的 tool_use_id（旧仓 collectCompactableToolIds 等价）。 */
function collectCompactableToolIds(
  messages: Message[],
  compactableTools: Set<string>,
): string[] {
  const ids: string[] = []
  for (const message of messages) {
    const content = (message.message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) continue
    for (const block of content as Array<{ type?: string; [k: string]: unknown }>) {
      if (block.type === 'tool_use' && compactableTools.has(String(block.name))) {
        ids.push(String(block.id))
      }
    }
  }
  return ids
}

/**
 * content-clear microcompact（旧仓 maybeTimeBasedMicrocompact 裁剪真核心：
 * gap 触发 → 保留最近 keepRecent → 其余可压缩 tool_result 内容清空）。
 * 未触发 / 无可清 → 原样返回（调用方 fall-through 到 autocompact，旧仓同语义）。
 */
export function microcompactMessages(
  messages: Message[],
  deps: MicrocompactDeps,
): MicrocompactOutcome {
  const trigger = evaluateTimeBasedTrigger(messages, deps)
  if (!trigger) {
    return { messages, clearedToolIds: [], tokensSaved: 0 }
  }
  const { config } = trigger

  const compactableIds = collectCompactableToolIds(messages, deps.compactableTools)
  // floor 1：slice(-0) 会返回全量（反直觉保全部），且全清让模型零工作上下文——旧仓同注。
  const keepRecent = Math.max(1, config.keepRecent)
  const keepSet = new Set(compactableIds.slice(-keepRecent))
  const clearSet = new Set(compactableIds.filter((id) => !keepSet.has(id)))
  if (clearSet.size === 0) {
    return { messages, clearedToolIds: [], tokensSaved: 0 }
  }

  let tokensSaved = 0
  const clearedToolIds: string[] = []
  const result: Message[] = messages.map((message) => {
    if (message.type !== 'user') return message
    const content = (message.message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) return message
    let touched = false
    const newContent = (content as Array<ToolResultBlockParam>).map((block) => {
      if (
        block.type === 'tool_result' &&
        clearSet.has(block.tool_use_id) &&
        block.content !== TIME_BASED_MC_CLEARED_MESSAGE
      ) {
        tokensSaved += toolResultTokens(block)
        clearedToolIds.push(block.tool_use_id)
        touched = true
        return { ...block, content: TIME_BASED_MC_CLEARED_MESSAGE }
      }
      return block
    })
    if (!touched) return message
    return { ...message, message: { ...(message.message as object), content: newContent } }
  })

  return { messages: result, clearedToolIds, tokensSaved }
}
