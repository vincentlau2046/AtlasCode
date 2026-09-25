/**
 * engine/tools/bash — getPlatform（§8.53 S-T2b，旧仓 src/utils/platform.ts
 * L11-40 逻辑逐字随迁）。
 *
 * bashPermissions L2003 单消费点（windows 支 cwd 路径转换门）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - lodash-es memoize → 同域 S-T1 本地 memoize（零参函数语义零差）
 *  - getFsImplementation().readFileSync → node:fs 直读（新仓无 fs 抽象层）
 *  - logError → 同域本地 log（S-T1）
 *  - SUPPORTED_PLATFORMS 常量旧仓 0 消费者不随迁（grep 核验）
 */
import { readFileSync } from 'fs'
import { logError } from './log'
import { memoize } from './memoize'

export type Platform = 'macos' | 'windows' | 'wsl' | 'linux' | 'unknown'

export const getPlatform = memoize((): Platform => {
  try {
    if (process.platform === 'darwin') {
      return 'macos'
    }

    if (process.platform === 'win32') {
      return 'windows'
    }

    if (process.platform === 'linux') {
      // Check if running in WSL (Windows Subsystem for Linux)
      try {
        const procVersion = readFileSync('/proc/version', { encoding: 'utf8' })
        if (
          procVersion.toLowerCase().includes('microsoft') ||
          procVersion.toLowerCase().includes('wsl')
        ) {
          return 'wsl'
        }
      } catch (error) {
        // Error reading /proc/version, assume regular Linux
        logError(error)
      }

      // Regular Linux
      return 'linux'
    }

    // Unknown platform
    return 'unknown'
  } catch (error) {
    logError(error)
    return 'unknown'
  }
})
