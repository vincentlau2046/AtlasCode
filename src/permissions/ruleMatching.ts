/**
 * ruleMatching — 权限规则匹配核心（E-4 S-4b，§8.33 边界钉死面）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissions.ts 规则支：
 *   - PERMISSION_RULE_SOURCES:96 / getAllow/Deny/AskRules:109-218（逐字）
 *   - toolMatchesRule:225（私）/ toolAlwaysAllowedRule:262 / getDenyRuleForTool:274
 *     / getAskRuleForTool:284 / getDenyRuleForAgent:295 / filterDeniedAgents:312（逐字）
 *   - getRuleByContentsForTool(Name):336-377（逐字）
 *   - checkRuleBasedPermissions:911-996（规则支 1a-1g，裁剪见下）
 *   - createPermissionRequestMessage:124-198（五变体裁剪版，见下）
 *   - permissionRuleSourceDisplayString:103（旧 getSettingSourceDisplayNameLowercase 逐字）
 *
 * 裁剪登记（H6 前向接缝 + 残留守，复审勿当遗漏重提）：
 *   - checkRuleBasedPermissions 1b 的 canSandboxAutoAllow（⑥ sandbox 自动放行）
 *     裁出 → 本面 ask 规则恒 ask；sandbox 自动放行随 E-6。
 *   - checkRuleBasedPermissions 1c = 鸭子可选分发（tool.checkPermissions? 存在才调）；
 *     旧 tool.inputSchema.parse 预解析裁（新 Tool 契约 inputSchema = JSON schema 无
 *     zod parse）/ catch 内 AbortError·APIUserAbortError 重抛裁（引擎类型，L3 域内
 *     不 import engine）+ logError → logForDebugging（shared/debug 无 logError）。
 *     工具面 checkPermissions 实现（Bash/PowerShell 等）归 E-6。
 *   - createPermissionRequestMessage 裁六支（hook/subcommandResults/
 *     permissionPromptTool/sandboxOverride/asyncAgent/classifier 决策原因分支）——
 *     生产方 = E-5 hooks / E-6 工具面 / E-7 / 分类器波（新仓 shared
 *     PermissionDecisionReason 仅 rule/mode/workingDir/safetyCheck/other 五变体）。
 *   - getUpdatedInputOrFallback（旧:1317）本切片零消费（消费点 = 旧 Inner 2a/2b
 *     工具面分发支，随 E-6）→ 裁出本切片，E-6 工具面分发片落（H6 防空洞）。
 *
 * 前向消费接缝（本切片登记，S-4d / E-6 消费，防「以为已全」）：
 *   - checkRuleBasedPermissions → S-4d gate 工厂（engine 侧 checkPermission 接线）
 *   - getDenyRuleForTool → S-4d filterToolsByDenyRules（deny 规则工具面过滤）
 *   - getRuleByContentsForToolName → E-6 Bash 工具面 checkPermissions（内容规则
 *     命中：deny `Bash(npm install)` 拒匹配 input）
 *   - getDenyRuleForAgent / filterDeniedAgents → AgentTool agentType 面
 *     （Agent(agentType) 语法，旧仓 swarm 链消费，新仓 AgentTool 消费登记）
 *
 * 域内依赖（L3 纯叶不破）：parser 函数组 = S-4a 同域文件；MCP 名匹配纯函数 =
 * 同域 mcpRuleNames.ts；类型全走 shared 单一事实源。
 */
import type {
  PermissionAskDecision,
  PermissionBehavior,
  PermissionDecisionReason,
  PermissionDenyDecision,
  PermissionMode,
  PermissionResult,
  PermissionRule,
  PermissionRuleSource,
  ToolPermissionContext,
} from '../shared'
import { errorMessage, logForDebugging } from '../shared'
import type { PermissionTool } from './filesystem'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from './permissionRuleParser'
import { getToolNameForPermissionCheck, mcpInfoFromString } from './mcpRuleNames'

/** 规则匹配工具窄视图（shared Tool 的 name + mcpInfo + 鸭子 checkPermissions 子集）。 */
export type RuleTool = Pick<PermissionTool, 'name' | 'mcpInfo' | 'checkPermissions'>

/**
 * 全部权限规则源（旧仓 [...SETTING_SOURCES, 'cliArg', 'command', 'session']）。
 * 匹配面 = flatMap + find 首命中优先（源序靠前者先列，命中即止）；旧仓
 * settings/constants.ts「后源覆盖前源」指 settings 合并序，不用于规则匹配
 * （E-4 审视 F3 订正——原注释系自合并语境照抄）。
 * 域内自持 8 值字面元组（SETTING_SOURCES 在 engine 侧 settings constants，
 * L3 不可 import；shared 类型约束 satisfies，值漂移 = tsc 红，§8.33 矛盾 ③）。
 */
const PERMISSION_RULE_SOURCES = [
  'userSettings',
  'projectSettings',
  'localSettings',
  'flagSettings',
  'policySettings',
  'cliArg',
  'command',
  'session',
] as const satisfies readonly PermissionRuleSource[]

/**
 * 权限规则源小写显示名（旧仓 getSettingSourceDisplayNameLowercase 逐字 8 值）。
 */
export function permissionRuleSourceDisplayString(
  source: PermissionRuleSource,
): string {
  switch (source) {
    case 'userSettings':
      return 'user settings'
    case 'projectSettings':
      return 'shared project settings'
    case 'localSettings':
      return 'project local settings'
    case 'flagSettings':
      return 'command line arguments'
    case 'policySettings':
      return 'enterprise managed settings'
    case 'cliArg':
      return 'CLI argument'
    case 'command':
      return 'command configuration'
    case 'session':
      return 'current session'
  }
}

export function getAllowRules(
  context: ToolPermissionContext,
): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysAllowRules[source] || []).map(ruleString => ({
      source,
      ruleBehavior: 'allow',
      ruleValue: permissionRuleValueFromString(ruleString),
    })),
  )
}

export function getDenyRules(context: ToolPermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysDenyRules[source] || []).map(ruleString => ({
      source,
      ruleBehavior: 'deny',
      ruleValue: permissionRuleValueFromString(ruleString),
    })),
  )
}

export function getAskRules(context: ToolPermissionContext): PermissionRule[] {
  return PERMISSION_RULE_SOURCES.flatMap(source =>
    (context.alwaysAskRules[source] || []).map(ruleString => ({
      source,
      ruleBehavior: 'ask',
      ruleValue: permissionRuleValueFromString(ruleString),
    })),
  )
}

/**
 * Check if the entire tool matches a rule
 * For example, this matches "Bash" but not "Bash(prefix:*)" for BashTool
 * This also matches MCP tools with a server name, e.g. the rule "mcp__server1"
 *
 * MCP server-level permission: rule "mcp__server1" matches tool
 * "mcp__server1__tool1". Also supports wildcard: rule "mcp__server1__*"
 * matches all tools from server1.（旧仓头注逐字；skip-prefix 环境模式
 * ATLAS_AGENT_SDK_MCP_NO_PREFIX 新仓无 = 残留守面，本面不实现。）
 */
function toolMatchesRule(
  tool: RuleTool,
  rule: PermissionRule,
): boolean {
  // Rule must not have content to match the entire tool
  if (rule.ruleValue.ruleContent !== undefined) {
    return false
  }

  // MCP 工具按全名 mcp__server__tool 匹配：deny 规则 targeting builtin
  // （如 "Write"）不应误伤同名 MCP 替代（getToolNameForPermissionCheck 逐字语义）。
  const nameForRuleMatch = getToolNameForPermissionCheck(tool)

  // Direct tool name match
  if (rule.ruleValue.toolName === nameForRuleMatch) {
    return true
  }

  // MCP server-level permission（旧仓逐字）
  const ruleInfo = mcpInfoFromString(rule.ruleValue.toolName)
  const toolInfo = mcpInfoFromString(nameForRuleMatch)

  return (
    ruleInfo !== null &&
    toolInfo !== null &&
    (ruleInfo.toolName === undefined || ruleInfo.toolName === '*') &&
    ruleInfo.serverName === toolInfo.serverName
  )
}

/**
 * Check if the entire tool is listed in the always allow rules
 * For example, this finds "Bash" but not "Bash(prefix:*)" for BashTool
 */
export function toolAlwaysAllowedRule(
  context: ToolPermissionContext,
  tool: RuleTool,
): PermissionRule | null {
  return (
    getAllowRules(context).find(rule => toolMatchesRule(tool, rule)) || null
  )
}

/**
 * Check if the tool is listed in the always deny rules
 */
export function getDenyRuleForTool(
  context: ToolPermissionContext,
  tool: RuleTool,
): PermissionRule | null {
  return getDenyRules(context).find(rule => toolMatchesRule(tool, rule)) || null
}

/**
 * Check if the tool is listed in the always ask rules
 */
export function getAskRuleForTool(
  context: ToolPermissionContext,
  tool: RuleTool,
): PermissionRule | null {
  return getAskRules(context).find(rule => toolMatchesRule(tool, rule)) || null
}

/**
 * Check if a specific agent is denied via Agent(agentType) syntax.
 * For example, Agent(Explore) would deny the Explore agent.
 */
export function getDenyRuleForAgent(
  context: ToolPermissionContext,
  agentToolName: string,
  agentType: string,
): PermissionRule | null {
  return (
    getDenyRules(context).find(
      rule =>
        rule.ruleValue.toolName === agentToolName &&
        rule.ruleValue.ruleContent === agentType,
    ) || null
  )
}

/**
 * Filter agents to exclude those that are denied via Agent(agentType) syntax.
 */
export function filterDeniedAgents<T extends { agentType: string }>(
  agents: T[],
  context: ToolPermissionContext,
  agentToolName: string,
): T[] {
  // Parse deny rules once and collect Agent(x) contents into a Set.
  // Previously this called getDenyRuleForAgent per agent, which re-parsed
  // every deny rule for every agent (O(agents×rules) parse calls).
  const deniedAgentTypes = new Set<string>()
  for (const rule of getDenyRules(context)) {
    if (
      rule.ruleValue.toolName === agentToolName &&
      rule.ruleValue.ruleContent !== undefined
    ) {
      deniedAgentTypes.add(rule.ruleValue.ruleContent)
    }
  }
  return agents.filter(agent => !deniedAgentTypes.has(agent.agentType))
}

/**
 * Map of rule contents to the associated rule for a given tool.
 * e.g. the string key is "prefix:*" from "Bash(prefix:*)" for BashTool
 */
export function getRuleByContentsForTool(
  context: ToolPermissionContext,
  tool: RuleTool,
  behavior: PermissionBehavior,
): Map<string, PermissionRule> {
  return getRuleByContentsForToolName(
    context,
    getToolNameForPermissionCheck(tool),
    behavior,
  )
}

// Used to break circular dependency where a Tool calls this function
export function getRuleByContentsForToolName(
  context: ToolPermissionContext,
  toolName: string,
  behavior: PermissionBehavior,
): Map<string, PermissionRule> {
  const ruleByContents = new Map<string, PermissionRule>()
  let rules: PermissionRule[] = []
  switch (behavior) {
    case 'allow':
      rules = getAllowRules(context)
      break
    case 'deny':
      rules = getDenyRules(context)
      break
    case 'ask':
      rules = getAskRules(context)
      break
  }
  for (const rule of rules) {
    if (
      rule.ruleValue.toolName === toolName &&
      rule.ruleValue.ruleContent !== undefined &&
      rule.ruleBehavior === behavior
    ) {
      ruleByContents.set(rule.ruleValue.ruleContent, rule)
    }
  }
  return ruleByContents
}

/**
 * 权限模式展示标题（旧仓 PermissionMode.ts getModeConfig title 逐字 5 外部模式；
 * auto/bubble 内部模式 = 分类器波残留守，回落 default 标题。TUI 符号/色面不随迁。）
 */
const PERMISSION_MODE_TITLES: Partial<Record<PermissionMode, string>> = {
  default: 'Default',
  plan: 'Plan Mode',
  acceptEdits: 'Accept edits',
  bypassPermissions: 'Bypass Permissions',
  dontAsk: "Don't Ask",
}

function permissionModeTitle(mode: PermissionMode): string {
  return PERMISSION_MODE_TITLES[mode] ?? 'Default'
}

/**
 * Creates a permission request message that explain the permission request
 * （裁剪版：仅新仓 shared PermissionDecisionReason 五变体，见文件头裁剪登记。）
 */
export function createPermissionRequestMessage(
  toolName: string,
  decisionReason?: PermissionDecisionReason,
): string {
  if (decisionReason) {
    switch (decisionReason.type) {
      case 'rule': {
        const ruleString = permissionRuleValueToString(
          decisionReason.rule.ruleValue,
        )
        const sourceString = permissionRuleSourceDisplayString(
          decisionReason.rule.source,
        )
        return `Permission rule '${ruleString}' from ${sourceString} requires approval for this ${toolName} command`
      }
      case 'mode': {
        const modeTitle = permissionModeTitle(decisionReason.mode)
        return `Current permission mode (${modeTitle}) requires approval for this ${toolName} command`
      }
      case 'workingDir':
      case 'safetyCheck':
      case 'other':
        return decisionReason.reason
    }
  }

  // Default message without listing allowed commands
  const message = `Atlas requested permissions to use ${toolName}, but you haven't granted it yet.`

  return message
}

/**
 * Check only the rule-based steps of the permission pipeline — the subset
 * that bypassPermissions mode respects (everything that fires before step 2a).
 *
 * Returns a deny/ask decision if a rule blocks the tool, or null if no rule
 * objects. 与旧仓差异（裁剪登记）：不跑自动模式分类器 / 模式转换（dontAsk/
 * asyncAgent）/ PermissionRequest hooks（残留守 ②⑤）；1b 无 sandbox 自动放行
 * 特判（⑥ 随 E-6）；1c 鸭子可选分发（工具面实现归 E-6）。
 *
 * Caller must pre-check tool.requiresUserInteraction() — step 1e is not
 * replicated（旧仓头注逐字）。
 */
export async function checkRuleBasedPermissions(
  tool: RuleTool,
  input: Record<string, unknown>,
  context: { getToolPermissionContext?(): ToolPermissionContext },
): Promise<PermissionAskDecision | PermissionDenyDecision | null> {
  const permissionContext = context.getToolPermissionContext?.()

  // 1a. Entire tool is denied by rule
  const denyRule = permissionContext
    ? getDenyRuleForTool(permissionContext, tool)
    : null
  if (denyRule) {
    return {
      behavior: 'deny',
      decisionReason: {
        type: 'rule',
        rule: denyRule,
      },
      message: `Permission to use ${tool.name} has been denied.`,
    }
  }

  // 1b. Entire tool has an ask rule（⑥ sandbox 自动放行裁出：恒 ask）
  const askRule = permissionContext
    ? getAskRuleForTool(permissionContext, tool)
    : null
  if (askRule) {
    return {
      behavior: 'ask',
      decisionReason: {
        type: 'rule',
        rule: askRule,
      },
      message: createPermissionRequestMessage(tool.name),
    }
  }

  // 1c. Tool-specific permission check (e.g. bash subcommand rules)——
  // 鸭子可选分发：tool.checkPermissions? 不存在（薄窄视图工具）= 保持 passthrough。
  let toolPermissionResult: PermissionResult = {
    behavior: 'passthrough',
    message: createPermissionRequestMessage(tool.name),
  }
  if (tool.checkPermissions) {
    try {
      toolPermissionResult = await tool.checkPermissions(input, context)
    } catch (e) {
      logForDebugging(
        `checkPermissions failed for ${tool.name}: ${errorMessage(e)}`,
      )
    }
  }

  // 1d. Tool implementation denied (catches content denies wrapped in
  // subcommandResults — no need to inspect decisionReason.type)
  if (toolPermissionResult?.behavior === 'deny') {
    return toolPermissionResult
  }

  // 1f. Content-specific ask rules from tool.checkPermissions
  // (e.g. Bash(npm publish:*) → {ask, type:'rule', ruleBehavior:'ask'})
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'rule' &&
    toolPermissionResult.decisionReason.rule.ruleBehavior === 'ask'
  ) {
    return toolPermissionResult
  }

  // 1g. Safety checks (e.g. .git/, .atlas/, .vscode/, shell configs) are
  // bypass-immune — they must prompt even when a PreToolUse hook returned
  // allow. checkPathSafetyForAutoEdit returns {type:'safetyCheck'} for these.
  if (
    toolPermissionResult?.behavior === 'ask' &&
    toolPermissionResult.decisionReason?.type === 'safetyCheck'
  ) {
    return toolPermissionResult
  }

  // No rule-based objection
  return null
}
