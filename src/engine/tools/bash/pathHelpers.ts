/**
 * engine/tools/bash — getDirectoryForPath（§8.53 S-T2b，旧仓
 * src/utils/path.ts:109-125 语义随迁 · 域内最小 POSIX 基线实现）。
 *
 * pathValidation 3 消费点（blockedPath / resolvedPath 目录归一）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧仓 getDirectoryForPath 前置 expandPath（tilde/home/Windows 转换/
 *    NFC 归一/getFsImplementation 全族）不随迁 → 最小形：相对路径经
 *    bootstrap getCwd 绝对化 + UNC 前缀跳 fs 操作（NTLM 凭据泄漏守卫
 *    逐字保留）+ statSync 目录判定。调用点输入 = permissions 域
 *    validatePath 已 resolve 的绝对路径（相对输入 = 防御性兜底支）。
 *  - Windows 面 = bash-only 基线域外（§8.53 落位裁定）。
 */
import { statSync } from 'fs'
import { dirname, isAbsolute, resolve } from 'path'
import { getCwd } from '../../../bootstrap'

export function getDirectoryForPath(path: string): string {
  const absolutePath = isAbsolute(path) ? path : resolve(getCwd(), path)
  // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
  if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
    return dirname(absolutePath)
  }
  try {
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      return absolutePath
    }
  } catch {
    // Path doesn't exist or can't be accessed
  }
  // If it's not a directory or doesn't exist, return the parent directory
  return dirname(absolutePath)
}
