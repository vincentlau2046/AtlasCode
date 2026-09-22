/**
 * 路径纯叶子（跨域，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）:
 *   - expandPath / containsPathTraversal ← src/utils/path.ts
 *   - sanitizePath / MAX_SANITIZED_LENGTH ← src/utils/sessionStoragePortable.ts
 * permissions 域（getProjectTempDir / pathInWorkingPath / isAtlasSettingsPath
 * / isDangerousFilePathToAutoEdit）+ task 域（diskOutput sanitizePath）共线，
 * 跨 ≥2 域纯叶子 → shared 下沉。
 *
 * 裁剪裁定（薄骨架，复审勿当遗漏重提）：
 * ① expandPath 签名加必填 baseDir 参（旧仓 baseDir? 缺省 getCwd()）：shared
 *   为底层叶子，不得 reach 上 bootstrap 状态——cwd 由消费域经注入窗口传入。
 * ② Windows POSIX→Windows 路径转换（posixPathToWindowsPath）不随迁（国内目标
 *   POSIX，Windows 路径归 engine 波）；expandPath 的 windows 分支保留判形不转换。
 * ③ sanitizePath 长路径哈希：Bun.hash 优先，Node 兜底 djb2（shared/hash.ts 单一事实源）。
 */
import { homedir } from 'os'
import { isAbsolute, resolve } from 'path'
import { getPlatform } from './platform'
import { djb2Hash } from './hash'

/**
 * 展开可能含 tilde（~）记法的路径为绝对路径。
 * 恒返回当前平台原生格式。
 *
 * @param path - 待展开路径（~/、~、绝对、相对）
 * @param baseDir - 相对路径解析基准（调用域注入的 cwd；shared 叶子不隐式取 cwd）
 *
 * @throws 路径含 null 字节或参数类型非法
 */
export function expandPath(path: string, baseDir: string): string {
  if (typeof path !== 'string') {
    throw new TypeError(`Path must be a string, received ${typeof path}`)
  }
  if (typeof baseDir !== 'string') {
    throw new TypeError(
      `Base directory must be a string, received ${typeof baseDir}`,
    )
  }
  if (path.includes('\0') || baseDir.includes('\0')) {
    throw new Error('Path contains null bytes')
  }

  const trimmedPath = path.trim()
  if (!trimmedPath) {
    return resolve(baseDir).normalize('NFC')
  }

  if (trimmedPath === '~') {
    return homedir().normalize('NFC')
  }

  if (trimmedPath.startsWith('~/')) {
    return resolve(homedir(), trimmedPath.slice(2)).normalize('NFC')
  }

  // Windows 分支保留判形（POSIX 目标不转换，posixPathToWindowsPath 归 engine）
  const processedPath = trimmedPath

  if (isAbsolute(processedPath)) {
    return resolve(processedPath).normalize('NFC')
  }

  return resolve(baseDir, processedPath).normalize('NFC')
}

/**
 * 检查路径是否含目录穿越模式（上跳父目录）。
 *
 * @returns 含 `../`、`..\` 或以 `..` 结尾时为 true
 */
export function containsPathTraversal(path: string): boolean {
  return /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)
}

export const MAX_SANITIZED_LENGTH = 200

/**
 * Node 兜底哈希（Bun.hash 不可用时）——djb2 有符号 32 位取绝对值 base36。
 */
function simpleHash(str: string): string {
  return Math.abs(djb2Hash(str)).toString(36)
}

/**
 * 把字符串转成安全的目录/文件名：非字母数字替换为连字符。
 * 超长（> MAX_SANITIZED_LENGTH）截断 + 追加哈希后缀保唯一。
 */
export function sanitizePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  const hash =
    typeof Bun !== 'undefined' ? Bun.hash(name).toString(36) : simpleHash(name)
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`
}
