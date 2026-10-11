/**
 * AD-46（0.1.51 C-2，CC 2.1.89）`ATLAS_NO_FLICKER` env 闭环 + 渲染层门控
 * 同源回归探针（工单 §1.6 verify 项，首轮绿——env 面已基本闭环，非修前红）。
 *
 * verify 定面（工单 §1.6）：FullscreenLayout.tsx L338/L469 门控消费
 * isFullscreenEnvEnabled()（单点，无 raw env 旁路）+ fullscreen.ts env 驱动
 * 路径（opt-in/opt-out + tmux -CC 自动禁）+ VirtualMessageList 虚拟化在场。
 * AD-14 改裁后断言面与 in-session 切换同源：运行时覆写槽（/tui 命令面）
 * > env 显式 opt-in/opt-out > 缺省——本探针钉住该优先级链 + 鼠标追踪
 * 传播面，作 TUI 渲染族回归探针（PTY flicker/alt-screen 探针归 e2e lane §3）。
 *
 * 分层纪律：纯内存态断言（零盘/零 PTY/零网络）；env 族清理 + 覆写槽/tmux
 * 探针缓存每例重置（同 AD-14 单测口径）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getFullscreenRuntimeOverride,
  isFullscreenActive,
  isFullscreenEnvEnabled,
  isMouseTrackingEnabled,
  setFullscreenRuntimeOverride,
  _resetForTesting,
  _resetTmuxControlModeProbeForTesting,
} from '../../src/tui/utils/fullscreen.js'
import { getIsInteractive, setIsInteractive } from '../../src/bootstrap'

const ENV_KEYS = [
  'ATLAS_NO_FLICKER',
  'ATLAS_ENABLE_MOUSE',
  'ATLAS_DISABLE_MOUSE',
  'TMUX',
  'TERM_PROGRAM',
  'TERM',
] as const

beforeEach(() => {
  _resetForTesting()
  _resetTmuxControlModeProbeForTesting()
  for (const k of ENV_KEYS) {
    delete process.env[k]
  }
})

describe('AD-46 ATLAS_NO_FLICKER env 闭环（渲染层门控同源探针）', () => {
  test('① env opt-in：ATLAS_NO_FLICKER=1 → 全屏路径开启 + 鼠标追踪传播', () => {
    process.env.ATLAS_NO_FLICKER = '1'
    expect(isFullscreenEnvEnabled()).toBe(true)
    // 渲染层门控同源：鼠标追踪经 isFullscreenEnvEnabled 传播（fullscreen 开 → 追踪开）
    expect(isMouseTrackingEnabled()).toBe(true)
  })

  test('② env 显式 opt-out：ATLAS_NO_FLICKER=0 → 全屏关（显式选择恒胜）', () => {
    process.env.ATLAS_NO_FLICKER = '0'
    expect(isFullscreenEnvEnabled()).toBe(false)
    expect(isMouseTrackingEnabled()).toBe(false)
  })

  test('③ 缺省：env 未设 → 全屏关（现行为零回归）', () => {
    expect(isFullscreenEnvEnabled()).toBe(false)
    expect(isMouseTrackingEnabled()).toBe(false)
  })

  test('④ 覆写 undefined → env 路径逐字恒等（AD-14 断言面同源：无 /tui 会话选择时 env 权威）', () => {
    expect(getFullscreenRuntimeOverride()).toBeUndefined()
    process.env.ATLAS_NO_FLICKER = '1'
    expect(isFullscreenEnvEnabled()).toBe(true)
    process.env.ATLAS_NO_FLICKER = '0'
    expect(isFullscreenEnvEnabled()).toBe(false)
  })

  test('⑤ 覆写压 env（双向）：显式会话选择（/tui）赢 env 面', () => {
    process.env.ATLAS_NO_FLICKER = '0'
    setFullscreenRuntimeOverride(true)
    expect(isFullscreenEnvEnabled()).toBe(true)
    setFullscreenRuntimeOverride(false)
    process.env.ATLAS_NO_FLICKER = '1'
    expect(isFullscreenEnvEnabled()).toBe(false)
  })

  test('⑥ isFullscreenActive 门控面：交互标志关（headless）→ 恒 false 即便 env opt-in', () => {
    const savedInteractive = getIsInteractive()
    try {
      process.env.ATLAS_NO_FLICKER = '1'
      setIsInteractive(false)
      // 非交互（headless/单测进程）→ 即使 env opt-in 也不进 alt-screen
      expect(isFullscreenActive()).toBe(false)
      setIsInteractive(true)
      // 交互 + env opt-in → 实际进 alt-screen（门控面 = 交互 ∧ env）
      expect(isFullscreenActive()).toBe(true)
    } finally {
      setIsInteractive(savedInteractive)
    }
  })

  test('⑦ 鼠标 env 面独立支：ATLAS_ENABLE_MOUSE=1 免全屏开追踪 / ATLAS_DISABLE_MOUSE=1 恒关', () => {
    process.env.ATLAS_ENABLE_MOUSE = '1'
    expect(isMouseTrackingEnabled()).toBe(true)
    process.env.ATLAS_DISABLE_MOUSE = '1'
    expect(isMouseTrackingEnabled()).toBe(false)
    delete process.env.ATLAS_DISABLE_MOUSE
    expect(isMouseTrackingEnabled()).toBe(true)
  })
})
