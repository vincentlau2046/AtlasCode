/**
 * engine/tools/mcp — ListMcpResourcesTool 本体（S-E2 §8.63 MCP+ToolSearch
 * 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ListMcpResourcesTool/ListMcpResourcesTool.ts
 * 123L 裁剪随迁（旧 buildTool 成员面 → 新 shared Tool 契约对象化，
 * config/askUser face 先例）+ prompt 27L + UI.tsx 字符串面裁剪随迁。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 call `context.options.mcpClients`（services/mcp/client.js client
 *    状态 + ensureConnectedClient/fetchResourcesForClient，新仓 0-hit）→
 *    mcpClientRegistry 注入接缝（getMcpClientRegistry()；TeamFileLoader
 *    接缝先例 §8.62 delta ⑤）；连接生命周期 + 真 client 接线 = MCP
 *    client 波残留守登记。
 *  ② server 字段 attach 面：旧在 fetchResourcesForClient 内 → 新显式落
 *    本体（`{ ...item, server: client.name }`，值语义不变）；一服务器不沉
 *    全果面逐字（catch → logForDebugging + []）；文案 = 新造最小形
 *    `MCP server "X" resource fetch failed: ...`（旧 logMCPError sink
 *    运维文案裁，delta ④ 同族）。
 *  ③ pending / reader 缺失静默 [] 面：旧 `client.type !== 'connected'` →
 *    []；新 `type !== 'connected' || listResources 缺` 同支（seam 未接线
 *    = 无可列资源，静默面不变，mcpClientRegistry delta ③）。
 *  ④ buildTool 缺省面显式化：isEnabled `() => true`（旧 TOOL_DEFAULTS
 *    L786）/ isDestructive `() => false` / checkPermissions allow 单支（旧
 *    TOOL_DEFAULTS 缺省 allow 面，SendMessage delta ② 先例）。
 *  ⑤ 旧 def description()（短 DESCRIPTION）/ prompt()（长 PROMPT）双临 →
 *    新 description() 单面 = PROMPT（house 先例 §8.62 delta ⑧）；短面经
 *    门面 LIST_MCP_RESOURCES_DESCRIPTION 别名。
 *  ⑥ 旧 UI.tsx renderToolUseMessage 字符串 2 面逐字 + `input ?? {}` 防御
 *    支（§8.62 S-E3 A 路 F4 先例）；renderToolResultMessage JSX（
 *    MessageResponse/OutputLine）裁 → TUI 波（可选槽不实现）。
 *  ⑦ 旧 lazySchema(zod) → 纯 JSON schema 常量（strict + additionalProperties
 *    双字段，config/askUser/sendMessage 先例）；output 面 = 本地 Output
 *    duck 型（house 面：output JSON schema 常量不保留，name 必填 = 旧
 *    outputSchema 面）。
 *
 * 消费方 = `mcp/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径注册位
 * （§8.63.1：无条件注册面，26/49 → 29/49；本体经 ToolRegistryDeps.
 * baseTools 消费方注入，注册表机制不变）。
 */
import {
  errorMessage,
  logForDebugging,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { jsonStringify } from '../../session/json'
import { LIST_MCP_RESOURCES_TOOL_NAME } from '../toolNames'
import { getMcpClientRegistry } from './mcpClientRegistry'
import { LIST_MCP_RESOURCES_PROMPT } from './mcpPrompt'
import { isOutputLineTruncated } from './truncation'

// delta ⑦：旧 lazySchema z.object 面 → 纯 JSON（server 可选，无 required）
export const LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    server: {
      type: 'string',
      description: 'Optional server name to filter resources by',
    },
  },
}

export type ListMcpResourcesInput = {
  server?: string
}

// delta ⑦：name 必填 = 旧 outputSchema 面（seam 保证）
export type ListMcpResourcesOutput = Array<{
  uri: string
  name: string
  mimeType?: string
  description?: string
  server: string
}>

export const ListMcpResourcesTool = {
  name: LIST_MCP_RESOURCES_TOOL_NAME,
  inputSchema: LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA,
  inputJSONSchema: LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA,
  strict: true,
  searchHint: 'list resources from connected MCP servers',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ④：旧 buildTool 缺省面显式化
  isEnabled: () => true,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  userFacingName: () => 'listMcpResources',

  toAutoClassifierInput(input: unknown) {
    return (input as ListMcpResourcesInput).server ?? ''
  },

  // delta ④：旧 buildTool 缺省 allow 面显式化
  async checkPermissions(input: unknown) {
    return {
      behavior: 'allow' as const,
      updatedInput: input as ListMcpResourcesInput,
    }
  },

  // delta ⑤：旧 description()/prompt() 双临 → 新 description() 单面
  async description(): Promise<string> {
    return LIST_MCP_RESOURCES_PROMPT
  },

  async call(
    input: unknown,
    _context: unknown,
  ): Promise<ToolResult<ListMcpResourcesOutput>> {
    const { server: targetServer } = input as ListMcpResourcesInput

    // delta ①：旧 options.mcpClients 读面 → 注入接缝
    const { clients } = getMcpClientRegistry()

    const clientsToProcess = targetServer
      ? clients.filter(client => client.name === targetServer)
      : clients

    if (targetServer && clientsToProcess.length === 0) {
      throw new Error(
        `Server "${targetServer}" not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
      )
    }

    // delta ②/③：旧 ensureConnectedClient + fetchResourcesForClient（LRU
    // 缓存 + reconnect re-fetch 面）→ seam listResources 残留守面；一
    // 服务器不沉全果面逐字
    const results = await Promise.all(
      clientsToProcess.map(async client => {
        if (
          client.type !== 'connected' ||
          typeof client.listResources !== 'function'
        ) {
          return []
        }
        try {
          const resources = await client.listResources()
          return resources.map(item => ({ ...item, server: client.name }))
        } catch (error) {
          // One server's reconnect failure shouldn't sink the whole result.
          logForDebugging(
            `MCP server "${client.name}" resource fetch failed: ${errorMessage(error)}`,
          )
          return []
        }
      }),
    )

    return {
      data: results.flat(),
    }
  },

  // delta ⑥：旧 UI.tsx 字符串 2 面逐字 + 防御支
  renderToolUseMessage(input: unknown) {
    const i = (input ?? {}) as Partial<ListMcpResourcesInput>
    return i.server
      ? `List MCP resources from server "${i.server}"`
      : 'List all MCP resources'
  },

  isResultTruncated(output: ListMcpResourcesOutput): boolean {
    return isOutputLineTruncated(jsonStringify(output))
  },

  mapToolResultToToolResultBlockParam(
    content: ListMcpResourcesOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (!content || content.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content:
          'No resources found. MCP servers may still provide tools even if they have no resources.',
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(content),
    }
  },
} satisfies Tool
