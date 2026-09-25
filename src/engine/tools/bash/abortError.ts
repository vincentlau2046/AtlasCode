/**
 * engine/tools/bash — AbortError（§8.53 S-T2b，旧仓 src/utils/errors.ts:12-16
 * 逐字随迁）。
 *
 * bashPermissions 3 个 throw 点（L1771/L1800/L2250 旧行号）+ 1 个
 * instanceof 判别点（classifier API 拒绝面，与 APIUserAbortError 并判）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓 AbortError 为全仓 utils/errors.ts 共享类；新仓未整体随迁 utils/
 *    errors 面（F4 先例：native abort 面 = DOMException name 判别，见
 *    permissions/ruleMatching isAbortShapedError 头注）→ 本域按首消费者
 *    落本地模块（bash 面 4 消费点），他域未来消费再上提。
 *  - 类名恒 'AbortError'（显式 name 赋值逐字保留）→ 与 isAbortShapedError
 *    的 `e.name === 'AbortError'` 形判别天然兼容。
 */

export class AbortError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'AbortError'
  }
}
