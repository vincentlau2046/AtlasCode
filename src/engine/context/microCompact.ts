/**
 * engine/context — microcompact（E-1b T-4b 裁剪核 + D-2a S4 富体回填，M5 切端）
 *
 * 语义：距上次 assistant 消息的 gap 超阈值（服务端 prompt cache 大概率过期）时，
 * 把最旧的可压缩 tool_result 内容清空（保留最近 keepRecent 个）→ 缩小下次全量重写的 prefix。
 * 白名单 = COMPACTABLE_TOOLS（旧仓 8 项：FileRead/Shell 家族/Grep/Glob/WebFetch/
 * WebSearch/FileEdit/FileWrite——review 2026-09-23 N-3 订正：含写类工具，非「只读」；
 * 共性 = tool_result 体量大且可再取——clear 后模型可重调工具恢复）。
 *
 * 双模式（S4，对齐 S3 compactConversation 重载先例——重载判别：第二参有
 * getAppState = 富模式，有 config = 裁剪模式，缺第二参 = 富模式 no-context）：
 *  - 裁剪模式（DI deps，同步）：guard → 计数 → content-clear，行为不变
 *    （engine-multi-round / w2-pre 判别单测消费面）。
 *  - 富模式（CompactContext 可选 + querySource，async，旧仓 orchestrator
 *    507L 面）：clearCompactWarningSuppression 起步 + time-based 触发
 *    （querySource 主线程门，显式 source 才触发）+ cached-MC 路径
 *    （env kill-switch + 主线程门 + 模型支持门，CachedMCModulePort DI 缝）
 *    + warning 抑制/reset 配对。返回 MicrocompactResult（旧仓形状，
 *    TUI 调用点 1/2 参消费 .messages 零改动）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *   ① cached-MC 体 = 单方法端口缝（W2-2-pre 缺面先迁③裁定维持：背衬
 *      cachedMicrocompact.ts 全 any-stub 不迁本体；宿主经
 *      setCachedMCModulePort 注真实现，缺省 stub = 死路径零运行时影响，
 *      等价旧仓 feature('CACHED_MICROCOMPACT') OFF 态）。
 *   ② cache-edit 4 函数族（consumePendingCacheEdits/getPinnedCacheEdits/
 *      pinCacheEdits/markToolsSentToAPIState）= 死导出（S9 前 grep 核验 TUI
 *      零消费方，仅 orchestrator 自引用）不迁；数据经
 *      MicrocompactResult.compactionInfo.pendingCacheEdits 流向调用方。
 *   ③ feature('CACHED_MICROCOMPACT') 构建期门 → env kill-switch
 *      ATLAS_ENABLE_CACHED_MICROCOMPACT（engine env 惯例，S1 snipRuntime 先例；
 *      精确 'true' 判定）。
 *   ④ notifyCacheDeletion（旧 feature('PROMPT_CACHE_BREAK_DETECTION') 门）
 *      = 宿主侧 port 可选方法（engine 保 gate-free，门语义随宿主注入决定）。
 *   ⑤ 旧 getMainLoopModel() 兜底 → context?.options.mainLoopModel 透传给
 *      port.isModelSupportedForCacheEditing（模型解析归宿主 port 自决）。
 *   ⑥ time-based config 读侧（旧 GrowthBook 'atlas_slate_heron'）→
 *      setTimeBasedMCConfigSource 注入（宿主注 GB 读面；缺省 = 缺省值，
 *      = 旧仓 GB-off 态行为等价）。
 *   ⑦ 富体 debug 日志（logForDebugging 两处）裁——纯调试面，非消费面。
 *   ⑧ 富路径 collectCompactableToolIds 复用裁剪版收集器（全消息扫描 +
 *      DEFAULT_COMPACTABLE_TOOLS 真值集；tool_use 块按 API 契约只出现在
 *      assistant 消息 → 与旧仓 assistant-only 扫描行为等价）。
 */
import type { Message, ToolResultBlockParam } from '../../shared'
import type { CompactContext } from './compactPorts'
import {
  clearCompactWarningSuppression,
  suppressCompactWarning,
} from './compactWarningState'
// 工具名常量引 leaf（非 tools 门面——TDZ 环规避，memory atlascode-baseToolEntities-tdz-cycle 同型）
import {
  FILE_READ_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  GREP_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  GLOB_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  SHELL_TOOL_NAMES,
} from '../tools/toolNames'

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

/**
 * time-based MC 配置读侧（W2-2-pre 缺面先迁④，§8.74.2）：旧仓
 * getTimeBasedMCConfig = GrowthBook 读（'atlas_slate_heron'，缺省
 * TIME_BASED_MC_CONFIG_DEFAULTS）。新仓 engine 面无 settings.featureFlags /
 * GrowthBook 读面（tui D3 GB 化层留 tui 侧）→ 返回缺省值副本（= tui GB-off
 * 态行为等价）；settings 覆写面随 W3 活链路接线回填（H6 前向接缝登记）。
 */
export function getTimeBasedMCConfig(): TimeBasedMCConfig {
  return { ...TIME_BASED_MC_CONFIG_DEFAULTS }
}

/**
 * 富路径 time-based 配置源注入（S4 delta ⑥）：宿主注 GB 读面（S8 接线）；
 * 缺省 = getTimeBasedMCConfig（缺省值）。传 null 复位。
 */
let timeBasedMCConfigSource: (() => TimeBasedMCConfig) | null = null

export function setTimeBasedMCConfigSource(
  next: (() => TimeBasedMCConfig) | null,
): void {
  timeBasedMCConfigSource = next
}

function resolveTimeBasedMCConfig(): TimeBasedMCConfig {
  return (timeBasedMCConfigSource ?? getTimeBasedMCConfig)()
}

/** 单 image/document 块 token 估值上限（旧仓常量）。 */
const IMAGE_MAX_TOKEN_SIZE = 2000

/** 粗略 token 估算（旧仓 roughTokenCountEstimation 等价：chars/4 上取整）。 */
function roughTokens(s: unknown): number {
  return Math.ceil(String(s ?? '').length / 4)
}

/**
 * tool_result 块 token 估值（旧仓 calculateToolResultTokens 等价，review 2026-09-23
 * M-2 订正为类型分档）：string → chars/4；数组按元素类型分档——text → chars/4、
 * image/document → 固定 2000（格式无关的近似）、其他 → 0（不计）。
 */
function toolResultTokens(block: ToolResultBlockParam): number {
  const content = block.content
  if (!content) return 0
  if (typeof content === 'string') return roughTokens(content)
  if (Array.isArray(content)) {
    return content.reduce((sum, item) => {
      const t = (item as { type?: string }).type
      if (t === 'text') return sum + roughTokens((item as { text?: unknown }).text)
      if (t === 'image' || t === 'document') return sum + IMAGE_MAX_TOKEN_SIZE
      return sum
    }, 0)
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
 * 富重载（S4）= querySource 主线程门形态（见下方重载）。
 */
export function evaluateTimeBasedTrigger(
  messages: Message[],
  deps: MicrocompactDeps,
): { gapMinutes: number; config: TimeBasedMCConfig } | null
// 富模式（S4，旧仓 L407-429 逐字语义）：显式主线程 querySource 才触发
// （/context、/compact、analyzeContext 无 source 的 analysis-only 调用不触发；
// isMainThreadSource 对 undefined 判主线程仅 cached-MC 向后兼容用）。
export function evaluateTimeBasedTrigger(
  messages: Message[],
  querySource?: string,
): { gapMinutes: number; config: TimeBasedMCConfig } | null
export function evaluateTimeBasedTrigger(
  messages: Message[],
  depsOrQuerySource?: MicrocompactDeps | string,
): { gapMinutes: number; config: TimeBasedMCConfig } | null {
  if (typeof depsOrQuerySource === 'object') {
    const { config } = depsOrQuerySource
    if (!config.enabled) {
      return null
    }
    const lastAssistant = messages.findLast((m) => m.type === 'assistant')
    if (!lastAssistant) {
      return null
    }
    const lastTs = new Date(String(lastAssistant.timestamp)).getTime()
    // timestamp 缺失/非法（NaN）或 epoch 0 均归 0 → gap = +∞ → 被下方 !Number.isFinite
    // 拦截 = 不触发（review 2026-09-23 N-1 注释：时间戳不可判定时宁不清空——
    // 清空是不可逆的上下文削减，缺判定依据时保守放行）。
    const gapMinutes = (Number.isFinite(lastTs) ? lastTs : 0) === 0
      ? Number.POSITIVE_INFINITY
      : ((depsOrQuerySource.now ?? Date.now()) - lastTs) / 60_000
    if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
      return null
    }
    return { gapMinutes, config }
  }
  // 富形态（旧仓逐字）
  const querySource = depsOrQuerySource
  const config = resolveTimeBasedMCConfig()
  if (!config.enabled || !querySource || !isMainThreadSource(querySource)) {
    return null
  }
  const lastAssistant = messages.findLast((m) => m.type === 'assistant')
  if (!lastAssistant) {
    return null
  }
  const gapMinutes =
    (Date.now() - new Date(String(lastAssistant.timestamp)).getTime()) / 60_000
  if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
    return null
  }
  return { gapMinutes, config }
}

/** 收集序列中属于可压缩工具的 tool_use_id（旧仓 collectCompactableToolIds 等价，delta ⑧）。 */
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
function trimmedMicrocompactMessages(
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

// ─────────────────────────── D-2a S4 富面（旧仓 orchestrator 507L 回填）───────────────────────────

/**
 * 旧仓 COMPACTABLE_TOOLS 真值集（8 项，旧仓 L37-46 逐字值；
 * engine 工具名常量经 toolNames leaf 单一事实源，delta ⑧）。
 */
const DEFAULT_COMPACTABLE_TOOLS = new Set<string>([
  FILE_READ_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
])

/**
 * 主线程 source 判定（旧仓 L245-247 逐字）：startsWith 前缀匹配——
 * promptCategory.ts 非默认 outputStyle 时 querySource =
 * 'repl_main_thread:outputStyle:<style>'；bare 'repl_main_thread' 仅默认 style。
 * undefined 判主线程 = cached-MC 向后兼容（time-based 触发面另行要求显式 source）。
 */
export function isMainThreadSource(querySource?: string): boolean {
  return !querySource || querySource.startsWith('repl_main_thread')
}

/**
 * cached-MC env kill-switch（S4 delta ③：旧 feature('CACHED_MICROCOMPACT')
 * 构建期门 → env 精确 'true' 判定，缺省 OFF = 死路径零运行时影响）。
 */
export function isCachedMicrocompactEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ATLAS_ENABLE_CACHED_MICROCOMPACT === 'true'
}

/**
 * 旧仓 PendingCacheEdits / MicrocompactResult 逐字（cache_edits 数据经
 * compactionInfo 流向调用方；API 层消费面 = S4 delta ② 死导出，不迁）。
 */
export type PendingCacheEdits = {
  trigger: 'auto'
  deletedToolIds: string[]
  // 上次 API response 的累计 cache_deleted_input_tokens 基线（API 值 sticky/累计，
  // 用于算单次操作 delta）
  baselineCacheDeletedTokens: number
}

export type MicrocompactResult = {
  messages: Message[]
  compactionInfo?: {
    pendingCacheEdits?: PendingCacheEdits
  }
}

/**
 * cached-MC 模块簇 DI 端口（S4 delta ①：单方法体缝——state 注册/删除集/
 * cache_edits 块构造/warning 抑制配对全归宿主 port 闭包；engine 本体
 * 零模块态 + React-free 红线）。缺省 stub = 全关（旧仓 feature OFF 态等价）。
 * 宿主注真实现（H6 前向接缝；S8 未注 = 保持死路径，与 TUI 现态一致）。
 */
export interface CachedMCModulePort {
  /** cached-MC 总开关（宿主读配置；缺省 stub false）。 */
  isCachedMicrocompactEnabled(): boolean
  /** 模型 cache-edit 支持判定（model = context.options.mainLoopModel，delta ⑤）。 */
  isModelSupportedForCacheEditing(model?: string): boolean
  /** cached-MC 全体（旧仓 cachedMicrocompactPath 语义）；返回旧仓 MicrocompactResult。 */
  cachedMicrocompactPath: (
    messages: Message[],
    querySource?: string,
  ) => Promise<MicrocompactResult>
  /** 宿主侧 cached-MC 模块态重置（time-based clear 后配对调用，S4 富 reset 缝）。 */
  resetCachedMCState?: () => void
  /** 缓存断检测通知（旧 feature('PROMPT_CACHE_BREAK_DETECTION') 门，delta ④）。 */
  notifyCacheDeletion?: (querySource: string) => void
}

const DEFAULT_CACHED_MC_PORT: CachedMCModulePort = {
  isCachedMicrocompactEnabled: () => false,
  isModelSupportedForCacheEditing: () => false,
  cachedMicrocompactPath: async (messages) => ({ messages }),
}

let cachedMCModulePort: CachedMCModulePort = DEFAULT_CACHED_MC_PORT

/** 宿主注 cached-MC 端口（H6/S8 接线）；传 null 复位缺省 stub（单测 teardown）。 */
export function setCachedMCModulePort(next: CachedMCModulePort | null): void {
  cachedMCModulePort = next ?? DEFAULT_CACHED_MC_PORT
}

export function getCachedMCModulePort(): CachedMCModulePort {
  return cachedMCModulePort
}

/**
 * 富 content-clear 触发（旧仓 maybeTimeBasedMicrocompact L431-507 逐字语义，
 * delta ⑦ debug 日志裁 + delta ⑧ 收集器复用）：gap 触发 → 保留最近 keepRecent →
 * 其余可压缩 tool_result 清空 + warning 抑制 + cached-MC 态重置配对。
 * 未触发 / 无可清 / 零节省 → null（调用方 fall-through 到 cached-MC 路径）。
 */
function maybeTimeBasedMicrocompact(
  messages: Message[],
  querySource: string | undefined,
): MicrocompactResult | null {
  const trigger = evaluateTimeBasedTrigger(messages, querySource)
  if (!trigger) {
    return null
  }
  const { config } = trigger

  const compactableIds = collectCompactableToolIds(messages, DEFAULT_COMPACTABLE_TOOLS)

  // Floor at 1: slice(-0) returns the full array（paradoxically keeps everything），
  // 且全清让模型零工作上下文——旧仓同注。
  const keepRecent = Math.max(1, config.keepRecent)
  const keepSet = new Set(compactableIds.slice(-keepRecent))
  const clearSet = new Set(compactableIds.filter((id) => !keepSet.has(id)))

  if (clearSet.size === 0) {
    return null
  }

  let tokensSaved = 0
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
        touched = true
        return { ...block, content: TIME_BASED_MC_CLEARED_MESSAGE }
      }
      return block
    })
    if (!touched) return message
    return { ...message, message: { ...(message.message as object), content: newContent } }
  })

  if (tokensSaved === 0) {
    return null
  }

  // 压缩成功即抑制 warning（下次 API response 前 token 计数不精确）
  suppressCompactWarning()
  // 刚 content-clear 了工具结果且改 prompt 内容令服务端 cache 失效——若 cached-MC
  // 下轮以陈旧模块态运行，会 cache_edit 服务端已不存在的条目。重置（S4 富 reset 缝）。
  resetMicrocompactState()
  // 刚改 prompt 内容——下次响应 cache read 走低是预期非 break；通知检测器
  // （delta ④：feature 门语义归宿主 port 注入侧）。
  if (querySource) {
    getCachedMCModulePort().notifyCacheDeletion?.(querySource)
  }

  return { messages: result }
}

/**
 * 富 microcompact 体（旧仓 L249-289 逐字语义）：warning 清除 → time-based 短接 →
 * cached-MC 路径（env + port + 主线程 + 模型三门）→ 兜底原样返回。
 */
async function richMicrocompactMessages(
  messages: Message[],
  context: CompactContext | undefined,
  querySource: string | undefined,
): Promise<MicrocompactResult> {
  // 新 microcompact 尝试起步清除抑制标志
  clearCompactWarningSuppression()

  // time-based 触发先行短路：gap 超阈 = 服务端 cache 已过期，全量 prefix 必重写——
  // 先于请求清旧 tool_result 缩小重写面；cached-MC（cache-editing）跳过（编辑
  // 假设 cache 热，刚判定为冷）。
  const timeBasedResult = maybeTimeBasedMicrocompact(messages, querySource)
  if (timeBasedResult) {
    return timeBasedResult
  }

  // 仅主线程跑 cached-MC，防 forked agents（session_memory 等）把自身
  // tool_results 注册进全局 cached-MC 态（宿主 port 闭包态）——否则主线程会
  // 尝试删除自己对话里不存在的工具。
  const port = getCachedMCModulePort()
  if (
    isCachedMicrocompactEnabled() &&
    port.isCachedMicrocompactEnabled() &&
    port.isModelSupportedForCacheEditing(context?.options.mainLoopModel) &&
    isMainThreadSource(querySource)
  ) {
    return await port.cachedMicrocompactPath(messages, querySource)
  }

  // 兜底（旧仓同注）：cached-MC 不可用（外部构建/非 ant/不支持模型/子代理）时
  // 此处不做压缩，autocompact 负责上下文压力。
  return { messages }
}

/**
 * microcompact 双模式重载（D-2a S4，M5 切端）——
 *  - 裁剪模式（DI deps，同步，E-1b T-4b 真核心）：engine 内部/判别单测消费面，行为零变更。
 *  - 富模式（CompactContext 可选 + querySource，async，旧仓 orchestrator 面）：
 *    S8 切端后 TUI 4 调用点（analyzeContext 1 参 / context 命令 1 参 /
 *    compact 命令 2 参 context）+ cached-MC/warning 面全解析富模式。
 *
 * 重载判别（对齐 S3 compactConversation 先例）：第二参有 getAppState = 富；
 * 有 config = 裁剪；缺第二参 = 富（no-context：time-based 不触发〔显式 source
 * 门〕+ cached-MC 缺省 stub 死路径 → 原样返回，与旧仓 1 参调用行为一致）。
 */
export function microcompactMessages(
  messages: Message[],
  deps: MicrocompactDeps,
): MicrocompactOutcome
export function microcompactMessages(
  messages: Message[],
  context?: CompactContext,
  querySource?: string,
): Promise<MicrocompactResult>
export function microcompactMessages(
  messages: Message[],
  contextOrDeps?: CompactContext | MicrocompactDeps,
  querySource?: string,
): MicrocompactOutcome | Promise<MicrocompactResult> {
  const rich =
    contextOrDeps === undefined ||
    typeof (contextOrDeps as { getAppState?: unknown }).getAppState === 'function'
  if (rich) {
    return richMicrocompactMessages(
      messages,
      contextOrDeps as CompactContext | undefined,
      querySource,
    )
  }
  return trimmedMicrocompactMessages(messages, contextOrDeps as MicrocompactDeps)
}

/**
 * 富 reset（旧仓 L126-131 语义）：重置宿主 cached-MC 模块态（S4 富 reset 缝；
 * delta ② pendingCacheEdits 模块态不持——4 函数族死导出，数据经 compactionInfo
 * 流动，无可清态）。缺省 stub = no-op 不抛（S-E2c swarm 调用点零行为变更）。
 */
export function resetMicrocompactState(): void {
  cachedMCModulePort.resetCachedMCState?.()
}

/**
 * CACHED_MICROCOMPACT 残留守 stub（D-2a S1：旧仓 cachedMCConfig.ts 逐字迁入；
 * 原 tui orchestrator/context/cachedMCConfig.ts 同名 stub 随 S9 删目录退役）。
 * feature('CACHED_MICROCOMPACT') 门控默认 OFF = 死路径零运行时影响（any-stub，
 * 消费点 tui constants/prompts.ts 懒加载 + 门控，缺省态返回空对象）。
 */
export const getCachedMCConfig : any = (() => ({})) as any;
