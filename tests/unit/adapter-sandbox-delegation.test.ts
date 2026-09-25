/**
 * 组合根 adapter shouldUseSandbox 委托面（S-T4 ⑧ 接线，§8.53）。
 *
 * unit 层（零盘）：adaptSandboxToExecutorPort(manager).shouldUseSandbox(cmd)
 * 委托 engine/tools shouldUseSandbox({command})（isSandboxingEnabled 总门经
 * permissions 域 sandboxAccess 注入窗口 + 用户 excludedCommands 经 engine
 * settings 门面 cache-first 读，setSessionSettingsCache 注入零盘）。
 *  - 总门关（窗口 isSandboxingEnabled 假）→ false
 *  - 总门开 + excludedCommands 命中（env 前缀不动点剥除）→ false
 *  - 总门开 + 未命中 → true
 *  - 逃生支不透出 executor 面：adapter 不传 dangerouslyDisableSandbox，
 *    即便 areUnsandboxedCommandsAllowed 真 + 无排除 → 仍 true（逃生支 = 工具层输入）
 * manager 参数本方法不消费（决策经窗口 + settings，非 manager 方法）→ 最小 stub 即可。
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import type { SandboxManager } from '../../src/sandbox'
import {
  resetSandboxAccess,
  setSandboxAccess,
} from '../../src/permissions'
import {
  type SettingsJson,
  resetSettingsCache,
  setSessionSettingsCache,
} from '../../src/engine'
import { adaptSandboxToExecutorPort } from '../../src/atlascode'

/** 最小 manager stub（本测仅调 shouldUseSandbox，不触 manager 3 方法）。 */
function stubManager(): SandboxManager {
  return {
    isSandboxingEnabled: () => false,
    wrapWithSandbox: async () => '',
    cleanupAfterCommand: () => {},
  } as unknown as SandboxManager
}

function stubWindow(over: {
  isSandboxingEnabled?: boolean
  areUnsandboxedCommandsAllowed?: boolean
} = {}): void {
  setSandboxAccess({
    isSandboxingEnabled: () => over.isSandboxingEnabled ?? true,
    isAutoAllowBashIfSandboxedEnabled: () => false,
    areUnsandboxedCommandsAllowed: () => over.areUnsandboxedCommandsAllowed ?? true,
    getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
  })
}

function stubSettings(excludedCommands: string[] = []): void {
  setSessionSettingsCache({
    settings: { sandbox: { excludedCommands } } as unknown as SettingsJson,
    errors: [],
  })
}

beforeEach(() => {
  resetSandboxAccess()
  resetSettingsCache()
})

afterEach(() => {
  resetSandboxAccess()
  resetSettingsCache()
})

describe('adaptSandboxToExecutorPort.shouldUseSandbox 委托 engine 决策', () => {
  test('总门关（窗口 isSandboxingEnabled 假）→ false', () => {
    stubWindow({ isSandboxingEnabled: false })
    stubSettings()
    const port = adaptSandboxToExecutorPort(stubManager())
    expect(port.shouldUseSandbox('git status')).toBe(false)
  })

  test('总门开 + excludedCommands 命中（env 前缀不动点剥除）→ false', () => {
    stubWindow({ isSandboxingEnabled: true })
    stubSettings(['bazel:*'])
    const port = adaptSandboxToExecutorPort(stubManager())
    // FOO=bar 前缀剥除后 'bazel test' 命中 'bazel:*'
    expect(port.shouldUseSandbox('FOO=bar bazel test')).toBe(false)
  })

  test('总门开 + 未命中排除 → true', () => {
    stubWindow({ isSandboxingEnabled: true })
    stubSettings(['bazel:*'])
    const port = adaptSandboxToExecutorPort(stubManager())
    expect(port.shouldUseSandbox('git status')).toBe(true)
  })

  test('逃生支不透出 executor 面（无 dangerouslyDisableSandbox → 恒不触发）', () => {
    stubWindow({ isSandboxingEnabled: true, areUnsandboxedCommandsAllowed: true })
    stubSettings()
    const port = adaptSandboxToExecutorPort(stubManager())
    // areUnsandboxed 真但 adapter 不传 dangerouslyDisableSandbox → 逃生支失活，仍 sandbox
    expect(port.shouldUseSandbox('git status')).toBe(true)
  })
})
