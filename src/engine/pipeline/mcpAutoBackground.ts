/**
 * mcpAutoBackground — MCP 慢调用自动转后台（0.1.79 W-C C5-3）
 *
 * 基线 569aed7 缺口：MCP 工具调用超 2 分钟仍前台阻塞整个回合（TUI 冻结态 +
 * agent loop 无法推进）。本模块 = race 面：executeToolUse 在 onMcpToolBackgrounded
 * 槽注入且 tool.isMcp 时以 callWithMcpAutoBackground 包裹（可再包 heartbeat——
 * 后台期间心跳继续，spinner 持「仍在运行」），计时器胜即合成非 error 的
 * 「已转后台」tool_result 早返（跳过 post-hook——后台化 ≠ 完成），真结果/异常
 * 经 onBackgrounded 回调送达（REPL enqueuePendingNotification task-notification
 * → 回合间自动再注入 agent loop）。
 *
 * 快完成/快拒绝原样穿透（catch 面不吞既有 executeToolUse 错误链）；槽未注入
 * （headless）或非 MCP 工具 = 直接调用零开销恒等锚。env ATLAS_MCP_AUTO_BACKGROUND_MS
 * 覆盖阈值（默认 120s，下限 1s 防 misconfig 即转后台）。
 */

export interface McpToolBackgroundedInfo {
  toolUseId: string
  toolName: string
  outcome: { ok: true; data: unknown } | { ok: false; error: string }
}

export const DEFAULT_MCP_AUTO_BACKGROUND_MS = 120_000
export const MIN_MCP_AUTO_BACKGROUND_MS = 1_000

/** 转后台阈值解析：env 覆盖 / 非法或空回落默认 / 下限 clamp。 */
export function getMcpAutoBackgroundMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.ATLAS_MCP_AUTO_BACKGROUND_MS
  if (!raw) return DEFAULT_MCP_AUTO_BACKGROUND_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_MCP_AUTO_BACKGROUND_MS
  return Math.max(MIN_MCP_AUTO_BACKGROUND_MS, parsed)
}

/**
 * 以转后台 race 包裹一次调用：backgroundAfterMs 内完成 → 结果/异常原样穿透；
 * 计时器胜 → 立返 { backgrounded: true }，fn 继续在后台跑，真终态（成功数据 /
 * 失败错误串）经 onBackgrounded 送达（fn 拒绝挂在 continuation 内消化，
 * 不产生 unhandled rejection）。
 */
export async function callWithMcpAutoBackground<T>(
  opts: {
    toolUseId: string
    toolName: string
    backgroundAfterMs: number
    onBackgrounded: (info: McpToolBackgroundedInfo) => void
  },
  fn: () => Promise<T>,
): Promise<{ backgrounded: true } | { backgrounded: false; result: T }> {
  let settled = false
  return new Promise((resolve, reject) => {
    // fn 只调一次；计时器胜后复用同一 promise 作 continuation（真终态经回调送达）
    const pending = fn()
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ backgrounded: true })
      pending
        .then((data) => {
          opts.onBackgrounded({
            toolUseId: opts.toolUseId,
            toolName: opts.toolName,
            outcome: { ok: true, data },
          })
        })
        .catch((error: unknown) => {
          opts.onBackgrounded({
            toolUseId: opts.toolUseId,
            toolName: opts.toolName,
            outcome: { ok: false, error: String((error as Error)?.message ?? error) },
          })
        })
    }, opts.backgroundAfterMs)
    ;(timer as { unref?: () => void }).unref?.()
    pending.then(
      (result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ backgrounded: false, result })
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
