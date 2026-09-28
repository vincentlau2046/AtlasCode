/**
 * engine/skill — 插件标识解析面（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/plugins/pluginIdentifier.ts skill 域消费子集）。
 *
 * 落面 = parsePluginIdentifier / buildPluginId / isOfficialMarketplaceName +
 * ALLOWED_OFFICIAL_MARKETPLACE_NAMES（8 官方市场名，逐字值）。skill 域消费点：
 * 插件 skill 命名（pluginInfo 面）与官方市场判定。
 *
 * 裁面登记（复审勿当遗漏重提）：
 *   ① 安装 scope 映射族（SETTING_SOURCE_TO_SCOPE / scopeToSettingSource /
 *      settingSourceToScope / ExtendedPluginScope / PersistablePluginScope，
 *      旧仓消费 installed_plugins.json 持久化 + EditableSettingSource 面）
 *      → 插件安装面（plugin 波）未落 → 不迁。
 */

/** 官方（Anthropic/Ascend 官方受控）市场名集合（旧仓逐字 8 名）。 */
export const ALLOWED_OFFICIAL_MARKETPLACE_NAMES = new Set([
  'claude-code-marketplace',
  'claude-code-plugins',
  'claude-plugins-official',
  'anthropic-marketplace',
  'anthropic-plugins',
  'agent-skills',
  'life-sciences',
  'knowledge-work-plugins',
])

/** 解析后的插件标识：name + 可选 marketplace */
export type ParsedPluginIdentifier = {
  name: string
  marketplace?: string
}

/**
 * 解析插件标识串（name 或 name@marketplace）为 name + marketplace。
 * 仅首个 '@' 作分隔符；多个 '@' 时第二个之后忽略
 * （市场名不应含 '@'，有意为之）。
 */
export function parsePluginIdentifier(plugin: string): ParsedPluginIdentifier {
  if (plugin.includes('@')) {
    const parts = plugin.split('@')
    return { name: parts[0] || '', marketplace: parts[1] }
  }
  return { name: plugin }
}

/**
 * 由 name + 可选 marketplace 构造插件 ID（"name" 或 "name@marketplace"）。
 */
export function buildPluginId(name: string, marketplace?: string): string {
  return marketplace ? `${name}@${marketplace}` : name
}

/**
 * 判定市场名是否为官方受控市场（旧仓遥测脱敏语义；新仓无遥测后端，
 * 保留判定面供市场治理消费）。
 */
export function isOfficialMarketplaceName(
  marketplace: string | undefined,
): boolean {
  return (
    marketplace !== undefined &&
    ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(marketplace.toLowerCase())
  )
}
