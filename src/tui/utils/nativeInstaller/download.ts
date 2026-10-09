/**
 * Download functionality for native installer
 *
 * W-opt 可信波 S2（D2 裁定，#299）：1P GCS 下载体裁除。本产品**无 native 发行形态**
 *（出货 = npm 包 / git 源码，node 运行器；§8.74.23 native 版本查询通道已裁为 no-op）。
 * 原 GCS 桶 URL + axios 下载体（getLatestVersionFromBinaryRepo /
 * downloadVersionFromBinaryRepo / StallTimeoutError + stall 重试 / gcloud ci-sentinel 支）
 * 全裁（零消费方核销）；导出面 downloadVersion / getLatestVersion 保留，休眠调用点
 *（installer.ts installMethod=native 支，本产品不可达）走明示错误路径，零行为变化。
 */

import { feature } from 'src/shared'
import type { ReleaseChannel } from '../config.js'

export async function getLatestVersion(
  channelOrVersion: string,
): Promise<string> {
  // Direct version - match internal format too (e.g. 1.0.30-dev.shaf4937ce)
  if (/^v?\d+\.\d+\.\d+(-\S+)?$/.test(channelOrVersion)) {
    const normalized = channelOrVersion.startsWith('v')
      ? channelOrVersion.slice(1)
      : channelOrVersion
    // 99.99.x is reserved for CI smoke-test fixtures.
    // feature() is false in all shipped builds — DCE collapses this to an
    // unconditional throw. Only `bun --feature=ALLOW_TEST_VERSIONS` (the
    // smoke test's source-level invocation) bypasses.
    if (/^99\.99\./.test(normalized) && !feature('ALLOW_TEST_VERSIONS')) {
      throw new Error(
        `Version ${normalized} is not available for installation. Use 'stable' or 'latest'.`,
      )
    }
    // W-opt 可信波 S2（#299）：直版本原经 GCS 桶下载，无 native 发行形态 → 明示错误
    throw new Error(
      `Version ${normalized} cannot be installed: this product has no native distribution form (npm package / git source only)`,
    )
  }

  // ReleaseChannel validation
  const channel = channelOrVersion as ReleaseChannel
  if (channel !== 'stable' && channel !== 'latest') {
    throw new Error(
      `Invalid channel: ${channelOrVersion}. Use 'stable' or 'latest'`,
    )
  }

  // W-opt 可信波 S2（#299）：GCS latest 查询支裁除 → 明示错误
  throw new Error(
    `Channel '${channel}' cannot be resolved: this product has no native distribution form (npm package / git source only)`,
  )
}

export async function downloadVersion(
  _version: string,
  _stagingPath: string,
): Promise<'npm' | 'binary'> {
  // W-opt 可信波 S2（#299）：GCS 下载支 + gcloud ci-sentinel 支全裁（原支休眠不可达，
  // 裁后明示错误替代 1P 外联，零行为变化）
  throw new Error(
    'Native binary download is not available in this product (no native distribution form; npm package / git source only)',
  )
}
