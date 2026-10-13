/**
 * 0.1.63 /goal 演化波 P8 — ProposeGoal 工具判别单测（CC 2.1.227）。
 *
 * 判别矩阵（工单 §2）：
 *   P8 ProposeGoal：schema 在场 + ask_user=true 审批弹窗 + ask_user=false
 *   判别断言 + 工具描述提示词断言（0.1.55 先例）+ ≤500/one-goal 语义继承断言。
 *
 * 判别力 = 工具本体字段断言（schema/description/checkPermissions/call）。
 * I/O-free → unit 层。goal 状态 = 模块级单例，beforeEach reset。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  resetGoalStateForTesting,
  isGoalArmed,
  getGoalCondition,
} from '../../src/engine'
import { ProposeGoalTool, PROPOSE_GOAL_TOOL_NAME } from '../../src/engine/tools/proposeGoal/ProposeGoal'
import { PROPOSE_GOAL_PROMPT } from '../../src/engine/tools/proposeGoal/proposeGoalPrompt'

beforeEach(() => {
  resetGoalStateForTesting()
})

describe('P8 ProposeGoal 工具（CC 2.1.227）', () => {
  describe('schema + 工具名', () => {
    test('工具名 = ProposeGoal（2.1.227 同构）', () => {
      expect(PROPOSE_GOAL_TOOL_NAME).toBe('ProposeGoal')
      expect(ProposeGoalTool.name).toBe('ProposeGoal')
    })

    test('schema 含 condition（string, required）+ ask_user（boolean）', () => {
      const schema = ProposeGoalTool.inputSchema as {
        type: string
        properties: Record<string, { type: string }>
        required?: string[]
      }
      expect(schema.type).toBe('object')
      expect(schema.properties.condition.type).toBe('string')
      expect(schema.properties.ask_user.type).toBe('boolean')
      expect(schema.required).toContain('condition')
    })

    test('isEnabled = true（恒注册，非门控工具）', () => {
      expect(ProposeGoalTool.isEnabled()).toBe(true)
    })

    test('isReadOnly = false（goal 状态变更面）', () => {
      expect(ProposeGoalTool.isReadOnly({})).toBe(false)
    })
  })

  describe('工具描述提示词（2.1.227 全文移植 + 国产适配）', () => {
    test('description() 返回 PROMPT（0.1.55 先例通道）', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      expect(desc).toBe(PROPOSE_GOAL_PROMPT)
    })

    test('含 ask_user 双支语义（true 默认审批 / false 仅用户原话）', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      expect(desc.toLowerCase()).toContain('ask_user')
      expect(desc.toLowerCase()).toContain('true')
      expect(desc.toLowerCase()).toContain('false')
    })

    test('ask_user=false 硬约束断言（「仅用户原话明确要求时」语义）', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      // 2.1.227 硬约束：ask_user=false ONLY when user's own words stated this
      expect(desc.toLowerCase()).toContain('only')
      expect(desc.toLowerCase()).toContain('user')
    })

    test('评估器仅对话验证语义（不跑命令不读文件）', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      // ProposeGoal 评估器语义：仅从对话验证
      expect(desc.toLowerCase()).toContain('verif')
      expect(desc.toLowerCase()).toContain('conversation')
    })

    test('≤500 字符约束语义在场', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      expect(desc).toContain('500')
    })

    test('one goal at a time 语义在场（新批准替换旧）', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      expect(desc.toLowerCase()).toContain('one goal')
    })

    test('BR-8：无字面 + 号', async () => {
      const desc = await ProposeGoalTool.description({}, {
        isNonInteractiveSession: false,
        toolPermissionContext: {},
        tools: [],
      })
      expect(desc).not.toContain('+')
    })
  })

  describe('checkPermissions（ask_user 双支判别）', () => {
    test('ask_user=true（默认）→ behavior=ask（审批弹窗）', async () => {
      const input = { condition: 'ship the parser', ask_user: true }
      const result = await ProposeGoalTool.checkPermissions(input, {}) as {
        behavior: string
        message?: string
      }
      expect(result.behavior).toBe('ask')
      expect(result.message).toBeDefined()
      // 审批消息含 goal 条件
      expect(result.message).toContain('ship the parser')
    })

    test('ask_user 缺省 = true（默认审批面）', async () => {
      const input = { condition: 'write tests' }
      const result = await ProposeGoalTool.checkPermissions(input, {}) as {
        behavior: string
      }
      expect(result.behavior).toBe('ask')
    })

    test('ask_user=false → behavior=allow（直接 arm，工具描述硬约束仅用户原话）', async () => {
      const input = { condition: 'refactor module', ask_user: false }
      const result = await ProposeGoalTool.checkPermissions(input, {}) as {
        behavior: string
      }
      // ask_user=false = 直接执行（allow），工具描述提示词承载「仅用户原话」硬约束
      expect(result.behavior).toBe('allow')
    })
  })

  describe('call（arm goal + one-goal-at-a-time + ≤500）', () => {
    test('call → armGoal（goal armed + 条件存储）', async () => {
      const result = await ProposeGoalTool.call(
        { condition: 'ship the parser module' },
        {},
        undefined,
        {} as never,
      )
      expect(isGoalArmed()).toBe(true)
      expect(getGoalCondition()).toBe('ship the parser module')
      // 返回 data 含 armed=true
      const data = (result as { data: { armed: boolean; condition: string } }).data
      expect(data.armed).toBe(true)
    })

    test('one goal at a time（新 arm 替换旧）', async () => {
      await ProposeGoalTool.call(
        { condition: 'first goal' },
        {},
        undefined,
        {} as never,
      )
      expect(getGoalCondition()).toBe('first goal')
      // 新 goal 替换
      await ProposeGoalTool.call(
        { condition: 'second goal' },
        {},
        undefined,
        {} as never,
      )
      expect(getGoalCondition()).toBe('second goal')
      expect(isGoalArmed()).toBe(true)
    })

    test('≤500 字符约束（超长 = 拒绝 arm，返 fail）', async () => {
      const longCondition = 'x'.repeat(501)
      const result = await ProposeGoalTool.call(
        { condition: longCondition },
        {},
        undefined,
        {} as never,
      )
      const data = (result as { data: { armed: boolean; reason?: string } }).data
      expect(data.armed).toBe(false)
      expect(data.reason).toBeDefined()
      // 超长未 armed
      expect(isGoalArmed()).toBe(false)
    })

    test('空条件 = 拒绝 arm', async () => {
      const result = await ProposeGoalTool.call(
        { condition: '   ' },
        {},
        undefined,
        {} as never,
      )
      const data = (result as { data: { armed: boolean } }).data
      expect(data.armed).toBe(false)
      expect(isGoalArmed()).toBe(false)
    })
  })

  describe('mapToolResultToToolResultBlockParam', () => {
    test('返 tool_result 含 armed 状态文本', () => {
      const block = ProposeGoalTool.mapToolResultToToolResultBlockParam(
        { armed: true, condition: 'test goal' },
        'tool-use-123',
      )
      expect(block.type).toBe('tool_result')
      expect(block.tool_use_id).toBe('tool-use-123')
    })
  })

  test('renderToolUseMessage 返 null（非内联渲染工具）', () => {
    expect(ProposeGoalTool.renderToolUseMessage({}, { theme: {}, verbose: false })).toBeNull()
  })
})
