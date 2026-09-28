/**
 * remote 域唯一公共出口（STR-1 门面规则；§8.68 remote 波 S-E2a）。
 *
 * 域 = UDS inbox / REPL bridge 面（旧仓 UDS 5 站点族基础设施：门 + socket
 * 客户端 + messaging 启动 + bridge handle + 跨 session 消息 + 地址 parser
 * 消费窗）。外部模块只许经本 index 引入（entry-point lint 拦截）。消费方：
 *   - engine/tools/team（SendMessageTool 5 站点族）：isUdsInboxEnabled 门 +
 *     parseAddress（re-export 单一事实源）+ getReplBridgeHandle /
 *     isReplBridgeActive / postInterClaudeMessage / sendToUdsSocket（call
 *     2 支 + checkPermissions / validate 面）
 *   - CLI 波（域外登记）：startUdsMessaging setup 面
 *
 * L3 注：parseAddress re-export 单一事实源 = swarm 门面（peerAddress.ts
 * C 桶 ③ 逐字 21L，经 swarm/index.ts 门面 re-export，STR-1 合规）；
 * engine 侧只经本门面引入，engine↛swarm L3 隔离保持。
 */
export { parseAddress } from '../swarm'
export { isUdsInboxEnabled } from './udsInboxEnabled'
export { sendToUdsSocket } from './udsClient'
export { startUdsMessaging } from './udsMessaging'
export {
  setReplBridgeHandle,
  getReplBridgeHandle,
  isReplBridgeActive,
  postInterClaudeMessage,
} from './peerBridge'
export type { ReplBridgeHandle } from './peerBridge'
