/**
 * engine/tools/bash — windowsPathToPosixPath（§8.53 S-T2b，旧仓
 * src/utils/windowsPaths.ts:128-142 函数体逐字随迁）。
 *
 * bashPermissions L2003 单消费点（getPlatform() === 'windows' 支 cwd 转换）。
 * bash-only 基线裁定（§8.53 跨域依赖闭包映射）：windows 面消费点存在 →
 * 域内最小实现（纯函数路径转换）+ 登记。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓 memoizeWithLRU 包裹不随迁（LRU 缓存面 = lodash 族裁剪先例；
 *    纯函数单调用点，语义零影响）
 */
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
