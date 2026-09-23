/**
 * engine/config 门面（§8.27 E-3 S-3a 类型面+源层+缓存，STR-1 门面规则）。
 *
 * S-3a 落：settings 类型面（SettingsSchema/SettingsJson/ValidationError）+ 源层
 * 常量（SETTING_SOURCES/getEnabledSettingSources）+ 三层缓存 + managedPath +
 * configRoot。S-3b 追加加载/合并/写回核心（settings.ts + validation）随切片
 * 在此追加 re-export。
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
