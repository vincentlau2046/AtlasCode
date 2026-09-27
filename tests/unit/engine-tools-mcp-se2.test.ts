/**
 * engine/tools/mcp S-E2（§8.63）unit 层（零盘零模型）：ListMcp/ReadMcp
 * 工具对象面 + schema 面 + 门控面 + ListMcp call 接缝面（mcpClientRegistry
 * 注入）+ ReadMcp call 3 段 throw 面 + blob 拦截面（text 透传支）+
 * isResultTruncated/render/userFacingName/prompt 面。
 *
 * blob 持久化成功/错误面为何 func 层（tests/func/engine-tools-mcp-se2-fs.
 * test.ts，真盘）：persistBinaryContent = 裸 fs 写（web/webFetchUtils.ts，
 * FsOperations 不可覆写）→ unit 仅测 text 透传支 + 拦截判定面（plan/web
 * func 先例）。
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  getBinaryBlobSavedMessage,
  LIST_MCP_RESOURCES_DESCRIPTION,
  LIST_MCP_RESOURCES_PROMPT,
  LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA,
  ListMcpResourcesTool,
  READ_MCP_RESOURCE_DESCRIPTION,
  READ_MCP_RESOURCE_PROMPT,
  READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA,
  ReadMcpResourceTool,
  isOutputLineTruncated,
  resetMcpClientRegistry,
  setMcpClientRegistry,
  type McpClientEntry,
} from '../../src/engine/tools'

const DESC_OPTS = {
  isNonInteractiveSession: false,
  toolPermissionContext: {},
  tools: [] as readonly unknown[],
}

function connectedClient(
  name: string,
  listResources?: () => Promise<
    Array<{ uri: string; name: string; mimeType?: string; description?: string }>
  >,
): McpClientEntry {
  return {
    name,
    type: 'connected',
    capabilities: { resources: true },
    ...(listResources ? { listResources } : {}),
  }
}

beforeEach(() => {
  resetMcpClientRegistry()
})

describe('ListMcpResourcesTool 对象面', () => {
  test('静态成员逐字（name/strict/shouldDefer/maxResultSizeChars/searchHint）', () => {
    expect(ListMcpResourcesTool.name).toBe('ListMcpResourcesTool')
    expect(ListMcpResourcesTool.strict).toBe(true)
    expect(ListMcpResourcesTool.shouldDefer).toBe(true)
    expect(ListMcpResourcesTool.maxResultSizeChars).toBe(100_000)
    expect(ListMcpResourcesTool.searchHint).toBe(
      'list resources from connected MCP servers',
    )
    expect(ListMcpResourcesTool.inputJSONSchema).toBe(
      LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA,
    )
  })

  test('门控面：isEnabled true（无条件注册面）', () => {
    expect(ListMcpResourcesTool.isEnabled()).toBe(true)
  })

  test('行为面：isConcurrencySafe/isReadOnly/isDestructive', () => {
    expect(ListMcpResourcesTool.isConcurrencySafe({})).toBe(true)
    expect(ListMcpResourcesTool.isReadOnly({})).toBe(true)
    expect(ListMcpResourcesTool.isDestructive({})).toBe(false)
  })
})

describe('LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA 面', () => {
  test('纯 JSON shape（server 可选 + additionalProperties false + 描述逐字）', () => {
    expect(LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA.additionalProperties).toBe(
      false,
    )
    expect(LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA.required).toBeUndefined()
    const server = (
      LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA.properties as Record<
        string,
        { type: string; description: string }
      >
    ).server
    expect(server.type).toBe('string')
    expect(server.description).toBe('Optional server name to filter resources by')
  })
})

describe('ListMcpResourcesTool call 接缝面（mcpClientRegistry）', () => {
  test('默认空 registry → data [] + mapToolResult 空面逐字', async () => {
    const res = await ListMcpResourcesTool.call({}, {})
    expect(res.data).toEqual([])
    const block = ListMcpResourcesTool.mapToolResultToToolResultBlockParam(
      [],
      'tu_1',
    )
    expect(block).toEqual({
      tool_use_id: 'tu_1',
      type: 'tool_result',
      content:
        'No resources found. MCP servers may still provide tools even if they have no resources.',
    })
  })

  test('connected client list 面（server 字段 attach 逐字）', async () => {
    setMcpClientRegistry({
      clients: [
        connectedClient('alpha', async () => [
          { uri: 'file:///a', name: 'a' },
          { uri: 'file:///b', name: 'b', mimeType: 'text/plain' },
        ]),
      ],
    })
    const res = await ListMcpResourcesTool.call({}, {})
    expect(res.data).toEqual([
      { uri: 'file:///a', name: 'a', server: 'alpha' },
      { uri: 'file:///b', name: 'b', mimeType: 'text/plain', server: 'alpha' },
    ])
  })

  test('pending client 跳（type !== connected → []）', async () => {
    setMcpClientRegistry({
      clients: [{ name: 'beta', type: 'pending' }],
    })
    const res = await ListMcpResourcesTool.call({}, {})
    expect(res.data).toEqual([])
  })

  test('listResources reject → 一服务器不沉全果（他服务器仍回）', async () => {
    setMcpClientRegistry({
      clients: [
        connectedClient('bad', async () => {
          throw new Error('reconnect failed')
        }),
        connectedClient('good', async () => [{ uri: 'file:///g', name: 'g' }]),
      ],
    })
    const res = await ListMcpResourcesTool.call({}, {})
    expect(res.data).toEqual([{ uri: 'file:///g', name: 'g', server: 'good' }])
  })

  test('targetServer not-found throw 逐字（Available servers 列表）', async () => {
    setMcpClientRegistry({
      clients: [
        connectedClient('alpha'),
        connectedClient('beta'),
      ],
    })
    await expect(
      ListMcpResourcesTool.call({ server: 'nope' }, {}),
    ).rejects.toThrow(
      'Server "nope" not found. Available servers: alpha, beta',
    )
  })

  test('targetServer 过滤面（仅匹配服务器回）', async () => {
    setMcpClientRegistry({
      clients: [
        connectedClient('alpha', async () => [
          { uri: 'file:///a', name: 'a' },
        ]),
        connectedClient('beta', async () => [{ uri: 'file:///b', name: 'b' }]),
      ],
    })
    const res = await ListMcpResourcesTool.call({ server: 'beta' }, {})
    expect(res.data).toEqual([{ uri: 'file:///b', name: 'b', server: 'beta' }])
  })
})

describe('ReadMcpResourceTool 对象面', () => {
  test('静态成员逐字（name/strict/shouldDefer/maxResultSizeChars/searchHint）', () => {
    expect(ReadMcpResourceTool.name).toBe('ReadMcpResourceTool')
    expect(ReadMcpResourceTool.strict).toBe(true)
    expect(ReadMcpResourceTool.shouldDefer).toBe(true)
    expect(ReadMcpResourceTool.maxResultSizeChars).toBe(100_000)
    expect(ReadMcpResourceTool.searchHint).toBe(
      'read a specific MCP resource by URI',
    )
    expect(ReadMcpResourceTool.inputJSONSchema).toBe(
      READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA,
    )
  })

  test('门控面：isEnabled true（无条件注册面）', () => {
    expect(ReadMcpResourceTool.isEnabled()).toBe(true)
  })

  test('行为面：isConcurrencySafe/isReadOnly/isDestructive', () => {
    expect(ReadMcpResourceTool.isConcurrencySafe({})).toBe(true)
    expect(ReadMcpResourceTool.isReadOnly({})).toBe(true)
    expect(ReadMcpResourceTool.isDestructive({})).toBe(false)
  })
})

describe('READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA 面', () => {
  test('纯 JSON shape（server + uri 双必填 + 描述逐字）', () => {
    expect(READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA.additionalProperties).toBe(
      false,
    )
    expect(READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA.required).toEqual([
      'server',
      'uri',
    ])
    const props = READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type: string; description: string }
    >
    expect(props.server.description).toBe('The MCP server name')
    expect(props.uri.description).toBe('The resource URI to read')
  })
})

describe('ReadMcpResourceTool call 面', () => {
  test('server not-found throw 逐字', async () => {
    setMcpClientRegistry({
      clients: [connectedClient('alpha')],
    })
    await expect(
      ReadMcpResourceTool.call({ server: 'nope', uri: 'x' }, {}),
    ).rejects.toThrow('Server "nope" not found. Available servers: alpha')
  })

  test('not-connected throw 逐字', async () => {
    setMcpClientRegistry({
      clients: [{ name: 'alpha', type: 'pending' }],
    })
    await expect(
      ReadMcpResourceTool.call({ server: 'alpha', uri: 'x' }, {}),
    ).rejects.toThrow('Server "alpha" is not connected')
  })

  test('无 capabilities.resources throw 逐字', async () => {
    setMcpClientRegistry({
      clients: [{ name: 'alpha', type: 'connected' }],
    })
    await expect(
      ReadMcpResourceTool.call({ server: 'alpha', uri: 'x' }, {}),
    ).rejects.toThrow('Server "alpha" does not support resources')
  })

  test('reader 缺失面（capabilities 有而 readResource 缺 → 同支 throw）', async () => {
    setMcpClientRegistry({
      clients: [
        {
          name: 'alpha',
          type: 'connected',
          capabilities: { resources: true },
        },
      ],
    })
    await expect(
      ReadMcpResourceTool.call({ server: 'alpha', uri: 'x' }, {}),
    ).rejects.toThrow('Server "alpha" does not support resources')
  })

  test('readResource 成功 text 面（"text" in c 透传 {uri,mimeType,text}）', async () => {
    setMcpClientRegistry({
      clients: [
        {
          name: 'alpha',
          type: 'connected',
          capabilities: { resources: true },
          readResource: async () => ({
            contents: [
              {
                uri: 'file:///doc.txt',
                mimeType: 'text/plain',
                text: 'hello',
              },
            ],
          }),
        },
      ],
    })
    const res = await ReadMcpResourceTool.call(
      { server: 'alpha', uri: 'file:///doc.txt' },
      {},
    )
    expect(res.data.contents).toEqual([
      { uri: 'file:///doc.txt', mimeType: 'text/plain', text: 'hello' },
    ])
  })

  test('mapToolResult 非空 jsonStringify 面', () => {
    const content = { contents: [{ uri: 'u', text: 't' }] }
    const block = ReadMcpResourceTool.mapToolResultToToolResultBlockParam(
      content,
      'tu_9',
    )
    expect(block).toEqual({
      tool_use_id: 'tu_9',
      type: 'tool_result',
      content: JSON.stringify(content),
    })
  })

  test('toAutoClassifierInput 模板逐字（"server uri"）', () => {
    expect(
      ReadMcpResourceTool.toAutoClassifierInput({
        server: 'alpha',
        uri: 'file:///x',
      }),
    ).toBe('alpha file:///x')
  })
})

describe('isResultTruncated 面', () => {
  test('isOutputLineTruncated 逐字面（旧 +1 wrapText 面：需 >4 换行位才 true）', () => {
    // 5 行（4 换行 + 尾字符）→ true（i=0..3 四次 indexOf 全命中 + pos<len）
    expect(isOutputLineTruncated('a\nb\nc\nd\ne')).toBe(true)
    // 4 行（3 换行 < 所需 4 换行）→ false
    expect(isOutputLineTruncated('a\nb\nc\nd')).toBe(false)
    expect(isOutputLineTruncated('a\nb\nc')).toBe(false)
    // A trailing newline is a terminator, not a new line
    expect(isOutputLineTruncated('a\nb\nc\nd\n')).toBe(false)
  })

  test('工具 isResultTruncated = isOutputLineTruncated(jsonStringify(output))（compact 单行面逐字）', () => {
    const output = [{ uri: 'file:///a', name: 'a' }]
    expect(ListMcpResourcesTool.isResultTruncated?.(output)).toBe(false)
    expect(
      ReadMcpResourceTool.isResultTruncated?.({ contents: [{ uri: 'u' }] }),
    ).toBe(false)
  })
})

describe('render / userFacingName / prompt 面', () => {
  test('ListMcp renderToolUseMessage 2 面逐字 + 防御支', () => {
    expect(ListMcpResourcesTool.renderToolUseMessage({ server: 'x' } as never)).toBe(
      'List MCP resources from server "x"',
    )
    expect(
      ListMcpResourcesTool.renderToolUseMessage({} as never),
    ).toBe('List all MCP resources')
    // 防御支：input ?? {}
    expect(
      ListMcpResourcesTool.renderToolUseMessage(undefined as never),
    ).toBe('List all MCP resources')
  })

  test('ReadMcp renderToolUseMessage 面逐字（null 守卫 + 防御支）', () => {
    expect(
      ReadMcpResourceTool.renderToolUseMessage(
        { server: 's', uri: 'u' } as never,
      ),
    ).toBe('Read resource "u" from server "s"')
    expect(ReadMcpResourceTool.renderToolUseMessage({} as never)).toBe(null)
    expect(ReadMcpResourceTool.renderToolUseMessage(undefined as never)).toBe(
      null,
    )
  })

  test('userFacingName 面 2 逐字', () => {
    expect(ListMcpResourcesTool.userFacingName({} as never)).toBe(
      'listMcpResources',
    )
    expect(ReadMcpResourceTool.userFacingName({} as never)).toBe(
      'readMcpResource',
    )
  })

  test('prompt 面：DESCRIPTION/PROMPT ×2 常量逐字锚点', () => {
    expect(LIST_MCP_RESOURCES_DESCRIPTION).toContain(
      'Lists available resources from configured MCP servers.',
    )
    expect(LIST_MCP_RESOURCES_DESCRIPTION).toContain(
      'listMcpResources({ server: "myserver" })',
    )
    expect(LIST_MCP_RESOURCES_PROMPT).toContain(
      "plus a 'server' field ",
    )
    expect(LIST_MCP_RESOURCES_PROMPT).toContain(
      'resources from all servers will be returned.',
    )
    expect(READ_MCP_RESOURCE_DESCRIPTION).toContain(
      'readMcpResource({ server: "myserver", uri: "my-resource-uri" })',
    )
    expect(READ_MCP_RESOURCE_PROMPT).toContain(
      '- uri (required): The URI of the resource to read',
    )
  })

  test('description() 单面 = 长 PROMPT（双临合面）', async () => {
    expect(
      await ListMcpResourcesTool.description(undefined, DESC_OPTS),
    ).toBe(LIST_MCP_RESOURCES_PROMPT)
    expect(await ReadMcpResourceTool.description(undefined, DESC_OPTS)).toBe(
      READ_MCP_RESOURCE_PROMPT,
    )
  })

  test('checkPermissions allow 单支（buildTool 缺省面显式化）', async () => {
    expect(await ListMcpResourcesTool.checkPermissions({ server: 'x' })).toEqual(
      { behavior: 'allow', updatedInput: { server: 'x' } },
    )
    expect(
      await ReadMcpResourceTool.checkPermissions({ server: 's', uri: 'u' }),
    ).toEqual({ behavior: 'allow', updatedInput: { server: 's', uri: 'u' } })
  })

  test('getBinaryBlobSavedMessage 逐字 4 参（含 formatFileSize KB 面）', () => {
    // formatFileSize .0$ 尾剥面：2KB 非 2.0KB
    expect(
      getBinaryBlobSavedMessage('/tmp/x.bin', 'image/png', 2048, '[src] '),
    ).toBe('[src] Binary content (image/png, 2KB) saved to /tmp/x.bin')
    // .0$ 尾剥面：2560 → 2.5KB
    expect(
      getBinaryBlobSavedMessage('/tmp/y.bin', undefined, 2560, ''),
    ).toBe('Binary content (unknown type, 2.5KB) saved to /tmp/y.bin')
  })
})
