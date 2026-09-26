/**
 * task 域 — 任务输出格式化（§8.56 S-D2 依赖闭包层，旧仓
 * utils/task/outputFormatting.ts 38L 逐字；TaskOutput 工具消费面）。
 *
 * delta 登记：
 *  ① 旧仓 validateBoundedIntEnvVar（utils/envValidation，带 logForDebugging
 *     + message 字段）→ shared parseBoundedIntEnv（B 波 S1 纯函数先例，
 *     message 字段裁）。
 *  ② 旧仓 `parsed <= 0 → invalid 回落默认`（0/负值皆拒）→ 新 parseBoundedIntEnv
 *     缺省 min=0 会放行 0 → 传 min=1 恢复旧语义（C1 先例「timeout 类 env
 *     传 min = 1 恢复旧仓 0 无效回落默认」）。
 *  ③ getTaskOutputPath 域内 diskOutput 直取（同域 import，非跨域边）。
 */
import { parseBoundedIntEnv } from '../shared'
import { getTaskOutputPath } from './diskOutput'

export const TASK_MAX_OUTPUT_UPPER_LIMIT = 160_000
export const TASK_MAX_OUTPUT_DEFAULT = 32_000

export function getMaxTaskOutputLength(): number {
  return parseBoundedIntEnv(
    'TASK_MAX_OUTPUT_LENGTH',
    process.env.TASK_MAX_OUTPUT_LENGTH,
    TASK_MAX_OUTPUT_DEFAULT,
    TASK_MAX_OUTPUT_UPPER_LIMIT,
    1,
  ).effective
}

/**
 * Format task output for API consumption, truncating if too large.
 * When truncated, includes a header with the file path and returns
 * the last N characters that fit within the limit.
 */
export function formatTaskOutput(
  output: string,
  taskId: string,
): { content: string; wasTruncated: boolean } {
  const maxLen = getMaxTaskOutputLength()

  if (output.length <= maxLen) {
    return { content: output, wasTruncated: false }
  }

  const filePath = getTaskOutputPath(taskId)
  const header = `[Truncated. Full output: ${filePath}]\n\n`
  const availableSpace = maxLen - header.length
  const truncated = output.slice(-availableSpace)

  return { content: header + truncated, wasTruncated: true }
}
