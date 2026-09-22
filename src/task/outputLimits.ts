/**
 * task 域 — 输出长度上限（旧仓 utils/shell/outputLimits.ts 12L 随迁，
 * C-Deep 切片 3 T2）
 *
 * 旧仓位于 shell/（executor 侧文件），但新仓切片 1 已裁定
 * （src/executor/shell/ShellCommand.ts 头注 16）："StreamWrapper 不做
 * maxOutputLength 截断（outputLimits 归 task 域策略）"——截断消费者是
 * TaskOutput.#readStdoutFromFile（getStdout 读文件前 N 字节），归 task 域。
 * env 语义单一事实源 = shared parseBoundedIntEnv（C1b 裁定，旧仓
 * validateBoundedIntEnvVar 已整删）。
 */
import { parseBoundedIntEnv } from '../shared'

export const BASH_MAX_OUTPUT_UPPER_LIMIT = 150_000
export const BASH_MAX_OUTPUT_DEFAULT = 30_000

export function getMaxOutputLength(): number {
  const result = parseBoundedIntEnv(
    'BASH_MAX_OUTPUT_LENGTH',
    process.env.BASH_MAX_OUTPUT_LENGTH,
    BASH_MAX_OUTPUT_DEFAULT,
    BASH_MAX_OUTPUT_UPPER_LIMIT,
  )
  return result.effective
}
