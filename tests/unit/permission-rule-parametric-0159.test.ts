/**
 * 0.1.59 C9-1 Tool(param:value) 参数化命中面判别单测（CC 2.1.178，工单
 * 2026-10-13-p0-wave-0159）。
 *
 * 被测面 = 参数化命中层（泛化 param:value，用户 2026-10-12 裁定选 A）：
 *   - parseParametricContent：ruleContent 'param:value'(可多参) → param 表；
 *     非 param:value 形（无 ':' / 空 param）= null（回落 content 面）。
 *   - ruleMatchesParametric：toolName 命中 + 所有 param 是工具 inputSchema
 *     声明入参字段 + 入参全命中（AND）。任一 param 非声明字段 = 非参数化。
 *   - getParametricRuleForTool：某行为下命中入参的参数化规则（首命中）。
 *
 * 零回归锚点（修前红→修后绿）：
 *   - 示例 = Agent(model:premium)（ModelRole 枚举 small/premium/fast，非 opus）。
 *   - 无参规则面（exact / :* / wildcard / tool-wide ruleContent undefined）恒等。
 *   - 非 param:value 形 content（Bash(npm install)，'npm' 非声明字段）回落
 *     既有 content 规则面（本面返回 null，不误判参数化）。
 * I/O-free（纯函数 + 构造 context）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  parseParametricContent,
  ruleMatchesParametric,
  getParametricRuleForTool,
  type RuleTool,
} from '../../src/permissions/ruleMatching'
import type {
  ToolPermissionContext,
  PermissionRule,
} from '../../src/shared'

/** 最小 ToolPermissionContext（cliArg 源承载规则；其余面零值）。 */
function ctx(
  deny: string[] = [],
  ask: string[] = [],
  allow: string[] = [],
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: { cliArg: allow },
    alwaysDenyRules: { cliArg: deny },
    alwaysAskRules: { cliArg: ask },
    isBypassPermissionsModeAvailable: false,
  } as ToolPermissionContext
}

/** Agent 工具窄视图（inputSchema.properties = AgentTool 声明入参，ModelRole 值域）。 */
const agentTool: RuleTool = {
  name: 'Agent',
  inputSchema: {
    properties: { description: {}, prompt: {}, subagent_type: {}, model: {} },
  },
}

/** Bash 工具窄视图（command 是声明入参字段）。 */
const bashTool: RuleTool = {
  name: 'Bash',
  inputSchema: { properties: { command: {}, description: {}, timeout: {} } },
}

function rule(toolName: string, ruleContent?: string): PermissionRule {
  return {
    source: 'cliArg',
    ruleBehavior: 'deny',
    ruleValue: ruleContent === undefined ? { toolName } : { toolName, ruleContent },
  }
}

describe('C9-1 parseParametricContent', () => {
  test('single param:value', () => {
    expect(parseParametricContent('model:premium')).toEqual({ model: 'premium' })
  })
  test('multi param (AND)', () => {
    expect(parseParametricContent('model:fast, subagent_type:Explore')).toEqual({
      model: 'fast',
      subagent_type: 'Explore',
    })
  })
  test('value may contain colon (split on first :)', () => {
    expect(parseParametricContent('command:echo a:b')).toEqual({
      command: 'echo a:b',
    })
  })
  test('no colon => not parametric (content form)', () => {
    expect(parseParametricContent('npm install')).toBeNull()
  })
  test('empty param => not parametric', () => {
    expect(parseParametricContent(':value')).toBeNull()
  })
})

describe('C9-1 ruleMatchesParametric', () => {
  test('Agent(model:premium) hits input.model=premium', () => {
    expect(
      ruleMatchesParametric(rule('Agent', 'model:premium'), agentTool, {
        model: 'premium',
      }),
    ).toBe(true)
  })
  test('Agent(model:premium) misses input.model=small', () => {
    expect(
      ruleMatchesParametric(rule('Agent', 'model:premium'), agentTool, {
        model: 'small',
      }),
    ).toBe(false)
  })
  test('multi-param AND (all must match)', () => {
    const r = rule('Agent', 'model:fast, subagent_type:Explore')
    expect(
      ruleMatchesParametric(r, agentTool, {
        model: 'fast',
        subagent_type: 'Explore',
      }),
    ).toBe(true)
    expect(
      ruleMatchesParametric(r, agentTool, { model: 'fast', subagent_type: 'Plan' }),
    ).toBe(false)
  })
  test('non-declared param => not parametric (content fallback)', () => {
    // 'npm' 非 Agent 声明入参字段 → 非参数化
    expect(
      ruleMatchesParametric(rule('Agent', 'npm:install'), agentTool, {
        npm: 'install',
      }),
    ).toBe(false)
  })
  test('undefined ruleContent (tool-wide) => not parametric', () => {
    expect(
      ruleMatchesParametric(rule('Agent'), agentTool, { model: 'premium' }),
    ).toBe(false)
  })
})

describe('C9-1 getParametricRuleForTool', () => {
  test('deny parametric rule matched by input', () => {
    const c = ctx(['Agent(model:premium)'])
    const hit = getParametricRuleForTool(c, agentTool, { model: 'premium' }, 'deny')
    expect(hit?.ruleValue.ruleContent).toBe('model:premium')
  })
  test('deny parametric rule not matched by different input', () => {
    const c = ctx(['Agent(model:premium)'])
    expect(
      getParametricRuleForTool(c, agentTool, { model: 'small' }, 'deny'),
    ).toBeNull()
  })
  test('content rule (Bash(npm install)) is not parametric => null', () => {
    const c = ctx(['Bash(npm install)'])
    expect(
      getParametricRuleForTool(c, bashTool, { command: 'npm install' }, 'deny'),
    ).toBeNull()
  })
  test('Bash(command:npm install) parametric matched', () => {
    const c = ctx(['Bash(command:npm install)'])
    const hit = getParametricRuleForTool(
      c,
      bashTool,
      { command: 'npm install' },
      'deny',
    )
    expect(hit?.ruleValue.ruleContent).toBe('command:npm install')
  })
  test('ask behavior', () => {
    const c = ctx([], ['Agent(model:premium)'])
    const hit = getParametricRuleForTool(c, agentTool, { model: 'premium' }, 'ask')
    expect(hit?.ruleValue.ruleContent).toBe('model:premium')
  })
})
