/**
 * engine/tools/bash — jsonStringify 域内小文件（§8.53 S-T1；域内小工具先例 =
 * engine/session/json.ts + engine/scheduler/cronEnv.ts 各域独立承载，禁止跨域 import）。
 *
 * 旧仓 `src/utils/slowOperations.ts` jsonStringify 语义逐字（计时包裹裁）。
 * delta 登记：旧仓 replacer 重载（函数 / 数组两形）不随迁——本域唯一消费者
 *   shellQuote.ts L302 `jsonStringify(arg)` 单参（replacer 0 消费，grep 确证），
 *   窄面 2 参 `(data, space?)` 即全消费面，零行为变化。
 */
export function jsonStringify(
  data: unknown,
  space?: number,
): string {
  return JSON.stringify(data, undefined, space)
}
