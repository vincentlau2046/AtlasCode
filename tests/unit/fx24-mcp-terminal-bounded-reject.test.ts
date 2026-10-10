/**
 * FX-24（0.1.48 A-② MCP，验证型 / live 已绿 / 回归断言）：
 * MCP tool call 中途断连挂死 → 有界拒（非挂死）。
 *
 * 机制（工单 §1.4，全在场，零落码）：TUI 车道 `client.ts` 终态错误 3 连发
 * （MAX_ERRORS_BEFORE_RECONNECT=3）→ `client.close()` → SDK `_onclose()` reject
 * 全部 pending request handler（hung `callTool()` 以 McpError -32000
 * "Connection closed" fail）+ 清 memo 缓存。终态判定 = 9 子串面（ECONNRESET /
 * ETIMEDOUT / EPIPE / EHOSTUNREACH / ECONNREFUSED / 'Body Timeout Error' /
 * 'terminated' / 'SSE stream disconnected' / 'Failed to reconnect SSE stream'）。
 *
 * 本 unit 锁**可达的判定原语**（终态错误分类器，3 连发 close+reject-pending
 * 的门）：`isTerminalConnectionError`（engine 侧导出，与 TUI 车道 client.ts
 * 同型 9 子串面）。
 *
 * **车道分工裁定**（工单 §3）：完整「mock SSE transport 中途断连 → in-flight
 * callTool Promise 有界拒 -32000（非挂死）」端到端探针 = **e2e gate 项**
 * （§3「MCP 断连探针（建议随 FX-24 新登记 1 条）」，TUI SDK transport 真 mock
 * 面归 e2e lane）；Main 车道 = 本 unit 判定原语回归断言（零码）。
 * 分层纪律：纯谓词（无网络/无 LLM/无 spawn）→ unit 层。
 */
import { describe, expect, test } from 'bun:test'
import { isTerminalConnectionError } from '../../src/mcp'

describe('FX-24 MCP 终态错误分类器（3 连发 close+reject-pending 的门原语）', () => {
  test('9 终态子串全部判 terminal（任一命中即计入 3 连发计数）', () => {
    const terminalSubstrings = [
      'ECONNRESET',
      'ETIMEDOUT',
      'EPIPE',
      'EHOSTUNREACH',
      'ECONNREFUSED',
      'Body Timeout Error',
      'terminated',
      // SDK SSE 重连中间错误（包裹实际网络错误，上列裸子串不匹配 → 独立登记）
      'SSE stream disconnected',
      'Failed to reconnect SSE stream',
    ]
    for (const s of terminalSubstrings) {
      expect(
        isTerminalConnectionError(s),
        `「${s}」应判 terminal`,
      ).toBe(true)
      // 真实断连文案（包裹形态）也须命中
      expect(
        isTerminalConnectionError(`read ECONNRESET while connecting: ${s}`),
        `包裹形态「${s}」应判 terminal`,
      ).toBe(true)
    }
  })

  test('非终态错误不误判 terminal（不误触 3 连发 close，避免过早断连）', () => {
    expect(isTerminalConnectionError('some transient read error')).toBe(false)
    expect(isTerminalConnectionError('')).toBe(false)
    // 近似但不匹配的子串不命中（精确 9 子串面，非模糊匹配）
    expect(isTerminalConnectionError('CONNECTION reset-ish')).toBe(false)
  })
})
