/**
 * Plugin install count reporting (0.1.46 三源波 S4，#301)。
 *
 * 客户端装成功 fire-and-forget 上报：仅 `ATLAS_STATS_ENDPOINT` 设真时外联
 * （用户自部署计数后端，POST `{base}/stats/report`）；缺省 = no-op，
 * 零外联零阻塞（W-opt 可信波 S5 #299 D3 端点策略：上报 = 用户显式配置
 * 端点才发生，用户自配端点 = 用户发起自带许可）。任何失败（网络/超时/
 * 4xx/5xx）只记 debug 日志，绝不阻塞安装主流程。
 */

import axios from 'axios'
import { logForDebugging } from '../debug.js'
import { getStatsReportUrl } from './installCounts.js'

/**
 * Report a plugin install to the user-deployed stats backend.
 * Fire-and-forget: returns a promise that ALWAYS resolves (success or
 * suppressed failure) so callers can await in tests but never need to
 * handle rejection; production callers ignore the return value.
 * No-op (zero network) when `ATLAS_STATS_ENDPOINT` is unset.
 */
export function reportInstall(
  pluginId: string,
  marketplaceName: string,
): Promise<void> {
  const url = getStatsReportUrl()
  if (!url) {
    return Promise.resolve()
  }
  return axios
    .post(url, { plugin: pluginId, marketplace: marketplaceName }, { timeout: 5000 })
    .then(() => {
      logForDebugging(`Install count reported: ${pluginId}`)
    })
    .catch((error: unknown) => {
      // fire-and-forget by contract: swallow every failure mode
      logForDebugging(
        `Install count report failed (${pluginId} @ ${marketplaceName}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
}
