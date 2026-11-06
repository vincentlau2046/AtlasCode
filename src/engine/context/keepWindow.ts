/**
 * engine/context — compaction keepRecent 切点 tool-pairing 平衡（wave0190 任务 A 层 1）。
 *
 * 缺陷基线（工单 CP-1）：compact.ts `messages.slice(-keepRecent)` 切点无配对安全保证
 * ——切点落 tool_use→tool_result 之间时保留段以孤儿 tool_result 开头（其 tool_use 的
 * assistant 被切掉）→ 投影 role:'tool' 直通 wire → OpenAI 兼容端 400 形。
 *
 * 语义（锁面批注 §5.4，上游 2.1.88 grouping.ts:5-50 对齐）：**assistant API 回合边界
 * 回退，扩大语义不收缩**——切点回退扩至保留段首个孤儿 tool_result 所属回合的
 * assistant 消息（整组并入；并行多 tool_call / 多 tool_result 分离消息 / 夹内容消息
 * 随回合整组天然覆盖，消息级不块级）。AtlasCode 一 API 回合 = 一 assistant 消息形
 * （每轮新 assistant 消息），assistant 消息索引即回合边界——配对判定不依赖 message.id，
 * 直接按「窗内 tool_result 的 tool_use_id 是否全部有窗内 assistant 前驱」自含判定。
 *
 * 分层（上游选择时/防御时互补）：
 *  - 层 1（本文件，选择时）：保良好输入——合法对话切点零回退零扰动；全畸形输入
 *    （孤儿 tool_use 无处可寻）回落全量压缩（row F 预注册形）——选择层不主动保留
 *    畸形（持久层 resume relink 面不被污染）；
 *  - 层 2（params.ts 出口，API 时）：兜变换过程中产生的孤儿（resume/截断畸形直进
 *    层 2 而非层 1 的输入面）——出口防御剥除并留痕。
 *
 * 硬约束：keepRecent<=0 无切点即无平衡面（恒等 undefined）；回退发生须由调用方留痕
 * （logForDebugging，禁静默——审计 3b 回退距离登记纪律）。
 */
import type { Message } from '../../shared'

export interface PairedKeepWindow {
  /** 平衡后的保留窗口；keepRecent<=0 → undefined（全量压缩既有语义）。 */
  window: Message[] | undefined
  /** 回退发生时的原切点（messages.slice 起点）；未回退 = undefined。 */
  revertedFrom: number | undefined
  /**
   * 全畸形回落（锁面 §5.5 row F 预注册形，f4 2026-11-06 裁定）：回退扩至序列头
   * 仍有孤儿 tool_result（tool_use 全序列无处可寻）→ 放弃 keepRecent 路径，
   * window=undefined = messagesToKeep=undefined 全量压缩（既有合法回落语义）。
   * 理由：①预注册纪律（实现不得偏离预注册形）；②window=full 保留全量 raw 抵消
   * 压缩目的；③选择层主动保留畸形会污染持久层（resume relink 面）——层 2 只兜
   * 变换过程中产生的孤儿，不兜选择层的主动保留。调用方留痕（禁静默）。
   */
  fellBackToFull?: boolean
}

/** 收集消息序列内全部 tool_use id（assistant content 块扫描；tool_use 按 API 契约只在 assistant 消息出现）。 */
function collectToolUseIds(messages: Message[]): Set<string> {
  const ids = new Set<string>()
  for (const m of messages) {
    if (m.type !== 'assistant') continue
    const content = (m.message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) continue
    for (const b of content as Array<{ type?: string; id?: string }>) {
      if (b.type === 'tool_use' && typeof b.id === 'string') ids.add(b.id)
    }
  }
  return ids
}

/** 窗口内是否存在孤儿 tool_result（tool_use_id 无窗内 assistant 前驱）。 */
function hasOrphanToolResult(window: Message[]): boolean {
  const ids = collectToolUseIds(window)
  for (const m of window) {
    if (m.type !== 'user') continue
    const content = (m.message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) continue
    for (const b of content as Array<{ type?: string; tool_use_id?: string }>) {
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string' && !ids.has(b.tool_use_id)) {
        return true
      }
    }
  }
  return false
}

/**
 * keepRecent 切点配对平衡（纯函数，层 1）。
 *
 * 基线切点照旧 `slice(-keepRecent)`；随后回退检查——窗口含孤儿 tool_result 时切点
 * 逐消息回退（扩大）直至配对平衡或达序列头。达序列头仍有孤儿 = 全畸形输入（孤儿
 * tool_use 无处可寻）→ 放弃 keepRecent 路径回落 messagesToKeep=undefined 全量压缩
 * （锁面 §5.5 row F 预注册形，f4 2026-11-06 裁定：window=full 抵消压缩目的 + 选择层
 * 不主动保留畸形；层 2 只兜变换过程中产生的孤儿）。fellBackToFull=true 供调用方留痕。
 * 保留段在扩大语义下永不为空（长度 ≥ keepRecent ≥ 1），工单 §4「空段回落全量压缩」
 * 分支在本实现形下不可达（防御性注释，勿当遗漏重提）。
 */
export function resolvePairedKeepWindow(
  messages: Message[],
  keepRecent: number,
): PairedKeepWindow {
  if (keepRecent <= 0 || messages.length === 0) {
    return { window: undefined, revertedFrom: undefined }
  }
  let start = Math.max(0, messages.length - keepRecent)
  const originalStart = start
  // 逐消息回退扩大直至配对平衡；达序列头仍有孤儿 = 全畸形（row F）→ 回落全量压缩。
  while (hasOrphanToolResult(messages.slice(start)) && start > 0) {
    start--
  }
  if (start === 0 && hasOrphanToolResult(messages)) {
    // 全畸形：孤儿 tool_use 全序列无处可寻 → 不硬造合法边也不原样保留（预注册形
    // = 全量压缩）；revertedFrom 保持 undefined（调用方经 fellBackToFull 留痕）。
    return { window: undefined, revertedFrom: undefined, fellBackToFull: true }
  }
  return {
    window: messages.slice(start),
    revertedFrom: start !== originalStart ? originalStart : undefined,
  }
}
