/**
 * 平台探测（跨域纯叶子，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）: src/utils/platform.ts — getPlatform 单一事实源。
 * shared/tempDir（getAtlasTempDirName）+ permissions 域（getAtlasTempDir /
 * hasSuspiciousWindowsPathPattern / containsVulnerableUncPath）+
 * sandbox 域共线消费，跨 ≥2 域 → shared 下沉。
 *
 * 裁剪注：旧仓 memoize 引 lodash-es；新仓沿用 sandbox 域先例——本地闭包
 * 缓存 memoizeNoArg（无新 npm 依赖）。
 */
import { getFsImplementation } from './fs-operations'
import { logForDebugging } from './debug'

export type Platform = 'macos' | 'windows' | 'wsl' | 'linux' | 'unknown'

/** 国内目标支持的宿主平台（wsl 归 Linux 族）。 */
export const SUPPORTED_PLATFORMS: Platform[] = ['macos', 'wsl']

/** 本地无参 memoize（lodash-es/memoize.js 等价，单值缓存）。 */
function memoizeNoArg<T>(fn: () => T): () => T {
  let cached: T | null = null
  let computed = false
  return () => {
    if (!computed) {
      cached = fn()
      computed = true
    }
    return cached!
  }
}

/**
 * 探测宿主平台（模块级 memoize——平台一次定形）。
 * linux 下再读 /proc/version 判 WSL（Microsoft 标记），判不出回落 linux。
 */
export const getPlatform = memoizeNoArg((): Platform => {
  try {
    if (process.platform === 'darwin') {
      return 'macos'
    }

    if (process.platform === 'win32') {
      return 'windows'
    }

    if (process.platform === 'linux') {
      // 检查是否跑在 WSL（Windows Subsystem for Linux）
      try {
        const procVersion = getFsImplementation().readFileSync(
          '/proc/version',
          { encoding: 'utf8' },
        )
        if (
          procVersion.toLowerCase().includes('microsoft') ||
          procVersion.toLowerCase().includes('wsl')
        ) {
          return 'wsl'
        }
      } catch (error) {
        // 读 /proc/version 失败，当普通 Linux
        logForDebugging(String(error))
      }

      return 'linux'
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
})
