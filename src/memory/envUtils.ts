/**
 * envUtils — 域本地配置目录辅助（从旧仓 configDir.ts 收进）
 *
 * C1b 去重：布尔 env 原语 isEnvTruthy/isEnvDefinedFalsy 已下沉 shared/env
 * （单一事实源，跨域消费）；本文件只留 memory 域专属的 config-dir 逻辑。
 * growthbook/settings 不在此（走 Port 8 / settings port 注入）。
 */
import { homedir } from 'os'
import { join } from 'path'

/**
 * 配置目录名。clean-cut：恒 `.atlas`（无 legacy ~/.claude 兜底）。
 * ATLAS_CONFIG_DIR_NAME env 可覆盖。
 */
function getConfigDirName(): string {
  const override = process.env.ATLAS_CONFIG_DIR_NAME
  if (override) return override
  return '.atlas'
}

/**
 * Atlas 配置主目录（~/.atlas 或 ATLAS_CONFIG_DIR 覆盖）。NFC 归一化。
 */
export function getAtlasConfigHomeDir(): string {
  return (process.env.ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())).normalize('NFC')
}

