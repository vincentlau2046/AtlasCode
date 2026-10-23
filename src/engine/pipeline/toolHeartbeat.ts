/**
 * toolHeartbeat — 长工具调用周期「进行中」心跳（0.1.79 W-C C4-3）
 *
 * 基线 569aed7 缺口：session keepalive（sessionActivity）与 MCP mcp_progress
 * （TUI MCP client onProgress，engine pipeline 不传）均不覆盖通用工具，长工具
 * 调用在渲染层呈冻结态。本模块 = 纯计时面：executeToolUse 以 runWithToolHeartbeat
 * 包 tool.call，间隔周期发 ToolHeartbeatInfo（identity + elapsedMs），经
 * AgentLoopEvent 'tool_heartbeat' → loopEvents 转发 → messages 消费 → REPL
 * spinnerTip（「X 仍在运行 · Ns」）。
 *
 * 瞬态信号不入 transcript；onToolHeartbeat 未注入（headless）= 直接调用零开销
 * 恒等锚。env ATLAS_TOOL_HEARTBEAT_MS 覆盖间隔（可测性，测试不挂 30s），
 * 下限 100ms 防 misconfig 紧循环。
 */

export interface ToolHeartbeatInfo {
  toolUseId: string
  toolName: string
  elapsedMs: number
}

export const DEFAULT_TOOL_HEARTBEAT_INTERVAL_MS = 30_000
export const MIN_TOOL_HEARTBEAT_INTERVAL_MS = 100

/** 心跳间隔解析：env 覆盖 / 非法或空回落默认 / 下限 clamp。 */
export function getToolHeartbeatIntervalMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.ATLAS_TOOL_HEARTBEAT_MS
  if (!raw) return DEFAULT_TOOL_HEARTBEAT_INTERVAL_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_TOOL_HEARTBEAT_INTERVAL_MS
  return Math.max(MIN_TOOL_HEARTBEAT_INTERVAL_MS, parsed)
}

/**
 * 以周期心跳包裹一次工具调用：fn 完成前每 intervalMs 发一次 onHeartbeat
 * （含起始 elapsedMs），结果/异常原样穿透，finally 清 timer（不泄漏）。
 */
export async function runWithToolHeartbeat<T>(
  opts: {
    toolUseId: string
    toolName: string
    intervalMs: number
    onHeartbeat: (info: ToolHeartbeatInfo) => void
  },
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  const timer = setInterval(() => {
    opts.onHeartbeat({
      toolUseId: opts.toolUseId,
      toolName: opts.toolName,
      elapsedMs: Date.now() - start,
    })
  }, opts.intervalMs)
  // 心跳不持进程（headless 场景 timer 不应延长退出）
  ;(timer as { unref?: () => void }).unref?.()
  try {
    return await fn()
  } finally {
    clearInterval(timer)
  }
}
