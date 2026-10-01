/**
 * tui/contextHostWiring — D-2a S8（M5 切端）：engine context 簇宿主侧端口接线。
 *
 * 组合根（factory.createCoreDependencies）调用一次 wireContextHostPorts()，
 * 把 tui 宿主的 LLM-bound / 模块态 / settings / GB 读面全部挂上 engine DI
 * 端口——切端后 TUI 全 core 名解到 engine 门面（engineCompat 单星号），
 * 富体经端口委托回本模块的宿主本体（S8 期本体仍在 orchestrator 目录，
 * S9 迁 contextBodies/ 后只改本文件 import 路径）。
 *
 * 接线面（engine 端口 ← 宿主实现）：
 *  - CompactPorts.summarize ← orchestrator streamCompactSummary（fork 支 +
 *    流式兜底；GB cache-prefix / streaming-retry 门宿主自读）——单点 cast
 *    （engine CompactContext duck → tui ToolUseContext，运行时实参即 TUI
 *    真实 ToolUseContext）
 *  - CompactPorts.hook 执行器 ← tui/utils/hooks（Pre/PostCompact）+
 *    utils/sessionStart（session-start 簇）
 *  - CompactPorts.buildPostCompactAttachments ← 旧仓 L493-549 组合配方
 *    （file+asyncAgent 并行 → plan/planMode/skill 追加 → deferred-tools /
 *    agent-listing / MCP-instructions delta 重宣告）逐字复原
 *  - CompactPorts.markPostCompaction/notifyCompaction ← bootstrapState /
 *    promptCacheBreakDetection（旧仓 bootstrapState 本 fork 为 stub，端口
 *    照注 = 行为逐字）
 *  - SessionMemoryCompactPort ← orchestrator sessionMemoryCompact 615L 本体
 *  - ReactiveCompactPort ← orchestrator reactiveCompact 2 入口（内部
 *    require('./compact.js') 富 compactConversation；S9 换 engine 导入）
 *  - PartialCompactPort ← orchestrator partialCompactConversation 7 参体
 *  - registerPostCompactReset × 5 组 ← 旧仓 postCompactCleanup 78L 清单
 *    （顺序 + 主线程门 + feature 门逐字；resetMicrocompactState 恒跑已
 *    内建 engine 注册表骨架）
 *  - setAutoCompactSettingsSource ← getGlobalConfig().autoCompactEnabled
 *    （默认 true，与旧仓 0 参 isAutoCompactEnabled 逐字等价）
 *  - setTimeBasedMCConfigSource ← GB 'atlas_slate_heron' 读面（旧仓
 *    timeBasedMCConfig.ts 逐字：默认 {enabled:false, 60min, keepRecent:5}）
 *
 * 未注裁定：CachedMCModulePort 不注——默认 stub 全关 = 旧仓 cachedMC
 * any-stub（cachedMicrocompact.ts 21L 全 `as any` 空实现）逐字等价（H6 前向
 * 接缝：真 cached-MC 落地时经 setCachedMCModulePort 注真实现）。
 *
 * 幂等：wireContextHostPorts() 可重复调用（createCoreDependencies 多实例，
 * 单测）——端口全量重设 + reset 注册表清后重建（clearPostCompactResets
 * 复用 engine 测试钩子，生产语义 = 注册表重建）。
 */
import { feature } from 'src/shared'
import {
  clearPostCompactResetsForTesting,
  registerPostCompactReset,
  setAutoCompactSettingsSource,
  setCompactPorts,
  setPartialCompactPort,
  setReactiveCompactPort,
  setSessionMemoryCompactPort,
  setTimeBasedMCConfigSource,
  TIME_BASED_MC_CONFIG_DEFAULTS,
  type CompactContext,
  type ReactiveCompactOutcome,
} from 'src/engine'
import type { AgentId } from './types/ids.js'
import type { UserMessage } from './types/message.js'
import type { ToolUseContext } from './Tool.js'
import type { AttachmentMessage } from './types/message.js'
import { getGlobalConfig } from './utils/config.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './services/analytics/growthbook.js'
import {
  executePostCompactHooks,
  executePreCompactHooks,
} from './utils/hooks.js'
import { processSessionStartHooks } from './utils/sessionStart.js'
import { markPostCompaction } from './bootstrapState.js'
import { notifyCompaction } from './services/api/promptCacheBreakDetection.js'
import {
  createAttachmentMessage,
  getAgentListingDeltaAttachment,
  getDeferredToolsDeltaAttachment,
  getMcpInstructionsDeltaAttachment,
} from './utils/attachments.js'
import { clearSystemPromptSections } from './constants/systemPromptSections.js'
import { getUserContext } from './context.js'
import { clearSpeculativeChecks } from './tools/BashTool/bashPermissions.js'
import { clearClassifierApprovals } from './utils/classifierApprovals.js'
import { resetGetMemoryFilesCache } from './utils/memoryFiles.js'
import { clearSessionMessagesCache } from './utils/sessionStorage.js'
import { clearBetaTracingState } from './utils/telemetry/betaSessionTracing.js'
import { resetContextCollapse } from './services/contextCollapse/index.js'
// S8 本体仍在 orchestrator 目录（S9 迁 contextBodies/，本文件 import 随迁）
import { streamCompactSummary } from './core/orchestrator/context/compact.js'
import {
  createAsyncAgentAttachmentsIfNeeded,
  createPlanAttachmentIfNeeded,
  createPlanModeAttachmentIfNeeded,
  createPostCompactFileAttachments,
  createSkillAttachmentIfNeeded,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
} from './core/orchestrator/context/compact.js'
import { trySessionMemoryCompaction as sessionMemoryCompactBody } from './core/orchestrator/context/sessionMemoryCompact.js'
import {
  reactiveCompactOnPromptTooLong as reactivePTLBody,
  tryReactiveCompact as reactiveTryBody,
} from './core/orchestrator/context/reactiveCompact.js'
import { partialCompactConversation as partialCompactBody } from './core/orchestrator/context/compact.js'

/**
 * post-compact 附件重建组合（旧仓 orchestrator compact.ts L493-549 逐字）：
 * 并行 file+asyncAgent → 条件追加 plan/planMode/skill → delta 重宣告三段。
 */
async function composePostCompactAttachments(
  preCompactReadFileState: Record<string, { content: string; timestamp: number }>,
  context: CompactContext,
): Promise<AttachmentMessage[]> {
  // 单点 cast（engine duck → tui ToolUseContext；运行时实参 = TUI 真实
  // ToolUseContext，duck 为其结构子集）
  const ctx = context as unknown as ToolUseContext
  const [fileAttachments, asyncAgentAttachments] = await Promise.all([
    createPostCompactFileAttachments(
      preCompactReadFileState,
      ctx,
      POST_COMPACT_MAX_FILES_TO_RESTORE,
    ),
    createAsyncAgentAttachmentsIfNeeded(ctx),
  ])
  const out: AttachmentMessage[] = [...fileAttachments, ...asyncAgentAttachments]
  const planAttachment = createPlanAttachmentIfNeeded(ctx.agentId)
  if (planAttachment) out.push(planAttachment)
  const planModeAttachment = await createPlanModeAttachmentIfNeeded(ctx)
  if (planModeAttachment) out.push(planModeAttachment)
  const skillAttachment = createSkillAttachmentIfNeeded(ctx.agentId)
  if (skillAttachment) out.push(skillAttachment)
  for (const att of getDeferredToolsDeltaAttachment(
    ctx.options.tools,
    ctx.options.mainLoopModel,
    [],
    { callSite: 'compact_full' },
  )) {
    out.push(createAttachmentMessage(att))
  }
  for (const att of getAgentListingDeltaAttachment(ctx, [])) {
    out.push(createAttachmentMessage(att))
  }
  for (const att of getMcpInstructionsDeltaAttachment(
    ctx.options.mcpClients,
    ctx.options.tools,
    ctx.options.mainLoopModel,
    [],
  )) {
    out.push(createAttachmentMessage(att))
  }
  return out
}

/** 宿主 context 簇端口接线（组合根 createCoreDependencies 调用；幂等）。 */
export function wireContextHostPorts(): void {
  setCompactPorts({
    // 单点 cast 三处（engine duck/Message 面 → tui 本体面；运行时实参
    // = TUI 真实对象，duck 为结构子集）
    summarize: (p) =>
      streamCompactSummary({
        messages: p.messages,
        summaryRequest: p.summaryRequest as unknown as UserMessage,
        appState: p.context.getAppState(),
        context: p.context as unknown as ToolUseContext,
        preCompactTokenCount: p.preCompactTokenCount,
        cacheSafeParams: p.cacheSafeParams as never,
      }),
    executePreCompactHooks,
    executePostCompactHooks,
    processSessionStartHooks,
    buildPostCompactAttachments: composePostCompactAttachments,
    markPostCompaction,
    notifyCompaction,
  })

  setSessionMemoryCompactPort({
    trySessionMemoryCompaction: (messages, agentId, threshold) =>
      sessionMemoryCompactBody(
        messages,
        agentId as AgentId | undefined,
        threshold,
      ),
  })

  setReactiveCompactPort({
    // 宿主本体 tryReactiveCompact 返回 Promise<any>（旧仓签名），结构可赋
    // engine 端口 Promise<CompactionResult | null>；入参单点 cast（engine
    // 宽松 cacheSafeParams 面 → 宿主 SystemPrompt 面，运行时同一对象）
    tryReactiveCompact: params =>
      reactiveTryBody(
        params as unknown as Parameters<typeof reactiveTryBody>[0],
      ),
    reactiveCompactOnPromptTooLong: (messages, cacheSafeParams, options) =>
      reactivePTLBody(
        messages,
        cacheSafeParams,
        options,
      ) as Promise<ReactiveCompactOutcome>,
  })

  setPartialCompactPort({
    partialCompactConversation: (
      allMessages,
      pivotIndex,
      context,
      cacheSafeParams,
      userFeedback,
      direction,
    ) =>
      partialCompactBody(
        allMessages,
        pivotIndex,
        context as unknown as ToolUseContext,
        cacheSafeParams as never,
        userFeedback,
        direction,
      ),
  })

  // settings 读侧（autoCompact 0 参判定；默认 true 与旧仓逐字）
  setAutoCompactSettingsSource(() => getGlobalConfig().autoCompactEnabled)
  // GB 时间触发配置读面（旧仓 timeBasedMCConfig.ts 逐字）
  setTimeBasedMCConfigSource(() =>
    getFeatureValue_CACHED_MAY_BE_STALE(
      'atlas_slate_heron',
      TIME_BASED_MC_CONFIG_DEFAULTS,
    ),
  )

  // post-compact reset 注册表（旧仓 postCompactCleanup 78L 清单逐字：
  // 执行序 + 主线程门 + feature 构建期门；恒跑的 resetMicrocompactState
  // 已内建 engine 注册表骨架，此处只注宿主 reset 组）
  clearPostCompactResetsForTesting()
  if (feature('CONTEXT_COLLAPSE')) {
    registerPostCompactReset(
      () => {
        resetContextCollapse()
      },
      { mainThreadOnly: true },
    )
  }
  registerPostCompactReset(
    () => {
      // getUserContext 外层 memo 缓存须同清（旧仓 L44-47 注：只清内层
      // getMemoryFiles 缓存 → 下轮命中外层缓存，InstructionsLoaded 不触发）
      getUserContext.cache.clear?.()
      resetGetMemoryFilesCache('compact')
    },
    { mainThreadOnly: true },
  )
  registerPostCompactReset(() => {
    clearSystemPromptSections()
    clearClassifierApprovals()
    clearSpeculativeChecks()
    clearBetaTracingState()
    // 有意不清 invoked skill 内容（skill 文本须跨多次压缩存活，旧仓同注）
  })
  if (feature('COMMIT_ATTRIBUTION')) {
    registerPostCompactReset(() => {
      void import('./utils/attributionHooks.js').then(m => m.sweepFileContentCache())
    })
  }
  registerPostCompactReset(() => {
    clearSessionMessagesCache()
  })
}
