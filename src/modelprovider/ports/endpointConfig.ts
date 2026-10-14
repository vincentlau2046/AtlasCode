/**
 * EndpointConfigSource 端口 — 从旧仓 modelprovider/config/port.ts 迁入
 *
 * modelprovider 域只通过此端口读取端点/模型配置（六边形：细节依赖抽象）。
 * 适配器实现（settings-adapter）在域外，保证域零外向运行时依赖。
 * 组合根（atlascode/compose.ts）经 setEndpointConfigSource() 注入。
 */

import type { ModelRole } from '../roles'

export interface EndpointConfigSource {
  /**
   * Per-role settings node: `settings.modelRoles[role]`
   * shape: `{ provider?, model?, baseURL?, apiKey?, models? }`（P4 池）。
   */
  getRoleSetting(role: ModelRole): any
  /**
   * settings.providers map: `{ [name]: { baseURL, apiKey, api, models[],
   * defaultContextWindow, defaultMaxTokens }`。
   */
  getProviders(): Record<string, any>
  /**
   * 全局 API key 回退（不区分角色）。实现面（0.1.70 H-1 de-ant 裁定后）：
   *   - tui settings-adapter = 恒 undefined（anthropic keychain/OAuth 读取已断——
   *     旧 getApiKeyFromConfigOrMacOSKeychain 回落链 = 403 根因，0.1.71 收尾清零）
   *   - atlascode 组合根 adapter = env 静态键车道（OPENAI_AUTH_TOKEN ?? OPENAI_API_KEY）
   * 必须吞掉 early-bootstrap 的 "Config accessed before allowed" 抛错，
   * 返回 undefined。
   */
  getGlobalApiKey(): string | undefined
}
