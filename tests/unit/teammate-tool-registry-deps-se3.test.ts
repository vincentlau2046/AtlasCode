/**
 * swarm 域 S-E3 修波（A 路 blocker，§8.66 delta ⑧ 回填）unit 层（零盘零
 * 模型）：teammateToolRegistryDeps 注入窗（backends/
 * teammateToolRegistryDeps.ts 34L，组合根 compose ⑫ / createAgentLoopDeps
 * 装配面）。
 *
 * 测面 = set/reset/get 窗口面 + fail-soft 零 deps 缺省 + getTools 池判别
 *（窗未设 = 最小池（无 SnipTool）/ 设 {baseTools:[SnipTool]} = 父会话
 * 等价池面（含 SnipTool，引用同一性——getTools 过滤保引用））。
 *
 * 模块态清理：afterEach resetTeammateToolRegistryDeps（与 S-E2d 尾 3 窗
 * 隔离守卫同型：set → reset → 零 deps round-trip）。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  getTeammateToolRegistryDeps,
  resetTeammateToolRegistryDeps,
  setTeammateToolRegistryDeps,
} from '../../src/swarm'
import { getTools, SnipTool } from '../../src/engine'
import type { ToolPermissionContext } from '../../src/shared'

/**
 * 最小 ToolPermissionContext（inProcessRunner
 * buildTeammateToolPermissionContext 同形：规则空 map = deny 过滤 no-op）。
 */
function makeTpc(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

afterEach(() => {
  resetTeammateToolRegistryDeps()
})

describe('teammate 工具池 deps 注入窗（S-E3 A 路 blocker 修波）', () => {
  test('窗未设 = 零 deps（fail-soft 不抛；最小池无 SnipTool）', () => {
    expect(getTeammateToolRegistryDeps()).toEqual({})
    const pool = getTools(makeTpc(), getTeammateToolRegistryDeps())
    expect(pool.some(t => t === SnipTool)).toBe(false)
  })

  test('设 {baseTools:[SnipTool]} → 窗读回 + 池判别含 SnipTool（引用同一性）', () => {
    setTeammateToolRegistryDeps({ baseTools: [SnipTool] })
    expect(getTeammateToolRegistryDeps()).toEqual({ baseTools: [SnipTool] })
    const pool = getTools(makeTpc(), getTeammateToolRegistryDeps())
    expect(pool.some(t => t === SnipTool)).toBe(true)
  })

  test('last-wins 覆写 + reset 回零 deps（round-trip 隔离守卫）', () => {
    setTeammateToolRegistryDeps({ baseTools: [SnipTool] })
    setTeammateToolRegistryDeps({})
    expect(getTeammateToolRegistryDeps()).toEqual({})
    resetTeammateToolRegistryDeps()
    expect(getTeammateToolRegistryDeps()).toEqual({})
  })
})
