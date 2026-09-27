/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）unit 层（零盘零模型）：
 * teammateLayoutManager 配色轮转面（旧仓 utils/swarm/teammateLayoutManager.ts
 * 107L，S-E2b 落位；pane 委托 4 面 = backends/port seam ② 未接线 fail-fast，
 * 本测试面只覆盖模块态配色面 = assignTeammateColor / getTeammateColor /
 * clearTeammateColors + AGENT_COLORS 轮转序）。
 *
 * 模块态清理：colorIndex + teammateColorAssignments 模块级 → 每用例
 * beforeEach clearTeammateColors 复位（防跨用例串染）。
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  AGENT_COLORS,
  assignTeammateColor,
  clearTeammateColors,
  getTeammateColor,
  type AgentColorName,
} from '../../src/swarm'

beforeEach(() => {
  clearTeammateColors()
})

describe('AGENT_COLORS 轮转序（旧 agentColorManager 8 值逐字镜像）', () => {
  test('8 值面 + 序逐字', () => {
    expect(AGENT_COLORS).toEqual([
      'red',
      'blue',
      'green',
      'yellow',
      'purple',
      'orange',
      'pink',
      'cyan',
    ])
  })
})

describe('assignTeammateColor round-robin 面', () => {
  test('前 8 次新 id 按序分配 8 色', () => {
    const got = Array.from({ length: 8 }, (_, i) =>
      assignTeammateColor(`w${i}`),
    )
    expect(got).toEqual([...AGENT_COLORS])
  })

  test('第 9 次 wrap 回 AGENT_COLORS[0]（模 8 轮转）', () => {
    for (let i = 0; i < 8; i++) assignTeammateColor(`w${i}`)
    expect(assignTeammateColor('w8')).toBe(AGENT_COLORS[0])
  })

  test('同 id 幂等（返既有色，不推进轮转序）', () => {
    expect(assignTeammateColor('w1')).toBe(AGENT_COLORS[0])
    expect(assignTeammateColor('w1')).toBe(AGENT_COLORS[0])
    // 未推进：新 id 仍取序位 1
    expect(assignTeammateColor('w2')).toBe(AGENT_COLORS[1])
  })

  test('16 次分配 = 两整轮（wrap 周期 8）', () => {
    const first = Array.from({ length: 8 }, (_, i) =>
      assignTeammateColor(`a${i}`),
    )
    const second = Array.from({ length: 8 }, (_, i) =>
      assignTeammateColor(`b${i}`),
    )
    expect(second).toEqual(first)
  })
})

describe('getTeammateColor / clearTeammateColors', () => {
  test('未分配 id → undefined', () => {
    expect(getTeammateColor('ghost')).toBeUndefined()
  })

  test('分配后 → 既有色可读', () => {
    assignTeammateColor('w1')
    expect(getTeammateColor('w1')).toBe(AGENT_COLORS[0])
  })

  test('clear 后既有分配全失 + 轮转序复位 0', () => {
    assignTeammateColor('w1')
    assignTeammateColor('w2')
    clearTeammateColors()
    expect(getTeammateColor('w1')).toBeUndefined()
    // 复位后首个新 id 从 8 色序头开始
    expect(assignTeammateColor('w3')).toBe(AGENT_COLORS[0])
  })

  test('clear 幂等（空态再清零副作用）', () => {
    clearTeammateColors()
    clearTeammateColors()
    expect(assignTeammateColor('w1')).toBe(AGENT_COLORS[0])
  })
})

describe('类型面编译断言（tsc 验真）', () => {
  test('assignTeammateColor 返回面 = AgentColorName 8 值联合（引用赋值零调用零态扰）', () => {
    const fn: (id: string) => AgentColorName = assignTeammateColor
    expect(fn).toBe(assignTeammateColor)
  })
})
