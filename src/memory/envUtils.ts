/**
 * envUtils — 域本地配置目录辅助（从旧仓 configDir.ts 收进）
 *
 * C1b 去重：布尔 env 原语 isEnvTruthy/isEnvDefinedFalsy 已下沉 shared/env
 * （单一事实源，跨域消费）。
 * T5 下沉效应收口：getConfigDirName 亦下沉 shared/configDir（单一事实源，
 * permissions + sandbox 共线）；本文件只留 memory 域专属的 getAtlasConfigHomeDir。
 * growthbook/settings 不在此（走 Port 8 / settings port 注入）。
 */
import { homedir } from 'os'
import { join } from 'path'
import { getConfigDirName } from '../shared'

/**
 * Atlas 配置主目录（~/.atlas 或 ATLAS_CONFIG_DIR 覆盖）。NFC 归一化。
 * getConfigDirName 来自 shared/configDir（单一事实源）。
 */
export function getAtlasConfigHomeDir(): string {
  return (process.env.ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())).normalize('NFC')
}
