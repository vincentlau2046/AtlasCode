/**
 * Ascend CANN 工具输出折叠工具集。
 *
 * 编码 CANN 工具链（bisheng/msprof）的输出格式域知识：
 * - stderr 中的 error/fatal 行是诊断关键（编译器错误、链接失败、运行时异常）
 * - stdout 多为进度 spam（编译阶段日志、调试器初始化），保留头部即可
 *
 * 被 CompilerBridge / GoldenTest / RealHWBridge 的 foldResult() 调用，
 * 在工具结果超 FOLD_THRESHOLD 时提取关键信息为紧凑摘要，
 * 全量输出由框架持久化到磁盘供模型 Read 回。
 */

/**
 * 从 stderr 提取错误行。
 * 匹配 error/fatal/failed/cannot/undefined reference/not found/exception
 * （大小写不敏感——CANN 工具链输出格式不统一）。
 * 最多提取 max 行，避免极端情况下摘要本身过大。
 */
export function extractErrorLines(stderr: string, max = 10): string[] {
  const patterns = /error|fatal|failed|cannot|undefined reference|not found|exception/i
  return stderr.split('\n').filter(l => patterns.test(l)).slice(0, max)
}

/**
 * 截断 stdout 到前 max 字符。
 * stdout 通常是进度日志（编译阶段、调试器初始化），保留头部足以辨识流程。
 */
export function truncateStdout(stdout: string, max = 200): string {
  if (stdout.length <= max) return stdout
  return stdout.slice(0, max) + '...[truncated]'
}

/**
 * 构建折叠摘要的 header 行。
 * 统一格式："<toolLabel>: <status> (exit <code>, <duration>ms[, mock])"
 * success=undefined 时（RealHW 无 success 字段）用 exit code 表示状态。
 */
export function foldHeader(
  toolLabel: string,
  success: boolean | undefined,
  exitCode: number | null,
  durationMs: number,
  mocked: boolean,
): string {
  const status = success === undefined
    ? `exit ${exitCode}`
    : success ? 'SUCCESS' : 'FAILED'
  return `${toolLabel}: ${status} (exit ${exitCode ?? '?'}, ${durationMs}ms${mocked ? ', mock' : ''})`
}
