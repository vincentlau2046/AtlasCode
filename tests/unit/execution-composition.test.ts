/**
 * B1 前置件形 2（f4 附条件采认 @2026-11-21）—— createExecutionComposition
 * 注入形判别腿。
 * 条件①：零参默认行为零变更（占位 runTurn fail-closed 抛错 → turn failed；
 * actorId ambient 默认）；注入面 = 可选 options { runTurn?, actorId?, now? }。
 * 条件③：单接触点纪律不变（upstream.ts 唯一 import 面——出口面扩展归
 * entry.ts + pack 导出面腿，见 tests/func/web-session-runtime-pack.test.ts）。
 */
import { describe, expect, test } from 'bun:test'

import { createExecutionComposition } from '../../src/kernel/execution/executionComposition'

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const UUID_B = 'c232ab00-9414-11e1-b4c3-0800200c9a66'

const waitFor = async (pred: () => boolean, ms = 2000) => {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('形 2 · createExecutionComposition 注入形（B1 前置件）', () => {
  test('零参默认行为零变更：占位 runTurn fail-closed → turn.failed（绝不静默假执行）', async () => {
    const { kernel, outlet } = createExecutionComposition()
    expect(typeof kernel.handleCommand).toBe('function')
    expect(typeof outlet.handle).toBe('function')
    const accepted = (await kernel.handleCommand({
      v: 0,
      id: UUID_A,
      ts: 1,
      bind: { workspaceId: 'ws', sessionId: 's1' },
      type: 'turn.submit',
      payload: { submitId: UUID_B, text: 'hi' },
    } as never)) as { bind: { turnId: string } }
    await waitFor(() => kernel.turnStates.get(accepted.bind.turnId) === 'failed')
    expect(kernel.turnStates.get(accepted.bind.turnId)).toBe('failed')
  })

  test('注入形：runTurn 真体 + actorId 真源生效（settled actorId = 注入值）', async () => {
    const { kernel } = createExecutionComposition({
      runTurn: async (deps) => {
        deps.emitDelta('real delta')
        const d = await deps.requestApproval()
        return d === 'approved' ? 'completed' : 'failed'
      },
      actorId: () => 'web-conn-actor',
      now: () => 1_700_000_000_000,
    })
    const seen: Array<{ type: string; payload: Record<string, unknown>; bind: { turnId: string } }> = []
    kernel.onEvent((e) => seen.push(e as never))
    const accepted = (await kernel.handleCommand({
      v: 0,
      id: UUID_A,
      ts: 1,
      bind: { workspaceId: 'ws', sessionId: 's1' },
      type: 'turn.submit',
      payload: { submitId: UUID_B, text: 'hi' },
    } as never)) as { bind: { turnId: string } }
    await waitFor(() => seen.some((e) => e.type === 'approval.requested'))
    const requested = seen.find((e) => e.type === 'approval.requested')!
    const approvalId = requested.payload.approvalId as string
    const decided = await kernel.handleCommand({
      v: 0,
      id: UUID_B,
      ts: 2,
      bind: { workspaceId: 'ws', sessionId: 's1', turnId: accepted.bind.turnId },
      type: 'approval.decide',
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect('code' in (decided as object)).toBe(false)
    await waitFor(() => kernel.turnStates.get(accepted.bind.turnId) === 'completed')
    // actorId 真源：settled payload 携注入身份，非 ambient 占位
    const settled = seen.find((e) => e.type === 'approval.settled')!
    expect(settled.payload.actorId).toBe('web-conn-actor')
    // 注入 runner 的 delta 经 kernel emit 权威到达事件流
    expect(seen.some((e) => e.type === 'turn.delta' && e.payload.text === 'real delta')).toBe(true)
  })
})
