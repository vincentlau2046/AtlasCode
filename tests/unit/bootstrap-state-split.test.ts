/**
 * bootstrapState 三层状态单源护栏（M1 裁定，2026-10-01 #209）
 *
 * 锁定的分层契约（零行为改动，仅观测 + 断言，防后续"收敛"波误伤）：
 *   ① TUI 车道读侧（src/tui/bootstrapState.ts stub 面）硬编码缺省不变：
 *      getAllowedSettingSources()=['userSettings'] / getFlagSettingsPath()=
 *      '/tmp/.claude-flags.json'（TUI SettingSource 型世界，非 engine 型）。
 *   ② engine 真状态域（src/bootstrap/）未接线时 get 缺省 = undefined（前向
 *      接缝态；engine settings 功能面迁移波落地后才消费）。
 *   ③ 两模块状态完全独立：engine 域 set 不改变 TUI stub 面硬编码值（反之
 *      亦然）。误把 TUI 读侧切到 engine 域 undefined 缺省 = TUI
 *      getEnabledSettingSources 丢 userSettings 回归（#203 族 needsModelSetup
 *      晚接线误判先例）——本护栏即为此设。
 *
 * 无网络 / 无真实磁盘 / 无 PTY（unit 层）。engine 域 state 为共享模块态，
 * set 后 resetCliEntryStateForTests 复位防跨文件泄漏。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getAllowedSettingSources as engineGetAllowedSettingSources,
  setAllowedSettingSources,
  getFlagSettingsPath as engineGetFlagSettingsPath,
  setFlagSettingsPath,
  resetCliEntryStateForTests,
} from '../../src/bootstrap'
import {
  getAllowedSettingSources as tuiGetAllowedSettingSources,
  getFlagSettingsPath as tuiGetFlagSettingsPath,
} from '../../src/tui/bootstrapState'

beforeEach(() => {
  // engine 域 state 复位（TUI stub 面无 setter 可复位——硬编码，天然稳定）
  resetCliEntryStateForTests()
})

describe('M1 bootstrapState 三层状态单源护栏', () => {
  test('① TUI 读侧硬编码缺省不变（userSettings / 硬编码 flag 路径）', () => {
    expect(tuiGetAllowedSettingSources()).toEqual(['userSettings'])
    expect(tuiGetFlagSettingsPath()).toBe('/tmp/.claude-flags.json')
  })

  test('② engine 域未接线时 get 缺省 = undefined（前向接缝态）', () => {
    expect(engineGetAllowedSettingSources()).toBeUndefined()
    expect(engineGetFlagSettingsPath()).toBeUndefined()
  })

  test('③ 两模块状态独立：engine 域 set 不改变 TUI stub 面硬编码值', () => {
    setAllowedSettingSources(['user', 'project'])
    setFlagSettingsPath('/engine/flags.json')

    // engine 域 get 反映 set（真状态生效）
    expect(engineGetAllowedSettingSources()).toEqual(['user', 'project'])
    expect(engineGetFlagSettingsPath()).toBe('/engine/flags.json')

    // 但 TUI 读侧不受 engine 域 set 影响（分层隔离 = 契约核心）
    expect(tuiGetAllowedSettingSources()).toEqual(['userSettings'])
    expect(tuiGetFlagSettingsPath()).toBe('/tmp/.claude-flags.json')
  })
})
