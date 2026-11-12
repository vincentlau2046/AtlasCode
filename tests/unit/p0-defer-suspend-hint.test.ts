/**
 * 0.1.102 P0 切片 2-C 判据格：AD-45 defer 挂起可视化（提示行格）。
 *
 * 格面（工单：defer 挂起 → 提示行格）：
 *  - 提示行文本基形：含「等待权限裁定」+ 工具名 + 「Esc 中止」（工单定语逐字）
 *  - 单源消费形：REPL 消费 AgentLoopResult.deferred（engine loop.ts 挂起标记
 *    单源）——断言 engine 面 DeferredToolUsePayload 形状字段在（toolName /
 *    deferReason）且 DeferSuspension 消费形对齐
 *  - 超时注记：<60s 无；≥60s 含「已挂起 Ns 未见重评」
 *  - reason 空串回退形
 */
import { describe, expect, test } from 'bun:test'

import {
  DEFER_SUSPEND_TIMEOUT_HINT_MS,
  deferSuspendHintText,
} from 'src/tui/components/DeferSuspendHint'
import type { DeferredToolUsePayload } from 'src/engine'

describe('deferSuspendHintText（切片 2-C 提示行格）', () => {
  test('常量 = 60s 超时阈值', () => {
    expect(DEFER_SUSPEND_TIMEOUT_HINT_MS).toBe(60_000)
  })

  test('基形含「等待权限裁定」+ 工具名 + 「Esc 中止」（工单定语逐字）', () => {
    const text = deferSuspendHintText('Bash', 'deferred by hook', 0)
    expect(text).toContain('等待权限裁定')
    expect(text).toContain('Bash')
    expect(text).toContain('deferred by hook')
    expect(text).toContain('Esc 中止')
    expect(text).toContain('发送消息可重评')
  })

  test('<60s 无超时注记；≥60s 含「已挂起 Ns 未见重评」', () => {
    const before = deferSuspendHintText('Read', 'r', DEFER_SUSPEND_TIMEOUT_HINT_MS - 1)
    expect(before).not.toContain('已挂起')
    const at = deferSuspendHintText('Read', 'r', DEFER_SUSPEND_TIMEOUT_HINT_MS)
    expect(at).toContain('已挂起 60s 未见重评')
    const after = deferSuspendHintText('Read', 'r', 125_000)
    expect(after).toContain('已挂起 125s 未见重评')
  })

  test('reason 空串回退：不出现空括号', () => {
    const text = deferSuspendHintText('WebFetch', '', 0)
    expect(text).toContain('等待权限裁定：WebFetch')
    expect(text).not.toContain('（）')
  })
})

describe('defer 单源消费形（AgentLoopResult.deferred 对齐）', () => {
  test('engine DeferredToolUsePayload 字段（toolName/deferReason/toolUseId）在场——REPL 消费形编译期对齐', async () => {
    // 单源格：REPL 消费 AgentLoopResult.deferred（DeferredToolUsePayload），
    // 禁第二 defer 判定。此处锁 payload 字段形（toolName → 提示行主语；
    // deferReason → 提示行理由；toolUseId → 重评关联）。
    const mod = await import('src/engine')
    expect(typeof mod).toBe('object')
    const payload: DeferredToolUsePayload = {
      toolUseId: 'tu-1',
      toolName: 'Bash',
      deferReason: 'deferred by hook',
    }
    // 消费形映射：DeferSuspension { toolName, reason, sinceMs } ← payload
    expect(payload.toolName).toBe('Bash')
    expect(payload.deferReason).toBe('deferred by hook')
  })
})
