/**
 * engine/config — settings 源层常量（§8.27 E-3 S-3a，旧仓 utils/settings/constants.ts 裁剪）
 *
 * 真核心：
 *   - SETTING_SOURCES 5 层（顺序 = 合并优先级，后源压前源）+ SettingSource 类型
 *   - getEnabledSettingSources（合并级联遍历面：allowed 源 + policy/flag 恒加）
 *   - EditableSettingSource（可写回源 = user/project/local，policy/flag 只读）
 *
 * 语义裁定（对照旧仓，锚点验真）：
 *   - 旧仓 getEnabledSettingSources = getAllowedSettingSources()（bootstrap/state
 *     桩恒 ['userSettings']）+ policy/flag 恒加 → 实际生效级联 =
 *     userSettings → policySettings → flagSettings 三源。projectSettings/
 *     localSettings 不在合并级联（旧仓语义逐字：仅 permissionsLoader/hooksSettings/
 *     sandbox 按源直读 + updateSettingsForSource 写回，S-3b/S-3c 消费）。
 *   - 新仓无 bootstrap getAllowedSettingSources 面 → allowed 固定 ['userSettings']
 *     （残留守：TUI 全模式源集扩展归组合根纵切；head 登记防「以为已全」）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - flagSettings 源保留但为死源：新仓无 --settings CLI 面（残留守），
 *     getSettingsFilePathForSource('flagSettings') 返回桩路径 → 文件不存在 → null。
 *   - 显示名族（getSettingSourceName/getSourceDisplayName/Lowercase/Capitalized）
 *     + SOURCES（权限规则保存 UI 显示序）+ ATLAS_SETTINGS_SCHEMA_URL → 裁剪
 *     （UI/JSON-schema 面；E-4 权限规则源显示名落规则树时按需回填）。
 *   - parseSettingSourcesFlag（--setting-sources CLI 解析）→ 裁剪（新仓无 CLI flag 面）。
 */

/**
 * All possible sources where settings can come from.
 * Order matters - later sources override earlier ones.
 */
export const SETTING_SOURCES = [
  // User settings (global)
  'userSettings',

  // Project settings (shared per-directory)
  'projectSettings',

  // Local settings (gitignored)
  'localSettings',

  // Flag settings (from --settings flag；新仓死源，见头注残留守)
  'flagSettings',

  // Policy settings (managed-settings.json，/etc/atlas 文件通道)
  'policySettings',
] as const

export type SettingSource = (typeof SETTING_SOURCES)[number]

/**
 * 新仓允许参与的源（allowed 面）：固定 userSettings 单源。
 * 残留守：旧仓经 bootstrap/state getAllowedSettingSources 供 TUI 全模式源集
 * （user/project/local 可随交互态扩展）；新仓无 bootstrap settings 面，
 * 固定单源（组合根纵切可注入扩展，头注登记防「以为已全」）。
 */
const ALLOWED_SETTING_SOURCES: readonly SettingSource[] = ['userSettings'] as const

/**
 * Get enabled setting sources with policy/flag always included.
 * @returns Array of enabled SettingSource values（级联遍历序）
 */
export function getEnabledSettingSources(): SettingSource[] {
  // Always include policy and flag settings（旧仓语义逐字）
  const result = new Set<SettingSource>(ALLOWED_SETTING_SOURCES)
  result.add('policySettings')
  result.add('flagSettings')
  return Array.from(result)
}

/**
 * Check if a specific source is enabled（级联是否遍历该源）。
 */
export function isSettingSourceEnabled(source: SettingSource): boolean {
  const enabled = getEnabledSettingSources()
  return enabled.includes(source)
}

/**
 * Editable setting sources（excludes policySettings and flagSettings which are read-only）。
 * 写回面（updateSettingsForSource，S-3b）仅接受此三源。
 */
export type EditableSettingSource = Exclude<
  SettingSource,
  'policySettings' | 'flagSettings'
>
