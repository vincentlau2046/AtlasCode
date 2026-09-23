/**
 * atlascode 组合根适配器 — env OpenAI 静态键车道 → modelprovider EndpointConfigSource
 * （§8.17 D18：8 域唯一非 fail-fast 注入窗口，空配置语义安全）
 *
 * modelprovider 域只经 EndpointConfigSource 端口读端点/模型配置（六边形细节依赖
 * 抽象）。settings 文件面归 engine 波（settings 体系移植）；B6-func 最小组合根
 * 只铺 env 车道（CLAUDE.md 命名规范：OpenAI-protocol 静态键
 * OPENAI_AUTH_TOKEN / OPENAI_API_KEY / per-role ATLAS_{ROLE}_*）：
 *
 *   - getRoleSetting / getProviders 返空：per-role env（ATLAS_{ROLE}_MODEL 等）
 *     由 roles.ts getRoleConfig 直接读（非经端口），settings 文件面 B6-func 尚无。
 *   - getGlobalApiKey 提供全局回退：roles.ts getRoleConfig 在 env/role apiKey
 *     均缺时兜底调用，落 OpenAI 静态键（AUTH_TOKEN 优先）。
 *
 * 空 roleSetting/providers 语义安全（角色解析回落默认 provider + model undefined
 * 不假完成），异于 sandbox 禁用态须 fail-fast（防 fake 到底）。
 */
import type { EndpointConfigSource } from '../../modelprovider'
import type { ModelRole } from '../../modelprovider'

/** env OpenAI 静态键车道 → modelprovider EndpointConfigSource 适配器。 */
export function createEndpointConfigSource(): EndpointConfigSource {
  return {
    // settings 文件面（settings.modelRoles[role] / settings.providers）归 engine 波；
    // per-role env 由 roles.ts 直读，此处返空不重复。
    getRoleSetting: (_role: ModelRole) => ({}),
    getProviders: () => ({}),
    // 全局 API key 回退：OpenAI 静态键车道（AUTH_TOKEN 优先 API_KEY）。
    getGlobalApiKey: () =>
      process.env.OPENAI_AUTH_TOKEN ?? process.env.OPENAI_API_KEY,
  }
}
