/**
 * session 域 — 会话去重 Set 缓存（R7 单一事实源）。
 *
 * S0-R2 必改钉①（lock-face @25cb7454 §3-3，f4 批复工单 §7 @351c74c4）：
 * 自 load.ts 整体迁移 `_sessionMessagesCache` Map + 四函数（getSessionMessages /
 * clearSessionMessagesCache / primeSessionMessages / hasSessionMessagesCache）
 * 及其唯一缓存读取辅助 doesMessageExistInSession——**零行为变化**（Map 实例
 * 搬家，四接缝共享同一实例的 R7 语义不变）。
 *
 * 迁移动机 = 机制面直断言：web 只读载体（./web-session-runtime 出口）的加载
 * 图 entry→runtimeDefault→readonly→load **零引用本模块** → 模块级可变缓存对
 * 载体结构性缺席（格 5 双实例零串扰由构造保证，bundle 文本唯一符号断言在
 * e2e gate 判据件）。CLI 车道经 session/index.ts 与 engine 门面 re-export 面
 * 消费，导入面零变。
 */

import { loadSessionFile } from './load'

/**
 * Gets message UUIDs for a specific session without loading all sessions.
 * Memoized to avoid re-reading the same session file multiple times.
 * （旧 lodash memoize(Promise) → 域本地 Map 缓存 in-flight Promise，语义
 * 逐字：并发调用共享同一 load；clearSessionMessagesCache = Map.clear。）
 */
const _sessionMessagesCache = new Map<string, Promise<Set<string>>>()

export function getSessionMessages(sessionId: string): Promise<Set<string>> {
  let cached = _sessionMessagesCache.get(sessionId)
  if (!cached) {
    cached = (async () => {
      const { messages } = await loadSessionFile(sessionId)
      return new Set(messages.keys())
    })()
    _sessionMessagesCache.set(sessionId, cached)
  }
  return cached
}

/**
 * Clear the memoized session messages cache.
 * Call after compaction when old message UUIDs are no longer valid.
 * R7（jsonl 双写收敛）：本缓存是会话去重 Set 的**单一事实源**（TUI
 * sessionStorage 的旧本地 memoize 实例已裁，改经 engine 门面委托本缓存——
 * 两写者四接缝共享同一 Set，docs/r3-jsonl-double-write-root-cause.md
 * 修复方向 ①）。
 */
export function clearSessionMessagesCache(): void {
  _sessionMessagesCache.clear()
}

/**
 * R7（jsonl 双写收敛）：预置会话去重 Set 缓存（--resume 挂载面性能优化：
 * getLastSessionLog 已全量读盘，预置避免 recordTranscript 二次全读，
 * 旧 tui lodash memoize `.cache.set` 逐字语义）。调用方契约：仅在缓存
 * 为空时预置（先经 hasSessionMessagesCache 判）——覆写活缓存会用陈旧
 * 盘快照丢掉未 flush 的 UUID，破坏写层 dedup。
 */
export function primeSessionMessages(
  sessionId: string,
  uuids: Set<string>,
): void {
  _sessionMessagesCache.set(sessionId, Promise.resolve(uuids))
}

/** 缓存是否已有该会话的去重 Set（R7：预置前守卫，见 primeSessionMessages 契约）。 */
export function hasSessionMessagesCache(sessionId: string): boolean {
  return _sessionMessagesCache.has(sessionId)
}

/**
 * Check if a message UUID exists in the session storage（旧 L3832 逐字；
 * 唯一缓存读取辅助，随钉①迁移同模块——载体图保持零缓存引用）。
 */
export async function doesMessageExistInSession(
  sessionId: string,
  messageUuid: string,
): Promise<boolean> {
  const messageSet = await getSessionMessages(sessionId)
  return messageSet.has(messageUuid)
}
