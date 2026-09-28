/**
 * remote 域 — UDS socket 客户端面（remote 波 S-E2a，§8.68 R1③）。
 *
 * 旧仓来源（a8af45b）：src/utils/udsClient.ts 3L — **旧仓自身 any stub**（真
 * socket 实现旧仓不在；H6：绝不把 stub 签名当真行为）：
 *   export const sendToUdsSocket : any = (() => ({})) as any
 * 新仓落面 = stub 语义逐字（no-op resolve）+ 真型面（旧 any → 新
 * (socketPath, message) => Promise<void>，call 支消费形）。真实现 = 新旧仓
 * 均 0-hit（非裁面漂移，复审勿当遗漏重提）。
 *
 * 消费方 = engine/tools/team sendMessageTool call uds 支（旧 lazy
 * require('../../utils/udsClient.js') → 新静态 import ESM 化）。
 */

/** UDS socket 发送（stub 面：no-op resolve，旧仓 any stub 逐字）。 */
export async function sendToUdsSocket(
  _socketPath: string,
  _message: string,
): Promise<void> {}
