/**
 * remote 域 — REPL bridge handle + 跨 session 消息面（remote 波 S-E2a，
 * §8.68 R1③）。
 *
 * 旧仓来源（a8af45b）：
 *  - bridge/replBridgeHandle.ts 36L（全局 handle 指针 set/get；旧 set 站点
 *    updateSessionBridgeId 副作用〔session 记录 publish bridge-id + .catch
 *    吞面，concurrentSessions 域〕→ 裁登记：session 记录面 = CLI 波 / 域外，
 *    新 set 面 = 纯指针 set）
 *  - bootstrap/state.ts:203 isReplBridgeActive = **旧仓自身 any stub**
 *    （`(() => ({})) as any` → 返回 {} truthy）→ 新 boolean stub = true
 *    （truthy 等价：旧 call 站 `!isReplBridgeActive()` 拒绝支在旧 stub 态
 *    恒不触发，行为面逐字；真实现 = bridge/CLI 波）
 *  - bridge/peerSessions.ts 1L postInterClaudeMessage = **旧仓自身 any
 *    stub** → 新落面 = stub（返回 {} = 无 ok/error 字段，旧 call 支
 *    `result.ok` 假值 → 失败面 'unknown' 逐字；真实现 = bridge/CLI 波）
 * ReplBridgeHandle 型 = 旧 replBridge.ts 2343L 域外 → 本地最小型面（新仓
 * 消费面仅需 bridgeSessionId 字段 + 真值判定；getSelfBridgeCompatId /
 * toCompatSessionId 面 = 新仓 0 消费点 → 裁登记）。
 *
 * 消费方 = engine/tools/team sendMessageTool（checkPermissions bridge ask
 * 站 + validate 连接检查站 + call bridge 支 handle 重查面）。
 */

/** REPL bridge handle 最小型面（旧 replBridge.ts 2343L 域外；消费面仅需
 * bridgeSessionId + 真值判定）。 */
export interface ReplBridgeHandle {
  bridgeSessionId: string
}

let handle: ReplBridgeHandle | null = null

/**
 * 设置（或清除）全局 bridge handle 指针。旧 set 副作用
 * （updateSessionBridgeId publish + .catch 吞面）裁登记（session 记录面 =
 * CLI 波 / 域外，见头注）。
 */
export function setReplBridgeHandle(h: ReplBridgeHandle | null): void {
  handle = h
}

/** 取全局 bridge handle（null = bridge 未连接）。 */
export function getReplBridgeHandle(): ReplBridgeHandle | null {
  return handle
}

/**
 * bridge 是否活跃（旧仓 bootstrap/state.ts any stub → 新 boolean stub true，
 * truthy 等价；真实现 = bridge/CLI 波，头注登记）。
 */
export function isReplBridgeActive(): boolean {
  return true
}

/**
 * 向另一 Claude session 发消息（stub 面：旧仓 any stub 逐字 = 返回 {}——
 * 旧 call 支 `result.ok` 假值 → 失败面 'unknown' 逐字；真实现 =
 * bridge/CLI 波，头注登记）。
 */
export async function postInterClaudeMessage(
  _sessionId: string,
  _message: string,
): Promise<{ ok?: boolean; error?: string }> {
  return {}
}
