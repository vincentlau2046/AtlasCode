/**
 * engine/context — 0.1.68 F-1：auto-compact 压缩体（富路径消费 + 裁剪 fail-safe
 * 双门面）。
 *
 * 根修（块 F F-1，用户 2026-10-14 第五条追加「compact 后像新 session 凭记忆
 * 重新读取」定因）：REPL 主 loop auto-compact 历史消费裁剪版 compactConversation
 * （keepRecent:0 + attachments/hookResults 硬置空，D-2a S2 登记 stub）→
 * post-compact 上下文 = [boundaryMarker, …summaryMessages] 仅此 → 模型失全部
 * 文件态/工具近态，必须重读。本改消费**富路径**（richCompactConversation，经
 * CompactPorts DI 缝）：附件重建（buildPostCompactAttachments 文件/plan/skill/
 * deferred-tools/MCP 重宣告）+ PTL 截头重试（CC-1180，小窗自 PTL 链 M1 缓解）
 * + hook 簇（PreCompact block 信号 AD-22 / PostCompact / SessionStart）+
 * markPostCompaction/notifyCompaction + reAppendSessionMetadata = 恢复质量对齐
 * 手动 /compact + reactive 413 消费面（单一 compact 实现，三触发面同构）。
 *
 * 双门面纪律（Main 2026-10-14 裁定登记，F′ 重构后更新）：
 *  - **全富路径**（非最小子集）：C2/C3/C4/C5 附件重建 + 工具续发 + hook 簇
 *    经 CompactPorts DI 缝；**C7 keepRecent N 经富路径第 8 参**（本波对齐
 *    上游恢复组件「近期消息保留」——富体新增槽，auto-compact 车道定参
 *    AUTOCOMPACT_KEEP_RECENT=3，N=0 恒等锚；手动 /compact + reactive 缺省 0
 *    零回归）。
 *  - **hooks 启用**（经 port）：用户未配置 hook = 宿主执行器 no-op 零回归；
 *    AD-22 PreCompact block 信号启用 = 返回 skip 载体（compactionSkipped），
 *    loop 消费点 compactionSkipped 门（loop.ts F-1a 挂点）防误覆盖消息面。
 *  - **port 门控 fail-safe**：getCompactPorts() 未注册（未接线车道，如 headless
 *    print.ts 窄体面无 readFileState/options 宿主本体）或 richContext null =
 *    裁剪路径逐字恒等（修前行为 = 零回归锚；headless 车道留裁剪登记，
 *    0.1.69 候选面）。
 *
 * engine React-free 红线：本体零 tui 依赖——richContext = 宿主结构 duck 单点
 * cast（调用方），LLM-bound / 文件 IO / 模块态叶全走 CompactPorts 端口 DI
 * （setCompactPorts 宿主注真实现，contextHostWiring 先例）。
 */
import type { Message } from '../../shared'
import {
  compactConversation,
  type CompactionResult,
} from './compact'
import { getCompactPorts } from './compactPorts'
import type { CacheSafeParams, CompactContext } from './compactPorts'

export interface AutoCompactCompactOptions {
  /** 裁剪路径摘要（宿主车道 modelProvider.chat 包装；仅窄面消费）。 */
  trimmedSummarize: (messages: Message[], prompt: Message) => Promise<string>
  /** token 计数（裁剪模式 post-compact 计数用；可选）。 */
  countTokens?: (messages: Message[]) => number | Promise<number>
  /** 富上下文（宿主 ToolUseContext 结构 duck）；null = 窄面（走裁剪）。 */
  richContext: CompactContext | null
  /**
   * 缓存安全参数（逐调用重建；forkContextMessages = 当前消息序列——同
   * reactive 消费点语义：loop 出错/触发前的活消息序列，非预 loop 静态序列）。
   */
  buildCacheSafeParams: (messages: Message[]) => CacheSafeParams
  /**
   * 0.1.68 F′ C7：近期消息保留数（富路径第 8 参；缺省 0 = 全量压缩）。
   * auto-compact 车道定参 = AUTOCOMPACT_KEEP_RECENT（3，Main 定参登记见
   * autoCompact.ts 常量头注）。仅富路径消费——裁剪 fail-safe 路径恒 0
   * （headless 车道留修前行为，零回归锚）。
   */
  keepRecent?: number
}

/**
 * auto-compact 压缩体构造器（纯函数，判别单测面）：port 门控双面（见头注），
 * 返回 AutoCompactDeps.compact 形 (messages) => Promise<CompactionResult>。
 *
 * 富面调用契约（判别单测锚）：
 *  - 摘要调用面不变（引擎 prompt 构建器单源 getCompactPrompt；port summarize
 *    收原消息数组引用 + 本函数 buildCacheSafeParams 产物）
 *  - post-compact 消息序 = buildPostCompactMessages 富 ordering（boundary →
 *    summary → attachments → hookResults）
 *  - 无文件变更面（readFileState 空 + 无模块态）= 宿主 buildPostCompactAttachments
 *    返 ∅ = 不误注（零附件恒等锚）
 */
export function createAutoCompactCompact(
  options: AutoCompactCompactOptions,
): (messages: Message[]) => Promise<CompactionResult> {
  return (messages) => {
    if (options.richContext && getCompactPorts()) {
      return compactConversation(
        messages,
        options.richContext,
        options.buildCacheSafeParams(messages),
        true, // suppressFollowUpQuestions（auto-compact 直接续跑，同裁剪面）
        undefined, // customInstructions
        true, // isAutoCompact（trigger 'auto' + 错误通知仅手动面弹）
        undefined, // recompactionInfo
        options.keepRecent ?? 0, // 0.1.68 F′ C7：近期消息保留（缺省 0）
      )
    }
    return compactConversation(messages, {
      summarize: options.trimmedSummarize,
      countTokens: options.countTokens,
      keepRecent: 0, // 裁剪 fail-safe 面恒 0（修前行为零回归锚）
    })
  }
}
