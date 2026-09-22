/**
 * debug 日志占位（charter C-4：本期不加第 9 port，logging port 定案前保持 no-op）。
 *
 * 单一事实源（C1 统一裁定）：C-Deep 填 executor/sandbox stub 时旧仓 Shell.ts
 * 会大量 import logForDebugging——禁止每域各复制一份 no-op（B 波
 * modelprovider/debug.ts 先例已废）。logging port 定案后整文件替换为
 * port 实现（签名不变，调用点零改动）。
 */

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

/** no-op — logging port 落地前不输出（测试无噪声）。 */
export function logForDebugging(
  _message: string,
  _options?: { level: DebugLogLevel },
): void {
  // C 波：经 logging port 注入（charter C-4）
}
