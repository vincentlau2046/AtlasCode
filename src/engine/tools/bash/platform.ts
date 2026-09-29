/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
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
 *  - SUPPORTED_PLATFORMS 常量本域（bash）0 消费者不随迁（旧仓消费者 =
 *    atlasDesktop.ts ×3 = 域外 D 波壳层核查面【docs/brand-string-classification
 *    特判 3】；常量本体已由 shared/platform.ts 逐字保留，功能零损失）
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
