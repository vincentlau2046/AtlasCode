/**
 * engine/tools/bash — jsonStringify 域内小文件（§8.53 S-T1；域内小工具先例 =
 * engine/session/json.ts + engine/scheduler/cronEnv.ts 各域独立承载，禁止跨域 import）。
 *
 * 旧仓 `src/utils/slowOperations.ts` jsonStringify 语义逐字（计时包裹裁）。
 */
export function jsonStringify(
  data: unknown,
  space?: number,
): string {
  return JSON.stringify(data, undefined, space)
}
