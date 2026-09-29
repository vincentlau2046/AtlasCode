/**
 * UNC 路径检测（跨域纯叶子，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）: src/utils/shell/readOnlyCommandValidation.ts —
 * containsVulnerableUncPath。permissions 域（hasSuspiciousWindowsPathPattern /
 * getPathsForPermissionCheck 早退）+ shell 只读命令校验共线，跨域纯叶子 →
 * shared 下沉。仅 Windows 平台判定（POSIX 目标恒 false，判形保留）。
 */
import { getPlatform } from './platform'

/**
 * 检测可能泄露凭据的 UNC 路径（\\server\share 等网络资源访问）。
 * 非 Windows 平台恒 false（UNC 语义 Windows/NTFS 特有）。
 */
export function containsVulnerableUncPath(pathOrCommand: string): boolean {
  if (getPlatform() !== 'windows') {
    return false
  }

  // 1. 反斜杠 UNC：\\server、\\server\share、\\server@port\share
  //    [^\s\\/]+ 捕 Unicode 同形字等非 ASCII 主机名；结尾容 \ 与 / 双分隔符
  const backslashUncPattern = /\\\\[^\s\\/]+(?:@(?:\d+|ssl))?(?:[\\/]|$|\s)/i
  if (backslashUncPattern.test(pathOrCommand)) {
    return true
  }

  // 2. 正斜杠 UNC：//server、//server/share、//192.168.1.1/share
  //    (?<!:) 排除 URL（https:// 等），捕引号/=/其它非冒号字符前的 //
  const forwardSlashUncPattern =
// eslint-disable-next-line custom-rules/no-lookbehind-regex -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（lookbehind 正则改写=行为面，W-opt 波再议）
    /(?<!:)\/\/[^\s\\/]+(?:@(?:\d+|ssl))?(?:[\\/]|$|\s)/i
  if (forwardSlashUncPattern.test(pathOrCommand)) {
    return true
  }

  // 3. 混合分隔符（正斜杠 + 反斜杠）：bash 下 /\ 转义为 /\，即 //
  const mixedSlashUncPattern = /\/\\{2,}[^\s\\/]/
  if (mixedSlashUncPattern.test(pathOrCommand)) {
    return true
  }

  // 4. 反向混合（反斜杠 + 正斜杠）：\\\server bash 转义为 \/server
  const reverseMixedSlashUncPattern = /\\{2,}\/[^\s\\/]/
  if (reverseMixedSlashUncPattern.test(pathOrCommand)) {
    return true
  }

  // 5. WebDAV SSL/端口标记：\\server@SSL@8443、\\server@8443@SSL
  if (/@SSL@\d+/i.test(pathOrCommand) || /@\d+@SSL/i.test(pathOrCommand)) {
    return true
  }

  // 6. DavWWWRoot 标记（Windows WebDAV redirector）
  if (/DavWWWRoot/i.test(pathOrCommand)) {
    return true
  }

  // 7. IPv4 UNC（纵深防御显式检查）：\\192.168.1.1\share、//10.0.0.1\path
  if (
    /^\\\\(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\\/]/.test(pathOrCommand) ||
    /^\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[\\/]/.test(pathOrCommand)
  ) {
    return true
  }

  // 8. 方括号 IPv6 UNC：\\[2001:db8::1]\share、\\[::1]\path
  if (
    /^\\\\(\[[\da-fA-F:]+\])[\\/]/.test(pathOrCommand) ||
    /^\/\/(\[[\da-fA-F:]+\])[\\/]/.test(pathOrCommand)
  ) {
    return true
  }

  return false
}
