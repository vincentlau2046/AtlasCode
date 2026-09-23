/**
 * permissions 域 settings 路径注入窗口 + 桩①接真 契约测试（§8.28 E-3 S-3c）。
 *
 * 被测能力：
 *   - settingsPaths 注入窗口：未注入 = 空数组降级 / 注入 = 提供器值（getter
 *     语义：调用时求值）/ reset 回降级态
 *   - isAtlasSettingsPath 两态：未注入 = 仅全局 {configDir}/settings.json
 *     endsWith 兜底（policy managed-settings.json 不命中，降级语义）；
 *     注入真实现后 policy 路径命中（S-3c 桩①接真判别信号）
 * 纯内存态（无 fs/网络/PTY）→ unit 层。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import {
  setSettingsPathsProvider,
  getSettingsPaths,
  resetSettingsPathsProvider,
  isAtlasSettingsPath,
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
} from '../../src/permissions'

const PROJECT_SETTINGS = join(process.cwd(), '.atlas', 'settings.json')
const POLICY_SETTINGS = '/etc/atlas/managed-settings.json'

beforeEach(() => {
  resetSettingsPathsProvider()
  // isAtlasSettingsPath 经 expandPathLocal 读 bootstrap 两 cwd 态（fail-fast 窗口）
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => '/tmp/proj',
    getCwd: () => '/tmp/proj',
  })
})

afterEach(() => {
  resetPermissionsBootstrapEnv()
})

describe('permissions settingsPaths 注入窗口（§8.28）', () => {
  test('未注入 = 空数组（降级态，非 fail-fast）', () => {
    expect(getSettingsPaths()).toEqual([])
  })

  test('注入后读提供器值（getter 语义：调用时求值）', () => {
    let calls = 0
    setSettingsPathsProvider(() => {
      calls++
      return [PROJECT_SETTINGS, POLICY_SETTINGS]
    })
    expect(getSettingsPaths()).toEqual([PROJECT_SETTINGS, POLICY_SETTINGS])
    expect(getSettingsPaths()).toEqual([PROJECT_SETTINGS, POLICY_SETTINGS])
    expect(calls).toBe(2) // 每次调用求值（路径依赖调用时 cwd/env 态）
  })

  test('reset 回降级态', () => {
    setSettingsPathsProvider(() => [PROJECT_SETTINGS])
    expect(getSettingsPaths()).toHaveLength(1)
    resetSettingsPathsProvider()
    expect(getSettingsPaths()).toEqual([])
  })
})

describe('isAtlasSettingsPath 两态（§8.28 桩①接真判别）', () => {
  test('未注入：全局 .atlas/settings.json endsWith 兜底命中，policy 路径不命中', () => {
    // endsWith 兜底：任意前缀的 {configDir}/settings.json（含用户全局配置目录）
    expect(isAtlasSettingsPath('/home/x/.atlas/settings.json')).toBe(true)
    expect(isAtlasSettingsPath('/home/x/.atlas/settings.local.json')).toBe(true)
    // policy managed-settings.json 文件名不同——降级态不命中（S-3c 判别信号）
    expect(isAtlasSettingsPath(POLICY_SETTINGS)).toBe(false)
  })

  test('注入真实现：policy 路径命中（桩①接真）', () => {
    setSettingsPathsProvider(() => [PROJECT_SETTINGS, POLICY_SETTINGS])
    expect(isAtlasSettingsPath(POLICY_SETTINGS)).toBe(true)
    expect(isAtlasSettingsPath(PROJECT_SETTINGS)).toBe(true)
    // endsWith 兜底不受影响
    expect(isAtlasSettingsPath('/home/x/.atlas/settings.json')).toBe(true)
    // 非 settings 路径不命中
    expect(isAtlasSettingsPath('/home/x/.atlas/other.json')).toBe(false)
  })
})
