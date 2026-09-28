/**
 * engine/skill S-E2d（§8.68 remote 波 ⑥ 核销）unit 层：MCP skill 注册窗
 * （setMcpSkillCommandSource / resetMcpSkillCommandSource）+
 * getMcpSkillCommands 无参面读窗（有参过滤面逐字回归）。
 *
 * 零盘零模型；fake Command 最小形（cast 面）。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  getMcpSkillCommands,
  resetMcpSkillCommandSource,
  setMcpSkillCommandSource,
  type Command,
} from '../../src/engine/skill'

function fakeCmd(over: Partial<Command>): Command {
  return {
    type: 'prompt',
    name: 'x',
    description: 'd',
    progressMessage: '',
    contentLength: 0,
    source: 'mcp',
    loadedFrom: 'mcp',
    getPromptForCommand: async () => [],
    ...over,
  } as unknown as Command
}

const okCmd = fakeCmd({ name: 'ok' })
const disabledCmd = fakeCmd({ name: 'no', disableModelInvocation: true })
const notMcpCmd = fakeCmd({ name: 'other', loadedFrom: 'bundled' })

afterEach(() => {
  resetMcpSkillCommandSource()
})

describe('S-MP1 MCP skill 注册窗', () => {
  test('未注册 = 无参面 []（旧 feature OFF 缺省面保真）', () => {
    expect(getMcpSkillCommands()).toEqual([])
  })

  test('注册源 → 无参面过滤消费（prompt + loadedFrom mcp + 非禁调）', () => {
    setMcpSkillCommandSource(() => [okCmd, disabledCmd, notMcpCmd])
    const got = getMcpSkillCommands()
    expect(got.map(c => c.name)).toEqual(['ok'])
  })

  test('有参面逐字不变（过滤面不读窗）', () => {
    setMcpSkillCommandSource(() => [okCmd])
    // 有参 = 显式穿线面（skill 索引调用方），窗口无关
    expect(getMcpSkillCommands([okCmd, disabledCmd]).map(c => c.name)).toEqual([
      'ok',
    ])
    expect(getMcpSkillCommands([])).toEqual([])
  })

  test('重复注册 = 后者胜出 + reset 复位', () => {
    setMcpSkillCommandSource(() => [okCmd])
    setMcpSkillCommandSource(() => [])
    expect(getMcpSkillCommands()).toEqual([])
    setMcpSkillCommandSource(() => [okCmd])
    expect(getMcpSkillCommands()).toHaveLength(1)
    resetMcpSkillCommandSource()
    expect(getMcpSkillCommands()).toEqual([])
  })
})
