/**
 * Kernel 执行域 —— B0 执行出口波 S3（呈批书 §2 S3 + f4 批复 @a62925c0）。
 * 合同 docs/superpowers/specs/2026-11-20-first-wave-execution-contract.md
 * §3（提交幂等）/§4（状态机与真取消）/§5（审批决策证据）/§2（bind/cursor）/
 * §8（上限：队列 16 / 300s / 2 MiB / 10 000 / 并发 1）。
 *
 * 职责边界：
 *  - 上游执法唯一点：幂等键 (workspaceId, sessionId, submitId) 结算重放、
 *    有界 FIFO 队列、并发 1、真取消（queued 不启动 / running 引擎真中止）、
 *    待批 300s 超时 → expired、decide 归属绑定（bind.turnId ≡ 审批归属 turn）、
 *    follow 事件缓冲溢出 → 错误边界标记（S4 游标重同步消费）。
 *  - 事件流：cursor 每 (workspaceId, sessionId) 流单调递增（唯一排序权威）；
 *    事件恒携权威 bind 三元组（E2：结算只认三元组精确匹配的对偶面）。
 *  - 引擎缝：options.runTurn 注入（组合根 S4 接线）；kernel 不 import 引擎面
 *    （加载图惰性同 executionOutlet 纪律）。
 *  - follow.resume 命令面 = S4（本切片返回 notImplemented 边界错误）。
 *  - 审计读门（turnStates / bufferState）公开为测试与运维只读面。
 */
import type {
  ExecutionReplay,
  WebExecutionCommand,
  WebExecutionError,
  WebExecutionEvent,
} from '../protocol/webExecutionV0'

export const EXECUTION_QUEUE_DEPTH = 16
export const EXECUTION_APPROVAL_TIMEOUT_MS = 300_000
export const EXECUTION_MAX_TEXT_BYTES = 2 * 1024 * 1024
export const EXECUTION_FOLLOW_BUFFER_LIMIT = 10_000

export type ExecutionTurnOutcome = 'completed' | 'failed' | 'cancelled'
export type ExecutionApprovalDecision = 'approved' | 'denied' | 'expired' | 'voidedByCancel'

export type ExecutionTurnRunnerDeps = {
  bind: { workspaceId: string; sessionId: string; turnId: string }
  text: string
  signal: AbortSignal
  /** 注册待批操作：resolve 于 decide / 300s expired / turn 取消（voidedByCancel）。 */
  requestApproval: () => Promise<ExecutionApprovalDecision>
  /**
   * 回合流增量发射（B1 前置件形 1，f4 附条件采认 @2026-11-21）：经 kernel
   * 既有 emit 权威落 `turn.delta`（cursor 单调/bind 三元组/缓冲上限同执法，
   * 零新执法面）。text = 回合流内容，不进审批证据记录（合同 §5 不含正文）。
   */
  emitDelta: (text: string) => void
}

export type ExecutionTurnRunner = (deps: ExecutionTurnRunnerDeps) => Promise<ExecutionTurnOutcome>

export type ExecutionKernelOptions = {
  runTurn: ExecutionTurnRunner
  /** 服务端时钟（§5：timestamp 由服务端产生；测试注入）。 */
  now?: () => number
  /** 服务端解析的连接身份（§5：actorId 客户端自报不得覆盖；组合根注入）。 */
  actorId?: () => string
  queueDepth?: number
  approvalTimeoutMs?: number
  maxTextBytes?: number
  followBufferLimit?: number
}

export type ExecutionKernelHandleResult = WebExecutionEvent | WebExecutionError

type TurnState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

type Turn = {
  turnId: string
  submitId: string
  text: string
  state: TurnState
  controller?: AbortController
}

type PendingApproval = {
  approvalId: string
  turnId: string
  workspaceId: string
  sessionId: string
  requestedAt: number
  settled: boolean
  timer: ReturnType<typeof setTimeout> | undefined
  resolve: (d: ExecutionApprovalDecision) => void
}

type Stream = {
  cursor: number
  buffer: WebExecutionEvent[]
  overflowed: boolean
  queue: Turn[]
  running?: Turn
  turns: Map<string, Turn>
  /** §3 幂等账本：submitId → 原结算（accepted 事件或拒绝错误）。 */
  idempotency: Map<string, ExecutionKernelHandleResult>
}

/**
 * §6 follow 恢复原语（S4）——结果型 ExecutionReplay 归协议文件
 * （webExecutionV0），本域只执语义。
 */
export type ExecutionKernel = {
  handleCommand: (command: WebExecutionCommand) => Promise<ExecutionKernelHandleResult>
  /** §6 恢复原语：follow.resume 的 kernel 侧真体（增量恰一次/过期基线替换）。 */
  replaySince: (workspaceId: string, sessionId: string, cursor?: string) => ExecutionReplay
  onEvent: (cb: (e: WebExecutionEvent) => void) => () => void
  /** 审计读门：turnId → 状态（queued/running/终态恰一个）。 */
  turnStates: Map<string, TurnState>
  /** 审计读门：follow 缓冲态（overflowed = 错误边界标记，S4 游标重同步消费）。 */
  bufferState: (workspaceId: string, sessionId: string) => { overflowed: boolean; kept: number }
}

const streamKey = (ws: string, s: string) => `${ws}\u0000${s}`

export function createExecutionKernel(options: ExecutionKernelOptions): ExecutionKernel {
  const now = options.now ?? (() => Date.now())
  const actorId = options.actorId ?? (() => 'kernel')
  const queueDepth = options.queueDepth ?? EXECUTION_QUEUE_DEPTH
  const approvalTimeoutMs = options.approvalTimeoutMs ?? EXECUTION_APPROVAL_TIMEOUT_MS
  const maxTextBytes = options.maxTextBytes ?? EXECUTION_MAX_TEXT_BYTES
  const followBufferLimit = options.followBufferLimit ?? EXECUTION_FOLLOW_BUFFER_LIMIT

  const streams = new Map<string, Stream>()
  const approvals = new Map<string, PendingApproval>()
  const subscribers = new Set<(e: WebExecutionEvent) => void>()
  const turnStates = new Map<string, TurnState>()
  let turnCounter = 0
  let approvalCounter = 0

  const streamOf = (ws: string, s: string): Stream => {
    const key = streamKey(ws, s)
    let st = streams.get(key)
    if (!st) {
      st = {
        cursor: 0,
        buffer: [],
        overflowed: false,
        queue: [],
        running: undefined,
        turns: new Map(),
        idempotency: new Map(),
      }
      streams.set(key, st)
    }
    return st
  }

  const err = (code: string, message: string, retryable = false): WebExecutionError => ({
    code,
    message,
    retryable,
  })

  const emit = (
    st: Stream,
    bind: { workspaceId: string; sessionId: string; turnId: string },
    type: WebExecutionEvent['type'],
    payload: Record<string, unknown>,
  ): WebExecutionEvent => {
    st.cursor += 1
    if (st.buffer.length >= followBufferLimit) {
      st.overflowed = true
      st.buffer.shift()
    }
    const event = {
      v: 0,
      id: crypto.randomUUID(),
      ts: now(),
      type,
      bind,
      cursor: String(st.cursor).padStart(16, '0'),
      payload,
    } as WebExecutionEvent
    st.buffer.push(event)
    for (const cb of subscribers) cb(event)
    return event
  }

  const settleApproval = (a: PendingApproval, decision: ExecutionApprovalDecision): WebExecutionEvent | undefined => {
    if (a.settled) return undefined
    a.settled = true
    if (a.timer) clearTimeout(a.timer)
    approvals.delete(a.approvalId)
    const st = streamOf(a.workspaceId, a.sessionId)
    const event = emit(
      st,
      { workspaceId: a.workspaceId, sessionId: a.sessionId, turnId: a.turnId },
      'approval.settled',
      { approvalId: a.approvalId, decision, actorId: actorId(), timestamp: now() },
    )
    a.resolve(decision)
    return event
  }

  /** 终态恰一个：终态后一切迟到结算（runner 迟到 resolve）被吞（E4）。 */
  const settleTurn = (
    st: Stream,
    turn: Turn,
    terminal: 'completed' | 'failed' | 'cancelled',
    failedMessage?: string,
  ): WebExecutionEvent | undefined => {
    if (turn.state === 'completed' || turn.state === 'failed' || turn.state === 'cancelled') {
      return undefined
    }
    turn.state = terminal
    turnStates.set(turn.turnId, terminal)
    // 取消路径：待批操作 voidedByCancel，绝不自动放行（合同 §4 断开 ≠ 取消对偶）。
    if (terminal === 'cancelled') {
      for (const a of [...approvals.values()]) {
        if (a.turnId === turn.turnId && !a.settled) settleApproval(a, 'voidedByCancel')
      }
    }
    st.running = st.running?.turnId === turn.turnId ? undefined : st.running
    const event = emit(
      st,
      { workspaceId: streamWs(st), sessionId: streamSess(st), turnId: turn.turnId },
      `turn.${terminal}`,
      terminal === 'failed' ? { message: failedMessage ?? 'turn failed' } : {},
    )
    void pump(streamWs(st), streamSess(st))
    return event
  }

  // stream 反查 ws/sess（emit bind 需要三元组；流键为其唯一权威）
  const wsByStream = new Map<Stream, string>()
  const sessByStream = new Map<Stream, string>()
  const streamWs = (st: Stream) => wsByStream.get(st) ?? ''
  const streamSess = (st: Stream) => sessByStream.get(st) ?? ''

  const origStreamOf = streamOf
  const streamOfTracked = (ws: string, s: string): Stream => {
    const st = origStreamOf(ws, s)
    if (!wsByStream.has(st)) {
      wsByStream.set(st, ws)
      sessByStream.set(st, s)
    }
    return st
  }

  const pump = (ws: string, s: string): void => {
    const st = streamOfTracked(ws, s)
    if (st.running || st.queue.length === 0) return
    const turn = st.queue.shift()!
    turn.state = 'running'
    turn.controller = new AbortController()
    st.running = turn
    emit(st, { workspaceId: ws, sessionId: s, turnId: turn.turnId }, 'turn.started', {})
    void (async () => {
      let outcome: ExecutionTurnOutcome
      try {
        outcome = await options.runTurn({
          bind: { workspaceId: ws, sessionId: s, turnId: turn.turnId },
          text: turn.text,
          signal: turn.controller!.signal,
          emitDelta: (text) => {
            // 安全硬化 F5：终态/中止后迟到增量零发射（cursor 不进、订阅不见、
            // replay 不含——turn 生命周期门外溢面归零）。
            if (turn.state !== 'running' || turn.controller?.signal.aborted) return
            emit(st, { workspaceId: ws, sessionId: s, turnId: turn.turnId }, 'turn.delta', { text })
          },
          requestApproval: () => {
            const approvalId = `appr-${++approvalCounter}`
            return new Promise<ExecutionApprovalDecision>((resolve) => {
              const approval: PendingApproval = {
                approvalId,
                turnId: turn.turnId,
                workspaceId: ws,
                sessionId: s,
                requestedAt: now(),
                settled: false,
                timer: undefined,
                resolve,
              }
              approvals.set(approvalId, approval)
              emit(
                st,
                { workspaceId: ws, sessionId: s, turnId: turn.turnId },
                'approval.requested',
                { approvalId },
              )
              approval.timer = setTimeout(() => {
                settleApproval(approval, 'expired')
              }, approvalTimeoutMs)
              approval.timer.unref?.()
            })
          },
        })
      } catch (e) {
        outcome = 'failed'
        settleTurn(st, turn, 'failed', e instanceof Error ? e.message : String(e))
        return
      }
      if (outcome === 'failed') {
        settleTurn(st, turn, 'failed')
      } else {
        settleTurn(st, turn, outcome)
      }
    })()
  }

  const handleCommand = async (command: WebExecutionCommand): Promise<ExecutionKernelHandleResult> => {
    const ws = command.bind.workspaceId
    const s = command.bind.sessionId
    // 安全硬化 F3：流键 streamKey 以 NUL 连接 (ws,s)——标识含 NUL 可构造跨流
    // 碰撞面（'a\0b'+'c' ≡ 'a'+'b\0c'）。fail-closed：含 NUL 一律 invalidBind。
    if (ws.includes('\u0000') || s.includes('\u0000')) {
      return err('invalidBind', 'workspaceId/sessionId 不得含 NUL 分隔符（流键碰撞面）')
    }

    if (command.type === 'turn.submit') {
      const st = streamOfTracked(ws, s)
      const recorded = st.idempotency.get(command.payload.submitId)
      if (recorded) return recorded // §3：同键重试返回原结算，绝不二次执行
      if (Buffer.byteLength(command.payload.text, 'utf8') > maxTextBytes) {
        const rejection = err('resourceLimit', `turn.submit 超过 ${maxTextBytes} 字节上限（合同 §8）`)
        st.idempotency.set(command.payload.submitId, rejection)
        return rejection
      }
      if (st.queue.length + (st.running ? 1 : 0) >= queueDepth) {
        const rejection = err('queueFull', `会话队列已满（深度 ${queueDepth}，合同 §8）`, true)
        st.idempotency.set(command.payload.submitId, rejection)
        return rejection
      }
      const turn: Turn = {
        turnId: `turn-${++turnCounter}`,
        submitId: command.payload.submitId,
        text: command.payload.text,
        state: 'queued',
      }
      st.turns.set(turn.turnId, turn)
      turnStates.set(turn.turnId, 'queued')
      st.queue.push(turn)
      const accepted = emit(
        st,
        { workspaceId: ws, sessionId: s, turnId: turn.turnId },
        'turn.accepted',
        { submitId: command.payload.submitId },
      )
      st.idempotency.set(command.payload.submitId, accepted)
      pump(ws, s)
      return accepted
    }

    if (command.type === 'turn.cancel' || command.type === 'queue.remove') {
      // queue.remove ≡ turn.cancel(queued)（审计必改 1）：落 cancelled 终态，不静默移除。
      const st = streamOfTracked(ws, s)
      const turn = st.turns.get(command.payload.targetTurnId)
      if (!turn) return err('notFound', `目标回合不存在：${command.payload.targetTurnId}`)
      if (turn.state === 'queued') {
        st.queue = st.queue.filter((t) => t.turnId !== turn.turnId)
        turn.state = 'cancelled'
        turnStates.set(turn.turnId, 'cancelled')
        return emit(st, { workspaceId: ws, sessionId: s, turnId: turn.turnId }, 'turn.cancelled', {})
      }
      if (turn.state === 'running') {
        turn.controller?.abort() // 引擎真中止信号；终态以本函数结算为准（E4 恰一个）
        turn.state = 'cancelled'
        turnStates.set(turn.turnId, 'cancelled')
        const event = emit(st, { workspaceId: ws, sessionId: s, turnId: turn.turnId }, 'turn.cancelled', {})
        // 待批操作 voidedByCancel + 腾位
        for (const a of [...approvals.values()]) {
          if (a.turnId === turn.turnId && !a.settled) settleApproval(a, 'voidedByCancel')
        }
        st.running = st.running?.turnId === turn.turnId ? undefined : st.running
        void pump(ws, s)
        return event
      }
      return err('alreadySettled', `回合已终态（${turn.state}），边界错误不改状态（合同 §4）`)
    }

    if (command.type === 'approval.decide') {
      const a = approvals.get(command.payload.approvalId)
      if (!a) return err('notFound', `待批操作不存在或已结算：${command.payload.approvalId}`)
      // decide 归属绑定（审计必改 2 + 安全硬化 F1）：全三元组 ≡ approval 归属
      // （turnId/workspaceId/sessionId 任一不一致拒且零副作用——E5 跨工作区腿）。
      if (
        command.bind.turnId !== a.turnId ||
        command.bind.workspaceId !== a.workspaceId ||
        command.bind.sessionId !== a.sessionId
      ) {
        return err('approvalBindMismatch', `decide bind 三元组与审批归属不一致（合同 §5）`)
      }
      if (a.settled || now() - a.requestedAt >= approvalTimeoutMs) {
        if (!a.settled) settleApproval(a, 'expired')
        return err('alreadySettled', '待批操作已结算（过期/已决），边界错误（合同 §5）')
      }
      return settleApproval(a, command.payload.decision)!
    }

    // follow.resume = S4（游标重放 + 过期基线替换，§6）
    return err('notImplemented', 'follow.resume 于 S4 切片落地（合同 §6）')
  }

  return {
    handleCommand,
    replaySince: (workspaceId, sessionId, cursor) => {
      const st = streams.get(streamKey(workspaceId, sessionId))
      const headCursor = String((st?.cursor ?? 0)).padStart(16, '0')
      if (!st || !cursor) return { kind: 'baseline', events: [], headCursor }
      if (st.overflowed) return { kind: 'expired', events: [], headCursor }
      const idx = st.buffer.findIndex((e) => e.cursor === cursor)
      if (idx < 0) return { kind: 'expired', events: [], headCursor }
      return { kind: 'delta', events: st.buffer.slice(idx + 1), headCursor }
    },
    onEvent: (cb) => {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    turnStates,
    bufferState: (workspaceId, sessionId) => {
      const st = streams.get(streamKey(workspaceId, sessionId))
      return st ? { overflowed: st.overflowed, kept: st.buffer.length } : { overflowed: false, kept: 0 }
    },
  }
}
