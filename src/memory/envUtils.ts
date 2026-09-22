/**
 * envUtils — 域本地环境变量辅助（从旧仓 utils/envUtils.ts + configDir.ts 收进）
 *
 * charter DEP-3：utils 依赖收进域内，不外泄。memory 域只需这几个函数。
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

/**
 * 判断 env 值是否为「真」（1/true/yes/on，大小写不敏感）。
 */
export function isEnvTruthy(envVar: string | boolean | undefined): boolean {
  if (!envVar) return false
  if (typeof envVar === 'boolean') return envVar
  const normalizedValue = envVar.toLowerCase().trim()
  return ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

/**
 * 判断 env 值是否显式设为「假」（0/false/no/off）。
 * undefined → false（未设不算显式假）。
 */
export function isEnvDefinedFalsy(
  envVar: string | boolean | undefined,
): boolean {
  if (envVar === undefined) return false
  if (typeof envVar === 'boolean') return !envVar
  if (!envVar) return false
  const normalizedValue = envVar.toLowerCase().trim()
  return ['0', 'false', 'no', 'off'].includes(normalizedValue)
}
