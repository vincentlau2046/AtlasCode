/**
 * 0.1.81 V3-2 K2 MCP 面 — 规则匹配簇判别单测（工单 #4/#9/#3/#2）
 *
 * 被测能力（mcpRuleNames + ruleMatching toolMatchesRule MCP 支）：
 *   - #4 双下划线 server 名 deny/ask 规则生效：规则 `mcp__my__server`
 *     （原始名含 `__`）旧实现经 mcpInfoFromString 首 `__` 切分得
 *     server='my' → 永不命中 → 修 = MCP 支按 tool.mcpInfo 直接折叠比对。
 *   - #9 allow 规则收窄（破坏性变更，fail-closed 方向）：`mcp__a` 不再
 *     匹配 server `a_`（旧：normalize 去尾下划线后 'a'==='a' 误命中）/
 *     不匹配 server `a__b`。
 *   - #3 保留名 server（constructor/prototype/toString）权限判定与普通名
 *     一致（匹配按 server/tool 名非字典键）。
 *   - 恒等锚：普通名单 server 级 / wildcard / exact 全名 / builtin 规则
 *     不误伤同名 MCP 工具（旧语义零回归）。
 * 零磁盘（纯 context 变换 + 假 tool 鸭子，fixture idiom 同
 * permission-rule-matching.test.ts）。
 */
import { describe, test, expect } from 'bun:test'
import {
  getDenyRuleForTool,
  getAskRuleForTool,
  toolAlwaysAllowedRule,
  buildMcpToolName,
  type RuleTool,
} from '../../src/permissions'
import type {
  PermissionRule,
  PermissionRuleValue,
  ToolPermissionContext,
} from '../../src/shared'

function makeContext(
  rules?: {
    allow?: Partial<ToolPermissionContext['alwaysAllowRules']>
    deny?: Partial<ToolPermissionContext['alwaysDenyRules']>
    ask?: Partial<ToolPermissionContext['alwaysAskRules']>
  },
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: rules?.allow ?? {},
    alwaysDenyRules: rules?.deny ?? {},
    alwaysAskRules: rules?.ask ?? {},
    isBypassPermissionsModeAvailable: false,
  }
}

const rule = (
  source: PermissionRule['source'],
  behavior: PermissionRule['ruleBehavior'],
  value: PermissionRuleValue,
): PermissionRule => ({ source, ruleBehavior: behavior, ruleValue: value })

/** MCP 假 tool（name = 归一 built 全名，同真实 buildMcpTool 产物）。 */
function mcpTool(serverName: string, toolName: string): RuleTool {
  return {
    name: buildMcpToolName(serverName, toolName),
    mcpInfo: { serverName, toolName },
  }
}

describe('K2 #4：双下划线 server 名 deny/ask 规则生效', () => {
  test('deny 规则 mcp__my__server 拒绝 server my__server 的工具', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__my__server'] },
    })
    const tool = mcpTool('my__server', 'tool1')
    expect(getDenyRuleForTool(ctx, tool)?.ruleValue.toolName).toBe(
      'mcp__my__server',
    )
  })

  test('ask 规则 mcp__my__server 命中 server my__server 的工具', () => {
    const ctx = makeContext({
      ask: { userSettings: ['mcp__my__server'] },
    })
    const tool = mcpTool('my__server', 'tool1')
    expect(getAskRuleForTool(ctx, tool)?.ruleValue.toolName).toBe(
      'mcp__my__server',
    )
  })

  test('wildcard 规则 mcp__my__server__* 命中 server my__server 的工具', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__my__server__*'] },
    })
    const tool = mcpTool('my__server', 'tool1')
    expect(getDenyRuleForTool(ctx, tool)?.ruleValue.toolName).toBe(
      'mcp__my__server__*',
    )
  })

  test('跨 server 不误伤：deny mcp__other 不命中 my__server 工具', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__other'] },
    })
    const tool = mcpTool('my__server', 'tool1')
    expect(getDenyRuleForTool(ctx, tool)).toBeNull()
  })
})

describe('K2 #9：allow 规则收窄（fail-closed 方向，破坏性变更）', () => {
  test('allow 规则 mcp__a 不再匹配 server a_（归一去尾下划线误命中修）', () => {
    const ctx = makeContext({
      allow: { userSettings: ['mcp__a'] },
    })
    const tool = mcpTool('a_', 'tool1')
    expect(toolAlwaysAllowedRule(ctx, tool)).toBeNull()
  })

  test('allow 规则 mcp__a 不匹配 server a__b', () => {
    const ctx = makeContext({
      allow: { userSettings: ['mcp__a'] },
    })
    const tool = mcpTool('a__b', 'tool1')
    expect(toolAlwaysAllowedRule(ctx, tool)).toBeNull()
  })

  test('allow 规则 mcp__a 仍匹配 server a（合法收窄后命中面）', () => {
    const ctx = makeContext({
      allow: { userSettings: ['mcp__a'] },
    })
    const tool = mcpTool('a', 'tool1')
    expect(toolAlwaysAllowedRule(ctx, tool)?.ruleValue.toolName).toBe('mcp__a')
  })
})

describe('K2 #3：保留名 server 权限判定与普通名一致', () => {
  for (const reserved of ['constructor', 'prototype', 'toString', '__proto__']) {
    test(`deny 规则 mcp__${reserved} 命中该 server 工具`, () => {
      const ctx = makeContext({
        deny: { userSettings: [`mcp__${reserved}`] },
      })
      const tool = mcpTool(reserved, 'tool1')
      expect(getDenyRuleForTool(ctx, tool)?.ruleValue.toolName).toBe(
        `mcp__${reserved}`,
      )
    })
  }
})

describe('恒等锚：普通名语义零回归', () => {
  test('server 级 deny mcp__srv 命中 srv 工具', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__srv'] },
    })
    expect(getDenyRuleForTool(ctx, mcpTool('srv', 'tool1'))).not.toBeNull()
  })

  test('wildcard deny mcp__srv__* 命中 srv 工具', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__srv__*'] },
    })
    expect(getDenyRuleForTool(ctx, mcpTool('srv', 'tool1'))).not.toBeNull()
  })

  test('exact 全名 deny mcp__srv__tool1 命中且不命中他工具', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__srv__tool1'] },
    })
    expect(
      getDenyRuleForTool(ctx, mcpTool('srv', 'tool1')),
    ).not.toBeNull()
    expect(getDenyRuleForTool(ctx, mcpTool('srv', 'tool2'))).toBeNull()
  })

  test('builtin deny Write 不误伤同名 MCP 工具（全名防误伤语义）', () => {
    const ctx = makeContext({
      deny: { userSettings: ['Write'] },
    })
    const mcpWrite = mcpTool('srv', 'Write')
    expect(getDenyRuleForTool(ctx, mcpWrite)).toBeNull()
  })

  test('规则串含点的 server 名折叠比对（mcp__My.Server ↔ My.Server）', () => {
    const ctx = makeContext({
      deny: { userSettings: ['mcp__My.Server'] },
    })
    const tool = mcpTool('My.Server', 'tool1')
    expect(getDenyRuleForTool(ctx, tool)).not.toBeNull()
  })
})

// rule() 构造器在本文件仅用于类型自证（规则经 context 串面注入）；
// 保留引用防 unused lint。
void rule
