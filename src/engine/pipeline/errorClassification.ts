/**
 * engine/pipeline — 错误分类小件（§8.21 E-1 窄 spine T-2，旧仓 toolExecution 移植）
 *
 * 把工具执行异常分类成可安全落日志/回给模型的字符串。
 * 旧仓完整 classifyToolError 额外识别 TelemetrySafeError（.telemetryMessage）与
 * 已知错误类型白名单——本版只锁 errno.code / 稳定 .name / 兜底三级真核心，
 * TelemetrySafeError 分支归 E-1b（遥测安全错误类型随遥测面回填）。
 *
 * 残留守头注释：TelemetrySafeError 识别（E-1b）/ 已知错误类型白名单（E-1b）。
 */
export function classifyToolError(error: unknown): string {
  if (error instanceof Error) {
    // Node.js 文件系统错误带稳定 `code`（ENOENT / EACCES …），比构造器名有用得多。
    const errnoCode = (error as NodeJS.ErrnoException).code
    if (typeof errnoCode === 'string') {
      return `Error:${errnoCode}`
    }
    // ShellError / ImageSizeError 等在构造器里设了稳定 .name（抗压缩），优先用它。
    if (error.name && error.name !== 'Error' && error.name.length > 3) {
      return error.name.slice(0, 60)
    }
    return 'Error'
  }
  return 'UnknownError'
}
