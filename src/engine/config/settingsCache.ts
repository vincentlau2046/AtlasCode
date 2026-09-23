/**
 * engine/config — settings 三层缓存（§8.27 E-3 S-3a，旧仓 utils/settings/settingsCache.ts 全量随迁）
 *
 * 真核心（旧仓逐字语义）：
 *   - sessionSettingsCache：合并结果（getSettingsWithErrors 会话级缓存）
 *   - perSourceCache：getSettingsForSource 按源缓存（undefined = miss；null = 该源
 *     无 settings 的已缓存结论）——与 session 缓存同一 resetSettingsCache() 触发
 *     失效（settings 写 / plugin init / hooks refresh）
 *   - parseFileCache：parseSettingsFile 路径级缓存（同一启动路径去重盘读 + zod 解析）
 *   - pluginSettingsBase：合并级联最低层（loadSettingsFromDisk 读取为 base）
 *
 * 残留守头注释（防「以为已全」）：
 *   - pluginSettingsBase 生产方 = 插件系统（pluginLoader 装载插件后写入）——新仓
 *     无插件系统（残留守）；未设 = undefined = 无 base 层，级联退化为 5 源层。
 *     setPluginSettingsBase 为预声明消费接缝（登记在案，非死接缝：级联读侧已落 S-3b）。
 */
import type { SettingSource } from './constants'
import type { SettingsJson, SettingsWithErrors, ValidationError } from './types'

let sessionSettingsCache: SettingsWithErrors | null = null

export function getSessionSettingsCache(): SettingsWithErrors | null {
  return sessionSettingsCache
}

export function setSessionSettingsCache(value: SettingsWithErrors): void {
  sessionSettingsCache = value
}

/**
 * Per-source cache for getSettingsForSource. Invalidated alongside the
 * merged sessionSettingsCache — same resetSettingsCache() triggers.
 */
const perSourceCache = new Map<SettingSource, SettingsJson | null>()

export function getCachedSettingsForSource(
  source: SettingSource,
): SettingsJson | null | undefined {
  // undefined = cache miss; null = cached "no settings for this source"
  return perSourceCache.has(source) ? perSourceCache.get(source) : undefined
}

export function setCachedSettingsForSource(
  source: SettingSource,
  value: SettingsJson | null,
): void {
  perSourceCache.set(source, value)
}

/**
 * Path-keyed cache for parseSettingsFile. Both getSettingsForSource and
 * loadSettingsFromDisk call parseSettingsFile on the same paths during
 * startup — this dedupes the disk read + zod parse.
 */
type ParsedSettings = {
  settings: SettingsJson | null
  errors: ValidationError[]
}
const parseFileCache = new Map<string, ParsedSettings>()

export function getCachedParsedFile(path: string): ParsedSettings | undefined {
  return parseFileCache.get(path)
}

export function setCachedParsedFile(path: string, value: ParsedSettings): void {
  parseFileCache.set(path, value)
}

export function resetSettingsCache(): void {
  sessionSettingsCache = null
  perSourceCache.clear()
  parseFileCache.clear()
}

/**
 * Plugin settings base layer for the settings cascade（最低优先级）。
 * 生产方残留守（见头注）；新仓未落插件系统前恒 undefined。
 */
let pluginSettingsBase: Record<string, unknown> | undefined

export function getPluginSettingsBase(): Record<string, unknown> | undefined {
  return pluginSettingsBase
}

export function setPluginSettingsBase(
  settings: Record<string, unknown> | undefined,
): void {
  pluginSettingsBase = settings
}

export function clearPluginSettingsBase(): void {
  pluginSettingsBase = undefined
}
