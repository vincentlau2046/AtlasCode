/**
 * permissions 域 — hasPermissionsToUseTool 规则支决策面（E-4 S-4b，§8.33）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissions.ts。薄骨架（C-Deep
 * 切片 3 T5 no-op-allow 起步）翻新为规则支决策面：
 *   forceDecision 优先 → 1a deny 规则命中 → deny → 1b ask 规则命中 → ask →
 *   2b allow tool-wide 规则命中 → allow（decisionReason rule）→
 *   **空规则集 / 无命中 = allow（decisionReason mode，薄骨架 no-op-allow
 *   默认兼容，§8.33 矛盾 ④——本仓无 prompt 面，无规则反对时恒 allow）**。
 *
 * 规则匹配核心落位（S-4b，本文件消费）：ruleMatching.ts（getDeny/AskRuleForTool
 * + toolAlwaysAllowedRule + createPermissionRequestMessage +
 * checkRuleBasedPermissions 规则支）+ mcpRuleNames.ts（MCP 名匹配纯函数）+
 * permissionUpdate.ts（update 应用核心）+ shellRuleMatching.ts（shell 三态）。
 *
 * 残留守（复审勿当遗漏重提）——旧仓 hasPermissionsToUseTool 全量面 350L 中
 * 未随迁支：
 *   ① 工具面 checkPermissions 分发（Inner 1c/1e/1g/2a/3 全量面）——规则求值
 *      核心已随 S-4b 落（本文件 + ruleMatching），工具面分发半随 E-6（Bash /
 *      PowerShell 工具实现 + getUpdatedInputOrFallback updatedInput 提取）
 *   ② dontAsk 模式 ask→deny 转换（auto-mode 纵切波，§8.31 裁定 ①）
 *   ③ 自动模式 AI 分类器（yoloClassifier 族整族留守 → auto-mode 纵切波）
 *   ④ 连续拒绝跟踪（recordSuccess / persistDenialState）
 *   ⑤ executePermissionRequestHooks —— hooks→permissions 反向边
 *      （§8.14 注入序 permissions 先于 hooks，E-5 hooks 流式波接回；当前 no-op）
 *   ⑥ sandbox 自动放行 / Bash·PowerShell 工具面特判（随 E-6）
 *
 * 签名（薄骨架起，S-4b 不变）：旧仓 CanUseToolFn 依赖完整 Tool / ToolUseContext
 * / AssistantMessage（engine 类型，未随迁）；此处以窄视图 PermissionTool +
 * 泛型 context（可选 getToolPermissionContext）承载。engine 波（S-4d gate
 * 工厂 + 3 值 verdict 裁定）换回全量类型时本函数决策序不变。
 */
import type {
  PermissionDecision,
  ToolPermissionContext,
} from '../shared'
import type { PermissionTool } from './filesystem'
import {
  createPermissionRequestMessage,
  getAskRuleForTool,
  getDenyRuleForTool,
  toolAlwaysAllowedRule,
} from './ruleMatching'

/**
 * 规则支 CanUseToolFn 窄视图（旧仓全量 CanUseToolFn 的 name/mcpInfo/checkPermissions
 * 子集 + 窄 context）。context 可选 getToolPermissionContext —— 未注入 =
 * 空规则集 → 末端 allow（薄骨架默认兼容，非 fail-fast：区别于 bootstrap 窗口）。
 */
export type CanUseToolFn<
  Input extends Record<string, unknown> = Record<string, unknown>,
> = (
  tool: PermissionTool,
  input: Input,
  context: { getToolPermissionContext?(): ToolPermissionContext },
  assistantMessage?: unknown,
  toolUseID?: string,
  forceDecision?: PermissionDecision<Input>,
) => Promise<PermissionDecision<Input>>

/**
 * 规则支决策面（§8.33）：forceDecision 优先（engine 波透传入口）→
 * 1a deny → 1b ask → 2b allow tool-wide → 空规则集 = allow（mode 原因）。
 * 判别信号（tests/unit/permissions.test.ts 翻新面）：deny 规则拒匹配工具 /
 * ask 命中返 ask / allow 命中 rule 原因 / mcp__server 前缀拒该 server 全部
 * 工具 / 空规则集 = allow 回归。
 */
export const hasPermissionsToUseTool: CanUseToolFn = async (
  tool,
  input,
  context,
  _assistantMessage,
  _toolUseID,
  forceDecision,
): Promise<PermissionDecision> => {
  if (forceDecision !== undefined) {
    return forceDecision
  }

  const permissionContext = context.getToolPermissionContext?.()

  // 1a. 整工具 deny 规则命中（含 mcp__server 前缀 / __* 通配，toolMatchesRule）
  const denyRule = permissionContext
    ? getDenyRuleForTool(permissionContext, tool)
    : null
  if (denyRule) {
    return {
      behavior: 'deny',
      message: `Permission to use ${tool.name} has been denied.`,
      decisionReason: {
        type: 'rule',
        rule: denyRule,
      },
    }
  }

  // 1b. 整工具 ask 规则命中（⑥ sandbox 自动放行裁出：恒 ask）
  const askRule = permissionContext
    ? getAskRuleForTool(permissionContext, tool)
    : null
  if (askRule) {
    return {
      behavior: 'ask',
      message: createPermissionRequestMessage(tool.name),
      decisionReason: {
        type: 'rule',
        rule: askRule,
      },
    }
  }

  // 2b. 整工具 allow 规则命中
  const alwaysAllowedRule = permissionContext
    ? toolAlwaysAllowedRule(permissionContext, tool)
    : null
  if (alwaysAllowedRule) {
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'rule',
        rule: alwaysAllowedRule,
      },
    }
  }

  // 空规则集 / 无命中 = allow（薄骨架 no-op-allow 默认兼容，§8.33 矛盾 ④）
  return {
    behavior: 'allow',
    updatedInput: input,
    decisionReason: {
      type: 'mode',
      mode: permissionContext?.mode ?? 'default',
    },
  }
}
