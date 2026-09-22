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
   * 全局 API key 回退（落盘 config / macOS keychain，不区分角色）。
   * 必须吞掉 early-bootstrap 的 "Config accessed before allowed" 抛错，
   * 返回 undefined。
   */
  getGlobalApiKey(): string | undefined
}
