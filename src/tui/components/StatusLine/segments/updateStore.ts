// 0.1.71 块 B：版本检查微 store（gitStore 范式——createSignal 信号 +
// useSyncExternalStore 接口 + trust 前置 + 并发去重）。
//
// 职责：持有「npm latest 版本」检查态（latest + loading），供 UpdateAvailableSegment
// 订阅渲染「新版本可用」nudge。数据源 = updateCheck.resolveLatestVersion
// （24h 磁盘缓存 + 固定 registry + ATLAS_UPDATE_CHECK 覆盖 + 失败静默）。
//
// 可测性：refreshUpdateState 接受可注入 seams（fetchLatest/cache/nowMs）——
// unit 层注内存 fake cache + fake fetch 即可驱动，零网络/零真盘。缺省（不注）
// = 真盘缓存 + 真 `npm view`（生产路径）。

import { createSignal } from '../../../utils/signal.js'
import { checkHasTrustDialogAccepted } from '../../../utils/config.js'
import {
  diskUpdateCache,
  resolveLatestVersion,
  type UpdateCachePort,
} from '../../../utils/updateCheck.js'

export interface UpdateSegmentState {
  /** npm latest 版本（检查失败 = null） */
  latest: string | null
  /** 是否仍在检查（首帧 loading，检查完成置 false） */
  loading: boolean
}

const EMPTY_STATE: UpdateSegmentState = { latest: null, loading: true }

let currentState: UpdateSegmentState = EMPTY_STATE
let fetchInFlight = false
const updateChanged = createSignal()

/**
 * 触发一次版本检查（trust 前置 + 并发去重）。
 * @param opts 可注入 seams（fetchLatest/cache/nowMs）——缺省 = 生产路径（真盘 + 真 npm）。
 */
export async function refreshUpdateState(opts: {
  fetchLatest?: () => Promise<string | null>
  cache?: UpdateCachePort
  nowMs?: number
} = {}): Promise<void> {
  // trust 前置（§9.9.3 安全红线：版本检查子进程须在 trust 之后执行）
  if (!checkHasTrustDialogAccepted()) return
  // 去重并发（首帧 mount + 后续刷新不叠）
  if (fetchInFlight) return
  fetchInFlight = true
  try {
    const { latest } = await resolveLatestVersion({
      fetchLatest: opts.fetchLatest,
      cache: opts.cache ?? diskUpdateCache,
      nowMs: opts.nowMs,
    })
    const next: UpdateSegmentState = { latest, loading: false }
    if (next.latest !== currentState.latest || next.loading !== currentState.loading) {
      currentState = next
      updateChanged.emit()
    } else {
      currentState = next
    }
  } catch {
    // 检查失败：静默降级（不崩 UI；nudge 缺席）
    if (currentState.loading) {
      currentState = { latest: null, loading: false }
      updateChanged.emit()
    }
  } finally {
    fetchInFlight = false
  }
}

/** useSyncExternalStore subscribe 接口 */
export const subscribeToUpdateState = updateChanged.subscribe

/** useSyncExternalStore getSnapshot 接口 */
export function getUpdateSnapshot(): UpdateSegmentState {
  return currentState
}

/** 重置 store（测试用） */
export function resetUpdateStore(): void {
  currentState = EMPTY_STATE
  fetchInFlight = false
  updateChanged.clear()
}
