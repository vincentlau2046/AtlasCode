import * as React from 'react'
import type { Notification } from '../context/notifications.js'
import { Text } from '../ink.js'
import { logForDebugging } from '../utils/debug.js'
import {
  ATLAS_MARKETPLACE_DISPLAY_LABEL,
  checkAndInstallAtlasMarketplace,
} from '../utils/plugins/atlasMarketplace.js'
import { useStartupNotification } from './notifs/useStartupNotification.js'

/**
 * Hook that auto-installs the Atlas self-built marketplace on startup and
 * shows a notification on success (or transient failure).
 *
 * Silent on intentional/permanent skips (disabled / already_installed /
 * policy_blocked / git_unavailable) — those are not worth nagging about.
 * Only a transient clone failure ('unknown') surfaces a "will retry" notice,
 * mirroring the official, Ascend, and Codex marketplace hooks.
 */
export function useAtlasMarketplaceNotification(): void {
  useStartupNotification(async () => {
    const result = await checkAndInstallAtlasMarketplace()
    const notifs: Notification[] = []

    if (result.fallback === 'builtin-snapshot') {
      // 0.1.46 三源波 S3（#301）：活源未就绪 → 已回落内建快照目录源（零网络，
      // /plugin 可见）。保留 0.1.43 失败可见性口径：提示「源未就绪 + 自动重试」，
      // 而非静默成功。
      logForDebugging(
        'Showing Atlas marketplace snapshot-fallback notification',
      )
      notifs.push({
        key: 'atlas-marketplace-snapshot-fallback',
        jsx: (
          <Text color="warning">
            {ATLAS_MARKETPLACE_DISPLAY_LABEL} 源未就绪 · 已用内建快照目录（
            /plugin 可浏览插件清单）· 下次启动自动重试活同步
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 10000,
      })
    } else if (result.installed) {
      logForDebugging('Showing Atlas marketplace installation success notification')
      notifs.push({
        key: 'atlas-marketplace-installed',
        jsx: (
          <Text color="success">
            ✓ {ATLAS_MARKETPLACE_DISPLAY_LABEL} marketplace installed · /plugin to
            browse Atlas plugins
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 7000,
      })
    } else if (result.skipped && result.reason === 'git_unavailable') {
      // 2026-10-08 多 OS 优化：Windows 新装常见根因（git 缺失/未进 PATH）不再静默；
      // 短行提示，与官方源提示互补（预集成的三源同一 git 根因）。
      logForDebugging('Showing Atlas marketplace git_unavailable notification')
      notifs.push({
        key: 'atlas-marketplace-git-unavailable',
        jsx: (
          <Text color="warning">
            {ATLAS_MARKETPLACE_DISPLAY_LABEL} 源未就绪 · git 缺失（安装 Git 并
            加入 PATH）· 下次启动自动重试
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 10000,
      })
    } else if (result.skipped && result.reason === 'unknown') {
      logForDebugging('Showing Atlas marketplace installation failure notification')
      notifs.push({
        key: 'atlas-marketplace-install-failed',
        jsx: (
          <Text color="warning">
            Failed to install {ATLAS_MARKETPLACE_DISPLAY_LABEL} marketplace · Will
            retry on next startup
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 8000,
      })
    }
    // Silent for: disabled, already_installed, policy_blocked.
    return notifs
  })
}
