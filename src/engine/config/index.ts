/**
 * engine/config 门面（§8.27 E-3 S-3a 类型面+源层+缓存，STR-1 门面规则）。
 *
 * S-3a 落：settings 类型面（SettingsSchema/SettingsJson/ValidationError）+ 源层
 * 常量（SETTING_SOURCES/getEnabledSettingSources）+ 三层缓存 + managedPath +
 * configRoot。S-3b 落：加载/合并/写回核心（settings.ts + merge.ts +
 * validation.ts）。S-3c 落：hooks 字段族（hooksSchema 四类判别联合 +
 * hooksConfig snapshot/provider）+ managedEnv（两 apply 函数 + SAFE_ENV_VARS）
 * + getSettingsPaths（permissions 域桩① 真实现）。S-3d 落：autoCompact env
 * 覆写读侧（autoCompactOverrides，旧仓三变量收拢 config 面）。
 */
export {
  SettingsSchema,
  type SettingsJson,
  type FieldPath,
  type ValidationError,
  type SettingsWithErrors,
} from './types'
export {
  SETTING_SOURCES,
  getEnabledSettingSources,
  isSettingSourceEnabled,
  type SettingSource,
  type EditableSettingSource,
} from './constants'
export {
  getSessionSettingsCache,
  setSessionSettingsCache,
  getCachedSettingsForSource,
  setCachedSettingsForSource,
  getCachedParsedFile,
  setCachedParsedFile,
  resetSettingsCache,
  getPluginSettingsBase,
  setPluginSettingsBase,
  clearPluginSettingsBase,
} from './settingsCache'
export {
  getManagedSettingsDir,
  getManagedSettingsDropInDir,
} from './managedPath'
export { getAtlasConfigHomeDir } from './configRoot'
export {
  mergeWith,
  settingsMergeCustomizer,
  type MergeCustomizer,
} from './merge'
export {
  formatZodError,
  filterInvalidPermissionRules,
} from './validation'
export {
  loadManagedFileSettings,
  parseSettingsFile,
  getSettingsRootPathForSource,
  getSettingsFilePathForSource,
  getSettingsPaths,
  getRelativeSettingsFilePathForSource,
  getSettingsForSource,
  getPolicySettingsOrigin,
  updateSettingsForSource,
  getAutoModeConfig,
  hasSkipDangerousModePermissionPrompt,
  getInitialSettings,
  getSettingsWithErrors,
} from './settings'
// S-3c：hooks 字段族数据契约 + snapshot/provider + managedEnv
export {
  HookCommandSchema,
  HookMatcherSchema,
  HooksSchema,
  type CommandHookCommand,
  type PromptHookCommand,
  type AgentHookCommand,
  type HttpHookCommand,
  type ConfigHookCommand,
  type ConfigHookMatcher,
  type HooksSettings,
} from './hooksSchema'
export {
  captureHooksConfigSnapshot,
  updateHooksConfigSnapshot,
  getHooksConfigFromSnapshot,
  resetHooksConfigSnapshot,
  shouldAllowManagedHooksOnly,
  shouldDisableAllHooksIncludingManaged,
  createHooksConfigProvider,
} from './hooksConfig'
export {
  applySafeConfigEnvironmentVariables,
  applyConfigEnvironmentVariables,
  SAFE_ENV_VARS,
} from './managedEnv'
export {
  getAutoCompactEnvOverrides,
  type AutoCompactEnvOverrides,
} from './autoCompactOverrides'
