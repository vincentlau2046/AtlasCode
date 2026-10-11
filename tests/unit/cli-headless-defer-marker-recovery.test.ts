/**
 * AD-45 缺口#2（0.1.54，prod lane r3 GATE-OPEN 打回）— deferred_tool_use 挂起 marker
 * 装载面回捞 判别单测（纯函数，零磁盘；手建 map+chain 隔离回捞逻辑，非恒绿假绿）。
 *
 * 背景：挂起 marker 以「叶 assistant 的 child」形态落盘（loop.ts roundMessages 轮末追加
 * marker + record 序贯 parent 链），而 loadTranscriptFile 叶计算排除 system 叶（load.ts
 * 「system 不应锚定会话链」）+ buildConversationChain 仅 parentUuid 单向（leaf→root）走
 * 链 → marker 结构性排除出链 → findDeferredToolUseState（仅扫链）恒 undefined → --resume
 * 重评支生产不可达（resume 退化为新 LLM 回合）。修 = print.ts 可测顶层面
 * recoverDeferredToolUseMarkers（未解决 marker = parent 在链内 + 全 transcript 无该
 * tool_use 的 tool_result，按 parent 在链内位置插回其后；无 marker 零追加 = 零回归约束 3；
 * headless 专用，TUI 走 sessionRestore 独立路径）。
 *
 * 分层纪律：纯函数（零磁盘，同 cli-headless-defer.test.ts unit 层口径；真实写 session
 * 文件 → load 路径 的端到端判别面在 tests/func/cli-headless-defer-marker-recovery-fs）。
 *
 * 判别信号（手建 map+chain 隔离回捞逻辑，非恒绿假绿）：
 *  - unresolved（挂起态）：marker parent 在链内 + 无对应 tool_result → 回捞后在场 +
 *    findDeferredToolUseState 回挂起面（修前红 = 未回捞则恒 undefined）
 *  - 零回归约束 3：无 marker 正常会话 → 原数组引用零追加 + findDeferredToolUseState undefined
 *  - 已解决：marker + 对应 tool_result 在场（sibling 非经 marker）→ 不回捞（防重复重评）
 *  - 已在链内：parent 链推进已穿过该 marker（后续消息 parent 指向它）→ 不重复回捞
 *  - last-wins：多 marker 按 parent 文档序追加，末位权威
 */
import { describe, test, expect } from 'bun:test'
import {
  recoverDeferredToolUseMarkers,
  findDeferredToolUseState,
} from '../../src/cli/print'
import type { Message } from '../../src/shared'

// 手建 transcript 消息（隔离回捞逻辑的最小形：recoverDeferredToolUseMarkers 泛型结构
// 约束 + findDeferredToolUseState 读的 tool_name/defer_reason 字段一并带上）
type TMsg = {
  uuid: string
  type: string
  subtype?: string
  parentUuid?: string | null
  tool_use_id?: string
  tool_name?: string
  defer_reason?: string
  message?: { content?: unknown }
}
function userMsg(uuid: string, parent: string | null): TMsg {
  return { uuid, type: 'user', parentUuid: parent, message: { content: 'user turn' } }
}
function asstTuMsg(uuid: string, parent: string, toolUseId: string, toolName: string): TMsg {
  return {
    uuid,
    type: 'assistant',
    parentUuid: parent,
    message: { content: [{ type: 'tool_use', id: toolUseId, name: toolName, input: {} }] },
  }
}
function markerMsg(uuid: string, parent: string, toolUseId: string, toolName: string): TMsg {
  return {
    uuid,
    type: 'system',
    subtype: 'deferred_tool_use',
    parentUuid: parent,
    tool_use_id: toolUseId,
    tool_name: toolName,
  }
}
function toolResultMsg(uuid: string, parent: string, toolUseId: string): TMsg {
  return {
    uuid,
    type: 'user',
    parentUuid: parent,
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] },
  }
}
function toMessages(ms: TMsg[]): Message[] {
  return ms as unknown as Message[]
}

describe('AD-45 缺口#2 回捞（recoverDeferredToolUseMarkers 纯函数，修前红）', () => {
  test('unresolved 挂起态：marker parent 在链内 + 无对应 tool_result → 回捞后在场 + findDeferredToolUseState 回挂起面', () => {
    const u0 = userMsg('u0', null)
    const a1 = asstTuMsg('a1', 'u0', 'toolu_1', 'Bash')
    const mk = markerMsg('mk1', 'a1', 'toolu_1', 'Bash')
    const messages = new Map<string, TMsg>([
      [u0.uuid, u0],
      [a1.uuid, a1],
      [mk.uuid, mk],
    ])
    // 模拟叶计算排除 system 叶 + 单向走链：chain = [u0, a1]（marker 结构性排除出链）
    const chain = [u0, a1]
    // 修前红（结构性排除的直接后果）：未回捞 → findDeferredToolUseState 恒 undefined
    expect(findDeferredToolUseState(toMessages(chain))).toBeUndefined()
    // 修：回捞 → marker 插回 parent 之后 + 挂起面复原
    const recovered = recoverDeferredToolUseMarkers(messages, chain)
    expect(recovered.map((m) => m.uuid)).toEqual(['u0', 'a1', 'mk1'])
    const s = findDeferredToolUseState(toMessages(recovered))
    expect(s?.toolUseId).toBe('toolu_1')
    expect(s?.toolName).toBe('Bash')
  })
})

describe('AD-45 缺口#2 零回归约束 3（无 marker / 已解决 / 已在链内）', () => {
  test('无 marker 正常会话 → 原数组引用零追加 + findDeferredToolUseState undefined', () => {
    const u0 = userMsg('u0', null)
    const a1 = asstTuMsg('a1', 'u0', 'toolu_9', 'Read')
    const tr = toolResultMsg('tr1', 'a1', 'toolu_9')
    const messages = new Map<string, TMsg>([
      [u0.uuid, u0],
      [a1.uuid, a1],
      [tr.uuid, tr],
    ])
    const chain = [u0, a1, tr]
    const recovered = recoverDeferredToolUseMarkers(messages, chain)
    expect(recovered).toBe(chain) // 同一引用 = 零追加（零回归约束 3）
    expect(findDeferredToolUseState(toMessages(recovered))).toBeUndefined()
  })

  test('已解决 marker（对应 tool_result 在场，sibling 非经 marker）→ 不回捞（防重复重评）', () => {
    const u0 = userMsg('u0', null)
    const a1 = asstTuMsg('a1', 'u0', 'toolu_2', 'Bash')
    const mk = markerMsg('mk2', 'a1', 'toolu_2', 'Bash')
    const tr = toolResultMsg('tr2', 'a1', 'toolu_2') // tool_result 是 a1 的 child（marker 的 sibling）
    const messages = new Map<string, TMsg>([
      [u0.uuid, u0],
      [a1.uuid, a1],
      [mk.uuid, mk],
      [tr.uuid, tr],
    ])
    // 叶 = tr（user）→ chain 经 parent 链 tr(a1)→a1→u0（marker 非 parent 链上 → 排除）
    const chain = [u0, a1, tr]
    const recovered = recoverDeferredToolUseMarkers(messages, chain)
    expect(recovered).toBe(chain) // toolu_2 已解决 → marker 不回捞
    expect(recovered.map((m) => m.uuid)).not.toContain('mk2')
    expect(findDeferredToolUseState(toMessages(recovered))).toBeUndefined()
  })

  test('已在链内（parent 链推进已穿过该 marker）→ 不重复回捞', () => {
    const u0 = userMsg('u0', null)
    const a1 = asstTuMsg('a1', 'u0', 'toolu_a', 'Read')
    const mkA = markerMsg('mkA', 'a1', 'toolu_a', 'Read')
    const a2 = asstTuMsg('a2', 'mkA', 'toolu_b', 'Bash') // a2 的 parent = marker（parent 链穿过 mkA）
    const messages = new Map<string, TMsg>([
      [u0.uuid, u0],
      [a1.uuid, a1],
      [mkA.uuid, mkA],
      [a2.uuid, a2],
    ])
    // 叶 = a2（assistant，其 parent 链 a2→mkA→a1→u0）→ chain 已含 mkA
    const chain = [u0, a1, mkA, a2]
    const recovered = recoverDeferredToolUseMarkers(messages, chain)
    // mkA 已在链内 → 不重复追加（uuid 各出现一次）
    expect(recovered.map((m) => m.uuid)).toEqual(['u0', 'a1', 'mkA', 'a2'])
    expect(recovered.filter((m) => m.uuid === 'mkA').length).toBe(1)
  })
})

describe('AD-45 缺口#2 last-wins（多 marker 按 parent 文档序，末位权威）', () => {
  test('多 marker（同 parent）追加 → 末位 marker 权威', () => {
    const u0 = userMsg('u0', null)
    const a1 = asstTuMsg('a1', 'u0', 'toolu_a', 'Read')
    const mkA = markerMsg('mkA', 'a1', 'toolu_a', 'Read')
    const mkB = markerMsg('mkB', 'a1', 'toolu_b', 'Bash') // 末次挂起（last-wins 权威）
    const messages = new Map<string, TMsg>([
      [u0.uuid, u0],
      [a1.uuid, a1],
      [mkA.uuid, mkA],
      [mkB.uuid, mkB],
    ])
    const chain = [u0, a1] // 叶计算排除 system 叶（mkA/mkB terminal）→ 叶 = a1
    const recovered = recoverDeferredToolUseMarkers(messages, chain)
    expect(recovered.map((m) => m.uuid)).toEqual(['u0', 'a1', 'mkA', 'mkB'])
    expect(findDeferredToolUseState(toMessages(recovered))?.toolUseId).toBe('toolu_b')
  })
})
