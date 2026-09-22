/**
 * PermissionRule — 权限规则类型 + zod schema（C-Deep 切片 3 T5 随迁）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/PermissionRule.ts（40L，零深依赖）。
 * 类型（PermissionBehavior/Rule/RuleSource/RuleValue）已 B 波契约冻结下沉
 * shared/types-session，此处 re-export 保消费方旧 import 面；两 zod schema
 * 经 shared lazySchema 延迟到首调构造（sandbox manager 类型消费面）。
 *
 * 裁剪注：旧仓 `import z from 'zod/v4'`（AtlasHarness 装 zod v3 + v4 子路径）；
 * 新仓装 zod 4.6.5 主入口即 v4，改 `import { z } from 'zod'`。
 */
import { z } from 'zod'

import { lazySchema } from '../shared'
import type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
} from '../shared'

// 向后兼容 re-export
export type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
}

/**
 * ToolPermissionBehavior 是权限规则关联的行为。
 * 'allow' 表示规则允许工具运行；'deny' 表示规则禁止工具运行；
 * 'ask' 表示规则强制向用户弹框询问。
 */
export const permissionBehaviorSchema = lazySchema(() =>
  z.enum(['allow', 'deny', 'ask']),
)

/**
 * PermissionRuleValue 是权限规则的内容。
 * @param toolName - 该规则适用的工具名
 * @param ruleContent - 规则的可选内容。各工具可在 `checkPermissions()` 内
 *   实现自定义处理。
 */
export const permissionRuleValueSchema = lazySchema(() =>
  z.object({
    toolName: z.string(),
    ruleContent: z.string().optional(),
  }),
)
