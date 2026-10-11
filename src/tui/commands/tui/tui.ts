/**
 * AD-14（0.1.51 C-2，CC 2.1.110）：/tui 命令本体（全屏渲染 in-session 切换）。
 *
 * 参数面：fullscreen（别名 on/true/1）= 开 / off（别名 default/reset/false/0）
 * = 关 / 无参 = 状态面（报现状 + 用法，不改覆写槽）/ 非法参 = 可操作报错。
 *
 * 双写持久化（autocompact 先例）：updateSettingsForSource('userSettings',
 * { tui: { fullscreen } })（settings.json 落盘，REPL 挂载 seed 重启后重新
 * 应用）+ setFullscreenRuntimeOverride（当 session 立即生效，in-session
 * 切换不重启——复用既有 fullscreen 管线，★ 改裁断言面）。优先级：/tui
 * 覆写（显式会话选择）> env ATLAS_NO_FLICKER 显式 opt-in/opt-out > 缺省。
 */
import type { LocalJSXCommandCall } from '../../types/command.js'
import {
  getFullscreenRuntimeOverride,
  isFullscreenEnvEnabled,
  setFullscreenRuntimeOverride,
} from '../../utils/fullscreen.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

const ON_ALIASES = ['fullscreen', 'on', 'true', '1'] as const
const OFF_ALIASES = ['off', 'default', 'reset', 'false', '0'] as const
const USAGE = 'Usage: /tui fullscreen|off (no argument = status)'

export const call: LocalJSXCommandCall = (onDone, context, args) => {
  const arg = (args ?? '').trim().toLowerCase()

  if (arg === '') {
    // 状态面：现状 = 运行时覆写 ?? env 驱动路径（只读，不改覆写槽）
    const active = getFullscreenRuntimeOverride() ?? isFullscreenEnvEnabled()
    onDone(
      `Fullscreen rendering: ${active ? 'on' : 'off'} (this session) · ${USAGE}`,
      { display: 'system' },
    )
    return Promise.resolve(null)
  }

  let target: boolean
  if ((ON_ALIASES as readonly string[]).includes(arg)) {
    target = true
  } else if ((OFF_ALIASES as readonly string[]).includes(arg)) {
    target = false
  } else {
    onDone(`Invalid /tui argument "${arg}". ${USAGE}`, { display: 'system' })
    return Promise.resolve(null)
  }

  const { error } = updateSettingsForSource('userSettings', {
    tui: { fullscreen: target },
  })
  if (error) {
    onDone(`Failed to persist fullscreen setting: ${error.message}`, {
      display: 'system',
    })
    return Promise.resolve(null)
  }

  // in-session 切换（不重启）：运行时覆写槽 + 当 session settings 视图
  setFullscreenRuntimeOverride(target)
  context.setAppState(prev => ({
    ...prev,
    settings: { ...prev.settings, tui: { fullscreen: target } },
  }))

  onDone(
    target
      ? 'Fullscreen rendering enabled for this session (in-session switch, no restart). Persisted to user settings.'
      : 'Fullscreen rendering disabled for this session (in-session switch, no restart). Persisted to user settings.',
    { display: 'system' },
  )
  return Promise.resolve(null)
}
