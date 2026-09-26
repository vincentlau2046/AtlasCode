/**
 * engine/tools/files — 域内 UserMessage 最小形（§8.55 S-C5，高频族纵切
 * 子波 3）。
 *
 * 旧仓来源（a8af45b）：src/utils/messages.ts createUserMessage（L471-536）
 * 消费子集移植 — Read 工具 newMessages 面仅消费 content / isMeta / uuid /
 * timestamp / message.role 五面（3 调用点：image 元数据文本【D-3 接缝后
 * 死】/ PDF 页面 image 块【D-3 接缝后死】/ PDF document 块【活】）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① S-E3 M-1 不变量（旧 messages.ts:525-526）：uuid 恒戳（randomUUID；
 *    旧 crypto UUID 品牌串 → string，新仓无品牌，session/types 残余 ② 口径）
 *    + timestamp ISO（new Date().toISOString()）+ isMeta 面 — 逐字保留。
 *  ② 旧全 UserMessage 面（toolUseResult / mcpMeta / imagePasteIds /
 *    sourceToolAssistantUUID / permissionMode / summarizeMetadata /
 *    isVisibleInTranscriptOnly / isVirtual / isCompactSummary / origin）
 *    = session/messaging 域残留守（D 波/TUI 波），不移植；本域内最小形
 *    = Read 工具 newMessages 面单一事实源。
 *  ③ content 型：旧 string | ContentBlockParam[]（API 块面）→ 新
 *    string | unknown[] 宽骨架（ContentBlockParam = wire 面，D 波单一
 *    事实源；Read 消费点结构逐字保留，消费方按块面 cast）。
 *  ④ 旧 NO_CONTENT_MESSAGE 空 content 兜底（`content || NO_CONTENT_MESSAGE`）
 *    裁：Read 3 调用点 content 恒具体（image 元数据文本 / image 块数组 /
 *    document 块数组），无空 content 路径。
 */
import { randomUUID } from 'crypto'

/** 域内 UserMessage 最小形（旧 UserMessage 消费子集，delta ①/②）。 */
export interface InDomainUserMessage {
  type: 'user'
  uuid: string
  timestamp: string
  isMeta?: boolean
  message: {
    role: 'user'
    content: string | unknown[]
  }
}

export function createUserMessage(input: {
  content: string | unknown[]
  isMeta?: true
}): InDomainUserMessage {
  return {
    type: 'user',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    isMeta: input.isMeta,
    message: {
      role: 'user',
      content: input.content,
    },
  }
}
