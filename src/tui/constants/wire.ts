/**
 * de-ANT: WIRE 协议标识符集中定义（W-2 占位化）。
 *
 * 背景：LLM 主链路已全走 OpenAI 协议 IFF 网关（无损转发，主链路不发任何
 * anthropic-* 头）。以下标识符只存在于 remote/cloud 功能子系统
 * （teleport / CCR / bridge / filesApi / 云会话，默认 feature 关闭），
 * 其服务端协议尚未与国内网关协同定案。
 *
 * [ATLAS-HOLD] 各常量的用途与改法：
 *   - 协议定案改名 → 只改这里的值（消费点已全部收敛到本文件）；
 *   - 整条协议随子系统下线 → 删常量，消费点随 feature 门一起消失。
 * 协同完成前值保持原样，保证子系统行为不变（零功能影响）。
 * 注意：HTTP 头键名 'anthropic-version' / 'anthropic-beta' 本身是协议键，
 * 改名需网关侧同步，不在本文件范围内（本文件只收敛"取值"）。
 */

/**
 * `anthropic-version` 头的取值。
 * 用途：teleport / CCR / bridge / filesApi / SSETransport / ccrClient /
 * remote 云会话子系统的 REST 请求头。
 */
export const WIRE_API_VERSION = '2023-06-01'

/**
 * `anthropic-beta` 头取值：CCR BYOC（bring-your-own-cloud）特性门。
 * 用途：teleport / createSession / sessionHistory / remote-setup /
 * remoteBridgeCore 的 cloud 会话建立请求。
 */
export const WIRE_CCR_BYOC_BETA = 'ccr-byoc-2025-07-29'

/**
 * `anthropic-beta` 头取值：environments API 特性门。
 * 用途：bridgeApi 环境管理请求。
 */
export const WIRE_ENVIRONMENTS_BETA = 'environments-2025-11-01'

/**
 * `anthropic-beta` 头取值：OAuth 特性门。
 * 用途：bootstrap / settingsSync / policyLimits / getOauthProfile 的
 * 1P OAuth 请求头。取值唯一事实来源在本文件（消费点直 import 本文件）。
 */
export const WIRE_OAUTH_BETA = 'oauth-2025-04-20'

/**
 * WIRE 协议 OAuth scope 标识符（冻结数据契约）。
 * 这些 scope 字符串是 gateway / 服务键车道的后端契约，改名需网关协同。
 * 从 constants/oauth.ts 迁入（订阅刷新链删除后，唯一活消费方是服务键的
 * scope 判定：settingsSync / policyLimits / auth.hasProfileScope）。
 */
export const CLAUDE_AI_INFERENCE_SCOPE = 'user:inference' as const
export const USER_PROFILE_SCOPE = 'user:profile' as const

/**
 * `anthropic-beta` 头取值：files API（oauth 子特性与 WIRE_OAUTH_BETA 联动，
 * 协同改名时只改 WIRE_OAUTH_BETA）。
 * 用途：filesApi 文件上传/读取请求。
 */
export const WIRE_FILES_API_BETA = `files-api-2025-04-14,${WIRE_OAUTH_BETA}`

/**
 * `anthropic-beta` 头取值：remote triggers 特性门。
 * 用途：RemoteTriggerTool 远程触发请求。
 */
export const WIRE_TRIGGERS_BETA = 'ccr-triggers-2026-01-30'

/**
 * `anthropic-beta` 头取值：managed MCP servers 特性门。
 * 用途：managedMcp 托管 MCP 服务器请求。
 */
export const WIRE_MCP_SERVERS_BETA = 'mcp-servers-2025-12-04'

/**
 * 环境描述协议枚举值（`environment_type` 字段）。
 * 用途：teleport/environments 与 remote-setup 创建 cloud 环境时的
 * 环境描述 payload。改值属协议变更，需网关协同。
 */
export const WIRE_ENVIRONMENT_TYPE = 'anthropic'

/**
 * 环境 kind 枚举值（'anthropic_cloud' | 'byoc' | 'bridge' 之一）。
 * 用途：同 WIRE_ENVIRONMENT_TYPE，cloud 环境默认 kind。
 * 注：EnvironmentKind 类型定义（teleport/environments.ts）中的字面量联合
 * 是枚举形状的事实来源，协同改名时类型与比较点需一并更新。
 */
export const WIRE_ENVIRONMENT_KIND_CLOUD = 'anthropic_cloud'
