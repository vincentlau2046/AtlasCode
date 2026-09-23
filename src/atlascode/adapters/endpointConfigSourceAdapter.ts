/**
 * atlascode 组合根适配器 — settings 面 + env 静态键车道 →
 * modelprovider EndpointConfigSource（§8.29 E-3 S-3d，替换 B6-func env-only 版）
 *
 * 旧仓 settings-adapter（src/config/settings-adapter.ts）真核心（settings 面逐字）：
 *   - getRoleSetting = settings.modelRoles?.[role] || {}（roles.ts getRoleConfig
 *     的 per-role 配置面；getRoleModel 池头解析经本方法读 modelRoles.<role>.models）。
 *     settings 经 getInitialSettings()（旧仓 getSettings_DEPRECATED() || {} 逐字
 *     等价，S-3b 预声明接缝消费面）
 *   - getProviders = settings.providers || {}（P4 池 normalizeRef / resolveModel
 *     数据源，roles.ts:123/146）
 *   - getGlobalApiKey = env OpenAI 静态键车道（AUTH_TOKEN 优先 API_KEY）——旧仓
 *     keychain 面（getApiKeyFromConfigOrMacOSKeychain）→ 残留守（新仓 auth lane
 *     裁定 = OpenAI 静态键，keychain 未落；旧仓 R3 early-bootstrap swallow 语义
 *     由 env 读取天然满足——不抛错）。
 *
 * 惰性 getter 语义（等价旧仓 R3 memoized 重跑）：getInitialSettings 调用时
 * 读 settings 会话缓存（S-3a 三层缓存）；外部编辑 settings.json 后
 * resetSettingsCache 读盘（UI 写回面残留守 E-4 / E-wave-end）。per-role env
 * （ATLAS_{ROLE}_MODEL 等）仍由 roles.ts getRoleConfig 直读（非经端口，§8.17
 * D18 语义不变）。
 */
import { getInitialSettings } from '../../engine'
import type { EndpointConfigSource, ModelRole } from '../../modelprovider'

/** settings 面 + env 静态键车道 → modelprovider EndpointConfigSource 适配器。 */
export function createEndpointConfigSource(): EndpointConfigSource {
  return {
    getRoleSetting: (role: ModelRole) =>
      getInitialSettings().modelRoles?.[role] ?? {},
    getProviders: () => getInitialSettings().providers ?? {},
    // 全局 API key 回落：OpenAI 静态键车道（AUTH_TOKEN 优先 API_KEY）；
    // 旧仓 keychain 面残留守（见头注）。
    getGlobalApiKey: () =>
      process.env.OPENAI_AUTH_TOKEN ?? process.env.OPENAI_API_KEY,
  }
}
