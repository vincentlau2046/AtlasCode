/**
 * AtlasWeb S0-R Code→中立投影（工单 §4.1 projection.ts；呈批书 §7.3
 * persisted-effective-conversation 显式定义 / 必改 6 Code-neutral 词汇审计）。
 *
 * 输入 = loadTranscriptFull 的只读加载结果（engine/session 门面族，零全局
 * 槽）；输出 = contract ProjectionSchema 形（text/activity 两块型，无任何
 * 内部词汇）。leaf 选取 = terminal leaf 中 timestamp 最新者（CLI 同域
 * 规则），链路 parentUuid 回溯；compact 边界行 / session 级元数据行不投影。
 */

import {
  buildConversationChain,
  type TranscriptMessage,
  type ReadonlyTranscriptLoad,
} from 'src/engine'

/** 投影块（contract BlockSchema 子面；label ≤256 / text 无界走 resourceLimit）。 */
export type NeutralBlock =
  | { kind: 'text'; text: string }
  | { kind: 'activity'; label: string; status?: string }

export interface NeutralProjectionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  createdAt: string | null
  blocks: NeutralBlock[]
}

export interface NeutralProjection {
  sessionId: string
  productId: string
  scopeId: string
  semantics: 'persisted-effective-conversation'
  messages: NeutralProjectionMessage[]
  truncated: false
}

const ACTIVITY_LABEL_MAX = 256

function projectBlocks(msg: TranscriptMessage): NeutralBlock[] {
  const blocks: NeutralBlock[] = []
  const content = (msg as { message?: { content?: unknown } }).message?.content
  const pushText = (text: unknown): void => {
    if (typeof text === 'string' && text.length > 0) {
      blocks.push({ kind: 'text', text })
    }
  }
  if (typeof content === 'string') {
    pushText(content)
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      if (rec.type === 'text') {
        pushText(rec.text)
      } else if (rec.type === 'tool_use') {
        const name = typeof rec.name === 'string' ? rec.name : 'activity'
        const label =
          name.length > ACTIVITY_LABEL_MAX
            ? name.slice(0, ACTIVITY_LABEL_MAX)
            : name
        blocks.push({ kind: 'activity', label })
      }
      // 其余 item 型（tool_result 等）不投影——中立契约只携 text/activity
    }
  }
  return blocks
}

/**
 * terminal leaf 集计算（load.ts:1187-1226 同规则镜像：terminal → 最近
 * user/assistant 祖先；增量尾读路径复用）。leafUuids 选 timestamp 最新者。
 */
export function computeLeafUuids(
  messages: Map<string, TranscriptMessage>,
): Set<string> {
  const all = [...messages.values()]
  const parentUuids = new Set(
    all.map(m => m.parentUuid).filter((u): u is string => u !== null),
  )
  const terminals = all.filter(m => !parentUuids.has(m.uuid))
  const leafUuids = new Set<string>()
  for (const terminal of terminals) {
    const seen = new Set<string>()
    let current: TranscriptMessage | undefined = terminal
    while (current) {
      if (seen.has(current.uuid)) break
      seen.add(current.uuid)
      if (current.type === 'user' || current.type === 'assistant') {
        leafUuids.add(current.uuid)
        break
      }
      current = current.parentUuid ? messages.get(current.parentUuid) : undefined
    }
  }
  return leafUuids
}

/**
 * terminal leaf 集中选 timestamp 最新者（并列取插入序末位），CLI 同规则
 * 链重建；空载入 → 空投影。
 */
export function projectConversation(
  load: Pick<ReadonlyTranscriptLoad, 'messages' | 'leafUuids'>,
  meta: { sessionId: string; productId: string; scopeId: string },
): NeutralProjection {
  const { messages, leafUuids } = load

  let leaf: TranscriptMessage | undefined
  for (const uuid of leafUuids) {
    const m = messages.get(uuid)
    if (!m) continue
    if (!leaf || (m.timestamp ?? '') >= (leaf.timestamp ?? '')) {
      leaf = m
    }
  }

  // CLI 同规则链重建（load.ts buildConversationChain：root→leaf）
  const chain = leaf ? buildConversationChain(messages, leaf) : []

  const out: NeutralProjectionMessage[] = []
  for (const m of chain) {
    if (m.type !== 'user' && m.type !== 'assistant') continue
    const blocks = projectBlocks(m)
    if (blocks.length === 0) continue
    out.push({
      id: m.uuid,
      role: m.type,
      createdAt: m.timestamp ?? null,
      blocks,
    })
  }

  return {
    sessionId: meta.sessionId,
    productId: meta.productId,
    scopeId: meta.scopeId,
    semantics: 'persisted-effective-conversation',
    messages: out,
    truncated: false,
  }
}
