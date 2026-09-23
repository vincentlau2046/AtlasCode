/**
 * engine/config — 用户配置根目录（§8.27 E-3 S-3a，旧仓 utils/envUtils.ts getAtlasConfigHomeDir 裁剪）
 *
 * 解析序（旧仓逐字）：
 *   1. ATLAS_CONFIG_DIR env —— 显式覆盖整个 ~/.atlas 根（目录级 env）。
 *   2. homedir() / getConfigDirName()（shared/configDir 单一事实源：`.atlas`，
 *      ATLAS_CONFIG_DIR_NAME 覆写；clean cut 无 legacy ~/.claude 探测）。
 *   NFC normalize（跨文件系统路径一致性，旧仓逐字）。
 *
 * 无 memoize：旧仓 lodash memoize 以 ATLAS_CONFIG_DIR 为 key（服务 150+ 热调用点 +
 * 测试改 env 需清缓存）；新仓每次直读 env → 测试改 env 天然 fresh，无缓存一致性问题。
 */
import { homedir } from 'os'
import { join } from 'path'
import { getConfigDirName } from '../../shared'

export function getAtlasConfigHomeDir(): string {
  return (
    process.env.ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())
  ).normalize('NFC')
}
