/**
 * debug 日志 — modelprovider 域最小副本
 *
 * 旧仓 utils/debug.ts 是重图（bufferedWriter/cleanupRegistry/fsOperations/process/...），
 * modelprovider 仅消费 logForDebugging（debug 模式外 = no-op）。
 * 域内保留 no-op stub（C 波 logging port 统一后替换）。
 */

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

/** No-op — debug 日志在 C 波 logging port 落地前不输出（测试无噪声）。 */
export function logForDebugging(
  _message: string,
  _options?: { level: DebugLogLevel },
): void {
  // C 波：经 logging port 注入（charter C-4：本期不加第 9 port，shared 开 I/O 叶子例外）
}
