// M2 (docs/06): settings 适配器 — 模型配置端口的具体实现。
//
// 六边形架构的 adapter 层：只有本文件允许接触 `utils/settings` 与
// `utils/auth`（core/modelprovider 域内不得出现这些运行时 import）。
// 组合根 `core/factory.ts` 负责注册本适配器（"injection window"，R5）。

import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import type { EndpointConfigSource } from 'src/modelprovider'

/**
 * 以 settings.json（getSettings_DEPRECATED）+ env 为后端的适配器。
 *
 * 0.1.70 H-1（de-ant 根除，用户 2026-10-14 裁定）：getGlobalApiKey 断
 * anthropic keychain/OAuth 读取（旧 getApiKeyFromConfigOrMacOSKeychain →
 * macOS keychain claude.ai OAuth token → api.anthropic.com 403
 * "not enough quota to pre-consume" 根因链）——本 adapter 恒返 undefined，
 * 全局回落链仅存 atlascode 组合根的 env 静态键车道（OPENAI_AUTH_TOKEN ??
 * OPENAI_API_KEY，非 anthropic）。auth.ts keychain 残留清零 + OAuth 流程面
 * （constants/oauth.ts BASE_API_URL）= 0.1.71 de-ant 收尾波登记（本波仅断
 * modelProvider apiKey 回落链，不触 OAuth 流程面，Main 定项②）。
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
    // H-1：恒 undefined（keychain/OAuth 读取已断，见头注）。
    getGlobalApiKey(): string | undefined {
      return undefined
    },
  }
}
