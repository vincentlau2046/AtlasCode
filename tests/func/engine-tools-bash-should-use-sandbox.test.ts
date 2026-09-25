/**
 * engine/tools/bash S-T2b shouldUseSandbox settings 消费面 真盘
 * （工具本体波 C 桶 ①，§8.53 S-T2b func 层 1 文件）。
 *
 * func 层（真盘 I/O 允许）：ATLAS_CONFIG_DIR → mkdtemp tmpdir，
 * settings.json 写盘（sandbox.excludedCommands）→ resetSettingsCache
 * → getSettingsWithErrors 真盘读 → shouldUseSandbox 决策。
 *   - excludedCommands 前缀命中（env 前缀不动点剥除后匹配 bazel:*）
 *   - 未命中 → 恒 sandbox
 *   - exact / wildcard 规则型匹配
 *   - 空配置（无 settings.json）→ excludedCommands 缺省空 → 恒 sandbox
 *   - 逃生支（dangerouslyDisableSandbox + areUnsandboxedCommandsAllowed
 *     窗口面 = 内存 stub，真策略读归 S-T4 组合根 ⑧）
 * sandboxAccess 窗口 = 内存注入（isSandboxingEnabled 恒 true 门控到达
 * settings 消费面；零 mock fs——真 NodeFsOperations + 真 tmpdir）。
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, rmSync as fsRmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { shouldUseSandbox } from '../../src/engine/tools'
import {
  resetSandboxAccess,
  setSandboxAccess,
} from '../../src/permissions'
import { resetSettingsCache } from '../../src/engine'

const USER_SETTINGS = (root: string) => join(root, 'settings.json')

let root: string
let savedConfigDir: string | undefined

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-sandbox-settings-'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = root
  resetSettingsCache()
  resetSandboxAccess()
  // 门控到达 settings 消费面（逃生支默认真 = 旧仓 manager
  // settings.sandbox.allowUnsandboxedCommands ?? true 缺省语义）
  setSandboxAccess({
    isSandboxingEnabled: () => true,
    isAutoAllowBashIfSandboxedEnabled: () => false,
    areUnsandboxedCommandsAllowed: () => true,
    getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
  })
})

afterEach(() => {
  fsRmSync(USER_SETTINGS(root), { force: true })
  if (savedConfigDir === undefined) {
    delete process.env.ATLAS_CONFIG_DIR
  } else {
    process.env.ATLAS_CONFIG_DIR = savedConfigDir
  }
  resetSettingsCache()
  resetSandboxAccess()
})

describe('shouldUseSandbox settings 真盘消费面', () => {
  test('excludedCommands 前缀命中（env 前缀不动点剥除）→ 不 sandbox', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({ sandbox: { excludedCommands: ['bazel:*'] } }),
    )
    resetSettingsCache()
    // env 前缀剥除后 'bazel test' 匹配 'bazel:*'
    expect(shouldUseSandbox({ command: 'FOO=bar bazel test' })).toBe(false)
    // wrapper 内嵌 env 前缀（不动点多轮）
    expect(
      shouldUseSandbox({ command: 'timeout 300 FOO=bar bazel run' }),
    ).toBe(false)
  })

  test('未命中 → 恒 sandbox', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({ sandbox: { excludedCommands: ['bazel:*'] } }),
    )
    resetSettingsCache()
    expect(shouldUseSandbox({ command: 'git status' })).toBe(true)
  })

  test('exact 规则型匹配', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({ sandbox: { excludedCommands: ['git status'] } }),
    )
    resetSettingsCache()
    expect(shouldUseSandbox({ command: 'git status' })).toBe(false)
    expect(shouldUseSandbox({ command: 'git log' })).toBe(true)
  })

  test('wildcard 规则型匹配', () => {
    writeFileSync(
      USER_SETTINGS(root),
      JSON.stringify({ sandbox: { excludedCommands: ['make *test*'] } }),
    )
    resetSettingsCache()
    expect(shouldUseSandbox({ command: 'make unit-test' })).toBe(false)
    expect(shouldUseSandbox({ command: 'make build' })).toBe(true)
  })

  test('空配置（无 settings.json）→ 恒 sandbox', () => {
    resetSettingsCache()
    expect(shouldUseSandbox({ command: 'bazel test' })).toBe(true)
  })
})

describe('shouldUseSandbox 逃生支（窗口面内存 stub）', () => {
  test('dangerouslyDisableSandbox + areUnsandboxed 真 → 不 sandbox', () => {
    expect(
      shouldUseSandbox({ command: 'git status', dangerouslyDisableSandbox: true }),
    ).toBe(false)
  })

  test('areUnsandboxed 假（策略收紧）→ 逃生支失活 恒 sandbox', () => {
    resetSandboxAccess()
    setSandboxAccess({
      isSandboxingEnabled: () => true,
      isAutoAllowBashIfSandboxedEnabled: () => false,
      areUnsandboxedCommandsAllowed: () => false,
      getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
    })
    expect(
      shouldUseSandbox({ command: 'git status', dangerouslyDisableSandbox: true }),
    ).toBe(true)
  })

  test('未启用（窗口禁用态）→ 恒不 sandbox', () => {
    resetSandboxAccess()
    setSandboxAccess({
      isSandboxingEnabled: () => false,
      isAutoAllowBashIfSandboxedEnabled: () => false,
      areUnsandboxedCommandsAllowed: () => true,
      getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
    })
    expect(shouldUseSandbox({ command: 'git status' })).toBe(false)
  })
})
