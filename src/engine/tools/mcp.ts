/**
 * engine/tools — MCP 工具构建（§8.25 E-2 T-5a，旧仓 services/mcp/client.ts
 * fetchToolsForClient + mcpStringUtils/normalization 裁剪版真核心）
 *
 * 架构裁定（残留守⑧闭环，review 2026-09-23「无消费点不加接缝」）：
 *   新仓 Tool 契约已有一等 `isMcp` / `mcpInfo` 字段 → MCP 工具 = 普通注册 Tool，
 *   旧仓 toolExecution 里 `mcp__` 名前缀双路路由（findMcpServerConnection 在
 *   执行链内按名查连接）**折叠进本模块的注册表构建**（createMcpTools 预构建时
 *   就把连接绑进 call 闭包）→ pipeline 执行链**不加** mcp 分支 / PipelineDeps
 *   不加 mcpClients 字段（无消费点）。findMcpServerConnection 仍导出 = E-4 权限
 *   规则求值树的 scope 查找纯函数（非执行链接缝）。
 *
 * 链路：MCPServerConnection（port，连接层预取 tools）→ createMcpTools 逐工具构造
 *   Tool（name = mcp__<server>__<tool>，isMcp + mcpInfo，call 经 port callTool 路由）
 *   → 并入注册表（T-5e getAllBaseTools）→ pipeline 当普通 Tool 执行。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 连接生命周期（connectToServer/重连/缓存/资源·prompt 拉取，旧仓 client.ts 3209L +
 *     useManageMCPConnections 887L）+ 认证面（auth 2370L + oauth/xaa）/ elicitation /
 *     vscode / xaaIdp → 残留守（归后续纵切，经 ports/mcpClient 注入；本版工具由连接层
 *     预取 tools 描述符后构建，非引擎内动态 tools/list）。
 *   - 旧仓 buildMcpTool 的 _meta `anthropic/searchHint` / `alwaysLoad` 提取 +
 *     `recursivelySanitizeUnicode` + `isIncludedMcpTool` channel 门 + skipPrefix SDK 模式
 *     + progress 事件（mcp_progress started/completed/failed）+ session 重试
 *     （McpSessionExpiredError 重建 client）+ CHICAGO_MCP computer-use override → 残留守。
 *   - checkPermissions 裁剪为 passthrough（旧仓 MCPTool 基类同语义：MCP 工具须权限，
 *     具体规则求值归 E-4 permissions-engine；findMcpServerConnection 供 E-4 scope 查找）。
 *   - toAutoClassifierInput 裁剪为 passthrough（旧仓 mcpToolInputToAutoClassifierInput
 *     的输入归一归 E-4 分类器面）。renderToolUseMessage 返 null（TUI 渲染 C/D 波补）。
 *   - 旧仓 mcpStringUtils 的 getToolNameForPermissionCheck（权限规则名匹配：MCP 工具
 *     用全名 mcp__server__tool 防 builtin 同名规则误伤）/ getMcpDisplayName /
 *     extractMcpToolDisplayName（显示名）→ 残留守（E-4 权限层 + TUI 显示面）。
 *   - 旧仓 fetchToolsForClient checkPermissions 的 suggestions（addRules 建议块，供权限
 *     UI 一键加规则）→ 残留守（E-4 权限层消费；本版仅 passthrough 消息）。
 *   - call 内 meta `claudecode/toolUseId` 透传（旧仓经 _meta 带给 MCP 服务器）+
 *     userFacingName 的 annotations.title 优先（无 title 回落 d.name）→ 残留守
 *     （port callTool 无 meta 参 / McpToolDescriptor 无 title 字段，连接层落时补）。
 *   - 旧仓 fetchToolsForClient/MCPTool 基类的 prompt()（MAX_MCP_DESCRIPTION_LENGTH 截断）/
 *     isOpenWorld(openWorldHint) / isSearchOrReadCommand(classifyMcpToolForCollapse) /
 *     outputSchema / isResultTruncated → 新 shared Tool 契约无此字段（C/D 波合同面），
 *     非 mcp.ts 可裁面；shared 契约补字段时（C/D 波）再随 MCPTool 基类一并落。
 */
import type {
  ContentBlockParam,
  Tool,
  ToolInputJSONSchema,
  ToolResultBlockParam,
  Tools,
} from '../../shared'
import type { MCPServerConnection } from '../ports/mcpClient'

// ── MCP 名归一 / 解析（旧仓 normalization.ts + mcpStringUtils.ts 纯函数照抄）──────
// 归一服务器名到 API 兼容 ^[a-zA-Z0-9_-]{1,64}$（非法字符含点/空格 → 下划线）。
const CLAUDEAI_SERVER_PREFIX = 'claude.ai '

export function normalizeNameForMCP(name: string): string {
  let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (name.startsWith(CLAUDEAI_SERVER_PREFIX)) {
    // claude.ai 服务器：折叠连续下划线 + 去首尾，防干扰 mcp__ 分隔符
    normalized = normalized.replace(/_+/g, '_').replace(/^_|_$/g, '')
  }
  return normalized
}

/**
 * 从 `mcp__<server>__<tool>` 解析 { serverName, toolName }（非 MCP 名 → null）。
 * 已知边界：server 名含 `__` 时解析错位（server 段取首个 `__` 前，罕见，旧仓同注）。
 */
export function mcpInfoFromString(
  toolString: string,
): { serverName: string; toolName: string | undefined } | null {
  const parts = toolString.split('__')
  const [mcpPart, serverName, ...toolNameParts] = parts
  if (mcpPart !== 'mcp' || !serverName) {
    return null
  }
  const toolName = toolNameParts.length > 0 ? toolNameParts.join('__') : undefined
  return { serverName, toolName }
}

/** 给定服务器的 MCP 工具名 prefix（`mcp__<normalized>__`）。 */
export function getMcpPrefix(serverName: string): string {
  return `mcp__${normalizeNameForMCP(serverName)}__`
}

/** 全限定 MCP 工具名（mcpInfoFromString 逆运算；server/tool 均归一）。 */
export function buildMcpToolName(serverName: string, toolName: string): string {
  return `${getMcpPrefix(serverName)}${normalizeNameForMCP(toolName)}`
}

/**
 * 按工具名查连接（旧仓 toolExecution findMcpServerConnection 照抄：两侧归一比对）。
 * 非 `mcp__` 前缀 / 解析失败 / 无匹配 → undefined。E-4 权限 scope 查找复用。
 */
export function findMcpServerConnection(
  toolName: string,
  mcpClients: readonly MCPServerConnection[],
): MCPServerConnection | undefined {
  if (!toolName.startsWith('mcp__')) {
    return undefined
  }
  const mcpInfo = mcpInfoFromString(toolName)
  if (!mcpInfo) {
    return undefined
  }
  // mcpInfo.serverName 已归一，client.name 是原名 → 归一后比对（旧仓同注）。
  return mcpClients.find(
    (client) => normalizeNameForMCP(client.name) === mcpInfo.serverName,
  )
}

// ── Tool 构建（旧仓 fetchToolsForClient 裁剪：连接层预取 tools → Tool[]）──────────

/** MCP 工具结果大小上限（旧仓 MCPTool 常量）。 */
const MCP_MAX_RESULT_SIZE_CHARS = 100_000

/** 无 schema 时的 permissive 兜底（旧仓 MCPTool 基类 `z.object({}).passthrough()` 语义）。 */
const PERMISSIVE_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {},
}

/**
 * 逐连接构建 MCP Tool 列表（旧仓 fetchToolsForClient 裁剪真核心）。
 * 未连接 / 无 tools 的连接 → 不产工具（连接层负责 connected 判定，见 port 头注）。
 */
export function createMcpTools(
  connections: readonly MCPServerConnection[],
): Tools {
  const tools: Tool[] = []
  for (const conn of connections) {
    const descriptors = conn.tools ?? []
    for (const d of descriptors) {
      tools.push(buildMcpTool(conn, d))
    }
  }
  return tools
}

/** 单 MCP 工具构造（旧仓 buildMcpTool 内 map 体裁剪；call 闭包绑定所属连接）。 */
function buildMcpTool(
  conn: MCPServerConnection,
  d: NonNullable<MCPServerConnection['tools']>[number],
): Tool {
  const schema =
    (d.inputJSONSchema as ToolInputJSONSchema | undefined) ?? PERMISSIVE_INPUT_SCHEMA
  return {
    name: buildMcpToolName(conn.name, d.name),
    inputSchema: schema,
    inputJSONSchema: schema,
    isMcp: true,
    mcpInfo: { serverName: conn.name, toolName: d.name },
    maxResultSizeChars: MCP_MAX_RESULT_SIZE_CHARS,
    isConcurrencySafe: () => d.readOnlyHint ?? false,
    isEnabled: () => true,
    isReadOnly: () => d.readOnlyHint ?? false,
    // 旧仓 fetchToolsForClient 恒定义（destructiveHint ?? false）；消费面 guard（?. ?? false）→ 恒定义等价且更忠实。
    isDestructive: () => d.destructiveHint ?? false,
    // 旧仓 MCPTool 基类同语义：MCP 工具须权限，规则求值归 E-4（残留守，见头注）。
    checkPermissions: async () => ({
      behavior: 'passthrough',
      message: 'MCPTool requires permission.',
    }),
    toAutoClassifierInput: (input: unknown) => input,
    description: async () => d.description ?? '',
    userFacingName: () => `${conn.name} - ${d.name} (MCP)`,
    // TUI 渲染 C/D 波补（残留守，见头注）；非 TUI 面（pipeline/loop）不消费此返回。
    renderToolUseMessage: () => null,
    async call(args: unknown, context: unknown) {
      // signal 经 call 第 2 参 context 透传（同 pipeline 契约：{ signal }，旧仓
      // context.abortController.signal → 新仓 context.signal，T-4c 同语义）。
      const signal = (context as { signal?: AbortSignal } | undefined)?.signal
      const res = await conn.client.callTool(
        d.name,
        (args ?? {}) as Record<string, unknown>,
        signal,
      )
      return {
        data: res.content,
        ...(res._meta || res.structuredContent
          ? {
              mcpMeta: {
                ...(res._meta ? { _meta: res._meta } : {}),
                ...(res.structuredContent
                  ? { structuredContent: res.structuredContent }
                  : {}),
              },
            }
          : {}),
      }
    },
    // MCP content（string | 块数组）原样进 block（旧仓 MCPTool mapToolResultToToolResultBlockParam 同义）。
    mapToolResultToToolResultBlockParam(
      content: unknown,
      toolUseID: string,
    ): ToolResultBlockParam {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: content as string | ContentBlockParam[],
      }
    },
  }
}
