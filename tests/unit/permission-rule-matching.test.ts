/**
 * permissions 域规则匹配核心契约测试（E-4 S-4b，§8.33 matrix 新行 proof）
 *
 * 被测能力（旧仓 permissions.ts 规则支 + PermissionUpdate 应用核心）：
 *   - 规则访问器多源 flatMap（PERMISSION_RULE_SOURCES 8 值域内元组序）
 *   - tool-wide / 内容规则分离（toolMatchesRule：ruleContent undefined 才
 *     匹配整工具；mcp__server 前缀 + __* 通配拒该 server 全部工具）
 *   - Agent(agentType) 族（getDenyRuleForAgent / filterDeniedAgents）
 *   - getRuleByContentsForTool(Name) 内容规则 map（判别信号：deny
 *     `Bash(npm install)` 入 content map，E-6 Bash 工具面消费）
 *   - checkRuleBasedPermissions 规则支 1a·1b·1c 鸭子·1f·1g + 优先级
 *   - createPermissionRequestMessage 五变体裁剪版
 *   - applyPermissionUpdate(s) / applyPermissionRulesToPermissionContext
 *     （update 应用核心，S-4c2 提前面）
 * L3：只 import permissions 域根门面 + shared 类型（STR-1）。
 * 零磁盘（纯 context 变换 + 假 tool 鸭子）。
 */
import { describe, test, expect } from 'bun:test'
import {
  getAllowRules,
  getDenyRules,
  getAskRules,
  getDenyRuleForTool,
  toolAlwaysAllowedRule,
  getDenyRuleForAgent,
  filterDeniedAgents,
  getRuleByContentsForTool,
  getRuleByContentsForToolName,
  checkRuleBasedPermissions,
  createPermissionRequestMessage,
  permissionRuleSourceDisplayString,
  applyPermissionUpdate,
  applyPermissionUpdates,
  applyPermissionRulesToPermissionContext,
  mcpInfoFromString,
  getToolNameForPermissionCheck,
  normalizeNameForMCP,
  type RuleTool,
} from '../../src/permissions'
import type {
  PermissionRule,
  PermissionRuleValue,
  PermissionResult,
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

// ── 规则访问器（多源 flatMap + 源序）────────────────────────────────

describe('规则访问器 getAllow/Deny/AskRules（多源 flatMap）', () => {
  test('三源规则按 PERMISSION_RULE_SOURCES 序展开（userSettings < cliArg < session）', () => {
    const ctx = makeContext({
      allow: {
        userSettings: ['Read'],
        cliArg: ['Grep'],
        session: ['Bash'],
      },
    })
    expect(getAllowRules(ctx).map(r => r.ruleValue.toolName)).toEqual([
      'Read',
      'Grep',
      'Bash',
    ])
    expect(getDenyRules(ctx)).toEqual([])
    expect(getAskRules(ctx)).toEqual([])
  })

  test('规则串 parse 时归一（消费 S-4a parser：内容规则带 ruleContent）', () => {
    const ctx = makeContext({ deny: { session: ['Bash(npm install)'] } })
    const rules = getDenyRules(ctx)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual(
      rule('session', 'deny', { toolName: 'Bash', ruleContent: 'npm install' }),
    )
  })
})

// ── tool-wide / 内容规则分离（toolMatchesRule）─────────────────────

describe('tool 规则访问器（tool-wide vs 内容规则分离）', () => {
  const bash: RuleTool = { name: 'Bash' }

  test('内容规则不匹配整工具（deny Bash(npm install) 不拒裸 Bash 工具）', () => {
    const ctx = makeContext({ deny: { session: ['Bash(npm install)'] } })
    expect(getDenyRuleForTool(ctx, bash)).toBeNull()
    expect(toolAlwaysAllowedRule(ctx, bash)).toBeNull()
  })

  test('tool-wide 规则命中（deny "Bash" 拒整工具）', () => {
    const ctx = makeContext({ deny: { session: ['Bash'] } })
    expect(getDenyRuleForTool(ctx, bash)).toEqual(
      rule('session', 'deny', { toolName: 'Bash' }),
    )
  })

  test('mcp__server 前缀拒该 server 全部工具（__* 通配同）', () => {
    const mcpTool: RuleTool = {
      name: 'mcp__myserver__tool1',
      mcpInfo: { serverName: 'myserver', toolName: 'tool1' },
    }
    const ctxPrefix = makeContext({ deny: { session: ['mcp__myserver'] } })
    expect(
      getDenyRuleForTool(ctxPrefix, mcpTool)?.ruleValue.toolName,
    ).toBe('mcp__myserver')
    const ctxWild = makeContext({ deny: { session: ['mcp__myserver__*'] } })
    expect(getDenyRuleForTool(ctxWild, mcpTool)).not.toBeNull()
    // 其他 server 不受影响
    const other: RuleTool = {
      name: 'mcp__other__tool1',
      mcpInfo: { serverName: 'other', toolName: 'tool1' },
    }
    expect(getDenyRuleForTool(ctxPrefix, other)).toBeNull()
  })

  test('MCP 工具按全名匹配（builtin 同名规则不误伤 MCP 替代）', () => {
    // 规则 "Write" 不应匹配 mcp__srv__Write（其规则匹配名 = mcp__srv__Write）
    const mcpWrite: RuleTool = {
      name: 'mcp__srv__Write',
      mcpInfo: { serverName: 'srv', toolName: 'Write' },
    }
    const ctx = makeContext({ deny: { session: ['Write'] } })
    expect(getDenyRuleForTool(ctx, mcpWrite)).toBeNull()
  })
})

// ── Agent(agentType) 族 ─────────────────────────────────────────────

describe('getDenyRuleForAgent / filterDeniedAgents（Agent(agentType) 语法）', () => {
  const ctx = makeContext({ deny: { session: ['Agent(Explore)', 'Agent(Plan)'] } })

  test('命中的 agentType 返回规则', () => {
    expect(getDenyRuleForAgent(ctx, 'Agent', 'Explore')).not.toBeNull()
  })

  test('未命中 = null', () => {
    expect(getDenyRuleForAgent(ctx, 'Agent', 'Other')).toBeNull()
  })

  test('filterDeniedAgents 剔除被拒 agentType（一次 parse 全量过滤）', () => {
    const agents = [
      { agentType: 'Explore' },
      { agentType: 'Plan' },
      { agentType: 'Other' },
    ]
    expect(filterDeniedAgents(agents, ctx, 'Agent')).toEqual([
      { agentType: 'Other' },
    ])
  })
})

// ── 内容规则 map（判别信号面）───────────────────────────────────────

describe('getRuleByContentsForTool(Name)（内容规则 map，E-6 工具面消费）', () => {
  test('deny Bash(npm install) 入 content map（判别信号）', () => {
    const ctx = makeContext({ deny: { session: ['Bash(npm install)', 'Bash'] } })
    const map = getRuleByContentsForToolName(ctx, 'Bash', 'deny')
    expect(map.get('npm install')).toEqual(
      rule('session', 'deny', { toolName: 'Bash', ruleContent: 'npm install' }),
    )
    // tool-wide 规则（无 ruleContent）不入 map
    expect(map.has('')).toBe(false)
    expect(map.size).toBe(1)
  })

  test('behavior 分离（allow/deny map 各取各支）', () => {
    const ctx = makeContext({
      deny: { session: ['Bash(npm install)'] },
      allow: { session: ['Bash(npm ci)'] },
    })
    expect(getRuleByContentsForToolName(ctx, 'Bash', 'deny').size).toBe(1)
    expect(getRuleByContentsForToolName(ctx, 'Bash', 'allow').size).toBe(1)
    expect(getRuleByContentsForToolName(ctx, 'Read', 'deny').size).toBe(0)
  })

  test('MCP 工具视图经 getRuleByContentsForTool 全名解析', () => {
    const mcpTool: RuleTool = {
      name: 'mcp__srv__query',
      mcpInfo: { serverName: 'srv', toolName: 'query' },
    }
    const ctx = makeContext({ deny: { session: ['mcp__srv__query(SELECT *)'] } })
    const map = getRuleByContentsForTool(ctx, mcpTool, 'deny')
    expect(map.get('SELECT *')).not.toBeNull()
  })
})

// ── checkRuleBasedPermissions（规则支 1a-1g）────────────────────────

describe('checkRuleBasedPermissions（bypass 尊重子集 1a-1g）', () => {
  const empty: Record<string, unknown> = {}

  test('1a deny 规则命中 → deny（先于工具面分发）', async () => {
    const tool: RuleTool = {
      name: 'Bash',
      // 即便工具面自决 allow，1a deny 规则优先
      checkPermissions: async () => ({
        behavior: 'allow' as const,
        decisionReason: undefined,
      }),
    }
    const ctx = makeContext({ deny: { session: ['Bash'] } })
    const result = await checkRuleBasedPermissions(tool, empty, {
      getToolPermissionContext: () => ctx,
    })
    expect(result?.behavior).toBe('deny')
  })

  test('1b ask 规则命中 → ask', async () => {
    const result = await checkRuleBasedPermissions(
      { name: 'Bash' },
      empty,
      {
        getToolPermissionContext: () =>
          makeContext({ ask: { session: ['Bash'] } }),
      },
    )
    expect(result?.behavior).toBe('ask')
    expect(result?.decisionReason?.type).toBe('rule')
  })

  test('无规则 + 无工具面分发 → null（无规则反对）', async () => {
    const result = await checkRuleBasedPermissions(
      { name: 'Bash' },
      empty,
      {},
    )
    expect(result).toBeNull()
  })

  test('1c 鸭子分发：工具面 deny → 透传（1d）', async () => {
    const tool: RuleTool = {
      name: 'Bash',
      checkPermissions: async () => ({
        behavior: 'deny' as const,
        message: 'subcommand denied',
        decisionReason: { type: 'other' as const, reason: 'dangerous subcommand' },
      }),
    }
    const result = await checkRuleBasedPermissions(tool, empty, {})
    expect(result?.behavior).toBe('deny')
    expect(result?.message).toBe('subcommand denied')
  })

  test('1f 内容规则 ask（decisionReason rule + ruleBehavior ask）→ 透传', async () => {
    const askResult: PermissionResult = {
      behavior: 'ask',
      message: 'content ask',
      decisionReason: {
        type: 'rule',
        rule: rule('session', 'ask', {
          toolName: 'Bash',
          ruleContent: 'npm publish:*',
        }),
      },
    }
    const result = await checkRuleBasedPermissions(
      { name: 'Bash', checkPermissions: async () => askResult },
      empty,
      {},
    )
    expect(result?.behavior).toBe('ask')
  })

  test('1g safetyCheck → 透传（bypass-immune）', async () => {
    const safety: PermissionResult = {
      behavior: 'ask',
      message: 'sensitive path',
      decisionReason: {
        type: 'safetyCheck',
        reason: 'protected file',
        classifierApprovable: false,
      },
    }
    const result = await checkRuleBasedPermissions(
      { name: 'Bash', checkPermissions: async () => safety },
      empty,
      {},
    )
    expect(result?.behavior).toBe('ask')
    expect(result?.decisionReason?.type).toBe('safetyCheck')
  })

  test('1c 工具面抛错 → 吞错降级 null（不传播）', async () => {
    const result = await checkRuleBasedPermissions(
      {
        name: 'Bash',
        checkPermissions: async () => {
          throw new Error('tool check blew up')
        },
      },
      empty,
      {},
    )
    expect(result).toBeNull()
  })
})

// ── createPermissionRequestMessage（五变体裁剪版）───────────────────

describe('createPermissionRequestMessage（裁剪版五变体）', () => {
  test('无 decisionReason → 默认请求消息', () => {
    expect(createPermissionRequestMessage('Bash')).toBe(
      "Atlas requested permissions to use Bash, but you haven't granted it yet.",
    )
  })

  test('rule 变体（规则串 + 源小写显示名）', () => {
    expect(
      createPermissionRequestMessage(
        'Bash',
        {
          type: 'rule',
          rule: rule('session', 'deny', {
            toolName: 'Bash',
            ruleContent: 'npm install',
          }),
        },
      ),
    ).toBe(
      "Permission rule 'Bash(npm install)' from current session requires approval for this Bash command",
    )
  })

  test('mode 变体（模式展示标题）', () => {
    expect(
      createPermissionRequestMessage('Bash', {
        type: 'mode',
        mode: 'plan',
      }),
    ).toBe(
      'Current permission mode (Plan Mode) requires approval for this Bash command',
    )
  })

  test('safetyCheck/other/workingDir 变体 → reason 原文', () => {
    expect(
      createPermissionRequestMessage('Write', {
        type: 'safetyCheck',
        reason: 'protected file',
        classifierApprovable: false,
      }),
    ).toBe('protected file')
  })
})

// ── mcpRuleNames 纯函数（域内本地定义面）────────────────────────────

describe('mcpRuleNames（MCP 名归一/解析纯函数）', () => {
  test('mcpInfoFromString 三态（server 级 / 工具级 / 非 MCP）', () => {
    expect(mcpInfoFromString('mcp__a__b')).toEqual({
      serverName: 'a',
      toolName: 'b',
    })
    expect(mcpInfoFromString('mcp__a')).toEqual({
      serverName: 'a',
      toolName: undefined,
    })
    expect(mcpInfoFromString('Bash')).toBeNull()
  })

  test('工具名内双下划线保留（join 全段）', () => {
    expect(mcpInfoFromString('mcp__s__a__b')?.toolName).toBe('a__b')
  })

  test('getToolNameForPermissionCheck：MCP 全名归一 / 非 MCP 原名', () => {
    expect(
      getToolNameForPermissionCheck({
        name: 'mcp__my server__t',
        mcpInfo: { serverName: 'my server', toolName: 't' },
      }),
    ).toBe('mcp__my_server__t')
    expect(getToolNameForPermissionCheck({ name: 'Bash' })).toBe('Bash')
  })

  test('normalizeNameForMCP 非法字符归一 + claude.ai 特判', () => {
    expect(normalizeNameForMCP('my.server v2')).toBe('my_server_v2')
    expect(normalizeNameForMCP('claude.ai acme')).toBe('claude_ai_acme')
  })
})

// ── permissionRuleSourceDisplayString ───────────────────────────────

describe('permissionRuleSourceDisplayString（8 值小写显示名）', () => {
  test('settings 五源 + 三非 settings 源', () => {
    expect(permissionRuleSourceDisplayString('userSettings')).toBe(
      'user settings',
    )
    expect(permissionRuleSourceDisplayString('policySettings')).toBe(
      'enterprise managed settings',
    )
    expect(permissionRuleSourceDisplayString('cliArg')).toBe('CLI argument')
    expect(permissionRuleSourceDisplayString('session')).toBe('current session')
  })
})

// ── update 应用核心（S-4c2 提前面）──────────────────────────────────

describe('applyPermissionUpdate(s) / applyPermissionRulesToPermissionContext', () => {
  test('addRules 累积 + replaceRules 替换 + removeRules 过滤', () => {
    let ctx = makeContext()
    ctx = applyPermissionUpdate(ctx, {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'ls' }],
      behavior: 'deny',
      destination: 'session',
    })
    expect(ctx.alwaysDenyRules.session).toEqual(['Bash(ls)'])
    ctx = applyPermissionUpdates(ctx, [
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'rm' }],
        behavior: 'deny',
        destination: 'session',
      },
    ])
    expect(ctx.alwaysDenyRules.session).toEqual(['Bash(ls)', 'Bash(rm)'])
    ctx = applyPermissionUpdate(ctx, {
      type: 'replaceRules',
      rules: [{ toolName: 'Bash', ruleContent: 'pwd' }],
      behavior: 'deny',
      destination: 'session',
    })
    expect(ctx.alwaysDenyRules.session).toEqual(['Bash(pwd)'])
    ctx = applyPermissionUpdate(ctx, {
      type: 'removeRules',
      rules: [{ toolName: 'Bash', ruleContent: 'pwd' }],
      behavior: 'deny',
      destination: 'session',
    })
    expect(ctx.alwaysDenyRules.session).toEqual([])
  })

  test('setMode 覆盖 mode + addDirectories 挂 additionalWorkingDirectories', () => {
    let ctx = applyPermissionUpdate(makeContext(), {
      type: 'setMode',
      destination: 'session',
      mode: 'plan',
    })
    expect(ctx.mode).toBe('plan')
    ctx = applyPermissionUpdate(ctx, {
      type: 'addDirectories',
      destination: 'session',
      directories: ['/tmp/extra'],
    })
    expect(ctx.additionalWorkingDirectories.get('/tmp/extra')).toEqual({
      path: '/tmp/extra',
      source: 'session',
    })
  })

  test('applyPermissionRulesToPermissionContext 按 source:behavior 分组累积', () => {
    const updated = applyPermissionRulesToPermissionContext(makeContext(), [
      rule('session', 'deny', { toolName: 'Bash', ruleContent: 'npm install' }),
      rule('session', 'deny', { toolName: 'Bash', ruleContent: 'npm ci' }),
      rule('userSettings', 'allow', { toolName: 'Read' }),
    ])
    expect(updated.alwaysDenyRules.session).toEqual([
      'Bash(npm install)',
      'Bash(npm ci)',
    ])
    expect(updated.alwaysAllowRules.userSettings).toEqual(['Read'])
  })
})
