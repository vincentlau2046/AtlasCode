/**
 * AtlasWeb S0-R Code→中立投影（工单 §4.1 projection.ts；呈批书 §7.3
 * persisted-effective-conversation 显式定义 / 必改 6 Code-neutral 词汇审计）。
 *
 * 输入 = loadTranscriptFull 的只读加载结果（经注入缝，本域零 engine 导入
 * ——§4.5 pack 加载图审计面）；输出 = contract ProjectionSchema 形
 * （text/activity 两块型，无任何内部词汇）。leaf 选取 = terminal leaf 中
 * timestamp 最新者（CLI 同域规则），链路 = 注入的 buildConversationChain
 * （CLI 同规则 load.ts 镜像，引擎适配边界做类型焊接，见 runtimeDefault.ts）；
 * compact 边界行 / session 级元数据行不投影。
 */

/** 投影消息源结构面（磁盘 JSONL 行的窄结构镜像；pack 域公开类型）。 */
export interface ProjectionSourceMessage {
  uuid: string
  parentUuid: string | null
  type: string
  timestamp?: string | null
  message?: { content?: unknown }
}

/** 注入缝：CLI 同规则链重建（load.ts buildConversationChain 镜像义务）。 */
export interface ProjectionEngineDeps {
  buildConversationChain: (
    messages: Map<string, ProjectionSourceMessage>,
    leaf: ProjectionSourceMessage,
  ) => ProjectionSourceMessage[]
}

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

export interface ProjectionLoad {
  messages: Map<string, ProjectionSourceMessage>
  leafUuids: Set<string>
}

const ACTIVITY_LABEL_MAX = 256

/** 事件/projection 序列化字节单一口径（replay 与 follow 共享，防兄弟路漂移）。 */
export function serializedProjectionBytes(p: unknown): number {
  return Buffer.byteLength(JSON.stringify(p))
}

function projectBlocks(msg: ProjectionSourceMessage): NeutralBlock[] {
  const blocks: NeutralBlock[] = []
  const content = msg.message?.content
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
 * user/assistant 祖先；增量尾读路径复用。f4 §5.7 登记：镜像同步义务，
 * 漂移守卫 = 必改5a fixture 对表 standing）。leafUuids 选 timestamp 最新者。
 */
export function computeLeafUuids(
  messages: Map<string, ProjectionSourceMessage>,
): Set<string> {
  const all = [...messages.values()]
  const parentUuids = new Set(
    all.map(m => m.parentUuid).filter((u): u is string => u !== null),
  )
  const terminals = all.filter(m => !parentUuids.has(m.uuid))
  const leafUuids = new Set<string>()
  for (const terminal of terminals) {
    const seen = new Set<string>()
    let current: ProjectionSourceMessage | undefined = terminal
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
 * terminal leaf 集中选 timestamp 最新者（并列取插入序末位），注入的
 * CLI 同规则链重建；空载入 → 空投影。
 */
export function projectConversation(
  load: ProjectionLoad,
  meta: { sessionId: string; productId: string; scopeId: string },
  engine: ProjectionEngineDeps,
): NeutralProjection {
  const { messages, leafUuids } = load

  let leaf: ProjectionSourceMessage | undefined
  for (const uuid of leafUuids) {
    const m = messages.get(uuid)
    if (!m) continue
    if (!leaf || (m.timestamp ?? '') >= (leaf.timestamp ?? '')) {
      leaf = m
    }
  }

  // CLI 同规则链重建（注入缝：load.ts buildConversationChain，见头注）
  const chain = leaf ? engine.buildConversationChain(messages, leaf) : []

  const out: NeutralProjectionMessage[] = []
  for (const m of chain) {
    if (m.type !== 'user' && m.type !== 'assistant') continue
    const blocks = projectBlocks(m)
    if (blocks.length === 0) continue
    out.push({
      id: m.uuid,
      role: m.type as 'user' | 'assistant',
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
