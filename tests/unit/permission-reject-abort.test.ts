/**
 * 2026-10-05 §4b A 波 A2：审批拒绝/取消语义判别单测。
 *
 * 语义（语义锁定，实现路径白盒）：
 * ① 显式 No（onReject → buildReject）= 拒绝这一次，拒绝消息（可带 feedback）
 *    送回 agent 继续运行——**不 abort**（主 agent 与子代理同）；
 * ② Esc/外部取消（onAbort → cancelAndAbort(undefined, true)）= abort 本轮，
 *    无 feedback 送回 agent；
 * ③ 子代理（agentId 置位）的拒绝消息走 SUBAGENT_* 文案（不带 memory 修正 hint）。
 * 分层纪律：纯上下文逻辑（无 React 渲染/无网络/无盘）。
 */
import { describe, test, expect } from 'bun:test'
import { createPermissionContext } from '../../src/tui/hooks/toolPermission/PermissionContext'
import {
  REJECT_MESSAGE,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
  SUBAGENT_REJECT_MESSAGE,
  SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX,
} from '../../src/tui/utils/messages'

function makeContext(agentId?: string) {
  const abortController = new AbortController()
  const tool = { name: 'Bash', userFacingName: () => 'Bash' } as never
  const toolUseContext = {
    agentId,
    abortController,
    getAppState: () => ({ toolPermissionContext: {} }),
  } as never
  const assistantMessage = { message: { id: 'm-1' } } as never
  const ctx = createPermissionContext(
    tool,
    { command: 'ls' },
    toolUseContext,
    assistantMessage,
    't-1',
    () => {},
  )
  return { ctx, abortController }
}

describe('A2 显式 No（buildReject）：拒绝这一次，不 abort', () => {
  test('主 agent 无 feedback：ask 决策 + REJECT_MESSAGE，不 abort', () => {
    const { ctx, abortController } = makeContext()
    const d = ctx.buildReject()
    expect(d.behavior).toBe('ask')
    expect(d.message).toContain(REJECT_MESSAGE)
    expect(abortController.signal.aborted).toBe(false)
  })

  test('主 agent 带 feedback：REJECT_MESSAGE_WITH_REASON_PREFIX + feedback，不 abort', () => {
    const { ctx, abortController } = makeContext()
    const d = ctx.buildReject('use the other file instead')
    expect(d.message).toContain(
      REJECT_MESSAGE_WITH_REASON_PREFIX + 'use the other file instead',
    )
    expect(abortController.signal.aborted).toBe(false)
  })

  test('子代理：SUBAGENT 文案（不带 memory 修正 hint），不 abort', () => {
    const { ctx, abortController } = makeContext('agent-1')
    const d = ctx.buildReject()
    expect(d.message).toContain(SUBAGENT_REJECT_MESSAGE)
    const d2 = ctx.buildReject('why not')
    expect(d2.message).toContain(
      SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX + 'why not',
    )
    expect(abortController.signal.aborted).toBe(false)
  })
})

describe('A2 取消（cancelAndAbort）：abort 本轮', () => {
  test('显式 isAbort=true：abort 触发', () => {
    const { ctx, abortController } = makeContext()
    const d = ctx.cancelAndAbort(undefined, true)
    expect(d.behavior).toBe('ask')
    expect(abortController.signal.aborted).toBe(true)
  })

  test('回归：带 feedback 的显式拒绝（isAbort 缺省）不 abort', () => {
    const { ctx, abortController } = makeContext()
    ctx.cancelAndAbort('nope')
    expect(abortController.signal.aborted).toBe(false)
  })

  test('回归：主 agent 无 feedback 且 isAbort 缺省 → 自动 abort（旧语义保留）', () => {
    const { ctx, abortController } = makeContext()
    ctx.cancelAndAbort()
    expect(abortController.signal.aborted).toBe(true)
  })

  test('回归：子代理（agentId 置位）从不 abort', () => {
    const { ctx, abortController } = makeContext('agent-1')
    ctx.cancelAndAbort()
    expect(abortController.signal.aborted).toBe(false)
  })
})
