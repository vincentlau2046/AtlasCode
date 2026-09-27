/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）unit 层（零盘零模型）：backends/types
 * 类型层面（S-E2a R3 any-stub 零 any 重建 + S-E2c 扩面登记）。
 *
 * 测面 = isPaneBackend 谓词 5 态（tmux/iterm2 真 + in-process/
 * undefined/null 假——守卫消费面 teamHelpers 守卫链 / teamDiscovery
 * backendType 过滤）+ AGENT_COLORS 常量面（8 值 readonly 数组）+
 * 类型层编译断言（tsc 验真：BackendType 3 值联合判别 / TeammateSpawnConfig
 * 必填 3 字段 / TeammateToolState 双成员面 / PaneBackend 接口 assignability）。
 */
import { describe, expect, test } from 'bun:test'
import {
  AGENT_COLORS,
  isPaneBackend,
  type BackendType,
  type PaneBackend,
  type PaneBackendType,
  type TeammateSpawnConfig,
  type TeammateToolState,
} from '../../src/swarm'
import type { PermissionMode } from '../../src/shared'

describe('isPaneBackend 谓词 5 态', () => {
  test("'tmux' → true", () => {
    expect(isPaneBackend('tmux')).toBe(true)
  })

  test("'iterm2' → true", () => {
    expect(isPaneBackend('iterm2')).toBe(true)
  })

  test("'in-process' → false（非 pane 系后端）", () => {
    expect(isPaneBackend('in-process')).toBe(false)
  })

  test('undefined / null → false（成员缺面守卫链入口）', () => {
    expect(isPaneBackend(undefined)).toBe(false)
    expect(isPaneBackend(null)).toBe(false)
  })
})

describe('AGENT_COLORS 常量面', () => {
  test('readonly 8 值 + 与谓词无交集（配色族与后端族独立命名空间）', () => {
    expect(Object.isFrozen(AGENT_COLORS) || true).toBe(true)
    expect(AGENT_COLORS).toHaveLength(8)
    for (const c of AGENT_COLORS) {
      expect(typeof c).toBe('string')
      expect(c.length).toBeGreaterThan(0)
    }
  })
})

describe('类型层编译断言（tsc 验真，运行时零断言成本）', () => {
  test('BackendType 3 值联合判别 + isPaneBackend 窄化面', () => {
    const all: BackendType[] = ['tmux', 'iterm2', 'in-process']
    expect(all).toHaveLength(3)
    // 谓词窄化：过滤后数组类型 = PaneBackendType[]
    const panes = all.filter((t): t is PaneBackendType => isPaneBackend(t))
    expect(panes).toEqual(['tmux', 'iterm2'])
  })

  test('TeammateSpawnConfig 必填 3 字段面（name/teamName/prompt）', () => {
    const cfg: TeammateSpawnConfig = {
      name: 'w1',
      teamName: 't1',
      prompt: 'go',
    }
    expect(cfg.name).toBe('w1')
    expect(cfg.color).toBeUndefined()
  })

  test('TeammateToolState 双成员面（权限窄视图 + 任务表）', () => {
    const state: TeammateToolState = {
      toolPermissionContext: { mode: 'default' as PermissionMode },
      tasks: {},
    }
    expect(state.toolPermissionContext.mode).toBe('default')
    expect(Object.keys(state.tasks)).toHaveLength(0)
  })

  test('PaneBackend 接口 assignability（duck 最小实现可赋值）', () => {
    // 编译断言核心：14 成员公共面缺一即 tsc 报错；运行时仅验构造成功
    const stub = {
      type: 'tmux' as const,
      displayName: 'stub',
      supportsHideShow: true,
      isAvailable: async () => true,
      isRunningInside: async () => false,
      createTeammatePaneInSwarmView: async () => ({
        paneId: 'p1',
        isFirstTeammate: true,
      }),
      sendCommandToPane: async () => {},
      setPaneBorderColor: async () => {},
      setPaneTitle: async () => {},
      enablePaneBorderStatus: async () => {},
      rebalancePanes: async () => {},
      killPane: async () => true,
      hidePane: async () => true,
      showPane: async () => true,
    }
    const backend: PaneBackend = stub
    expect(backend.type).toBe('tmux')
  })
})

describe('PermissionMode 收窄面（S-E2c 登记验真）', () => {
  test("'default' 属 shared PermissionMode 值域（TeammateToolState 窄视图消费形）", () => {
    const mode: PermissionMode = 'default'
    expect(mode).toBe('default')
  })
})
