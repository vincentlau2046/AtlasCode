/**
 * mcp 域 — tools/resources/commands 3 供应商（remote 波 S-E2b，§8.68 R2）。
 *
 * 旧仓来源（a8af45b）：services/mcp/client.ts fetchToolsForClient
 * （L1644-1894）/ fetchResourcesForClient（L1895-1927）/
 * fetchCommandsForClient（L1928-2010）—— memoizeWithLRU（LRU 20，键 =
 * 服务器名，旧 MCP_FETCH_CACHE_SIZE = 20 逐字）+ reconnect re-fetch 面
 * （onclose 清缓存 → 下次取重拉；本域 invalidateMcpFetchCache 由
 * mcpConnectionManager drop 面调用）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 本地最小 LRU（旧 utils memoizeWithLRU lodash 面 → 3-dep 纪律
 *     本地 Map 实现，size 20 逐字；invalidate = 按名 delete 面同旧
 *     `.cache.delete(name)`）。
 *  ② 旧 fetchToolsForClient 产出**全 Tool 对象**（mcp__ 前缀 /
 *     searchHint / alwaysLoad / prompt 截断 / isConcurrencySafe 面）=
 *     新仓 engine/tools/mcp.ts createMcpTools 既有面（S-E2 已落，
 *     前缀/归一在 engine 侧 normalizeNameForMCP 单一事实源）→ 本域只产
 *     **描述符面**（McpToolDescriptor 本地型，结构 = engine port
 *     McpToolDescriptor 同构；L3 顶域 ↛ engine，组合根 S-E2d 映射）。
 *  ③ 本地 sanitize-unicode（旧 utils/sanitization.ts 2 函数逐字：
 *     partiallySanitizeUnicode NFKC + 危险类目剥除 10 次迭代安全闸 /
 *     recursivelySanitizeUnicode 递归；lodash 非用 = 旧实现本就纯 JS，
 *     逐字随迁）。
 *  ④ McpPromptCommand 本地型（旧 fetchCommands 产 engine Command 型 →
 *     L3 顶域 ↛ engine：本地最小 prompt 命令型，组合根 S-E2d 映射 engine
 *     Command）。getPromptForCommand 消费面：旧 ensureConnectedClient +
 *     getPrompt + transformResultContent 链 → 新 = manager 在位连接
 *     client.request('prompts/get') 直取（旧 transformResultContent
 *     image/blob 持久化 2368L 面裁登记：新仓无消息层持久化消费点，
 *     内容块原样返回）。
 *  ⑤ zipObject（旧 lodash）→ 本地 2 行等价。
 *  ⑥ capability gate 3 面逐字（!capabilities?.tools / resources /
 *     prompts → []；非 connected 态 → []）。
 */
import { logError, logForDebugging } from '../shared'
import type {
  ConnectedMcpServer,
  McpServerConnection,
  McpServerPrompt,
  McpServerResource,
  McpServerTool,
} from './types'
import { getMcpConnectionManager } from './mcpConnectionManager'

// ── 本地最小 LRU（delta ①：旧 memoizeWithLRU 面，size 20 逐字）──────

const MCP_FETCH_CACHE_SIZE = 20

class LruCache<K, V> {
  private map = new Map<K, Promise<V>>()
  constructor(private size: number) {}

  get(key: K): Promise<V> | undefined {
    const hit = this.map.get(key)
    if (hit === undefined) return undefined
    // LRU 触顶重排：删后重插 = 最新位
    this.map.delete(key)
    this.map.set(key, hit)
    return hit
  }

  set(key: K, value: Promise<V>): void {
    if (this.map.size >= this.size && !this.map.has(key)) {
      const oldest = this.map.keys().next()
      if (!oldest.done) this.map.delete(oldest.value)
    }
    this.map.set(key, value)
  }

  invalidate(key: K): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}

// memoize 语义：缓存值 = Promise（首次触发即入表，后续命中同 Promise 去重并发）
const toolsCache = new LruCache<string, McpToolDescriptor[]>(
  MCP_FETCH_CACHE_SIZE,
)
const resourcesCache = new LruCache<string, McpServerResourceEntry[]>(
  MCP_FETCH_CACHE_SIZE,
)
const commandsCache = new LruCache<string, McpPromptCommand[]>(
  MCP_FETCH_CACHE_SIZE,
)

/** 按服务器名失效 3 缓存（旧 onclose 清 memo 面：reconnect re-fetch 语义；
 * mcpConnectionManager drop 面消费）。 */
export function invalidateMcpFetchCache(name: string): void {
  toolsCache.invalidate(name)
  resourcesCache.invalidate(name)
  commandsCache.invalidate(name)
}

/** 测试面：全量清（3 缓存）。 */
export function resetMcpFetchCaches(): void {
  toolsCache.clear()
  resourcesCache.clear()
  commandsCache.clear()
}

// ── 本地最小型面（delta ②/④：L3 顶域 ↛ engine，组合根映射）──────────

/** MCP 工具描述符（engine port McpToolDescriptor 结构同构；前缀/归一 =
 * engine 侧 createMcpTools 面，本域产原始名）。 */
export type McpToolDescriptor = {
  name: string
  description?: string
  inputJSONSchema?: unknown
  /** 旧 annotations.readOnlyHint（并发安全/只读判定来源）。 */
  readOnlyHint?: boolean
  /** 旧 annotations.destructiveHint。 */
  destructiveHint?: boolean
}

/** MCP 资源条目（旧 SDK ResourcesListItem 最小面 + server 字段）。 */
export type McpServerResourceEntry = McpServerResource & {
  server: string
}

/** MCP prompt 命令（旧 Command prompt 臂最小型；组合根 S-E2d 映射
 * engine Command：type/name/description/argNames/userFacingName/
 * getPromptForCommand 面保真，isEnabled/isHidden/progressMessage/
 * source 等 engine 型字段由映射侧补默认值）。 */
export type McpPromptCommand = {
  type: 'prompt'
  name: string
  description: string
  argNames: string[]
  userFacingName(): string
  getPromptForCommand(args: string): Promise<unknown[]>
}

// ── 本地 sanitize-unicode（delta ③：旧 utils/sanitization.ts 逐字）──

/**
 * Unicode Sanitization for Hidden Character Attack Mitigation（旧仓
 * 头注逐字保留要点：NFKC + 危险类目剥除，HackerOne #3086545 面）。
 */
export function partiallySanitizeUnicode(prompt: string): string {
  let current = prompt
  let previous = ''
  let iterations = 0
  const MAX_ITERATIONS = 10 // Safety limit to prevent infinite loops

  // Iteratively sanitize until no more changes occur or max iterations reached
  while (current !== previous && iterations < MAX_ITERATIONS) {
    previous = current

    // Apply NFKC normalization to handle composed character sequences
    current = current.normalize('NFKC')

    // Method 1: Strip dangerous Unicode property classes
    // This is the primary defence and is the solution that is widely used in OSS libraries.
    current = current.replace(/[\p{Cf}\p{Co}\p{Cn}]/gu, '')

    // Method 2: Explicit character ranges. There are some subtle issues with the above method
    // failing in certain environments that don't support regexes for unicode property classes,
    // so we also implement a fallback that strips out some specifically known dangerous ranges.
    current = current
      .replace(/[\u200B-\u200F]/g, '') // Zero-width spaces, LTR/RTL marks
      .replace(/[\u202A-\u202E]/g, '') // Directional formatting characters
      .replace(/[\u2066-\u2069]/g, '') // Directional isolates
      .replace(/\uFEFF/g, '') // Byte order mark
      .replace(/[\uE000-\uF8FF]/g, '') // Basic Multilingual Plane private use

iterations++
  }

  // If we hit max iterations, crash loudly. This should only ever happen if there is a bug or if someone purposefully created a deeply nested unicode string.
  if (iterations >= MAX_ITERATIONS) {
    throw new Error(
      `Unicode sanitization reached maximum iterations (${MAX_ITERATIONS}) for input: ${prompt.slice(0, 100)}`,
    )
  }

  return current
}

export function recursivelySanitizeUnicode(value: unknown): unknown {
  if (typeof value === 'string') {
    return partiallySanitizeUnicode(value)
  }

  if (Array.isArray(value)) {
    return value.map(recursivelySanitizeUnicode)
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      sanitized[recursivelySanitizeUnicode(key) as string] =
        recursivelySanitizeUnicode(val)
    }
    return sanitized
  }

  // Return other primitive values (numbers, booleans, null, undefined) unchanged
  return value
}

// ── 3 供应商（旧 3 fetch 面逐字：gate → request → 转换 → 缓存）──────

/** 工具描述符供应商（旧 fetchToolsForClient L1644 面：gate + sanitize +
 * 描述符映射；LRU 20 键 = 服务器名）。 */
export async function fetchToolsForClient(
  connection: McpServerConnection,
): Promise<McpToolDescriptor[]> {
  const cached = toolsCache.get(connection.name)
  if (cached) return cached

  const promise = (async (): Promise<McpToolDescriptor[]> => {
    if (connection.type !== 'connected') return []
    try {
      if (!connection.capabilities?.tools) {
        return []
      }
      const result = (await connection.client.request(
        'tools/list',
      )) as { tools?: McpServerTool[] } | undefined
      if (!result?.tools) return []
      // Sanitize tool data from MCP server（delta ③ 本地面逐字）
      const toolsToProcess = recursivelySanitizeUnicode(result.tools) as
        | McpServerTool[]
        | undefined
      if (!toolsToProcess) return []
      // 描述符映射（delta ②：旧 Tool 构建面归 engine createMcpTools）
      return toolsToProcess.map((tool): McpToolDescriptor => ({
        name: tool.name,
        ...(tool.description !== undefined
          ? { description: tool.description }
          : {}),
        ...(tool.inputSchema !== undefined
          ? { inputJSONSchema: tool.inputSchema }
          : {}),
        ...(tool.annotations?.readOnlyHint !== undefined
          ? { readOnlyHint: tool.annotations.readOnlyHint }
          : {}),
        ...(tool.annotations?.destructiveHint !== undefined
          ? { destructiveHint: tool.annotations.destructiveHint }
          : {}),
      }))
    } catch (error) {
      logError(error)
      logForDebugging(
        `[MCP:${connection.name}] Failed to fetch tools: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return []
    }
  })()

  toolsCache.set(connection.name, promise)
  return promise
}

/** 资源供应商（旧 fetchResourcesForClient L1895 面逐字：gate +
 * server 字段 attach + catch → []）。 */
export async function fetchResourcesForClient(
  connection: McpServerConnection,
): Promise<McpServerResourceEntry[]> {
  const cached = resourcesCache.get(connection.name)
  if (cached) return cached

  const promise = (async (): Promise<McpServerResourceEntry[]> => {
    if (connection.type !== 'connected') return []
    try {
      if (!connection.capabilities?.resources) {
        return []
      }
      const result = (await connection.client.request(
        'resources/list',
      )) as { resources?: McpServerResource[] } | undefined
      if (!result?.resources) return []
      // Add server name to each resource（旧仓同注逐字）
      return result.resources.map(resource => ({
        ...resource,
        server: connection.name,
      }))
    } catch (error) {
      logError(error)
      logForDebugging(
        `[MCP:${connection.name}] Failed to fetch resources: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return []
    }
  })()

  resourcesCache.set(connection.name, promise)
  return promise
}

/** 本地 zipObject 等价（delta ⑤：旧 lodash zipObject 2 参数配对）。 */
function zipObject(keys: string[], values: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = values[i]
  }
  return out
}

/** prompt 命令供应商（旧 fetchCommandsForClient L1928 面：gate +
 * sanitize + 命令映射；命令名面 `mcp__<server>__<prompt>` = 旧仓逐字
 * 组合〔归一本地最小面：server 名非法字符 → 下划线，engine
 * normalizeNameForMCP 同规则，L3 域内副本 delta 登记〕）。 */
export async function fetchCommandsForClient(
  connection: McpServerConnection,
): Promise<McpPromptCommand[]> {
  const cached = commandsCache.get(connection.name)
  if (cached) return cached

  const promise = (async (): Promise<McpPromptCommand[]> => {
    if (connection.type !== 'connected') return []
    try {
      if (!connection.capabilities?.prompts) {
        return []
      }
      // Request prompts list from client
      const result = (await connection.client.request(
        'prompts/list',
      )) as { prompts?: McpServerPrompt[] } | undefined
      if (!result?.prompts) return []

      // Sanitize prompt data from MCP server
      const promptsToProcess = recursivelySanitizeUnicode(
        result.prompts,
      ) as McpServerPrompt[] | undefined
      if (!promptsToProcess) return []

      // Convert MCP prompts to command descriptors（delta ④ 本地型面）
      return promptsToProcess.map(prompt => {
        const argNames = Object.values(prompt.arguments ?? {}).map(
          k => k.name,
        )
        const normalizedServer = connection.name.replace(
          /[^a-zA-Z0-9_-]/g,
          '_',
        )
        return {
          type: 'prompt' as const,
          name: `mcp__${normalizedServer}__${prompt.name}`,
          description: prompt.description ?? '',
          argNames,
          userFacingName() {
            // Use prompt.name (programmatic identifier) not prompt.title (display name)
            // to avoid spaces breaking slash command parsing（旧仓同注逐字）
            return `${connection.name}:${prompt.name} (MCP)`
          },
          async getPromptForCommand(args: string) {
            const argsArray = args.split(' ')
            // delta ④：旧 ensureConnectedClient + transformResultContent 链
            // → manager 在位连接取 client（drop 后 = failed 态 → 抛错面）
            const manager = getMcpConnectionManager()
            const current = manager.get(connection.name)
            if (current?.type !== 'connected') {
              throw new Error(
                `MCP server "${connection.name}" is not connected`,
              )
            }
            const result = (await current.client.request(
              'prompts/get',
              {
                name: prompt.name,
                arguments: zipObject(argNames, argsArray),
              },
            )) as { messages?: Array<{ content?: unknown }> } | undefined
            return (result?.messages ?? []).map(m => m.content)
          },
        }
      })
    } catch (error) {
      logError(error)
      logForDebugging(
        `[MCP:${connection.name}] Failed to fetch commands: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return []
    }
  })()

  commandsCache.set(connection.name, promise)
  return promise
}

/** 组合根 S-E2d 消费面（engine port 映射侧用）：取 manager 在位连接。 */
export function getConnectedMcpServer(
  name: string,
): ConnectedMcpServer | undefined {
  const conn = getMcpConnectionManager().get(name)
  return conn?.type === 'connected' ? conn : undefined
}
