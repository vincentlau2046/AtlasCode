/**
 * engine/config — managed settings 路径（§8.27 E-3 S-3a，旧仓 utils/settings/managedPath.ts 裁剪）
 *
 * 架构裁定：Linux 单支 /etc/atlas（旧仓 macos/windows 分支为 ClaudeCode 旧路径残留，
 * 不随迁；MDM registry/plist 通道残留守，Linux 文件通道 = managed 层单一活通道）。
 * 无 memoize（旧仓 lodash-es memoize 服务 150+ 热调用点；新仓 engine 上下文低频纯
 * 字符串拼接，零成本直算）。
 *
 * 语义（旧仓逐字）：
 *   - managed-settings.json（目录内基座）先合并，managed-settings.d/*.json drop-in
 *     按字母序叠在基座之上（后文件赢，systemd 惯例）——loadManagedFileSettings
 *     消费此两路径（S-3b）。
 */
import { join } from 'path'

/** managed settings 目录（Linux /etc/atlas）。 */
export function getManagedSettingsDir(): string {
  return '/etc/atlas'
}

/**
 * managed-settings.d/ drop-in 目录（drop-in 覆盖基座，字母序后文件赢）。
 */
export function getManagedSettingsDropInDir(): string {
  return join(getManagedSettingsDir(), 'managed-settings.d')
}
