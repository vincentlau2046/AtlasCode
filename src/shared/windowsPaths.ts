/**
 * shared — windowsPathToPosixPath / posixPathToWindowsPath 纯路径转换
 * （§8.55 S-C2 跨域叶子提升，C-Deep T5 / §8.55 S-C1 logError 提升先例）。
 *
 * 旧仓来源（a8af45b）：src/utils/windowsPaths.ts 两纯函数体逐字随迁
 * （UNC / 盘符 / cygdrive / MinGW /c/ 四形态 + 纯反斜杠翻转）。
 *
 * 提升理由：memory 域（memoryFileDetection 的 MinGW 形态比较）+
 * engine/tools/bash 域（bashPermissions cwd 转换）双消费，shared =
 * 唯一跨域叶子汇。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓 memoizeWithLRU(fn, key, 500) 包裹不随迁（LRU 缓存面 = lodash 族
 *    裁剪先例，同 §8.53 S-T2b bash 域内最小实现裁定；纯函数多调用点
 *    语义零影响）。
 *  - 旧仓同文件其余导出（setShellIfWindows / findGitBashPath /
 *    checkPathExists / findExecutable = Git Bash 探活族，Windows 专属
 *    shell 面）不随迁（新仓无 Windows shell 探活消费点；Bash 工具本体波
 *    归 shell·swarm 后续波，届时按需重建）。
 */

/** Convert a Windows path to a POSIX path using pure JS. */
export const windowsPathToPosixPath = (
  windowsPath: string,
): string => {
  // Handle UNC paths: \\server\share -> //server/share
  if (windowsPath.startsWith('\\\\')) {
    return windowsPath.replace(/\\/g, '/')
  }
  // Handle drive letter paths: C:\Users\foo -> /c/Users/foo
  const match = windowsPath.match(/^([A-Za-z]):[/\\]/)
  if (match) {
    const driveLetter = match[1]!.toLowerCase()
    return '/' + driveLetter + windowsPath.slice(2).replace(/\\/g, '/')
  }
  // Already POSIX or relative — just flip slashes
  return windowsPath.replace(/\\/g, '/')
}

/** Convert a POSIX path to a Windows path using pure JS. */
export const posixPathToWindowsPath = (posixPath: string): string => {
  // Handle UNC paths: //server/share -> \\server\share
  if (posixPath.startsWith('//')) {
    return posixPath.replace(/\//g, '\\')
  }
  // Handle /cygdrive/c/... format
  const cygdriveMatch = posixPath.match(/^\/cygdrive\/([A-Za-z])(\/|$)/)
  if (cygdriveMatch) {
    const driveLetter = cygdriveMatch[1]!.toUpperCase()
    const rest = posixPath.slice(('/cygdrive/' + cygdriveMatch[1]).length)
    return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\')
  }
  // Handle /c/... format (MSYS2/Git Bash)
  const driveMatch = posixPath.match(/^\/([A-Za-z])(\/|$)/)
  if (driveMatch) {
    const driveLetter = driveMatch[1]!.toUpperCase()
    const rest = posixPath.slice(2)
    return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\')
  }
  // Already Windows or relative — just flip slashes
  return posixPath.replace(/\//g, '\\')
}
