/**
 * AD-14（0.1.51 C-2，CC 2.1.110）`/tui` 命令 + `tui` setting——全屏渲染
 * in-session 切换（不重启）判别单测（纯 unit，零盘/零 PTY）。
 *
 * 工单 §1.2 缺口：`/tui` 斜杠命令 + `tui`/`fullscreen` setting key 不存在
 * （tui/commands.ts 无 tui + engine/config/types.ts 与 tui/utils/settings/types.ts
 * grep 0 命中）。改法 = 复用既有 fullscreen 管线（`isFullscreenEnvEnabled`
 * 单点门控 + FullscreenLayout 渲染消费），**in-session 切换不重启**（★ 改裁
 * 断言面）。零回归约束：无 /tui 调用 + setting 缺省 → env 驱动路径逐字恒等。
 *
 * 落码面（本测试判别）：
 *  - fullscreen.ts 运行时覆写槽：`setFullscreenRuntimeOverride(v)`（/tui 命令
 *    in-session 切换写此槽；undefined = 无覆写，env 路径逐字恒等）+
 *    `getFullscreenRuntimeOverride` 读面
 *  - 优先级：/tui 覆写（显式会话选择）> env 显式 opt-out/opt-in > 缺省
 *  - settings schema 双拷贝 typed `tui` 键（engine × tui，`tui.fullscreen`
 *    布尔；两 schema 均 .passthrough() → 判别 = shape 显式键在场，非
 *    safeParse 透传）
 *
 * 判别（修前红 → 修后绿）：①② 覆写槽红（导出缺席，动态 import 面缺席 →
 * 定向红，文件不崩）/ ④⑤ schema shape 红（typed 键缺席）；③⑥ 零回归恒绿
 * （env 驱动路径逐字）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  isFullscreenEnvEnabled,
  isMouseTrackingEnabled,
  _resetForTesting,
} from '../../src/tui/utils/fullscreen.js'
import { SettingsSchema as EngineSettingsSchema } from '../../src/engine/config/types.js'
import { SettingsSchema as TuiSettingsSchema } from '../../src/tui/utils/settings/types.js'

const ENV_KEYS = ['ATLAS_NO_FLICKER', 'TMUX', 'TERM_PROGRAM', 'TERM'] as const

function cleanEnv(): void {
  for (const k of ENV_KEYS) {
    delete process.env[k]
  }
}

/** AD-14 修前红面：运行时覆写槽两导出（模块在场、面缺席 → 定向红）。 */
async function loadOverrideFace() {
  const mod = await import('../../src/tui/utils/fullscreen.js')
  return {
    set: mod.setFullscreenRuntimeOverride as
      | ((v: boolean | undefined) => void)
      | undefined,
    get: mod.getFullscreenRuntimeOverride as
      | (() => boolean | undefined)
      | undefined,
  }
}

beforeEach(() => {
  _resetForTesting()
  cleanEnv()
})

describe('AD-14 全屏 in-session 运行时覆写槽（/tui 命令消费面）', () => {
  test('① 覆写 true（无 env）→ isFullscreenEnvEnabled = true（in-session 开）', async () => {
    const { set, get } = await loadOverrideFace()
    expect(set, 'setFullscreenRuntimeOverride 导出缺席（修前红）').toBeTypeOf(
      'function',
    )
    expect(get, 'getFullscreenRuntimeOverride 导出缺席（修前红）').toBeTypeOf(
      'function',
    )
    set!(true)
    expect(get!()).toBe(true)
    expect(isFullscreenEnvEnabled()).toBe(true)
  })

  test('② 覆写 false 压 env opt-in（ATLAS_NO_FLICKER=1）→ false（显式会话选择赢）', async () => {
    const { set } = await loadOverrideFace()
    expect(set).toBeTypeOf('function')
    process.env.ATLAS_NO_FLICKER = '1'
    set!(false)
    expect(isFullscreenEnvEnabled()).toBe(false)
  })

  test('③ 零回归：覆写 undefined → env 驱动路径逐字恒等（无 env 缺省 false / =1 true / =0 压回）', async () => {
    const { set } = await loadOverrideFace()
    set?.(undefined)
    expect(isFullscreenEnvEnabled()).toBe(false) // 缺省 = 现行为
    process.env.ATLAS_NO_FLICKER = '1'
    expect(isFullscreenEnvEnabled()).toBe(true) // env opt-in 现行为不变
    process.env.ATLAS_NO_FLICKER = '0'
    if (set) {
      set(true)
      expect(isFullscreenEnvEnabled()).toBe(true) // 覆写亦压显式 opt-out（会话显式选择）
      set(undefined)
    }
    expect(isFullscreenEnvEnabled()).toBe(false) // opt-out 现行为不变
  })

  test('④ engine settings schema：typed tui 键在场（shape 显式 + fullscreen 布尔）', () => {
    const schema = EngineSettingsSchema()
    expect('tui' in (schema as { shape: Record<string, unknown> }).shape).toBe(
      true,
    )
    const parsed = schema.safeParse({ tui: { fullscreen: true } })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect((parsed.data as { tui?: { fullscreen?: boolean } }).tui?.fullscreen).toBe(true)
    }
  })

  test('⑤ tui settings schema：typed tui 键在场（双拷贝一致性）', () => {
    const schema = TuiSettingsSchema()
    expect('tui' in (schema as { shape: Record<string, unknown> }).shape).toBe(
      true,
    )
    const parsed = schema.safeParse({ tui: { fullscreen: false } })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect((parsed.data as { tui?: { fullscreen?: boolean } }).tui?.fullscreen).toBe(false)
    }
  })

  test('⑥ 零回归：覆写槽缺席 + 无 env → 鼠标追踪/全屏缺省面不变（false）', async () => {
    const { set } = await loadOverrideFace()
    set?.(undefined)
    expect(isMouseTrackingEnabled()).toBe(false)
    expect(isFullscreenEnvEnabled()).toBe(false)
  })
})
