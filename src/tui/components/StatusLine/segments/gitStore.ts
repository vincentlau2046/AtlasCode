// GitSegment 微 store——独立于 AppState 的 git 状态缓存
// 17-TUI设计方案 §9.2 方案 B：GitSegment 组件内部自取数
//
// 设计：
// - useSyncExternalStore 接口（先例 atlasCodeHints.ts:137）
// - 2s 结果缓存（避免每 300ms 防抖窗口都 fork git）
// - trust 前置（§9.9.3 安全红线：git 子进程须在 trust 之后执行）
// - 刷新节奏独立于消息防抖（切分支立即生效）

import { createSignal } from '../../../utils/signal.js'
import { checkHasTrustDialogAccepted } from '../../../utils/config.js'
import { getGitState, getChangedFiles, type GitRepoState } from '../../../utils/git.js'

export interface GitSegmentState {
  branch: string | null
  isClean: boolean
  dirtyCount: number  // 改动文件数（staged + unstaged + untracked）
  loading: boolean
}

const EMPTY_STATE: GitSegmentState = {
  branch: null,
  isClean: true,
  dirtyCount: 0,
  loading: true,
}

// ── 微 store ──────────────────────────────────────────────────────

let currentState: GitSegmentState = EMPTY_STATE
let lastFetchTs = 0
let fetchInFlight = false
const CACHE_TTL_MS = 2000
const gitChanged = createSignal()

/** 触发一次 git 状态拉取（带 2s 缓存 + trust 前置） */
export async function refreshGitState(): Promise<void> {
  // trust 前置（§9.9.3 安全红线）
  if (!checkHasTrustDialogAccepted()) return

  // 缓存未过期直接返回
  const now = Date.now()
  if (now - lastFetchTs < CACHE_TTL_MS && !currentState.loading) return

  // 去重并发请求
  if (fetchInFlight) return
  fetchInFlight = true

  try {
    const [state, changedFiles] = await Promise.all([
      getGitState(),
      getChangedFiles(),
    ])

    const nextState: GitSegmentState = {
      branch: state?.branchName ?? null,
      isClean: state?.isClean ?? true,
      dirtyCount: changedFiles?.length ?? 0,
      loading: false,
    }

    // 只有值真正变化时才 notify（避免无谓重渲）
    if (
      nextState.branch !== currentState.branch ||
      nextState.isClean !== currentState.isClean ||
      nextState.dirtyCount !== currentState.dirtyCount ||
      nextState.loading !== currentState.loading
    ) {
      currentState = nextState
      gitChanged.emit()
    } else {
      currentState = nextState
    }
    lastFetchTs = Date.now()
  } catch {
    // git 命令失败：静默降级（不崩 UI）
    if (currentState.loading) {
      currentState = { ...EMPTY_STATE, loading: false }
      gitChanged.emit()
    }
  } finally {
    fetchInFlight = false
  }
}

/** useSyncExternalStore subscribe 接口 */
export const subscribeToGitState = gitChanged.subscribe

/** useSyncExternalStore getSnapshot 接口 */
export function getGitSnapshot(): GitSegmentState {
  return currentState
}

/** 重置 store（测试用） */
export function resetGitStore(): void {
  currentState = EMPTY_STATE
  lastFetchTs = 0
  fetchInFlight = false
  gitChanged.clear()
}
