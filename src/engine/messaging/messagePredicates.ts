/**
 * messaging 域 — 消息谓词面（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/messagePredicates.ts 8L 随迁。
 *
 * 类型面 delta 登记（H6，复审勿当遗漏重提）：
 *   - 旧 `m is UserMessage`（types/message.ts 联合成员守卫）→ 新
 *     `m is Message & { type: 'user' }`：域 Message 非联合（session 域宽
 *     接口，见 session/types.ts），守卫收窄 type 字段面；判定体
 *     `type==='user' && !isMeta && toolUseResult===undefined` 逐字。
 *   - session Message 补 `toolUseResult?: unknown` 可选字段（session/types.ts
 *     登记，旧 UserMessage.toolUseResult UI-native tool Out 面）。
 */
import type { Message } from '../session'

// tool_result messages share type:'user' with human turns; the discriminant
// is the optional toolUseResult field. Four PRs (#23977, #24016, #24022,
// #24025) independently fixed miscounts from checking type==='user' alone.
export function isHumanTurn(m: Message): m is Message & { type: 'user' } {
  return m.type === 'user' && !m.isMeta && m.toolUseResult === undefined
}
