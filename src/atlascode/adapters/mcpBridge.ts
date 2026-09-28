/**
 * atlascode/adapters — MCP 组合根桥（§8.68 remote 波 S-E2d ⑭；L3 顶域
 * ↛ engine：mcp 域产原始面（McpJsonRpcClient / 描述符 / 资源 / prompt
 * 命令），engine 型映射全部在组合根 / engine 侧完成（mcp 门面头注
 * 预声明，复审勿当遗漏重提））。
 *
 * 4 面（组合根 ⑭ 消费；H6：每面均有消费点，无死接缝）：
 *  ① bridgeMcpToolClient — mcp 域 McpJsonRpcClient → engine port
 *     McpToolClient（callTool = 'tools/call' 请求面；signal 面裁登记：
 *     旧 SDK callTool 的 abort 通道 → 本地 JSON-RPC 转写无 abort 通道，
 *     server 无响应唯一路径 = close（stdio 子进程清理阶梯），delta 登记）
 *  ② buildMcpEngineConnections — manager 4 态 list 中 connected 态 →
 *     engine MCPServerConnection[]（描述符经 mcp 域 fetchToolsForClient
 *     预取 = LRU 缓存 + drop 失效面；createMcpTools 单入口消费不变）
 *  ③ syncMcpClientRegistry — manager 4 态 → engine mcpClientRegistry
 *     条目（connected = listResources/readResource 实填〔mcp 域供应商 +
 *     resources/read 直取〕；pending 占位条目 = manager pending Set 活面
 *     〔getPendingServerNames，旧面 appState.mcp.clients pending 条目；
 *     新真 manager 的 connections Map 仅存 connected/failed 对象，
 *     pending 存独立 Set〕；failed/disabled 不进注册表 = engine 条目型
 *     union 仅 connected|pending 面——**文案分歧面登记**（S-E3 A 路 D-3）：
 *     旧 options.mcpClients 含 failed/disabled 条目 → 工具报错面旧 =
 *     List 静默 [] / Read 'is not connected'，新 = 'not found' 且 failed
 *     名从 Available 列表消失（union 收窄本身 S-E2b 已登记，文案分歧
 *     本行补登记，行为面不改）；drop 机制修正登记（S-E3 A 路）：
 *     manager close 用**新对象**替换 Map 条目（非 mutate 已捕获对象）→
 *     注册表闭包捕获的旧对象 type 仍 'connected' → 供应商门通过 →
 *     closed client request 被拒（mcpJsonRpc 'Connection disposed'）→
 *     供应商 try/catch → [] 降级面（fail-soft 非假绿，净结果同旧 LRU
 *     失效早退 []））
 *  ④ mapMcpPromptCommands — mcp 域 McpPromptCommand → engine skill
 *     Command（mcp 门面头注预声明映射面：type/name/description/
 *     argNames/userFacingName 面保真，engine 型字段映射侧补〔
 *     progressMessage = 旧 'running' 逐字 / contentLength 0 /
 *     source+loadedFrom 'mcp' / hasUserSpecifiedDescription =
 *     description !== ''（旧 client.ts:1955 逐字；缺此字段 MCP 命令
 *     永不进 getSkillToolCommands 列表过滤）〕；getPromptForCommand
 *     = mcp 域 delta ④ 扁平 content 面（string | content 块对象）→
 *     engine 块面映射〔旧仓 transformResultContent text 案逐字：
 *     string → {type:'text', text} 块（新仓 TextBlock 契约字段 =
 *     text，wire 面 params.ts 读 b.text）；块对象透传；undefined 项
 *     跳过 = 旧意外 TypeError rethrow 裁登记（畸形 server 面）〕，
 *     非 cast 委托；isError 结果面 = ① 透传 content 不 throw〔旧
 *     throw + TelemetrySafeError 面裁登记，模型可见错误面经 content
 *     真〕；MCP_TOOL_TIMEOUT 每请求超时限裁登记（S-E3 A 路）：env
 *     名单仅 engine/config/managedEnv.ts:98，mcpJsonRpc request 无
 *     per-request 超时（连接超时 MCP_TIMEOUT 30s 面逐字保留；设
 *     该 env 用户旧仓生效新仓静默忽略 = 裁登记））
 *
 * 消费面：组合根 compose.ts initMcpConnections（①②③④）+ createAgent
 * LoopDeps ⑭ mcpTools 供给（②）；tests 经 atlascode 根门面引（STR-1）。
 */
import type {
  ContentBlockParam,
} from '../../shared'
import type {
  Command,
  MCPServerConnection,
  McpClientEntry,
  McpResourceContent,
  McpToolClient,
  SkillCommandContext,
} from '../../engine'
import { setMcpClientRegistry } from '../../engine'
import type {
  McpConnectionManager,
  McpJsonRpcClient,
  McpPromptCommand,
} from '../../mcp'
import {
  fetchCommandsForClient,
  fetchResourcesForClient,
  fetchToolsForClient,
} from '../../mcp'

// ── ① McpToolClient 桥（engine port 实现面）─────────────────────────

/** tools/call 请求结果面（MCP 协议 tools/call result 裁剪：content +
 * 可选 structuredContent/_meta 段 + isError 标记〔④ 透传面〕）。 */
type ToolsCallResult = {
  content?: unknown
  structuredContent?: Record<string, unknown>
  _meta?: Record<string, unknown>
  isError?: boolean
}

export function bridgeMcpToolClient(client: McpJsonRpcClient): McpToolClient {
  return {
    async callTool(
      toolName: string,
      args: Record<string, unknown>,
      // signal 面裁登记（delta ①）：本地 JSON-RPC 无 abort 通道
      _signal?: AbortSignal,
    ) {
      const result = (await client.request('tools/call', {
        name: toolName,
        arguments: args,
      })) as ToolsCallResult | undefined
      return {
        content: result?.content ?? [],
        ...(result?.structuredContent
          ? { structuredContent: result.structuredContent }
          : {}),
        ...(result?._meta ? { _meta: result._meta } : {}),
      }
    },
  }
}

// ── ② 连接面（manager connected 态 → engine MCPServerConnection[]）──

export async function buildMcpEngineConnections(
  manager: McpConnectionManager,
): Promise<MCPServerConnection[]> {
  const out: MCPServerConnection[] = []
  for (const conn of manager.list()) {
    if (conn.type !== 'connected') continue
    // 描述符预取（mcp 域供应商 = LRU 缓存 + drop 失效；未连接早退 []）
    const tools = await fetchToolsForClient(conn)
    out.push({
      name: conn.name,
      client: bridgeMcpToolClient(conn.client),
      tools,
    })
  }
  return out
}

// ── ③ registry 供给面（manager 4 态 → engine mcpClientRegistry）─────

export function syncMcpClientRegistry(manager: McpConnectionManager): void {
  const clients: McpClientEntry[] = []
  for (const conn of manager.list()) {
    if (conn.type === 'connected') {
      // 闭包绑定 manager 连接对象（fetchResourcesForClient 读其 type /
      // capabilities / client 面；drop 后该对象置 failed → 供应商早退
      // [] 降级面，非假绿）
      const connection = conn
      clients.push({
        name: connection.name,
        type: 'connected',
        capabilities: { resources: connection.capabilities.resources },
        listResources: async () => {
          const entries = await fetchResourcesForClient(connection)
          // server 字段 attach 面 = engine 工具侧再 attach（delta ② 先例
          // 同向），本处剥除
          return entries.map(({ server: _server, ...item }) => item)
        },
        readResource: async (uri: string) => {
          const result = (await connection.client.request(
            'resources/read',
            { uri },
          )) as { contents?: McpResourceContent[] } | undefined
          return { contents: result?.contents ?? [] }
        },
      })
    }
    // failed / disabled → 不进注册表（engine 条目型 union 仅
    // connected|pending；failed = 状态面，见头注 ③）
  }
  // pending 占位条目 = manager pending Set 活面（旧面：appState.mcp.
  // clients pending 条目；新真 manager 的 connections Map 仅存
  // connected/failed 对象，pending 存独立 Set → 占位经
  // getPendingServerNames 供给；sync 时点 pending 已 settle 时此面 =
  // 空，重连中再 sync 时物化）
  for (const name of manager.getPendingServerNames()) {
    clients.push({ name, type: 'pending' })
  }
  setMcpClientRegistry({ clients })
}

// ── ④ MCP prompt 命令映射面（McpPromptCommand → engine Command）────

export function mapMcpPromptCommands(
  commands: readonly McpPromptCommand[],
): Command[] {
  return commands.map(c => ({
    type: 'prompt' as const,
    name: c.name,
    description: c.description,
    argNames: c.argNames,
    isMcp: true,
    source: 'mcp',
    loadedFrom: 'mcp' as const,
    userFacingName: c.userFacingName,
    // engine 型字段默认值补（mcp 门面头注预声明映射面）：MCP prompt 无
    // 静态内容 = contentLength 0；progressMessage = 旧 'running' 逐字
    // （旧 client.ts:1960，新仓非 MCP 命令同值约定）
    progressMessage: 'running',
    contentLength: 0,
    // 旧 client.ts:1955 逐字（description = mcpFetch ?? '' 补 →
    // !== '' ≡ !!prompt.description）：缺此字段 MCP 命令永不进
    // getSkillToolCommands 列表过滤（须 hasUserSpecifiedDescription ||
    // whenToUse）
    hasUserSpecifiedDescription: c.description !== '',
    getPromptForCommand: async (
      args: string,
      _context: SkillCommandContext,
    ): Promise<ContentBlockParam[]> => {
      // mcp 域 delta ④ 扁平 content 面（string | content 块对象）→
      // engine 块面（旧仓 transformResultContent text 案逐字：string →
      // {type:'text', text} 块——新仓 TextBlock 契约字段 = text，
      // shared/types.ts，wire 面 params.ts 读 b.text；块对象透传；
      // undefined 项跳过面 = 旧意外 TypeError rethrow 裁登记，
      // 畸形 server 面）
      const flat = await c.getPromptForCommand(args)
      return flat
        .filter(
          (item): item is string | ContentBlockParam =>
            item !== undefined,
        )
        .map(item =>
          typeof item === 'string' ? { type: 'text', text: item } : item,
        )
    },
  }))
}

/** 全量取某 manager 已连接服务器的 prompt 命令（组合根 ⑭ 注册窗供给面）。 */
export async function collectMcpPromptCommands(
  manager: McpConnectionManager,
): Promise<McpPromptCommand[]> {
  const out: McpPromptCommand[] = []
  for (const conn of manager.list()) {
    if (conn.type !== 'connected') continue
    out.push(...(await fetchCommandsForClient(conn)))
  }
  return out
}
