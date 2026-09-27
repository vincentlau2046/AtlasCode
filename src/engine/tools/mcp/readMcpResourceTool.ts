/**
 * engine/tools/mcp — ReadMcpResourceTool 本体（S-E2 §8.63 MCP+ToolSearch
 * 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ReadMcpResourceTool/ReadMcpResourceTool.ts
 * 158L 裁剪随迁（旧 buildTool 成员面 → 新 shared Tool 契约对象化，
 * config/askUser face 先例）+ prompt 22L + UI.tsx 字符串面裁剪随迁。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 call `context.options.mcpClients`（services/mcp/client.js，新仓
 *    0-hit）→ mcpClientRegistry 注入接缝（getMcpClientRegistry()；
 *    TeamFileLoader 接缝先例 §8.62 delta ⑤）；连接生命周期 + 真 client
 *    接线 = MCP client 波残留守登记。
 *  ② 旧 SDK `client.request({method:'resources/read'}, ReadResourceResultSchema)`
 *    （@modelcontextprotocol/sdk 不在新仓 3 依赖）→ seam readResource 残留
 *    守面（seam 保证返回结构型 `{ contents: McpResourceContent[] }`；
 *    SDK schema 校验面裁，mcpClientRegistry delta ②）；blob 拦截面逐字
 *    （'text' in c 透传 / base64 blob → persistBinaryContent 落盘 +
 *    blobSavedTo + getBinaryBlobSavedMessage 文案）。
 *  ③ reader 缺失面（capabilities.resources = true 而 readResource 未注入
 *    = seam 未接线）：throw 复用旧逐字面 `Server "X" does not support
 *    resources`（零新造文案，与旧 capabilities 缺面同支合并）；3 段 throw
 *    面（not found / not connected / does not support resources）逐字。
 *  ④ persistBinaryContent = 新仓在位（web/webFetchUtils.ts L668，经 web/
 *    子门面 import）；persistId `mcp-resource-${Date.now()}-${i}-${random6}`
 *    逐字；错误面 `Binary content could not be saved to disk: ...` 逐字。
 *  ⑤ getBinaryBlobSavedMessage（旧 utils/mcpOutputStorage.ts:171-179 逐字
 *    4 参）+ formatFileSize（旧 utils/format.ts:9-24 纯函数逐字）本地移植
 *    本文件（mcp 子域，仅本工具消费）。
 *  ⑥ buildTool 缺省面显式化：isEnabled `() => true` / isDestructive
 *    `() => false` / checkPermissions allow 单支（同 ListMcp delta ④）。
 *  ⑦ 旧 def description()（短）/ prompt()（长）双临 → 新 description()
 *    单面 = PROMPT（house 先例 §8.62 delta ⑧）；userFacingName 'readMcpResource'
 *    旧 UI.tsx import → 新内联逐字值。
 *  ⑧ 旧 UI.tsx renderToolUseMessage 逐字（`Read resource "uri" from server
 *    "server"` / null 守卫）+ `input ?? {}` 防御支（§8.62 S-E3 A 路 F4
 *    先例）；renderToolResultMessage JSX 裁 → TUI 波（可选槽不实现）。
 *  ⑨ 旧 lazySchema(zod) → 纯 JSON schema 常量（strict + additionalProperties
 *    双字段）；output 面 = 本地 Output duck 型（house 面）。
 *
 * 消费方 = `mcp/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径注册位
 * （§8.63.1：无条件注册面，26/49 → 29/49；本体经 ToolRegistryDeps.
 * baseTools 消费方注入，注册表机制不变）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { jsonStringify } from '../../session/json'
import { persistBinaryContent } from '../web'
import { READ_MCP_RESOURCE_TOOL_NAME } from '../toolNames'
import { getMcpClientRegistry } from './mcpClientRegistry'
import { READ_MCP_RESOURCE_PROMPT } from './mcpPrompt'
import { isOutputLineTruncated } from './truncation'

// delta ⑨：旧 lazySchema z.object 面 → 纯 JSON（server + uri 双必填）
export const READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['server', 'uri'],
  properties: {
    server: {
      type: 'string',
      description: 'The MCP server name',
    },
    uri: {
      type: 'string',
      description: 'The resource URI to read',
    },
  },
}

export type ReadMcpResourceInput = {
  server: string
  uri: string
}

export type ReadMcpResourceOutputContent = {
  uri: string
  mimeType?: string
  text?: string
  blobSavedTo?: string
}

export type ReadMcpResourceOutput = {
  contents: ReadMcpResourceOutputContent[]
}

// delta ⑤：旧 utils/mcpOutputStorage.ts:171-179 逐字（4 参）
export function getBinaryBlobSavedMessage(
  filepath: string,
  mimeType: string | undefined,
  size: number,
  sourceDescription: string,
): string {
  const mt = mimeType || 'unknown type'
  return `${sourceDescription}Binary content (${mt}, ${formatFileSize(size)}) saved to ${filepath}`
}

// delta ⑤：旧 utils/format.ts:9-24 纯函数逐字
function formatFileSize(sizeInBytes: number): string {
  const kb = sizeInBytes / 1024
  if (kb < 1) {
    return `${sizeInBytes} bytes`
  }
  if (kb < 1024) {
    return `${kb.toFixed(1).replace(/\.0$/, '')}KB`
  }
  const mb = kb / 1024
  if (mb < 1024) {
    return `${mb.toFixed(1).replace(/\.0$/, '')}MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(1).replace(/\.0$/, '')}GB`
}

export const ReadMcpResourceTool = {
  name: READ_MCP_RESOURCE_TOOL_NAME,
  inputSchema: READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA,
  strict: true,
  searchHint: 'read a specific MCP resource by URI',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ⑥：旧 buildTool 缺省面显式化
  isEnabled: () => true,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  // delta ⑦：旧 UI.tsx import 面 → 内联逐字值
  userFacingName: () => 'readMcpResource',

  toAutoClassifierInput(input: unknown) {
    const { server, uri } = input as ReadMcpResourceInput
    return `${server} ${uri}`
  },

  // delta ⑥：旧 buildTool 缺省 allow 面显式化
  async checkPermissions(input: unknown) {
    return {
      behavior: 'allow' as const,
      updatedInput: input as ReadMcpResourceInput,
    }
  },

  // delta ⑦：旧 description()/prompt() 双临 → 新 description() 单面
  async description(): Promise<string> {
    return READ_MCP_RESOURCE_PROMPT
  },

  async call(
    input: unknown,
    _context: unknown,
  ): Promise<ToolResult<ReadMcpResourceOutput>> {
    const { server: serverName, uri } = input as ReadMcpResourceInput

    // delta ①：旧 options.mcpClients 读面 → 注入接缝
    const { clients } = getMcpClientRegistry()

    const client = clients.find(c => c.name === serverName)

    if (!client) {
      throw new Error(
        `Server "${serverName}" not found. Available servers: ${clients.map(c => c.name).join(', ')}`,
      )
    }

    if (client.type !== 'connected') {
      throw new Error(`Server "${serverName}" is not connected`)
    }

    // delta ③：reader 缺失面与旧 capabilities 缺面同支（seam 未接线 =
    // 不支持资源，零新造文案）
    if (!client.capabilities?.resources || typeof client.readResource !== 'function') {
      throw new Error(`Server "${serverName}" does not support resources`)
    }

    // delta ②：旧 SDK client.request resources/read 面 → seam 残留守
    const result = await client.readResource(uri)

    // Intercept any blob fields: decode, write raw bytes to disk with a
    // mime-derived extension, and replace with a path. Otherwise the base64
    // would be stringified straight into the context.
    const contents = await Promise.all(
      result.contents.map(async (c, i) => {
        if ('text' in c) {
          return { uri: c.uri, mimeType: c.mimeType, text: c.text }
        }
        if (!('blob' in c) || typeof c.blob !== 'string') {
          return { uri: c.uri, mimeType: c.mimeType }
        }
        // delta ④：persistId 格式逐字
        const persistId = `mcp-resource-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`
        const persisted = await persistBinaryContent(
          Buffer.from(c.blob, 'base64'),
          c.mimeType,
          persistId,
        )
        if ('error' in persisted) {
          return {
            uri: c.uri,
            mimeType: c.mimeType,
            text: `Binary content could not be saved to disk: ${persisted.error}`,
          }
        }
        return {
          uri: c.uri,
          mimeType: c.mimeType,
          blobSavedTo: persisted.filepath,
          text: getBinaryBlobSavedMessage(
            persisted.filepath,
            c.mimeType,
            persisted.size,
            `[Resource from ${serverName} at ${c.uri}] `,
          ),
        }
      }),
    )

    return {
      data: { contents },
    }
  },

  // delta ⑧：旧 UI.tsx 逐字 + 防御支
  renderToolUseMessage(input: unknown) {
    const i = (input ?? {}) as Partial<ReadMcpResourceInput>
    if (!i.uri || !i.server) {
      return null
    }
    return `Read resource "${i.uri}" from server "${i.server}"`
  },

  isResultTruncated(output: ReadMcpResourceOutput): boolean {
    return isOutputLineTruncated(jsonStringify(output))
  },

  mapToolResultToToolResultBlockParam(
    content: ReadMcpResourceOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(content),
    }
  },
} satisfies Tool
