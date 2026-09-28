/**
 * mcp 域 — 连接生命周期管理（remote 波 S-E2b，§8.68 R2 裁定）。
 *
 * 旧仓来源（a8af45b）：services/mcp/client.ts connectToServer（L550-1549
 * 3209L 文件核心）+ useManageMCPConnections 887L 状态面 → **§8.68 R2
 * 裁定落面**：
 *   - **stdio = 真实现**（本地 JSON-RPC 转写 mcpJsonRpc.ts）：spawn +
 *     initialize 握手 + MCP_TIMEOUT 连接超时（旧 L411 逐字：
 *     `parseInt(process.env.MCP_TIMEOUT || '', 10) || 30000`）+ 64MB
 *     stderr cap（旧 L905-920 逐字）+ ATLAS_SHELL_PREFIX 覆盖（旧 L881-887
 *     逐字）+ drop 检测 3 连发 terminal error（旧 L1178-1191 9 子串面
 *     逐字）+ SIGINT→SIGTERM→SIGKILL 清理阶梯（旧 L1355-1470 行为等价
 *     转写：50ms 轮询 interval + 600ms failsafe → 100ms/400ms 阶梯
 *     await，信号时序面不变，delta 登记）
 *   - **sse/http/ws/ws-ide/sse-ide = 前向接缝登记**（failed 态 + 登记
 *     message：真传输面待 IFF 网关 / 远程车道，[ATLAS-HOLD]）
 *   - **sdk = 旧仓 throw 同登记**（`Unsupported server type: sdk` 文案
 *     逐字 → failed 态）
 *   - **claudeai-proxy = OAuth 车道已删 [ATLAS-HOLD]**（2026-09-18
 *     endpoint-cleanup；failed 态 + 登记 message）
 *
 * 状态面（旧 useManageMCPConnections React 状态 887L = TUI 波域外）→
 * 非 React 单例 manager：connections Map（4 态）+ pending Set（连接中，
 * ToolSearch delta ⑤ getPendingServerNames 消费面）+ 单例注入窗
 * （getMcpConnectionManager / resetMcpConnectionManager 测试面）。
 *
 * drop 语义（旧 onclose 清 memo 缓存面 L1310-1330 转写）：连接断开 →
 * 本机 connections 置 failed（error = 'MCP server connection closed'）
 * + mcpFetch LRU 缓存失效（invalidateMcpFetchCache）+ 下次 connect 重跑
 * 生命周期（去重仅对 connected 态生效）。
 *
 * 依赖面：shared（logForDebugging 单一事实源；旧 logMCPDebug 2 参 →
 * 新 1 参 `[MCP:<name>]` 前缀面 delta 登记）+ bootstrap（roots/list
 * 反向请求 getOriginalCwd 面，LSP 域同型）。
 */
import type { ChildProcess } from 'node:child_process'
import { logForDebugging } from '../shared'
import { getOriginalCwd } from '../bootstrap'
import {
  spawnMcpStdioClient,
  McpJsonRpcError,
} from './mcpJsonRpc'
import { invalidateMcpFetchCache } from './mcpFetch'
import type {
  ConfigScope,
  ConnectedMcpServer,
  FailedMcpServer,
  McpServerConnection,
  McpStdioServerConfig,
  ScopedMcpServerConfig,
} from './types'

/** stdio 臂 scoped 配置（union 收窄面：connect 分发后 stdio 支消费）。 */
type ScopedMcpStdioConfig = McpStdioServerConfig & {
  scope: ConfigScope
  pluginSource?: string
}

/** 连接超时限（旧 L411 逐字：MCP_TIMEOUT env || 30000ms）。 */
function getConnectionTimeoutMs(): number {
  return parseInt(process.env.MCP_TIMEOUT || '', 10) || 30000
}

// ── terminal error 判定（旧 L1178-1191 9 子串面逐字）────────────────

/** 终态连接错误判定（旧 isTerminalConnectionError 逐字：ECONNRESET /
 * ETIMEDOUT / EPIPE / EHOSTUNREACH / ECONNREFUSED / 'Body Timeout Error'
 * / 'terminated' / SDK SSE 重连中间错误 2 子串）。远程支前向接缝落位后
 * 消费；stdio 支单退出路径 = onClose（child close）。 */
export function isTerminalConnectionError(msg: string): boolean {
  return (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('EPIPE') ||
    msg.includes('EHOSTUNREACH') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Body Timeout Error') ||
    msg.includes('terminated') ||
    // SDK SSE reconnection intermediate errors — may be wrapped around the
    // actual network error, so the substrings above won't match
    msg.includes('SSE stream disconnected') ||
    msg.includes('Failed to reconnect SSE stream')
  )
}

/** 3 连发 terminal error 触顶（旧 MAX_ERRORS_BEFORE_RECONNECT = 3 逐字）。 */
const MAX_ERRORS_BEFORE_RECONNECT = 3

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** pid 存活探测（旧 process.kill(pid, 0) 探测面逐字）。 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * stdio 子进程清理阶梯（旧 L1355-1470 行为等价转写：SIGINT → 100ms →
 * SIGTERM → 400ms → SIGKILL；旧 50ms 轮询 interval + 600ms failsafe
 * 面 = 本阶梯总时长等价，delta 登记）。
 */
async function terminateChild(
  name: string,
  child: ChildProcess,
): Promise<void> {
  const pid = child.pid
  if (pid === undefined) return
  logForDebugging(`[MCP:${name}] Sending SIGINT to MCP server process`)
  try {
    process.kill(pid, 'SIGINT')
  } catch (e) {
    logForDebugging(`[MCP:${name}] Error sending SIGINT: ${String(e)}`)
    return
  }
  await sleep(100)
  if (!isPidAlive(pid)) return
  // SIGINT failed, sending SIGTERM
  logForDebugging(`[MCP:${name}] SIGINT failed, sending SIGTERM to MCP server process`)
  try {
    process.kill(pid, 'SIGTERM')
  } catch (e) {
    logForDebugging(`[MCP:${name}] Error sending SIGTERM: ${String(e)}`)
    return
  }
  await sleep(400)
  if (!isPidAlive(pid)) return
  // SIGTERM failed, sending SIGKILL
  logForDebugging(`[MCP:${name}] SIGTERM failed, sending SIGKILL to MCP server process`)
  try {
    process.kill(pid, 'SIGKILL')
  } catch (e) {
    logForDebugging(`[MCP:${name}] Error sending SIGKILL: ${String(e)}`)
  }
}

// ── 前向接缝登记 message（非 stdio 传输支；§8.68 R2 裁定）──────────

const FORWARD_SEAM_MESSAGE =
  'MCP transport = 前向接缝登记（§8.68 R2：非 stdio 传输真实现待 IFF 网关 / 远程车道 [ATLAS-HOLD]；型面 8 型 config 保真，仅 stdio 连接支 live）'

// ── manager 面 ────────────────────────────────────────────────────────

export type McpConnectionManager = {
  /** 连接（已 connected 态 = 去重直接返回；失败态重跑生命周期）。 */
  connect(name: string, config: ScopedMcpServerConfig): Promise<McpServerConnection>
  /** 取当前 4 态连接（无 → undefined）。 */
  get(name: string): McpServerConnection | undefined
  /** 全量 4 态连接列表。 */
  list(): McpServerConnection[]
  /** 关闭单机（connected → cleanup；非 connected → 移除登记）。 */
  close(name: string): Promise<void>
  /** 全量关闭（进程退出面 / 测试面）。 */
  closeAll(): Promise<void>
  /** 连接中服务器名（ToolSearch delta ⑤ getPendingServerNames 消费面）。 */
  getPendingServerNames(): string[]
}

export function createMcpConnectionManager(): McpConnectionManager {
  const connections = new Map<string, McpServerConnection>()
  const pending = new Set<string>()

  function fail(
    name: string,
    config: ScopedMcpServerConfig,
    error: string,
    authFailure = false,
  ): FailedMcpServer {
    const conn: FailedMcpServer = {
      name,
      type: 'failed',
      config,
      error,
      ...(authFailure ? { authFailure: true } : {}),
    }
    connections.set(name, conn)
    return conn
  }

  async function connectStdio(
    name: string,
    config: ScopedMcpStdioConfig,
  ): Promise<McpServerConnection> {
    // ATLAS_SHELL_PREFIX 覆盖（旧 L881-887 逐字：prefix 存在时 command+args
    // 折叠为单参 shell 行）
    const finalCommand = process.env.ATLAS_SHELL_PREFIX || config.command
    const finalArgs = process.env.ATLAS_SHELL_PREFIX
      ? [[config.command, ...(config.args ?? [])].join(' ')]
      : (config.args ?? [])
    // env 面：{ ...process.env, ...config.env }（旧 subprocessEnv() = CCR
    // proxy / GHA scrub 面裁登记——CCR 车道 2026-09-18 已删，GHA scrub
    // = CI 专属面无新仓消费点；裸 process.env 基座）
    const env = { ...process.env, ...(config.env ?? {}) }

    const { client, child, stderr } = spawnMcpStdioClient({
      command: finalCommand,
      args: finalArgs,
      env,
    })

    // 64MB stderr cap（旧 L905-920 逐字：防无界内存增长 + 超长按 try 吞）
    let stderrOutput = ''
    const stderrHandler = (data: Buffer): void => {
      if (stderrOutput.length < 64 * 1024 * 1024) {
        try {
          stderrOutput += data.toString()
        } catch {
          // Ignore errors from exceeding max string length
        }
      }
    }
    stderr.on('data', stderrHandler)

    // roots/list 反向请求（旧 ListRootsRequestSchema handler 逐字面：
    // 原始 cwd file:// URI）
    client.onRequest('roots/list', () => ({
      roots: [{ uri: `file://${getOriginalCwd()}` }],
    }))

    // drop 检测（旧 3 连发 terminal error 面：terminal 计数触顶 = 强制
    // 关连接；stdio 支单退出路径走 onClose，本计数器为远程支落位预留）
    let consecutiveTerminalErrors = 0
    const errorObserver = (error: Error): void => {
      const transportType = config.type || 'stdio'
      logForDebugging(
        `[MCP:${name}] ${transportType.toUpperCase()} connection error: ${error.message}`,
      )
      if (isTerminalConnectionError(error.message)) {
        consecutiveTerminalErrors++
        logForDebugging(
          `[MCP:${name}] Terminal connection error ${consecutiveTerminalErrors}/${MAX_ERRORS_BEFORE_RECONNECT}`,
        )
        if (consecutiveTerminalErrors >= MAX_ERRORS_BEFORE_RECONNECT) {
          consecutiveTerminalErrors = 0
          void closeConnection(name)
        }
      } else {
        consecutiveTerminalErrors = 0
      }
    }
    client.onError(errorObserver)

    const closeOnDrop = (): void => {
      stderr.off('data', stderrHandler)
      // drop 语义（旧 onclose 清 memo 缓存面）：置 failed + LRU 失效 +
      // 下次 connect 重跑
      if (stderrOutput) {
        logForDebugging(`[MCP:${name}] Server stderr: ${stderrOutput}`)
        stderrOutput = '' // Release accumulated string to prevent memory growth
      }
      invalidateMcpFetchCache(name)
      const current = connections.get(name)
      if (current?.type === 'connected') {
        connections.set(name, {
          name,
          type: 'failed',
          config,
          error: 'MCP server connection closed',
        })
      }
      void terminateChild(name, child)
    }
    client.onClose(closeOnDrop)

    // initialize 握手 + 连接超时（旧 L995-1025 面：race + 超时文案逐字 +
    // connect settle 即清 timer〔旧 L1013-1019 逐字〕；旧 TelemetrySafeError
    // → 本地 Error 化 delta 登记）
    const initPromise = client.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {
        // 空对象声明能力（旧仓同注：发 {form:{},url:{}} 会砸 Spring AI
        // Elicitation 零字段类）
        elicitation: {},
        roots: {},
      },
      clientInfo: { name: 'atlascode', version: '0.0.1' },
    })
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(
              `MCP server "${name}" connection timed out after ${getConnectionTimeoutMs()}ms`,
            ),
          ),
        getConnectionTimeoutMs(),
      )
    })
    // Clean up timeout if connect resolves or rejects（旧 L1013-1019 逐字）
    void initPromise.then(
      () => clearTimeout(timeoutId),
      () => clearTimeout(timeoutId),
    )
    try {
      const init = (await Promise.race([initPromise, timeoutPromise])) as {
        capabilities?: { tools?: boolean; resources?: boolean; prompts?: boolean }
        serverInfo?: { name: string; version: string }
        instructions?: string
      }
      client.notify('notifications/initialized')

      const connection: ConnectedMcpServer = {
        name,
        type: 'connected',
        client,
        capabilities: init.capabilities ?? {},
        ...(init.serverInfo
          ? {
              serverInfo: {
                name: init.serverInfo.name,
                version: init.serverInfo.version,
              },
            }
          : {}),
        ...(init.instructions ? { instructions: init.instructions } : {}),
        config,
        cleanup: async () => {
          stderr.off('data', stderrHandler)
          client.close()
          await terminateChild(name, child)
        },
      }
      connections.set(name, connection)
      return connection
    } catch (e) {
      // spawn 失败 / 超时 / initialize 错误 → failed（stderr 面同 drop 面）
      stderr.off('data', stderrHandler)
      client.close()
      void terminateChild(name, child)
      if (stderrOutput) {
        logForDebugging(`[MCP:${name}] Server stderr: ${stderrOutput}`)
        stderrOutput = ''
      }
      const message =
        e instanceof McpJsonRpcError || e instanceof Error
          ? e.message
          : String(e)
      return fail(name, config, message)
    }
  }

  async function connect(
    name: string,
    config: ScopedMcpServerConfig,
  ): Promise<McpServerConnection> {
    const existing = connections.get(name)
    if (existing?.type === 'connected') return existing

    pending.add(name)
    try {
      const t = (config as { type?: string }).type
      // 非 stdio 传输支：前向接缝登记（§8.68 R2 裁定）
      if (t === 'sse' || t === 'http' || t === 'ws' || t === 'sse-ide' || t === 'ws-ide') {
        return fail(name, config, `${t}: ${FORWARD_SEAM_MESSAGE}`)
      }
      if (t === 'sdk') {
        // 旧仓 connectToServer sdk 支 = throw 'Unsupported server type: sdk'
        // 同登记（SDK 模式客户端 = 旧 setupSdkMcpClients 3123L 面，
        // agent-SDK 域外；failed 态承载文案逐字）
        return fail(name, config, 'Unsupported server type: sdk')
      }
      if (t === 'claudeai-proxy') {
        // OAuth 车道已删（2026-09-18 endpoint-cleanup；[ATLAS-HOLD]）
        return fail(
          name,
          config,
          'claudeai-proxy: OAuth 车道已删 [ATLAS-HOLD]（旧仓 claude.ai 订阅车道 2026-09-18 端点清理裁，待 IFF 网关换值）',
          true,
        )
      }
      // stdio（type 'stdio' | 缺省 = 旧 `type === 'stdio' || !type` 支逐字；
      // 分发已排除 6 非 stdio 型，union 收窄到 stdio 臂）
      return await connectStdio(name, config as ScopedMcpStdioConfig)
    } finally {
      pending.delete(name)
    }
  }

  async function closeConnection(name: string): Promise<void> {
    const current = connections.get(name)
    if (!current) return
    if (current.type === 'connected') {
      await current.cleanup().catch(() => {})
    }
    connections.delete(name)
  }

  const manager: McpConnectionManager = {
    connect,
    get: (name) => connections.get(name),
    list: () => [...connections.values()],
    close: (name) => closeConnection(name),
    async closeAll() {
      for (const name of [...connections.keys()]) {
        await manager.close(name)
      }
    },
    getPendingServerNames: () => [...pending],
  }
  return manager
}

// ── 单例注入窗（组合根 S-E2d 消费；测试面 reset）────────────────────

let singleton: McpConnectionManager | undefined

export function getMcpConnectionManager(): McpConnectionManager {
  return (singleton ??= createMcpConnectionManager())
}

/** 测试面：关全量 + 清单例（新 manager 从零态起）。 */
export async function resetMcpConnectionManager(): Promise<void> {
  if (singleton) {
    await singleton.closeAll().catch(() => {})
    singleton = undefined
  }
}
