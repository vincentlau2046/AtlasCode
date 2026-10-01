/**
 * engine/context — snip 运行时面（D-2a S1，M5 切端回填）：
 * 旧仓 orchestrator/context/snipCompact.ts 的运行时门控 + nudge 节奏两面移植。
 *
 * 移植裁定（与 engine 既有惯例对齐）：
 *   - isSnipRuntimeEnabled：旧 `feature('HISTORY_SNIP')`（bun:bundle 构建期门，
 *     新仓 0-hit 不可测，见 bun:bundle feature 不可测登记）→ env kill-switch
 *     （precedent：toolRegistry FEATURE_ASCEND_TOOLS / coordinatorMode
 *     FEATURE_COORDINATOR_MODE）：ATLAS_DISABLE_SNIP=true 强制关（优先），
 *     FEATURE_HISTORY_SNIP=false 关（kill-switch），缺省开（旧 ON_BY_DEFAULT 语义）。
 *     env 可注入（单测不触 process.env，同 isAscendToolsEnabled 约定）。
 *   - shouldNudgeForSnips：deps rewire 到 engine 面（isSnipBoundaryMessage /
 *     isCompactBoundaryMessage / estimateMessageTokens），零 tui 依赖。
 *     token 估算换 engine estimateMessageTokens（chars/4 · 4/3 padding，较旧
 *     roughTokenCountEstimationForMessages 略保守偏高）→ nudge 为软节奏提示
 *     （context_efficiency attachment），非正确性路径，近似等价可接受。
 * LLM-bound 体（snipCompact / buildSnipCompact / snipCompactIfNeeded）= D-2a
 * S6 簇（依赖 rich compact helpers），本文件仅门控 + 节奏两纯函数面。
 */
import type { Message } from '../../shared'
import { isSnipBoundaryMessage, SNIP_NUDGE_TEXT } from './snipProjection'
// 边界谓词单源 = session/predicates.ts（旧 messages.ts L4596 逐字；
// engine 域内跨子域引 facade 先例 tasks.ts / query/loop.ts）
import { isCompactBoundaryMessage } from '../session'
import { estimateMessageTokens } from './microCompact'

/** Token-growth interval (tokens) between context-efficiency nudges（旧仓常量）。 */
const SNIP_NUDGE_TOKEN_INTERVAL = 10_000

/**
 * Is the snip runtime enabled?（旧仓 isSnipRuntimeEnabled 语义，env kill-switch 化）。
 * 须与 SnipTool 运行时门控口径一致：DISABLE 强制关 > kill-switch 关 > 缺省开。
 */
export function isSnipRuntimeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ATLAS_DISABLE_SNIP === 'true') {
    return false
  }
  // 旧 feature('HISTORY_SNIP') ON_BY_DEFAULT → env kill-switch（FEATURE_* 惯例）。
  return env.FEATURE_HISTORY_SNIP !== 'false'
}

/**
 * Context-efficiency nudge 节奏（旧仓 shouldNudgeForSnips 语义）：自最近一个
 * pacing 锚点（snip marker / compact boundary / nudge meta 消息）之后增长超
 * SNIP_NUDGE_TOKEN_INTERVAL 才 nudge。无锚点 = 全量估算。
 */
export function shouldNudgeForSnips(messages: Message[]): boolean {
  let anchorIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (!msg) continue
    const isAnchor =
      isSnipBoundaryMessage(msg) ||
      isCompactBoundaryMessage(msg) ||
      (msg.type === 'user' &&
        msg.isMeta === true &&
        typeof msg.content === 'string' &&
        (msg.content as string).includes(SNIP_NUDGE_TEXT))
    if (isAnchor) {
      anchorIdx = i
      break
    }
  }
  const slice = anchorIdx >= 0 ? messages.slice(anchorIdx + 1) : messages
  return estimateMessageTokens(slice) >= SNIP_NUDGE_TOKEN_INTERVAL
}
