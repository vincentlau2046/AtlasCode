/**
 * 2026-10-04 issule 工单 Task A2 — 权限弹框第 4 选项（auto mode）共享 helper
 * 判别单测（mutation-red 风）：钉住 `autoModePermissionOption.ts` 的契约——
 *
 *   1. 可见性：auto 门开 且 当前 mode 非 auto 才显示（已 auto 再选 = no-op
 *      转换，隐藏）；门关恒隐藏。
 *   2. 选中应用：transition 成功 → 经 setAppState 发布转换后 context
 *      （mode 'auto'，其余字段原样保留）+ 恰好 1 次 recheck（只重放当前
 *      这 1 个 pending 请求，非历史队列）。
 *   3. 竞态兜底：render 与点击间 gate 翻关（transition 抛错）→ 不发布、
 *      仅按当前 mode 原样 re-dispatch 1 次（弹框行为 = 选第 4 选项前）。
 *
 * 弹框面「gate 开时第 4 选项真出现 + auto 放行/危险 re-ask」的活判别归
 * issule-analyst 的 PTY 探针（工单 probe spec 面）；本文件钉共享 helper
 * 本体（ticket「抽个共享 AutoModePermissionOption 复用」交付物）。
 *
 * 面坑登记（mock-module-export-surface）：repo 无 mock.module 先例，此处
 * 按坑对策 = 先真实 import 全导出面再 spread，仅覆写 2 个 gate 函数；
 * `bun test --isolate` 每文件独立进程，mock 不跨文件泄漏。
 */
import { describe, expect, it, mock } from 'bun:test'
import type { ToolPermissionContext } from '../../src/tui/Tool'
import type { AppState } from '../../src/tui/state/AppState'

const SETUP_PATH = '../../src/tui/utils/permissions/permissionSetup.js'
const HELPER_PATH =
  '../../src/tui/utils/permissions/autoModePermissionOption.js'

// 先取真实模块全导出面（顺带验 TUI import 链在单测进程可加载），
// 再 mock.module 覆写 gate 两函数（其余名原样透传）。
const realSetup = await import(SETUP_PATH)

let gateEnabled = false
let transitionThrows = false

mock.module(SETUP_PATH, () => ({
  ...realSetup,
  isAutoModeGateEnabled: () => gateEnabled,
  transitionPermissionMode: (
    _from: string,
    _to: string,
    context: ToolPermissionContext,
  ): ToolPermissionContext => {
    if (transitionThrows) {
      throw new Error('Cannot transition to auto mode: gate is not enabled')
    }
    return context
  },
}))

const {
  isAutoModeOptionVisible,
  applyAutoModePermissionOption,
} = await import(HELPER_PATH)

function makeContext(mode: string): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: { cliArg: [], settings: [] },
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
}

describe('A2 isAutoModeOptionVisible（第 4 选项可见性）', () => {
  it('门开 + 非 auto 态 → 显示', () => {
    gateEnabled = true
    transitionThrows = false
    expect(isAutoModeOptionVisible(makeContext('default'))).toBe(true)
  })

  it('门开 + 已在 auto 态 → 隐藏（再选 = no-op 转换）', () => {
    gateEnabled = true
    expect(isAutoModeOptionVisible(makeContext('auto'))).toBe(false)
  })

  it('门关 → 隐藏（无论当前态）', () => {
    gateEnabled = false
    expect(isAutoModeOptionVisible(makeContext('default'))).toBe(false)
    expect(isAutoModeOptionVisible(makeContext('plan'))).toBe(false)
  })
})

describe('A2 applyAutoModePermissionOption（选中应用 + 竞态兜底）', () => {
  function harness() {
    const ctx = makeContext('default')
    let published: AppState | undefined
    let recheckCalls = 0
    const setAppState = (updater: (prev: AppState) => AppState): void => {
      published = updater({
        ...({} as AppState),
        toolPermissionContext: ctx,
      } as AppState)
    }
    const recheckPermission = (): Promise<void> => {
      recheckCalls += 1
      return Promise.resolve()
    }
    return { ctx, setAppState, recheckPermission, getPublished: () => published, getRecheckCalls: () => recheckCalls }
  }

  it('transition 成功 → 发布 mode=auto（其余字段保留）+ recheck 恰 1 次', () => {
    gateEnabled = true
    transitionThrows = false
    const h = harness()
    applyAutoModePermissionOption(h.ctx, h.setAppState, h.recheckPermission)
    const published = h.getPublished()
    expect(published).toBeDefined()
    const next = published!.toolPermissionContext
    expect(next.mode).toBe('auto')
    // 其余字段 = transition 返回值原样 spread（此处 stub 恒等 → 同 ctx 字段）
    expect(next.alwaysDenyRules).toBe(h.ctx.alwaysDenyRules)
    expect(next.additionalWorkingDirectories).toBe(
      h.ctx.additionalWorkingDirectories,
    )
    expect(h.getRecheckCalls()).toBe(1)
  })

  it('竞态：transition 抛（gate 翻关）→ 不发布 + 仅原样 re-dispatch 1 次', () => {
    gateEnabled = true // render 时门开（选项已显示），点击时翻关
    transitionThrows = true
    const h = harness()
    applyAutoModePermissionOption(h.ctx, h.setAppState, h.recheckPermission)
    expect(h.getPublished()).toBeUndefined()
    expect(h.getRecheckCalls()).toBe(1)
  })
})
