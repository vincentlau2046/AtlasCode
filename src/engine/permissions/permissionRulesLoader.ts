/**
 * engine/permissions — 权限规则磁盘加载 / 写回（E-4 S-4c1，§8.34 裁定 ①⑤⑦⑩）
 *
 * 旧仓来源（a8af45b）:
 *   - src/utils/permissions/permissionsLoader.ts（296L 全迁：managed-only 判定 /
 *     lenient 编辑读 / settings→规则转换 / 全源加载 / 按源加载 / 写回 add·delete）
 *   - src/utils/permissions/permissions.ts:1156-1210 deletePermissionRule
 *     （⑩ 签名裁定：setToolPermissionContext 回调，旧 EditPermissionRuleArgs 逐字）
 *   - src/utils/permissions/permissions.ts:1259-1306 syncPermissionRulesFromDisk
 *     （接缝⑤ 写回核销：settings 热更后盘 → 内存 context 替换面）
 *
 * 依赖改法（裁定 ⑦，全部走 L3 连接器面，permissions 纯叶域不跨域）:
 *   - getSettingsForSource / getSettingsFilePathForSource / updateSettingsForSource /
 *     getEnabledSettingSources → engine/config settings 面（S-3b 真核心）
 *   - safeResolvePath + lstatSync → shared/fs-operations 加法原语（本切片落）
 *   - 旧 safeParseJSON(content, false) → 本地 parseJson（BOM 剥离 + JSON.parse
 *     try/catch → null，旧 utils/json 语义；shouldLogError=false = 不重复日志，
 *     校验错误经 settings 错误面呈现）
 *   - 旧 readFileSync（fileRead 包装）→ shared getFsImplementation().readFileSync
 *   - logError → shared logForDebugging no-op 门面（charter C-4 logging port 前）
 *   - 规则 parse/serialize + apply 核心 → permissions 域单一事实源（S-4a/S-4b）
 *
 * 裁出面登记（复审勿当遗漏重提）:
 *   - shouldShowAlwaysAllowOptions（旧 :42）不随迁：消费面 = 权限提示 UI
 *     （UI 面未落 = 残留守；单行 `!shouldAllowManagedPermissionRulesOnly()`，
 *     UI 落地时内联即得，不预声明死接缝）
 *   - lenient reader 的 FOR_EDITING_ONLY 语义逐字保留：仅写回路径使用，
 *     执行读一律走 getSettingsForSource（zod 校验面）
 *
 * 消费面登记（H6 实挂 / 预声明）:
 *   - loadAllPermissionRulesFromDisk / getPermissionRulesForSource：本切片
 *     permissionSetup.initializeToolPermissionContext 实挂
 *   - addPermissionRulesToSettings（接缝⑤ 写回写侧）：persistPermissionUpdate
 *     （S-4c2）+ 权限管理命令面（engine 侧接线）消费
 *   - deletePermissionRule：权限管理命令面（engine 侧接线）消费；只读源
 *     （policySettings/flagSettings/command）throw 逐字（旧仓行为契约）
 *   - syncPermissionRulesFromDisk：settings 热更面（applySettingsChange）残留守
 *   - shouldAllowManagedPermissionRulesOnly：loadAll / add 守卫 + 本文件消费
 */
import {
  getFsImplementation,
  safeResolvePath,
  logForDebugging,
  type PermissionBehavior,
  type PermissionRule,
  type PermissionRuleSource,
  type PermissionRuleValue,
  type PermissionUpdateDestination,
  type ToolPermissionContext,
} from '../../shared'
import {
  getEnabledSettingSources,
  getSettingsFilePathForSource,
  getSettingsForSource,
  updateSettingsForSource,
  type EditableSettingSource,
  type SettingsJson,
  type SettingSource,
} from '../config'
import {
  applyPermissionUpdate,
  applyPermissionUpdates,
  convertRulesToUpdates,
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from '../../permissions'

/**
 * Returns true if allowManagedPermissionRulesOnly is enabled in managed settings (policySettings).
 * When enabled, only permission rules from managed settings are respected.
 * （allowManagedPermissionRulesOnly 未入 SettingsSchema（passthrough 透传）→
 * Record 断言读，同 hasSkipDangerousModePermissionPrompt 口径）
 */
export function shouldAllowManagedPermissionRulesOnly(): boolean {
  const policy = getSettingsForSource('policySettings') as
    | Record<string, unknown>
    | null
  return policy?.allowManagedPermissionRulesOnly === true
}

const SUPPORTED_RULE_BEHAVIORS = [
  'allow',
  'deny',
  'ask',
] as const satisfies PermissionBehavior[]

/**
 * Lenient version of getSettingsForSource that doesn't fail on ANY validation errors.
 * Simply parses the JSON and returns it as-is without schema validation.
 *
 * Used when loading settings to append new rules (avoids losing existing rules
 * due to validation failures in unrelated fields like hooks).
 *
 * FOR EDITING ONLY - do not use this for reading settings for execution.
 */
function getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(
  source: SettingSource,
): SettingsJson | null {
  const filePath = getSettingsFilePathForSource(source)
  if (!filePath) {
    return null
  }

  try {
    const fs = getFsImplementation()
    const { resolvedPath } = safeResolvePath(fs, filePath)
    const content = fs.readFileSync(resolvedPath, { encoding: 'utf-8' })
    if (content.trim() === '') {
      return {}
    }

    const data = parseJson(content)
    // Return raw parsed JSON without validation to preserve all existing settings
    // This is safe because we're only using this for reading/appending, not for execution
    return data && typeof data === 'object' ? (data as SettingsJson) : null
  } catch {
    return null
  }
}

/** JSON.parse 安全包装（旧 safeParseJSON 裁剪：BOM 剥离 + try/catch → null）。 */
function parseJson(content: string): unknown {
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

/**
 * Converts permissions JSON to an array of PermissionRule objects
 * @param data The parsed permissions data
 * @param source The source of these rules
 * @returns Array of PermissionRule objects
 */
function settingsJsonToRules(
  data: SettingsJson | null,
  source: PermissionRuleSource,
): PermissionRule[] {
  if (!data || !data.permissions) {
    return []
  }

  const { permissions } = data
  const rules: PermissionRule[] = []
  for (const behavior of SUPPORTED_RULE_BEHAVIORS) {
    const behaviorArray = permissions[behavior]
    if (behaviorArray) {
      for (const ruleString of behaviorArray) {
        rules.push({
          source,
          ruleBehavior: behavior,
          ruleValue: permissionRuleValueFromString(ruleString),
        })
      }
    }
  }
  return rules
}

/**
 * Loads all permission rules from all relevant sources (managed and project settings)
 * @returns Array of all permission rules
 */
export function loadAllPermissionRulesFromDisk(): PermissionRule[] {
  // If allowManagedPermissionRulesOnly is set, only use managed permission rules
  if (shouldAllowManagedPermissionRulesOnly()) {
    return getPermissionRulesForSource('policySettings')
  }

  // Otherwise, load from all enabled sources (backwards compatible)
  const rules: PermissionRule[] = []

  for (const source of getEnabledSettingSources()) {
    rules.push(...getPermissionRulesForSource(source))
  }
  return rules
}

/**
 * Loads permission rules from a specific source
 * @param source The source to load from
 * @returns Array of permission rules from that source
 */
export function getPermissionRulesForSource(
  source: SettingSource,
): PermissionRule[] {
  const settingsData = getSettingsForSource(source)
  return settingsJsonToRules(settingsData, source)
}

export type PermissionRuleFromEditableSettings = PermissionRule & {
  source: EditableSettingSource
}

// Editable sources that can be modified (excludes policySettings and flagSettings)
const EDITABLE_SOURCES: EditableSettingSource[] = [
  'userSettings',
  'projectSettings',
  'localSettings',
]

/**
 * Deletes a rule from the project permissions file
 * @param rule The rule to delete
 * @returns A boolean indicating success
 */
export function deletePermissionRuleFromSettings(
  rule: PermissionRuleFromEditableSettings,
): boolean {
  // Runtime check to ensure source is actually editable
  if (!EDITABLE_SOURCES.includes(rule.source as EditableSettingSource)) {
    return false
  }

  const ruleString = permissionRuleValueToString(rule.ruleValue)
  const settingsData = getSettingsForSource(rule.source)

  // If there's no settings data or permissions, nothing to do
  if (!settingsData || !settingsData.permissions) {
    return false
  }

  const behaviorArray = settingsData.permissions[rule.ruleBehavior]
  if (!behaviorArray) {
    return false
  }

  // Normalize raw settings entries via roundtrip parse→serialize so legacy
  // names (e.g. "KillShell") match their canonical form ("TaskStop").
  const normalizeEntry = (raw: string): string =>
    permissionRuleValueToString(permissionRuleValueFromString(raw))

  if (!behaviorArray.some(raw => normalizeEntry(raw) === ruleString)) {
    return false
  }

  try {
    // Keep a copy of the original permissions data to preserve unrecognized keys
    const updatedSettingsData = {
      ...settingsData,
      permissions: {
        ...settingsData.permissions,
        [rule.ruleBehavior]: behaviorArray.filter(
          raw => normalizeEntry(raw) !== ruleString,
        ),
      },
    }

    const { error } = updateSettingsForSource(rule.source, updatedSettingsData)
    if (error) {
      // Error already logged inside updateSettingsForSource
      return false
    }

    return true
  } catch (error) {
    logForDebugging(errorMessageOf(error))
    return false
  }
}

function getEmptyPermissionSettingsJson(): SettingsJson {
  return {
    permissions: {},
  }
}

/**
 * Adds rules to the project permissions file
 * @param ruleValues The rule values to add
 * @returns A boolean indicating success
 */
export function addPermissionRulesToSettings(
  {
    ruleValues,
    ruleBehavior,
  }: {
    ruleValues: PermissionRuleValue[]
    ruleBehavior: PermissionBehavior
  },
  source: EditableSettingSource,
): boolean {
  // When allowManagedPermissionRulesOnly is enabled, don't persist new permission rules
  if (shouldAllowManagedPermissionRulesOnly()) {
    return false
  }

  if (ruleValues.length < 1) {
    // No rules to add
    return true
  }

  const ruleStrings = ruleValues.map(permissionRuleValueToString)
  // First try the normal settings loader which validates the schema
  // If validation fails, fall back to lenient loading to preserve existing rules
  // even if some fields (like hooks) have validation errors
  const settingsData =
    getSettingsForSource(source) ||
    getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) ||
    getEmptyPermissionSettingsJson()

  try {
    // Ensure permissions object exists
    const existingPermissions = settingsData.permissions || {}
    const existingRules = existingPermissions[ruleBehavior] || []

    // Filter out duplicates - normalize existing entries via roundtrip
    // parse→serialize so legacy names match their canonical form.
    const existingRulesSet = new Set(
      existingRules.map(raw =>
        permissionRuleValueToString(permissionRuleValueFromString(raw)),
      ),
    )
    const newRules = ruleStrings.filter(rule => !existingRulesSet.has(rule))

    // If no new rules to add, return success
    if (newRules.length === 0) {
      return true
    }

    // Keep a copy of the original settings data to preserve unrecognized keys
    const updatedSettingsData = {
      ...settingsData,
      permissions: {
        ...existingPermissions,
        [ruleBehavior]: [...existingRules, ...newRules],
      },
    }
    const result = updateSettingsForSource(source, updatedSettingsData)

    if (result.error) {
      throw result.error
    }

    return true
  } catch (error) {
    logForDebugging(errorMessageOf(error))
    return false
  }
}

/**
 * Delete a permission rule from the appropriate destination
 * （旧仓 permissions.ts:1169 逐字；⑩ 签名裁定：setToolPermissionContext
 * 回调替代旧仓 React 状态 setter——消费面（权限管理命令面）接线真状态写回）
 */
export async function deletePermissionRule({
  rule,
  initialContext,
  setToolPermissionContext,
}: {
  rule: PermissionRule
  initialContext: ToolPermissionContext
  setToolPermissionContext: (updatedContext: ToolPermissionContext) => void
}): Promise<void> {
  if (
    rule.source === 'policySettings' ||
    rule.source === 'flagSettings' ||
    rule.source === 'command'
  ) {
    throw new Error('Cannot delete permission rules from read-only settings')
  }

  const updatedContext = applyPermissionUpdate(initialContext, {
    type: 'removeRules',
    rules: [rule.ruleValue],
    behavior: rule.ruleBehavior,
    destination: rule.source as PermissionUpdateDestination,
  })

  // Per-destination logic to delete the rule from settings
  const destination = rule.source
  switch (destination) {
    case 'localSettings':
    case 'userSettings':
    case 'projectSettings': {
      // Note: Typescript doesn't know that rule conforms to
      // `PermissionRuleFromEditableSettings` even when we switch on `rule.source`
      deletePermissionRuleFromSettings(
        rule as PermissionRuleFromEditableSettings,
      )
      break
    }
    case 'cliArg':
    case 'session': {
      // No action needed for in-memory sources - not persisted to disk
      break
    }
  }

  setToolPermissionContext(updatedContext)
}

/**
 * Sync permission rules from disk (replacement - for settings changes)
 * （旧仓 permissions.ts:1259 逐字；接缝⑤ 写回核销——settings 热更后
 * 盘上规则 → 内存 context 的替换面。convertRulesToUpdates 'replaceRules'
 * 面经 permissions 域门面消费，addRules 面见 applyPermissionRulesToPermissionContext）
 */
export function syncPermissionRulesFromDisk(
  toolPermissionContext: ToolPermissionContext,
  rules: PermissionRule[],
): ToolPermissionContext {
  let context = toolPermissionContext

  // When allowManagedPermissionRulesOnly is enabled, clear all non-policy sources
  if (shouldAllowManagedPermissionRulesOnly()) {
    const sourcesToClear: PermissionUpdateDestination[] = [
      'userSettings',
      'projectSettings',
      'localSettings',
      'cliArg',
      'session',
    ]
    const behaviors: PermissionBehavior[] = ['allow', 'deny', 'ask']

    for (const source of sourcesToClear) {
      for (const behavior of behaviors) {
        context = applyPermissionUpdate(context, {
          type: 'replaceRules',
          rules: [],
          behavior,
          destination: source,
        })
      }
    }
  }

  // Clear all disk-based source:behavior combos before applying new rules.
  // Without this, removing a rule from settings (e.g. deleting a deny entry)
  // would leave the old rule in the context because convertRulesToUpdates
  // only generates replaceRules for source:behavior pairs that have rules —
  // an empty group produces no update, so stale rules persist.
  const diskSources: PermissionUpdateDestination[] = [
    'userSettings',
    'projectSettings',
    'localSettings',
  ]
  for (const diskSource of diskSources) {
    for (const behavior of ['allow', 'deny', 'ask'] as PermissionBehavior[]) {
      context = applyPermissionUpdate(context, {
        type: 'replaceRules',
        rules: [],
        behavior,
        destination: diskSource,
      })
    }
  }

  const updates = convertRulesToUpdates(rules, 'replaceRules')
  return applyPermissionUpdates(context, updates)
}

/** 错误消息提取（旧仓 logError(error) → shared no-op 门面单参 string 口）。 */
function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
