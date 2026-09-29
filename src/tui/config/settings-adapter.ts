// M2 (docs/06): settings 适配器 — 模型配置端口的具体实现。
//
// 六边形架构的 adapter 层：只有本文件允许接触 `utils/settings` 与
// `utils/auth`（core/modelprovider 域内不得出现这些运行时 import）。
// 组合根 `core/factory.ts` 负责注册本适配器（"injection window"，R5）。

import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { getApiKeyFromConfigOrMacOSKeychain } from '../utils/auth.js'
import type { EndpointConfigSource } from 'src/modelprovider'

/**
 * 以 settings.json（getSettings_DEPRECATED）+ env + 落盘/keychain 全局 key
 * 为后端的适配器。保留 R3 的 early-throw swallow：config 未就绪时
 * getGlobalApiKey 返回 undefined 而非抛错（memoized getter 会在 config
 * 可读后重跑）。
 */
export function createSettingsAdapter(): EndpointConfigSource {
  return {
    getRoleSetting(role: string): any {
      const settings = getSettings_DEPRECATED() || {}
      return (settings as any).modelRoles?.[role] || {}
    },
    getProviders(): Record<string, any> {
      const settings = getSettings_DEPRECATED() || {}
      return ((settings as any).providers || {}) as Record<string, any>
    },
    getGlobalApiKey(): string | undefined {
      try {
        return getApiKeyFromConfigOrMacOSKeychain()?.key
      } catch {
        // R3：early-bootstrap 阶段 config 未就绪会抛 "Config accessed before
        // allowed"；吞掉返回 undefined（memoized getter 稍后自动重跑）。
        return undefined
      }
    },
  }
}
