import z from 'zod/v4'
// Types extracted to src/types/permissions.ts to break import cycles
import type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
} from '../../types/permissions.js'
import { lazySchema } from '../lazySchema.js'

// Re-export for backwards compatibility
export type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
}

/**
 * ToolPermissionBehavior is the behavior associated with a permission rule.
 * 'allow' means the rule allows the tool to run.
 * 'deny' means the rule denies the tool from running.
 * 'ask' means the rule forces a prompt to be shown to the user.
 */
export const permissionBehaviorSchema = lazySchema(() =>
  z.enum(['allow', 'deny', 'ask']),
)

/**
 * AD-45 0.1.52：PreToolUse hook 路径权限决策 4 值枚举（单一事实源）。
 * 'defer' = 挂起重评（hook 裁定「现在不裁决」，会话挂起待 --resume 重评；
 * headless 车道走 hooks 域挂起面，TUI 交互车道解析器映射为确认等价 'ask'）。
 * 区别于 3 值 permissionBehaviorSchema（规则面 addRules/replaceRules 等
 * 权限规则值集——defer 是 hook 决策值，不入规则面，3 值枚举不动）。
 */
export const preToolUsePermissionDecisionSchema = lazySchema(() =>
  z.enum(['allow', 'deny', 'ask', 'defer']),
)

/**
 * PermissionRuleValue is the content of a permission rule.
 * @param toolName - The name of the tool this rule applies to
 * @param ruleContent - The optional content of the rule.
 *   Each tool may implement custom handling in `checkPermissions()`
 */
export const permissionRuleValueSchema = lazySchema(() =>
  z.object({
    toolName: z.string(),
    ruleContent: z.string().optional(),
  }),
)
