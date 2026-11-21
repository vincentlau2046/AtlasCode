/**
 * B0 执行出口波 S3 —— kernel 执行域状态机 + 上限执法判别单测。
 * 呈批书 docs/2026-11-21-execution-outlet-wave-lockface-brief.md §2 S3；
 * 合同 §3（幂等）/§4（状态机与真取消）/§5（审批证据）/§8（上限）。
 * 判据对表：E2（bind 三元组）/E3（幂等）/E4（真取消）/E5（审批证据）。
 */
import { describe, expect, test } from 'bun:test'

import {
  createExecutionKernel,
  type ExecutionTurnRunner,
  type ExecutionTurnRunnerDeps,
} from '../../src/kernel/execution/executionKernel'
import type { WebExecutionEvent } from '../../src/kernel/protocol/webExecutionV0'

const UUID_A = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const UUID_B = 'c232ab00-9414-11e1-b4c3-0800200c9a66'
const UUID_C = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const UUID_D = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

type RunnerHandle = {
  deps: ExecutionTurnRunnerDeps
  done: { promise: Promise<'completed' | 'failed' | 'cancelled'>; resolve: (v: 'completed' | 'failed' | 'cancelled') => void }
}

const blockingRunner = (): { runner: ExecutionTurnRunner; calls: RunnerHandle[] } => {
  const calls: RunnerHandle[] = []
  const runner: ExecutionTurnRunner = async (deps) => {
    const done = deferred<'completed' | 'failed' | 'cancelled'>()
    calls.push({ deps, done })
    return done.promise
  }
  return { runner, calls }
}

const baseBind = { workspaceId: 'ws', sessionId: 's1' }

const submitCmd = (over: Record<string, unknown> = {}) => ({
  v: 0,
  id: UUID_A,
  ts: 1,
  bind: { ...baseBind },
  type: 'turn.submit' as const,
  payload: { submitId: UUID_B, text: 'hi' },
  ...over,
})

const cancelCmd = (targetTurnId: string, bind = baseBind) => ({
  v: 0,
  id: UUID_C,
  ts: 1,
  bind,
  type: 'turn.cancel' as const,
  payload: { targetTurnId },
})

const decideCmd = (approvalId: string, turnId: string, decision: 'approved' | 'denied' = 'approved', bind = { ...baseBind, turnId }) => ({
  v: 0,
  id: UUID_D,
  ts: 1,
  bind,
  type: 'approval.decide' as const,
  payload: { approvalId, decision },
})

const isErr = (r: unknown): r is { code: string; retryable: boolean } =>
  typeof r === 'object' && r !== null && 'code' in r && !('cursor' in r)

const waitFor = async (pred: () => boolean, ms = 2000) => {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('S3 · 格 A §3 幂等（E3）', () => {
  test('同 (ws,sess,submitId) 重试返回原结算（同 cursor 深等），绝不二次执行', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const first = await k.handleCommand(submitCmd())
    expect(isErr(first)).toBe(false)
    const replay = await k.handleCommand(submitCmd())
    expect(replay).toEqual(first)
    expect(calls.length).toBe(1)
  })

  test('不同 submitId 同文本 = 两个独立回合（E3 判据 B）', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const a = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    const b = (await k.handleCommand(submitCmd({ payload: { submitId: UUID_C, text: 'hi' } }))) as WebExecutionEvent
    expect(a.bind.turnId).not.toBe(b.bind.turnId)
    expect(calls.length).toBe(1) // 并发 1：第二个排队
  })

  test('跨 session 同 submitId = 不同幂等键（三元组绑定）', async () => {
    const { runner } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const a = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    const b = (await k.handleCommand(
      submitCmd({ bind: { workspaceId: 'ws', sessionId: 's2' } }),
    )) as WebExecutionEvent
    expect(a.bind.turnId).not.toBe(b.bind.turnId)
  })

  test('拒绝结算同键重试返回原拒绝（§3 审计登记 c）——2 MiB 超限', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner, maxTextBytes: 8 })
    const big = submitCmd({ payload: { submitId: UUID_B, text: 'x'.repeat(9) } })
    const r1 = await k.handleCommand(big)
    expect(isErr(r1) && r1.code).toBe('resourceLimit')
    const r2 = await k.handleCommand(big)
    expect(r2).toEqual(r1)
    expect(calls.length).toBe(0)
  })
})

describe('S3 · 格 B §8 上限执法', () => {
  test('有界 FIFO 16：第 17 个 submit 被拒（queueFull retryable），终态腾位后可再提交', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    for (let i = 0; i < 16; i++) {
      const r = await k.handleCommand(submitCmd({ payload: { submitId: `sub-${i}` as never, text: 'hi' } }))
      expect(isErr(r)).toBe(false)
    }
    const over = await k.handleCommand(submitCmd({ payload: { submitId: 'sub-16' as never, text: 'hi' } }))
    expect(isErr(over) && over.code).toBe('queueFull')
    expect(isErr(over) && over.retryable).toBe(true)
    expect(calls.length).toBe(1)
    // 首回合终态 → 腾一个位
    calls[0].done.resolve('completed')
    await waitFor(() => calls.length >= 2)
    const ok = await k.handleCommand(submitCmd({ payload: { submitId: 'sub-17' as never, text: 'hi' } }))
    expect(isErr(ok)).toBe(false)
  })

  test('并发 1：首回合未终态前第二回合只排队不启动', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    await k.handleCommand(submitCmd())
    await k.handleCommand(submitCmd({ payload: { submitId: UUID_C, text: 'hi' } }))
    expect(calls.length).toBe(1)
    calls[0].done.resolve('completed')
    await waitFor(() => calls.length === 2)
  })
})

describe('S3 · 格 C §4 状态机与真取消（E4）', () => {
  test('cancel(queued)：回合永不启动且落 cancelled 终态', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const first = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    const turn2 = (await k.handleCommand(submitCmd({ payload: { submitId: UUID_C, text: 'hi' } }))) as WebExecutionEvent
    const qId = turn2.bind.turnId!
    const r = await k.handleCommand(cancelCmd(qId))
    expect(isErr(r)).toBe(false)
    expect((r as WebExecutionEvent).type).toBe('turn.cancelled')
    calls[0].done.resolve('completed')
    await waitFor(() => (k as unknown as { turnStates: Map<string, string> }).turnStates.get(qId) === 'cancelled')
    expect(calls.length).toBe(1) // 永不启动
    void first
  })

  test('cancel(running)：abort 信号在场 + 恰一个 cancelled 终态（迟到的 runner 结算被吞）', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const acc = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    const turnId = acc.bind.turnId!
    const terminals: string[] = []
    k.onEvent((e) => {
      if (e.type === 'turn.cancelled' && e.bind.turnId === turnId) terminals.push(e.type)
      if ((e.type === 'turn.completed' || e.type === 'turn.failed') && e.bind.turnId === turnId)
        terminals.push(e.type)
    })
    const r = await k.handleCommand(cancelCmd(turnId))
    expect((r as WebExecutionEvent).type).toBe('turn.cancelled')
    expect(calls[0].deps.signal.aborted).toBe(true)
    calls[0].done.resolve('completed') // 引擎侧迟到结算
    await new Promise((r2) => setTimeout(r2, 10))
    expect(terminals).toEqual(['turn.cancelled']) // 恰一个终态
  })

  test('已终态再 cancel = 边界错误（不改状态）', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const acc = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    calls[0].done.resolve('completed')
    await waitFor(() => (k as unknown as { turnStates: Map<string, string> }).turnStates.get(acc.bind.turnId!) === 'completed')
    const r = await k.handleCommand(cancelCmd(acc.bind.turnId!))
    expect(isErr(r)).toBe(true)
    expect((k as unknown as { turnStates: Map<string, string> }).turnStates.get(acc.bind.turnId!)).toBe('completed')
  })

  test('queue.remove ≡ turn.cancel(queued)：落 cancelled 终态不静默移除（审计必改 1）', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    await k.handleCommand(submitCmd())
    const turn2 = (await k.handleCommand(submitCmd({ payload: { submitId: UUID_C, text: 'hi' } }))) as WebExecutionEvent
    const r = await k.handleCommand({
      v: 0, id: UUID_D, ts: 1, bind: { ...baseBind }, type: 'queue.remove' as const,
      payload: { targetTurnId: turn2.bind.turnId! },
    })
    expect((r as WebExecutionEvent).type).toBe('turn.cancelled')
    await waitFor(() => (k as unknown as { turnStates: Map<string, string> }).turnStates.get(turn2.bind.turnId!) === 'cancelled')
    expect(calls.length).toBe(1)
  })
})

describe('S3 · 格 D §5 审批证据（E5）', () => {
  const approvalRunner: ExecutionTurnRunner = async (deps) => {
    const d = await deps.requestApproval()
    return d === 'approved' ? 'completed' : 'cancelled'
  }

  test('decide happy path：settled 携 actorId+timestamp（f4 裁定字段），runner 收到决定', async () => {
    const k = createExecutionKernel({ runTurn: approvalRunner, actorId: () => 'conn-7' })
    // pump 同步启动 runner：requested 事件先于 submit 返回 —— 订阅须在前
    let requestedId = ''
    k.onEvent((e) => {
      if (e.type === 'approval.requested') requestedId = e.payload.approvalId
    })
    const acc = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => requestedId !== '')
    const r = await k.handleCommand(decideCmd(requestedId, acc.bind.turnId!))
    expect(isErr(r)).toBe(false)
    expect((r as WebExecutionEvent).payload).toMatchObject({
      decision: 'approved', actorId: 'conn-7',
    })
    expect(typeof (r as WebExecutionEvent).payload.timestamp).toBe('number')
  })

  test('E5 跨 turn decide（旧 approvalId 配新 turn bind）= 拒且零副作用', async () => {
    const k = createExecutionKernel({ runTurn: approvalRunner })
    let requestedId = ''
    k.onEvent((e) => {
      if (e.type === 'approval.requested') requestedId = e.payload.approvalId
    })
    const acc1 = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => requestedId !== '')
    const r = await k.handleCommand(decideCmd(requestedId, 'turn-fake-other'))
    expect(isErr(r)).toBe(true)
    // 审批仍 pending：正确 bind 的 decide 仍可达
    const ok = await k.handleCommand(decideCmd(requestedId, acc1.bind.turnId!))
    expect(isErr(ok)).toBe(false)
  })

  test('E5 同 approvalId 二次 decide = 边界错误（有效决定恰一个）', async () => {
    const k = createExecutionKernel({ runTurn: approvalRunner })
    let requestedId = ''
    k.onEvent((e) => {
      if (e.type === 'approval.requested') requestedId = e.payload.approvalId
    })
    const acc = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => requestedId !== '')
    expect(isErr(await k.handleCommand(decideCmd(requestedId, acc.bind.turnId!)))).toBe(false)
    const again = await k.handleCommand(decideCmd(requestedId, acc.bind.turnId!, 'denied'))
    expect(isErr(again)).toBe(true)
  })

  test('待批超时 → expired（300s 默认，测试注入小窗）；过期后 decide = 边界错误不执行业务动作', async () => {
    const k = createExecutionKernel({ runTurn: approvalRunner, approvalTimeoutMs: 20 })
    let requestedId = ''
    let expired = false
    k.onEvent((e) => {
      if (e.type === 'approval.requested') requestedId = e.payload.approvalId
      if (e.type === 'approval.settled' && e.payload.decision === 'expired') expired = true
    })
    const acc = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => requestedId !== '')
    await waitFor(() => expired, 3000)
    const late = await k.handleCommand(decideCmd(requestedId, acc.bind.turnId!))
    expect(isErr(late)).toBe(true)
  })

  test('cancel(running) 期间待批操作 → voidedByCancel，绝不自动放行（断开 ≠ 取消的对偶）', async () => {
    const seen: Array<'approved' | 'denied' | 'expired' | 'voidedByCancel'> = []
    const runner: ExecutionTurnRunner = async (deps) => {
      seen.push(await deps.requestApproval())
      return 'cancelled'
    }
    const k = createExecutionKernel({ runTurn: runner })
    let requested = false
    k.onEvent((e) => {
      if (e.type === 'approval.requested') requested = true
    })
    const acc = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => requested)
    await k.handleCommand(cancelCmd(acc.bind.turnId!))
    await waitFor(() => seen.length === 1)
    expect(seen[0]).toBe('voidedByCancel')
  })
})

describe('S3 · 格 E 事件流（E2 bind 权威 + cursor 单调 + 缓冲上限）', () => {
  test('S4 前置原语 replaySince：无 cursor = baseline + headCursor', () => {
    const { runner } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const r = k.replaySince('ws', 's1')
    expect(r.kind).toBe('baseline')
    expect(r.headCursor).toBeDefined()
  })

  test('replaySince 增量恰一次：cursor 后事件严格递增且不重不漏', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const events: WebExecutionEvent[] = []
    k.onEvent((e) => events.push(e))
    await k.handleCommand(submitCmd())
    calls[0].done.resolve('completed')
    await waitFor(() => events.some((e) => e.type === 'turn.completed'))
    const mid = events[1]!.cursor
    const r = k.replaySince('ws', 's1', mid)
    expect(r.kind).toBe('delta')
    if (r.kind === 'delta') {
      // 恰为 mid 之后的事件（不重）
      expect(r.events.map((e) => e.cursor)).toEqual(events.slice(2).map((e) => e.cursor))
      const nums = r.events.map((e) => Number(e.cursor))
      for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThan(nums[i - 1])
    }
  })

  test('replaySince 过期游标（不在缓冲/溢出丢弃）= expired（基线替换信号，§6）', async () => {
    const { runner } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner, followBufferLimit: 2 })
    for (let i = 0; i < 4; i++) {
      await k.handleCommand(submitCmd({ payload: { submitId: `x-${i}` as never, text: 'hi' } }))
    }
    const r = k.replaySince('ws', 's1', String(1).padStart(16, '0'))
    expect(r.kind).toBe('expired') // 溢出已丢弃 cursor=1
    const foreign = k.replaySince('ws', 's1', 'deadbeef')
    expect(foreign.kind).toBe('expired') // 外来/未来 cursor fail-closed
  })

  test('事件携权威 bind 三元组（含 turnId）+ cursor 逐件严格递增', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const events: WebExecutionEvent[] = []
    k.onEvent((e) => events.push(e))
    await k.handleCommand(submitCmd())
    calls[0].done.resolve('completed')
    await waitFor(() => events.some((e) => e.type === 'turn.completed'))
    for (const e of events) {
      expect(e.bind.workspaceId).toBe('ws')
      expect(e.bind.sessionId).toBe('s1')
      expect(e.bind.turnId).toBeTruthy()
    }
    const cursors = events.map((e) => Number(e.cursor))
    for (let i = 1; i < cursors.length; i++) expect(cursors[i]).toBeGreaterThan(cursors[i - 1])
  })

  test('follow 缓冲溢出 → 错误边界标记（10 000 默认，测试注入小值）', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner, followBufferLimit: 3 })
    for (let i = 0; i < 5; i++) {
      await k.handleCommand(submitCmd({ payload: { submitId: `s-${i}` as never, text: 'hi' } }))
    }
    // running 1 + queued 4 = 5 pending > 3 → 溢出标记
    const st = (k as unknown as { bufferState: (ws: string, s: string) => { overflowed: boolean; kept: number } }).bufferState('ws', 's1')
    expect(st.overflowed).toBe(true)
    expect(st.kept).toBeLessThanOrEqual(3)
    void calls
  })
})

/**
 * B1 前置件形 1（f4 附条件采认 @2026-11-21）—— emitDelta 判别腿。
 * 条件①：delta 经 kernel 既有 emit 权威（cursor 单调/bind 三元组/缓冲上限
 * 同执法，零新执法面）；条件②：delta text 不进审批证据记录（§5 不含正文）。
 */
describe('形 1 · emitDelta 通道（B1 前置件，f4 批复附条件）', () => {
  test('emitDelta → turn.delta 事件：payload {text} + bind 三元组精确 + cursor 单调', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const seen: WebExecutionEvent[] = []
    k.onEvent((e) => seen.push(e))
    const accepted = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => calls.length === 1)
    calls[0].deps.emitDelta('he')
    calls[0].deps.emitDelta('llo')
    const deltas = seen.filter((e) => e.type === 'turn.delta')
    expect(deltas.length).toBe(2)
    for (const d of deltas) {
      expect(d.bind).toEqual({ workspaceId: 'ws', sessionId: 's1', turnId: accepted.bind.turnId })
      expect((d.payload as { text: string }).text).toMatch(/^(he|llo)$/)
    }
    // cursor 单调：started < delta1 < delta2
    const cursors = seen.map((e) => e.cursor)
    const sorted = [...cursors].sort()
    expect(cursors).toEqual(sorted)
    const startedIdx = seen.findIndex((e) => e.type === 'turn.started')
    const d0 = seen.indexOf(deltas[0]!)
    expect(d0).toBeGreaterThan(startedIdx)
    // 缓冲执法同面：replaySince 自 accepted cursor 起的增量含 delta（零新执法面的正证）
    const replay = k.replaySince('ws', 's1', accepted.cursor)
    expect(replay.events.some((e) => e.type === 'turn.delta')).toBe(true)
  })

  test('delta text 不进审批证据：emitDelta 后 decide，settled payload 零正文字段', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const seen: WebExecutionEvent[] = []
    k.onEvent((e) => seen.push(e))
    await k.handleCommand(submitCmd())
    await waitFor(() => calls.length === 1)
    calls[0].deps.emitDelta('SECRET-DELTA-TEXT')
    // 触发审批并批准
    const approvalPromise = calls[0].deps.requestApproval()
    await waitFor(() => seen.some((e) => e.type === 'approval.requested'))
    const requested = seen.find((e) => e.type === 'approval.requested')!
    const approvalId = (requested.payload as { approvalId: string }).approvalId
    const decided = await k.handleCommand({
      v: 0,
      id: UUID_D,
      ts: 2,
      bind: { workspaceId: 'ws', sessionId: 's1', turnId: (seen[0]!.bind.turnId) },
      type: 'approval.decide',
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(isErr(decided)).toBe(false)
    expect(await approvalPromise).toBe('approved')
    const settled = seen.find((e) => e.type === 'approval.settled')!
    const keys = Object.keys(settled.payload as Record<string, unknown>).sort()
    expect(keys).toEqual(['actorId', 'approvalId', 'decision', 'timestamp'])
    // 全事件流零 SECRET 正文残留（delta 事件除外——delta 本身是回合流内容面）
    const deltaEvents = seen.filter((e) => e.type === 'turn.delta')
    for (const e of seen) {
      if (!deltaEvents.includes(e)) {
        expect(JSON.stringify(e.payload)).not.toContain('SECRET-DELTA-TEXT')
      }
    }
  })
})

/**
 * 推送安全审查硬化（34437b0f 审查 findings 1/3/5；2/4 登记 f4 候定谳）。
 * F1 decide 全三元组绑定（E5 跨工作区）；F3 流键 NUL 碰撞 fail-closed；
 * F5 终态/中止后 delta 零发射（cursor 不进、订阅者不见、replay 不含）。
 */
describe('安全硬化 · decide 全绑定 / 流键碰撞 / 终态后 delta', () => {
  test('F1：decide bind ws/session 与审批归属不一致 → 拒且审批保持 pending', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const seen: WebExecutionEvent[] = []
    k.onEvent((e) => seen.push(e))
    const accepted = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => calls.length === 1)
    const approvalPromise = calls[0].deps.requestApproval()
    await waitFor(() => seen.some((e) => e.type === 'approval.requested'))
    const approvalId = (seen.find((e) => e.type === 'approval.requested')!.payload as { approvalId: string }).approvalId
    // 正确 approvalId + 正确 turnId，但 workspace 错 → 拒
    const cross = await k.handleCommand({
      v: 0,
      id: UUID_C,
      ts: 2,
      bind: { workspaceId: 'other-ws', sessionId: 's1', turnId: accepted.bind.turnId },
      type: 'approval.decide',
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(isErr(cross) && cross.code).toBe('approvalBindMismatch')
    // sessionId 错同理
    const crossSess = await k.handleCommand({
      v: 0,
      id: UUID_C,
      ts: 2,
      bind: { workspaceId: 'ws', sessionId: 'other-sess', turnId: accepted.bind.turnId },
      type: 'approval.decide',
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(isErr(crossSess) && crossSess.code).toBe('approvalBindMismatch')
    // 审批保持 pending：runner promise 未 settle（40ms 内无结算）
    const raced = await Promise.race([approvalPromise.then(() => 'settled' as const), new Promise<'pending'>((r) => setTimeout(() => r('pending'), 40))])
    expect(raced).toBe('pending')
    // 正确三元组 decide 仍可达
    const ok = await k.handleCommand({
      v: 0,
      id: UUID_D,
      ts: 3,
      bind: { workspaceId: 'ws', sessionId: 's1', turnId: accepted.bind.turnId },
      type: 'approval.decide',
      payload: { approvalId, decision: 'approved' },
    } as never)
    expect(isErr(ok)).toBe(false)
    expect(await approvalPromise).toBe('approved')
  })

  test('F3：workspaceId/sessionId 含 NUL 分隔符 → invalidBind（流键碰撞面 fail-closed）', async () => {
    const { runner } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const r1 = await k.handleCommand(submitCmd({ bind: { workspaceId: 'a\u0000b', sessionId: 'c' } }))
    expect(isErr(r1)).toBe(true)
    const r2 = await k.handleCommand(submitCmd({ bind: { workspaceId: 'a', sessionId: 'b\u0000c' } }))
    expect(isErr(r2)).toBe(true)
    // 合法名不受影响
    const ok = await k.handleCommand(submitCmd())
    expect(isErr(ok)).toBe(false)
  })

  test('F5：cancel(running) 后 emitDelta 零发射（cursor 不动/订阅不见/replay 不含）', async () => {
    const { runner, calls } = blockingRunner()
    const k = createExecutionKernel({ runTurn: runner })
    const seen: WebExecutionEvent[] = []
    k.onEvent((e) => seen.push(e))
    const accepted = (await k.handleCommand(submitCmd())) as WebExecutionEvent
    await waitFor(() => calls.length === 1)
    await k.handleCommand({
      v: 0,
      id: UUID_C,
      ts: 2,
      bind: { workspaceId: 'ws', sessionId: 's1' },
      type: 'turn.cancel',
      payload: { targetTurnId: accepted.bind.turnId },
    } as never)
    const cursorAtCancel = (seen[seen.length - 1]!.cursor)
    calls[0].deps.emitDelta('after-cancel')  // 迟到增量：零发射
    calls[0].done.resolve('cancelled')
    await new Promise((r) => setTimeout(r, 20))
    const lateDeltas = seen.filter((e) => e.type === 'turn.delta')
    expect(lateDeltas.length).toBe(0)
    expect(seen[seen.length - 1]!.cursor).toBe(cursorAtCancel)
    const replay = k.replaySince('ws', 's1', cursorAtCancel)
    expect(replay.events.some((e) => e.type === 'turn.delta')).toBe(false)
  })
})
