/**
 * Peer address parsing — kept separate from peerRegistry.ts so that
 * SendMessageTool can import parseAddress without transitively loading
 * the bridge (axios) and UDS (fs, net) modules at tool-enumeration time.
 *
 * 源 = 旧仓 a8af45b src/utils/peerAddress.ts（21L）逐字迁移（S-E2a）。
 * 消费面 = engine/tools team/collab 面（SendMessage 地址解析）+ remote 波
 * UDS 5 站点族（uds: 支真实现）。bridge:/UDS 模块本体 = remote 波（§8.66.1.6 残留守 ①）。
 */

/** Parse a URI-style address into scheme + target. */
export function parseAddress(to: string): {
  scheme: 'uds' | 'bridge' | 'other'
  target: string
} {
  if (to.startsWith('uds:')) return { scheme: 'uds', target: to.slice(4) }
  if (to.startsWith('bridge:')) return { scheme: 'bridge', target: to.slice(7) }
  // Legacy: old-code UDS senders emit bare socket paths in from=; route them
  // through the UDS branch so replies aren't silently dropped into teammate
  // routing. (No bare-session-ID fallback — bridge messaging is new enough
  // that no old senders exist, and the prefix would hijack teammate names
  // like session_manager.)
  if (to.startsWith('/')) return { scheme: 'uds', target: to }
  return { scheme: 'other', target: to }
}
