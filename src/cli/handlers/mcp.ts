/**
 * cli（CLI 公共域）S-C4 commit 4（§8.71.1.4）— mcp 子命令 handler（旧仓
 * cli/handlers/mcp.tsx 337L + commands/mcp/addCommand.ts 265L 裁剪随迁；
 * 惰性加载面保真：parse.ts 按子命令动态 import 本模块，type-only 选项面）。
 *
 * 随迁面（支序旧仓逐字）：serve / add（stdio·sse·http 三 transport 支）/
 * remove（explicit scope + 缺省 scope 三态 0/1/多）/ list（并发 health
 * check + 按 type 输出）/ get（详情 + health）/ add-json。
 *
 * 裁登记（H6 防空洞，复审勿当遗漏重提）：
 *   - mcp serve 尾段 = startMCPServer 前向接缝登记：新仓无 MCP server 入口
 *     （旧 entrypoints/mcp.ts = Atlas 自身作 MCP server 的 stdio 入口，
 *     mcp 域 R2 = client 面；server 面待 IFF 网关 / 远程车道 [ATLAS-HOLD]）
 *     ——明示接缝 exit 1，不伪装能力；
 *   - secure storage 清理（旧 remove handler cleanupSecureStorage /
 *     auth.ts clearServerTokensFromLocalStorage·clearMcpClientConfig
 *     keychain 槽）= 新仓无 auth 存储面（OAuth 车道裁 [ATLAS-HOLD]）；
 *   - OAuth client secret（旧 readClientSecret stdin prompt + keychain 存储
 *     + saveMcpClientSecret）= 裁：parse.ts --client-id/--client-secret/
 *     --callback-port 选项面 = 惰性数据保留（S-C2 头注同登记），handler 仅
 *     构造 oauth {clientId, callbackPort}（xaa flag 支裁：新仓无 --xaa 选项
 *     / XAA 面域外）；get 面 oauth 行 'client_secret configured' 子支同裁；
 *   - list claudeai-proxy 输出支（OAuth 车道裁）+ ws·ws-ide·sse-ide·sdk 输出
 *     支（旧码同 fall-through 无输出，行为保真）；
 *   - pMap 并发（3-dep 纪律无 p-map：本地批队列替身，保序 = pMap 语义）+
 *     batch size env MCP_SERVER_CONNECTION_BATCH_SIZE || 3（旧 client.ts
 *     getMcpServerConnectionBatchSize 逐字）；
 *   - gracefulShutdown(0)（旧 utils/gracefulShutdown 进程退出面）→ 本地
 *     manager.closeAll()（spawned stdio 子进程清理面同语义；不 process.exit，
 *     commander action 返回后自然退出）；
 *   - isFsInaccessible（旧 utils/errors）→ 本地 errno code 判（ENOENT /
 *     EACCES / EPERM 同集）；
 *   - console.log → process.stdout.write（exit.ts 头注同裁定：Bun 下
 *     process.stdout.write 可测面）；
 *   - logEvent tengu_mcp_* 点（旧 879 点清核）/ getPlatform（旧
 *     add-from-desktop handler 专用，该 handler 域外裁）；
 *   - 品牌文案：旧 handler 文本 `claude mcp ...` → `atlascode mcp ...`
 *     （S-C2 选项面 de-Claude 化同裁定）。
 *
 * health check = mcp 域 manager connect（createMcpConnectionManager 新实例，
 * 非组合根单例）：旧 connectToServer 3 态 union（connected / needs-auth /
 * failed）→ 新 4 态 union 映射（§8.68 R2 裁定 needs-auth 折叠进
 * failed.authFailure）：connected → '✓ Connected' / failed∧authFailure →
 * '! Needs authentication' / failed → '✗ Failed to connect' / catch →
 * '✗ Connection error'（stdio 真 spawn；非 stdio = 前向接缝 fail 态，
 * mcpConnectionManager.ts 头注逐字）。
 *
 * 预声明注入窗：旧 .tsx Ink 对话框面（add-from-desktop 对话框 /
 * reset-project-choices 审批面）= 不随迁（parse.ts 头注裁登记逐字），对话框
 * 渲染由 TUI 壳供给（壳波 #152）。
 *
 * boundaries allow 面（eslint.config.mjs cli 规则既覆盖面，无新增）：mcp
 * （型面 + manager）+ 域内（exit/entryInit/mcpConfigWrite/setup）。
 */
import { stat } from 'node:fs/promises'
import {
  createMcpConnectionManager,
  type McpConnectionManager,
  type ScopedMcpServerConfig,
} from '../../mcp'
import { safeParseJSON } from '../entryInit'
import { cliError, cliOk } from '../exit'
import {
  addMcpConfig,
  describeMcpConfigFilePath,
  ensureConfigScope,
  ensureTransport,
  getAllMcpConfigs,
  getMcpConfigByName,
  getMcpConfigsByScope,
  getScopeLabel,
  parseEnvVars,
  parseHeaders,
  removeMcpConfig,
} from '../mcpConfigWrite'
import { runCliSetup } from '../setup'

// ── 选项面（parse.ts type-only import；commander options 解析后形状）──

export type McpServeOptions = {
  debug?: boolean
  verbose?: boolean
}
export type McpAddOptions = {
  scope?: string
  transport?: string
  env?: string[]
  header?: string[]
  clientId?: string
  clientSecret?: boolean
  callbackPort?: string
}
export type McpRemoveOptions = {
  scope?: string
}
export type McpAddJsonOptions = {
  scope?: string
  clientSecret?: boolean
}

/** batch size env（旧 client.ts getMcpServerConnectionBatchSize 逐字）。 */
function getConnectionBatchSize(): number {
  return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE || '', 10) || 3
}

/** 本地并发 map（3-dep 纪律 pMap 替身；保序 = pMap 语义）。 */
async function mapConcurrent<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers: Promise<void>[] = []
  const n = Math.max(1, Math.min(concurrency, items.length))
  for (let i = 0; i < n; i++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = next++
          if (idx >= items.length) return
          results[idx] = await fn(items[idx])
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

/** health 态映射（旧 connectToServer 3 态 → 新 4 态，见头注裁定）。 */
async function checkMcpServerHealth(
  manager: McpConnectionManager,
  name: string,
  server: ScopedMcpServerConfig,
): Promise<string> {
  try {
    const result = await manager.connect(name, server)
    if (result.type === 'connected') {
      return '✓ Connected'
    } else if (result.type === 'failed' && result.authFailure) {
      return '! Needs authentication'
    } else {
      return '✗ Failed to connect'
    }
  } catch (_error) {
    return '✗ Connection error'
  }
}

// mcp serve
export async function mcpServeHandler(
  _options: McpServeOptions,
): Promise<void> {
  // debug/verbose = startMCPServer 接缝透传数据（接缝未落盘，参数面保留，
  // parse.ts 选项注册面逐字；接缝落盘后接管）
  const providedCwd = process.cwd()
  try {
    await stat(providedCwd)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
      cliError(`Error: Directory ${providedCwd} does not exist`)
    }
    throw error
  }
  // 旧 setup(providedCwd, 'default', false, false, undefined, false) → 新
  // runCliSetup（permissionMode 缺省 = 'default' 同义）
  await runCliSetup({ cwd: providedCwd })
  // startMCPServer 前向接缝登记（见头注：新仓无 MCP server 入口 [ATLAS-HOLD]）
  cliError(
    'atlascode mcp serve: startMCPServer = 前向接缝登记（MCP server 入口未落盘，IFF 网关 / 远程车道 [ATLAS-HOLD]）',
  )
}

// mcp remove
export async function mcpRemoveHandler(
  name: string,
  options: McpRemoveOptions,
): Promise<void> {
  // Look up config before removing（旧注释逐字；新仓 secure storage 清理
  // 支裁登记见头注，前查面随之消解）
  try {
    if (options.scope) {
      const scope = ensureConfigScope(options.scope)
      await removeMcpConfig(name, scope)
      process.stdout.write(
        `Removed MCP server ${name} from ${scope} config\n`,
      )
      cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`)
    }

    // If no scope specified, check where the server exists
    const [localServers, projectServers, userServers] = await Promise.all([
      getMcpConfigsByScope('local'),
      getMcpConfigsByScope('project'),
      getMcpConfigsByScope('user'),
    ])

    // Count how many scopes contain this server（支序 = 旧 local → project
    // → user 逐字）
    const scopes: Array<'local' | 'project' | 'user'> = []
    if (localServers[name]) scopes.push('local')
    if (projectServers[name]) scopes.push('project')
    if (userServers[name]) scopes.push('user')
    if (scopes.length === 0) {
      cliError(`No MCP server found with name: "${name}"`)
    } else if (scopes.length === 1) {
      // Server exists in only one scope, remove it
      const scope = scopes[0]!
      await removeMcpConfig(name, scope)
      process.stdout.write(
        `Removed MCP server "${name}" from ${scope} config\n`,
      )
      cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`)
    } else {
      // Server exists in multiple scopes
      process.stderr.write(
        `MCP server "${name}" exists in multiple scopes:\n`,
      )
      for (const scope of scopes) {
        process.stderr.write(
          `  - ${getScopeLabel(scope)} (${describeMcpConfigFilePath(scope)})\n`,
        )
      }
      process.stderr.write('\nTo remove from a specific scope, use:\n')
      for (const scope of scopes) {
        process.stderr.write(
          `  atlascode mcp remove "${name}" -s ${scope}\n`,
        )
      }
      cliError()
    }
  } catch (error) {
    cliError((error as Error).message)
  }
}

// mcp list
export async function mcpListHandler(): Promise<void> {
  const configs = await getAllMcpConfigs()
  if (Object.keys(configs).length === 0) {
    process.stdout.write(
      'No MCP servers configured. Use `atlascode mcp add` to add a server.\n',
    )
    return
  }

  process.stdout.write('Checking MCP server health...\n\n')

  const manager = createMcpConnectionManager()
  try {
    // Check servers concurrently（pMap → 本地批队列，见头注）
    const entries = Object.entries(configs)
    const results = await mapConcurrent(
      entries,
      async ([name, server]) => ({
        name,
        server,
        status: await checkMcpServerHealth(manager, name, server),
      }),
      getConnectionBatchSize(),
    )
    for (const { name, server, status } of results) {
      // Intentionally excluding sse-ide servers here since they're internal
      if (server.type === 'sse') {
        process.stdout.write(`${name}: ${server.url} (SSE) - ${status}\n`)
      } else if (server.type === 'http') {
        process.stdout.write(`${name}: ${server.url} (HTTP) - ${status}\n`)
      } else if (!server.type || server.type === 'stdio') {
        const stdioServer = server as { command?: string; args?: string[] }
        const args = Array.isArray(stdioServer.args) ? stdioServer.args : []
        process.stdout.write(
          `${name}: ${stdioServer.command} ${args.join(' ')} - ${status}\n`,
        )
      }
      // claudeai-proxy / ws / ws-ide / sse-ide / sdk 输出支裁登记见头注
    }
  } finally {
    // 旧 gracefulShutdown(0) → closeAll（裁登记见头注：spawned stdio 子
    // 进程清理，防孤儿）
    await manager.closeAll()
  }
}

// mcp get
export async function mcpGetHandler(name: string): Promise<void> {
  const server = await getMcpConfigByName(name)
  if (!server) {
    cliError(`No MCP server found with name: ${name}`)
  }

  process.stdout.write(`${name}:\n`)
  process.stdout.write(`  Scope: ${getScopeLabel(server.scope)}\n`)

  const manager = createMcpConnectionManager()
  try {
    // Check server health
    const status = await checkMcpServerHealth(manager, name, server)
    process.stdout.write(`  Status: ${status}\n`)

    // Intentionally excluding sse-ide servers here since they're internal
    if (server.type === 'sse') {
      process.stdout.write(`  Type: sse\n`)
      process.stdout.write(`  URL: ${server.url}\n`)
      if (server.headers) {
        process.stdout.write('  Headers:\n')
        for (const [key, value] of Object.entries(server.headers)) {
          process.stdout.write(`    ${key}: ${value}\n`)
        }
      }
      if (server.oauth?.clientId || server.oauth?.callbackPort) {
        const parts: string[] = []
        if (server.oauth.clientId) {
          parts.push('client_id configured')
          // client_secret configured 子支裁（keychain 存储面缺席，见头注）
        }
        if (server.oauth.callbackPort) {
          parts.push(`callback_port ${server.oauth.callbackPort}`)
        }
        process.stdout.write(`  OAuth: ${parts.join(', ')}\n`)
      }
    } else if (server.type === 'http') {
      process.stdout.write(`  Type: http\n`)
      process.stdout.write(`  URL: ${server.url}\n`)
      if (server.headers) {
        process.stdout.write('  Headers:\n')
        for (const [key, value] of Object.entries(server.headers)) {
          process.stdout.write(`    ${key}: ${value}\n`)
        }
      }
      if (server.oauth?.clientId || server.oauth?.callbackPort) {
        const parts: string[] = []
        if (server.oauth.clientId) {
          parts.push('client_id configured')
          // client_secret configured 子支裁（同上）
        }
        if (server.oauth.callbackPort) {
          parts.push(`callback_port ${server.oauth.callbackPort}`)
        }
        process.stdout.write(`  OAuth: ${parts.join(', ')}\n`)
      }
    } else if (server.type === 'stdio') {
      process.stdout.write(`  Type: stdio\n`)
      process.stdout.write(`  Command: ${server.command}\n`)
      const args = Array.isArray(server.args) ? server.args : []
      process.stdout.write(`  Args: ${args.join(' ')}\n`)
      if (server.env) {
        process.stdout.write('  Environment:\n')
        for (const [key, value] of Object.entries(server.env)) {
          process.stdout.write(`    ${key}=${value}\n`)
        }
      }
    }
    process.stdout.write(
      `\nTo remove this server, run: atlascode mcp remove "${name}" -s ${server.scope}\n`,
    )
  } finally {
    await manager.closeAll()
  }
}

// mcp add-json
export async function mcpAddJsonHandler(
  name: string,
  json: string,
  options: McpAddJsonOptions,
): Promise<void> {
  try {
    const scope = ensureConfigScope(options.scope)
    const parsedJson = safeParseJSON(json)

    // clientSecret 支裁（keychain 存储面缺席；parse.ts 选项面 = 惰性数据，
    // 见头注）
    await addMcpConfig(name, parsedJson, scope)
    const transportType =
      parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson
        ? String((parsedJson as { type?: unknown }).type || 'stdio')
        : 'stdio'
    cliOk(`Added ${transportType} MCP server ${name} to ${scope} config`)
  } catch (error) {
    cliError((error as Error).message)
  }
}

// mcp add（旧 addCommand.ts 三 transport 支裁剪随迁，裁登记见头注）
export async function mcpAddHandler(
  name: string,
  commandOrUrl: string,
  args: string[],
  options: McpAddOptions,
): Promise<void> {
  // Commander.js handles -- natively: it consumes -- and everything after
  // becomes args
  const actualCommand = commandOrUrl
  const actualArgs = args

  // If no name is provided, error
  if (!name) {
    cliError(
      'Error: Server name is required.\n' +
        'Usage: atlascode mcp add <name> <command> [args...]',
    )
  } else if (!actualCommand) {
    cliError(
      'Error: Command is required when server name is provided.\n' +
        'Usage: atlascode mcp add <name> <command> [args...]',
    )
  }

  try {
    const scope = ensureConfigScope(options.scope)
    const transport = ensureTransport(options.transport)

    // XAA fail-fast 支裁（新仓无 --xaa 选项 / XAA 面域外，parse.ts 头注）

    // Check if transport was explicitly provided
    const transportExplicit = options.transport !== undefined

    // Check if the command looks like a URL (likely incorrect usage)
    const looksLikeUrl =
      actualCommand.startsWith('http://') ||
      actualCommand.startsWith('https://') ||
      actualCommand.startsWith('localhost') ||
      actualCommand.endsWith('/sse') ||
      actualCommand.endsWith('/mcp')

    if (transport === 'sse') {
      if (!actualCommand) {
        cliError('Error: URL is required for SSE transport.')
      }

      const headers = options.header
        ? parseHeaders(options.header)
        : undefined

      const callbackPort = options.callbackPort
        ? parseInt(options.callbackPort, 10)
        : undefined
      // xaa flag 支裁（见头注）；clientSecret 读写支裁（keychain 缺席）
      const oauth =
        options.clientId || callbackPort
          ? {
              ...(options.clientId ? { clientId: options.clientId } : {}),
              ...(callbackPort ? { callbackPort } : {}),
            }
          : undefined

      const serverConfig = {
        type: 'sse' as const,
        url: actualCommand,
        headers,
        oauth,
      }
      await addMcpConfig(name, serverConfig, scope)

      process.stdout.write(
        `Added SSE MCP server ${name} with URL: ${actualCommand} to ${scope} config\n`,
      )
      if (headers) {
        process.stdout.write(
          `Headers: ${JSON.stringify(headers, null, 2)}\n`,
        )
      }
    } else if (transport === 'http') {
      if (!actualCommand) {
        cliError('Error: URL is required for HTTP transport.')
      }

      const headers = options.header
        ? parseHeaders(options.header)
        : undefined

      const callbackPort = options.callbackPort
        ? parseInt(options.callbackPort, 10)
        : undefined
      // xaa / clientSecret 支裁（同上）
      const oauth =
        options.clientId || callbackPort
          ? {
              ...(options.clientId ? { clientId: options.clientId } : {}),
              ...(callbackPort ? { callbackPort } : {}),
            }
          : undefined

      const serverConfig = {
        type: 'http' as const,
        url: actualCommand,
        headers,
        oauth,
      }
      await addMcpConfig(name, serverConfig, scope)

      process.stdout.write(
        `Added HTTP MCP server ${name} with URL: ${actualCommand} to ${scope} config\n`,
      )
      if (headers) {
        process.stdout.write(
          `Headers: ${JSON.stringify(headers, null, 2)}\n`,
        )
      }
    } else {
      if (
        options.clientId ||
        options.clientSecret ||
        options.callbackPort
      ) {
        process.stderr.write(
          `Warning: --client-id, --client-secret, and --callback-port are only supported for HTTP/SSE transports and will be ignored for stdio.\n`,
        )
      }

      // Warn if this looks like a URL but transport wasn't explicitly
      // specified
      if (!transportExplicit && looksLikeUrl) {
        process.stderr.write(
          `\nWarning: The command "${actualCommand}" looks like a URL, but is being interpreted as a stdio server as --transport was not specified.\n`,
        )
        process.stderr.write(
          `If this is an HTTP server, use: atlascode mcp add --transport http ${name} ${actualCommand}\n`,
        )
        process.stderr.write(
          `If this is an SSE server, use: atlascode mcp add --transport sse ${name} ${actualCommand}\n`,
        )
      }

      const env = parseEnvVars(options.env)
      await addMcpConfig(
        name,
        { type: 'stdio', command: actualCommand, args: actualArgs, env },
        scope,
      )

      process.stdout.write(
        `Added stdio MCP server ${name} with command: ${actualCommand} ${actualArgs.join(' ')} to ${scope} config\n`,
      )
    }
    cliOk(`File modified: ${describeMcpConfigFilePath(scope)}`)
  } catch (error) {
    cliError((error as Error).message)
  }
}
