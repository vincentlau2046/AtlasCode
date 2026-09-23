/**
 * permissions 域 — settings 路径跨域注入窗口（E-3 S-3c，L3 四域斩断）
 *
 * L3 四域（task/bootstrap/permissions/hooks）互不 import：permissions 域
 * 需 settings 文件路径面（旧仓 getSettingsPaths = SETTING_SOURCES.map
 * getSettingsFilePathForSource，依赖 engine/config settings 加载体系），经
 * 本注入窗口斩断（同 bootstrap-env 的 setPermissionsBootstrapEnv idiom，
 * §8.14 注入序）；组合根（compose.ts）注入真实现（engine/config
 * getSettingsPaths，S-3c 消费点接线）。
 *
 * 未注入 = 空数组（降级态 = isAtlasSettingsPath 仅剩全局 {configDir}/
 * settings.json 的 endsWith 兜底捕获，即 S-3c 前薄骨架桩①行为）。非
 * fail-fast：permissions 域单测不经组合根，空数组是安全降级而非静默错误
 * （区别于 bootstrap 状态缺失的 fail-fast——两态语义差异见
 * bootstrap-env.ts 头注）。
 */

/** settings 路径提供器（无参 getter：路径依赖调用时 cwd/env 态，非装配时快照）。 */
export type SettingsPathsProvider = () => string[]

let _provider: SettingsPathsProvider | null = null

/** 组合根注入 settings 路径提供器（S-3c 接线：engine/config getSettingsPaths）。 */
export function setSettingsPathsProvider(provider: SettingsPathsProvider): void {
  _provider = provider
}

/** 读当前 settings 文件路径列表（未注入 = 空数组，降级语义见头注）。 */
export function getSettingsPaths(): string[] {
  return _provider ? _provider() : []
}

/** 测试复位（teardown 用）。 */
export function resetSettingsPathsProvider(): void {
  _provider = null
}
