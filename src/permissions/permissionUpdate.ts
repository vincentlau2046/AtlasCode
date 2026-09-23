/**
 * permissionUpdate — 权限更新纯应用核心（E-4 S-4b，§8.33 传递依赖裁定）
 *
 * 旧仓来源（a8af45b）:
 *   - src/utils/permissions/PermissionUpdate.ts:55-206（applyPermissionUpdate /
 *     applyPermissionUpdates 逐字）
 *   - src/utils/permissions/permissions.ts:1215-1254（convertRulesToUpdates 私有 +
 *     applyPermissionRulesToPermissionContext）
 *
 * 传递依赖裁定（§8.33 矛盾 ①）：边界钉死的 applyPermissionRulesToPermissionContext
 * 传递依赖 applyPermissionUpdates（纯 context 变换）→ update 应用核心自 S-4c2
 * 提前入 S-4b。S-4c2 余：persistPermissionUpdate(s) / supportsPersistence /
 * extractRules / hasRules / PermissionUpdateSchema（zod）/ 接缝③ 语法过滤支。
 * syncPermissionRulesFromDisk + deletePermissionRule 依赖 permissionsLoader
 * （S-4c1 engine 侧）→ 归 S-4c1，不本切片。
 *
 * 裁剪登记：旧 persistPermissionUpdate(s):222/349 + supportsPersistence:208 +
 * extractRules:30 / hasRules:45 不随迁（磁盘写回面 = S-4c1/c2；extractRules/
 * hasRules 无新仓消费点则不留死接缝，H6 核销归 S-4c2 判定）；旧 import
 * getSettingsForSource/updateSettingsForSource/addPermissionRulesToSettings/
 * toPosixPath 全裁（engine 侧面，L3 纯叶域不跨域）。
 * 依赖改法：logForDebugging = shared/debug（逐字语义）；jsonStringify =
 * JSON.stringify（旧 utils/slowOperations 深依赖，本面仅 debug 日志行）；
 * 类型全走 shared 单一事实源（PermissionUpdate 族 B 波冻结下沉）。
 *
 * 消费面（本切片实挂）：applyPermissionRulesToPermissionContext 供规则源装配
 * （S-4c1 permissionSetup 保留面 initializeToolPermissionContext 族）；
 * applyPermissionUpdates 供 S-4c1 写回核销 + S-4c2 persist 链。
 */
import type {
  PermissionBehavior,
  PermissionRule,
  PermissionRuleValue,
  PermissionUpdate,
  PermissionUpdateDestination,
  ToolPermissionContext,
} from '../shared'
import { logForDebugging } from '../shared'
import { permissionRuleValueToString } from './permissionRuleParser'

/**
 * Applies a single permission update to the context and returns the updated
 * context（旧仓 PermissionUpdate.ts:55 逐字）。
 * @param context The current permission context
 * @param update The permission update to apply
 * @returns The updated permission context
 */
export function applyPermissionUpdate(
  context: ToolPermissionContext,
  update: PermissionUpdate,
): ToolPermissionContext {
  switch (update.type) {
    case 'setMode':
      logForDebugging(
        `Applying permission update: Setting mode to '${update.mode}'`,
      )
      return {
        ...context,
        mode: update.mode,
      }

    case 'addRules': {
      const ruleStrings = update.rules.map(rule =>
        permissionRuleValueToString(rule),
      )
      logForDebugging(
        `Applying permission update: Adding ${update.rules.length} ${update.behavior} rule(s) to destination '${update.destination}': ${JSON.stringify(ruleStrings)}`,
      )

      // Determine which collection to update based on behavior
      const ruleKind =
        update.behavior === 'allow'
          ? 'alwaysAllowRules'
          : update.behavior === 'deny'
            ? 'alwaysDenyRules'
            : 'alwaysAskRules'

      return {
        ...context,
        [ruleKind]: {
          ...context[ruleKind],
          [update.destination]: [
            ...(context[ruleKind][update.destination] || []),
            ...ruleStrings,
          ],
        },
      }
    }

    case 'replaceRules': {
      const ruleStrings = update.rules.map(rule =>
        permissionRuleValueToString(rule),
      )
      logForDebugging(
        `Replacing all ${update.behavior} rules for destination '${update.destination}' with ${update.rules.length} rule(s): ${JSON.stringify(ruleStrings)}`,
      )

      // Determine which collection to update based on behavior
      const ruleKind =
        update.behavior === 'allow'
          ? 'alwaysAllowRules'
          : update.behavior === 'deny'
            ? 'alwaysDenyRules'
            : 'alwaysAskRules'

      return {
        ...context,
        [ruleKind]: {
          ...context[ruleKind],
          [update.destination]: ruleStrings, // Replace all rules for this source
        },
      }
    }

    case 'addDirectories': {
      logForDebugging(
        `Applying permission update: Adding ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'} with destination '${update.destination}': ${JSON.stringify(update.directories)}`,
      )
      const newAdditionalDirs = new Map(context.additionalWorkingDirectories)
      for (const directory of update.directories) {
        newAdditionalDirs.set(directory, {
          path: directory,
          source: update.destination,
        })
      }
      return {
        ...context,
        additionalWorkingDirectories: newAdditionalDirs,
      }
    }

    case 'removeRules': {
      const ruleStrings = update.rules.map(rule =>
        permissionRuleValueToString(rule),
      )
      logForDebugging(
        `Applying permission update: Removing ${update.rules.length} ${update.behavior} rule(s) from source '${update.destination}': ${JSON.stringify(ruleStrings)}`,
      )

      // Determine which collection to update based on behavior
      const ruleKind =
        update.behavior === 'allow'
          ? 'alwaysAllowRules'
          : update.behavior === 'deny'
            ? 'alwaysDenyRules'
            : 'alwaysAskRules'

      // Filter out the rules to be removed
      const existingRules = context[ruleKind][update.destination] || []
      const rulesToRemove = new Set(ruleStrings)
      const filteredRules = existingRules.filter(
        rule => !rulesToRemove.has(rule),
      )

      return {
        ...context,
        [ruleKind]: {
          ...context[ruleKind],
          [update.destination]: filteredRules,
        },
      }
    }

    case 'removeDirectories': {
      logForDebugging(
        `Applying permission update: Removing ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'}: ${JSON.stringify(update.directories)}`,
      )
      const newAdditionalDirs = new Map(context.additionalWorkingDirectories)
      for (const directory of update.directories) {
        newAdditionalDirs.delete(directory)
      }
      return {
        ...context,
        additionalWorkingDirectories: newAdditionalDirs,
      }
    }

    default:
      return context
  }
}

/**
 * Applies multiple permission updates to the context and returns the updated
 * context（旧仓 PermissionUpdate.ts:196 逐字）。
 */
export function applyPermissionUpdates(
  context: ToolPermissionContext,
  updates: PermissionUpdate[],
): ToolPermissionContext {
  let updatedContext = context
  for (const update of updates) {
    updatedContext = applyPermissionUpdate(updatedContext, update)
  }

  return updatedContext
}

/**
 * Helper to convert PermissionRule array to PermissionUpdate array
 * （旧仓 permissions.ts:1215 逐字；私有助手，随 apply 核心落本文件。）
 */
function convertRulesToUpdates(
  rules: PermissionRule[],
  updateType: 'addRules' | 'replaceRules',
): PermissionUpdate[] {
  // Group rules by source and behavior
  const grouped = new Map<string, PermissionRuleValue[]>()

  for (const rule of rules) {
    const key = `${rule.source}:${rule.ruleBehavior}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(rule.ruleValue)
  }

  // Convert to PermissionUpdate array
  const updates: PermissionUpdate[] = []
  for (const [key, ruleValues] of grouped) {
    const [source, behavior] = key.split(':')
    updates.push({
      type: updateType,
      rules: ruleValues,
      behavior: behavior as PermissionBehavior,
      destination: source as PermissionUpdateDestination,
    })
  }

  return updates
}

/**
 * Apply permission rules to context (additive - for initial setup)
 * （旧仓 permissions.ts:1248 逐字。syncPermissionRulesFromDisk 同族替换面
 * 归 S-4c1——依赖 permissionsLoader 磁盘读面。）
 */
export function applyPermissionRulesToPermissionContext(
  toolPermissionContext: ToolPermissionContext,
  rules: PermissionRule[],
): ToolPermissionContext {
  const updates = convertRulesToUpdates(rules, 'addRules')
  return applyPermissionUpdates(toolPermissionContext, updates)
}
