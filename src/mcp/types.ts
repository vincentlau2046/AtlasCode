/**
 * mcp 域 — 配置 8 型 schema + 连接 4 态 union + 本地 SDK 替代型
 * （remote 波 S-E2b，§8.68 R2 MCP client 波）。
 *
 * 旧仓来源（a8af45b）：src/services/mcp/types.ts 258L 型面保真转写：
 *   - 8 型配置 schema（ConfigScope 7 值 + Transport 6 值 + 7 服务器型 +
 *     union + McpJsonConfig）逐字（型面保真：裁的是传输实现面，型面全留）
 *   - 旧 5 态 union（connected/failed/needs-auth/pending/disabled）→
 *     **4 态裁定**：needs-auth 折叠进 failed（authFailure 标记位）——认证面
 *     （旧 auth.ts 2370L + oauthPort/xaaIdpLogin）= 域外残留守（OAuth 车道
 *     2026-09-18 endpoint-cleanup 已删，[ATLAS-HOLD] 待 IFF 网关）
 *   - 旧 SerializedTool/SerializedClient/MCPCliState（CLI 状态面）= CLI 波
 *     域外，裁登记（新仓 CLI --mcp 面随 CLI 波落，型届时随面补）
 *
 * 依赖面调整（3-dep 纪律 + L3 顶域 ↛ engine）：
 *   - 旧 `import { z } from 'zod/v4'` → 新仓 zod 主入口 `zod`（= v4，
 *     swarm/teamHelpers delta 同注）
 *   - 旧 `lazySchema`（utils）→ shared 门面（跨域纯叶子下沉件）
 *   - 旧 SDK 型（@modelcontextprotocol/sdk Client/ServerCapabilities/
 *     Resource）→ 本地最小替代型（McpServerCapabilities /
 *     McpServerResource / McpServerTool / McpServerPrompt；结构字段保真，
 *     消费面 = mcpFetch 3 供应商 + manager initialize 握手；SDK 本体 =
 *     3-dep 违规面，本地 JSON-RPC 转写在 mcpJsonRpc.ts）
 */
import { z } from 'zod'
import { lazySchema } from '../shared'
import type { McpJsonRpcClient } from './mcpJsonRpc'

// ── 8 型配置 schema（旧 types.ts L10-135 逐字）────────────────────────

export const ConfigScopeSchema = lazySchema(() =>
  z.enum([
    'local',
    'user',
    'project',
    'dynamic',
    'enterprise',
    'claudeai',
    'managed',
  ]),
)
export type ConfigScope = z.infer<ReturnType<typeof ConfigScopeSchema>>

export const TransportSchema = lazySchema(() =>
  z.enum(['stdio', 'sse', 'sse-ide', 'http', 'ws', 'sdk']),
)
export type Transport = z.infer<ReturnType<typeof TransportSchema>>

export const McpStdioServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('stdio').optional(), // Optional for backwards compatibility
    command: z.string().min(1, 'Command cannot be empty'),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).optional(),
  }),
)

// Cross-App Access (XAA / SEP-990): just a per-server flag. IdP connection
// details (issuer, clientId, callbackPort) come from settings.xaaIdp — configured
// once, shared across all XAA-enabled servers. clientId/clientSecret (parent
// oauth config + keychain slot) are for the MCP server's AS.
const McpXaaConfigSchema = lazySchema(() => z.boolean())

const McpOAuthConfigSchema = lazySchema(() =>
  z.object({
    clientId: z.string().optional(),
    callbackPort: z.number().int().positive().optional(),
    authServerMetadataUrl: z
      .string()
      .url()
      .startsWith('https://', {
        message: 'authServerMetadataUrl must use https://',
      })
      .optional(),
    xaa: McpXaaConfigSchema().optional(),
  }),
)

export const McpSSEServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    headersHelper: z.string().optional(),
    oauth: McpOAuthConfigSchema().optional(),
  }),
)

// Internal-only server type for IDE extensions
export const McpSSEIDEServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('sse-ide'),
    url: z.string(),
    ideName: z.string(),
    ideRunningInWindows: z.boolean().optional(),
  }),
)

// Internal-only server type for IDE extensions
export const McpWebSocketIDEServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('ws-ide'),
    url: z.string(),
    ideName: z.string(),
    authToken: z.string().optional(),
    ideRunningInWindows: z.boolean().optional(),
  }),
)

export const McpHTTPServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    headersHelper: z.string().optional(),
    oauth: McpOAuthConfigSchema().optional(),
  }),
)

export const McpWebSocketServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('ws'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    headersHelper: z.string().optional(),
  }),
)

export const McpSdkServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('sdk'),
    name: z.string(),
  }),
)

// Config type for Claude.ai proxy servers
export const McpClaudeAIProxyServerConfigSchema = lazySchema(() =>
  z.object({
    type: z.literal('claudeai-proxy'),
    url: z.string(),
    id: z.string(),
  }),
)

export const McpServerConfigSchema = lazySchema(() =>
  z.union([
    McpStdioServerConfigSchema(),
    McpSSEServerConfigSchema(),
    McpSSEIDEServerConfigSchema(),
    McpWebSocketIDEServerConfigSchema(),
    McpHTTPServerConfigSchema(),
    McpWebSocketServerConfigSchema(),
    McpSdkServerConfigSchema(),
    McpClaudeAIProxyServerConfigSchema(),
  ]),
)

export type McpStdioServerConfig = z.infer<
  ReturnType<typeof McpStdioServerConfigSchema>
>
export type McpSSEServerConfig = z.infer<
  ReturnType<typeof McpSSEServerConfigSchema>
>
export type McpSSEIDEServerConfig = z.infer<
  ReturnType<typeof McpSSEIDEServerConfigSchema>
>
export type McpWebSocketIDEServerConfig = z.infer<
  ReturnType<typeof McpWebSocketIDEServerConfigSchema>
>
export type McpHTTPServerConfig = z.infer<
  ReturnType<typeof McpHTTPServerConfigSchema>
>
export type McpWebSocketServerConfig = z.infer<
  ReturnType<typeof McpWebSocketServerConfigSchema>
>
export type McpSdkServerConfig = z.infer<
  ReturnType<typeof McpSdkServerConfigSchema>
>
export type McpClaudeAIProxyServerConfig = z.infer<
  ReturnType<typeof McpClaudeAIProxyServerConfigSchema>
>
export type McpServerConfig = z.infer<ReturnType<typeof McpServerConfigSchema>>

export type ScopedMcpServerConfig = McpServerConfig & {
  scope: ConfigScope
  // For plugin-provided servers: the providing plugin's LoadedPlugin.source
  // (e.g. 'slack@anthropic'). Stashed at config-build time so the channel
  // gate doesn't have to race AppState.plugins.enabled hydration.
  pluginSource?: string
}

export const McpJsonConfigSchema = lazySchema(() =>
  z.object({
    mcpServers: z.record(z.string(), McpServerConfigSchema()),
  }),
)

export type McpJsonConfig = z.infer<ReturnType<typeof McpJsonConfigSchema>>

// ── 本地 SDK 替代型（3-dep 纪律；旧 SDK 型最小结构面）────────────────

/** 旧 SDK ServerCapabilities 最小面（消费面 = mcpFetch 3 供应商 capability
 * gate + manager initialize 结果落位）。 */
export type McpServerCapabilities = {
  tools?: boolean
  resources?: boolean
  prompts?: boolean
  [x: string]: unknown
}

/** 旧 SDK Resource 最小面（mcpFetch fetchResources 供应商落位）。 */
export type McpServerResource = {
  uri: string
  name: string
  mimeType?: string
  description?: string
}

/** 旧 SDK Tool 型最小面（mcpFetch fetchTools 供应商消费面）。 */
export type McpServerTool = {
  name: string
  description?: string
  inputSchema?: unknown
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    openWorldHint?: boolean
    title?: string
    [x: string]: unknown
  }
  _meta?: Record<string, unknown>
}

/** 旧 SDK Prompt 型最小面（mcpFetch fetchCommands 供应商消费面）。 */
export type McpServerPrompt = {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

// ── 连接 4 态 union（§8.68 R2 裁定：needs-auth 折叠进 failed）─────────

/** 已连接服务器（connected 形态；client = 本地 JSON-RPC 客户端真实现，
 * stdio 支 live；远程支前向接缝登记 = 本形态仅 stdio 可达）。 */
export type ConnectedMcpServer = {
  name: string
  type: 'connected'
  client: McpJsonRpcClient
  capabilities: McpServerCapabilities
  serverInfo?: {
    name: string
    version: string
  }
  instructions?: string
  config: ScopedMcpServerConfig
  cleanup: () => Promise<void>
}

/** 连接失败（failed 形态；error 承载失败原因。authFailure = 旧 needs-auth
 * 态折叠标记位〔§8.68 R2 裁定：认证面域外残留守，非独立态〕）。 */
export type FailedMcpServer = {
  name: string
  type: 'failed'
  config: ScopedMcpServerConfig
  error?: string
  authFailure?: boolean
}

export type PendingMcpServer = {
  name: string
  type: 'pending'
  config: ScopedMcpServerConfig
  reconnectAttempt?: number
  maxReconnectAttempts?: number
}

export type DisabledMcpServer = {
  name: string
  type: 'disabled'
  config: ScopedMcpServerConfig
}

export type McpServerConnection =
  | ConnectedMcpServer
  | FailedMcpServer
  | PendingMcpServer
  | DisabledMcpServer
