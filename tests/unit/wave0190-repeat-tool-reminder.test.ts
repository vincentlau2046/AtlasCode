/**
 * wave0190 任务 B：repeat-tool 连击建议守（工单 §1-B；锁面批注 §5.2）。
 *
 * 缺陷基线（RR-1）：同参同工具连击（弱模型循环重试同一调用）零提醒——agent loop
 * 无任何「你已连续 N 次调用同一工具同参」建议面。
 *
 * 语义（DSH repeat-tool-reminder 233L 对齐 + 锁面裁定）：
 *  - 计数键 = [toolName, canonicalize(arguments)]（canonicalize = deep key-sort +
 *    stringify——键序差异不产生新链，值差异产生新链）
 *  - 阈值默认 [3,5,8]：首阈 gentle 文案，后续阈 detailed 文案（含 args 预览，
 *    argumentsPreviewChars 500 头截断）；阈间调用不提醒
 *  - 配置 fail-loud（空表 / 非整数 / <2 / 重复 → 构造时抛）
 *  - per-agent 隔离 = tracker 实例即链状态（run 生命周期注入一次）
 *  - 注入槽位 = executeToolUse 成功支产出 tool_result 后，in-band user + isMeta
 *    走 C85-B ToolResult.newMessages 既有交付链（零新投递面）；失败支计数不注入
 *    （DSH observe post-execute 同口径——denied/error 计数推进，无成功块不投递）
 *  - 未注入 tracker = 零行为恒等锚（单轮 queryOneRound 直调 / 窄 spine 不受影响）
 */
import { describe, test, expect } from 'bun:test'
import { executeToolUse, runToolBatch, type Tool } from '../../src/engine'
import {
  REPEAT_TOOL_REMINDER_THRESHOLDS,
  canonicalizeArguments,
  createRepeatToolCallTracker,
} from '../../src/engine/pipeline/repeatToolReminder'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

function makeTool(name: string, opts?: { throw?: Error }): Tool {
  return {
    name,
    isConcurrencySafe: () => false,
    call: async () => {
      if (opts?.throw) throw opts.throw
      return { data: `result:${name}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

// ─────────────────────────── 构造 / 纯面 ───────────────────────────

describe('wave0190 连击守 配置 fail-loud（构造时抛）', () => {
  test('空阈值表 throw', () => {
    expect(() => createRepeatToolCallTracker({ thresholds: [] })).toThrow()
  })
  test('非整数阈值 throw', () => {
    expect(() => createRepeatToolCallTracker({ thresholds: [3, 4.5] })).toThrow()
  })
  test('阈值 <2 throw', () => {
    expect(() => createRepeatToolCallTracker({ thresholds: [1, 5] })).toThrow()
  })
  test('重复阈值 throw', () => {
    expect(() => createRepeatToolCallTracker({ thresholds: [3, 3, 8] })).toThrow()
  })
  test('缺省配置 = 默认 [3,5,8]（token 锚 090-06）', () => {
    expect(REPEAT_TOOL_REMINDER_THRESHOLDS).toEqual([3, 5, 8])
    expect(() => createRepeatToolCallTracker()).not.toThrow()
  })
})

describe('wave0190 连击守 canonicalize（deep key-sort）', () => {
  test('键序差异 = 同键（{a,b:{d,c}} ≡ {b:{c,d},a}）', () => {
    expect(canonicalizeArguments({ a: 1, b: { d: 2, c: 3 } })).toBe(
      canonicalizeArguments({ b: { c: 3, d: 2 }, a: 1 }),
    )
  })
  test('值差异 = 异键', () => {
    expect(canonicalizeArguments({ a: 1 })).not.toBe(canonicalizeArguments({ a: 2 }))
  })
})

// ─────────────────────────── tracker 计数 / 提醒面 ───────────────────────────

describe('wave0190 连击守 observe（阈值 [3,5,8] gentle→detailed）', () => {
  test('第 1/2 次不提醒，第 3 次（首阈）gentle 含工具名与计数', () => {
    const t = createRepeatToolCallTracker()
    expect(t.observe('Read', { path: 'a.ts' })).toBeUndefined()
    expect(t.observe('Read', { path: 'a.ts' })).toBeUndefined()
    const r = t.observe('Read', { path: 'a.ts' })
    expect(r).toBeDefined()
    expect(r!).toContain('Read')
    expect(r!).toContain('3')
  })
  test('第 4/5 次间不提醒→第 5 次 detailed；第 6/7 不提醒→第 8 次 detailed', () => {
    const t = createRepeatToolCallTracker()
    for (let i = 0; i < 4; i++) t.observe('Bash', { command: 'x' })
    const r5 = t.observe('Bash', { command: 'x' })
    expect(r5).toBeDefined() // 5 = 第二阈 → detailed
    expect(r5).toContain('5')
    expect(t.observe('Bash', { command: 'x' })).toBeUndefined()
    expect(t.observe('Bash', { command: 'x' })).toBeUndefined()
    const r8 = t.observe('Bash', { command: 'x' })
    expect(r8).toBeDefined() // 8 = 第三阈 → detailed
    expect(r8).toContain('8')
  })
  test('detailed 含 args 预览且 500 头截断（argumentsPreviewChars）', () => {
    const t = createRepeatToolCallTracker()
    const big = 'x'.repeat(2000)
    for (let i = 0; i < 7; i++) t.observe('Read', { content: big })
    const r = t.observe('Read', { content: big }) // 第 8 次 = 第三阈 detailed
    expect(r).toBeDefined()
    expect(r!.length).toBeLessThan(1000) // 500 预览 + 文案骨架，未截断会 >2000
    expect(r).toContain('xxx')
  })
  test('不同参数 = 不同链（不累计）', () => {
    const t = createRepeatToolCallTracker()
    expect(t.observe('Read', { path: 'a.ts' })).toBeUndefined() // a:1
    expect(t.observe('Read', { path: 'b.ts' })).toBeUndefined() // b:1（独立链）
    expect(t.observe('Read', { path: 'a.ts' })).toBeUndefined() // a:2
    expect(t.observe('Read', { path: 'b.ts' })).toBeUndefined() // b:2
    expect(t.observe('Read', { path: 'a.ts' })).toBeDefined() // a:3 触首阈（b 未污染）
  })
  test('per-agent 隔离：两 tracker 链状态独立', () => {
    const t1 = createRepeatToolCallTracker()
    const t2 = createRepeatToolCallTracker()
    t1.observe('Read', { path: 'a.ts' })
    t1.observe('Read', { path: 'a.ts' })
    expect(t2.observe('Read', { path: 'a.ts' })).toBeUndefined() // t2 计数未被 t1 污染
    expect(t1.observe('Read', { path: 'a.ts' })).toBeDefined()
  })
})

// ─────────────────────────── executeToolUse / runToolBatch 集成 ───────────────────────────

describe('wave0190 连击守 executeToolUse 注入（C85-B 通道）', () => {
  test('同 tracker 第 3 次同参成功调用 → newMessages 含 user+isMeta 提醒（源 tool_use 关联）', async () => {
    const tracker = createRepeatToolCallTracker()
    const deps = { tools: [makeTool('reader')], repeatToolTracker: tracker }
    await executeToolUse(tu('t1', 'reader', { path: 'a.ts' }), ASSISTANT, deps)
    await executeToolUse(tu('t2', 'reader', { path: 'a.ts' }), ASSISTANT, deps)
    const r3 = await executeToolUse(tu('t3', 'reader', { path: 'a.ts' }), ASSISTANT, deps)
    expect(r3.isError).toBe(false)
    expect(r3.newMessages).toHaveLength(1)
    const m = r3.newMessages![0] as Record<string, unknown>
    expect(m.type).toBe('user')
    expect(m.isMeta).toBe(true)
    expect(m.sourceToolUseId).toBe('t3')
    expect(String((m.message as Record<string, unknown>).content)).toContain('reader')
  })

  test('无 tracker = 零行为恒等（零 newMessages）', async () => {
    const r = await executeToolUse(tu('t1', 'plain'), ASSISTANT, { tools: [makeTool('plain')] })
    expect(r.newMessages).toBeUndefined()
  })

  test('失败支计数推进但不注入：2 次 error + 第 3 次成功 → 成功支出提醒', async () => {
    const tracker = createRepeatToolCallTracker()
    const deps = { tools: [makeTool('boom')], repeatToolTracker: tracker }
    await executeToolUse(tu('t1', 'boom'), ASSISTANT, { ...deps, tools: [makeTool('boom', { throw: new Error('e1') })] })
    await executeToolUse(tu('t2', 'boom'), ASSISTANT, { ...deps, tools: [makeTool('boom', { throw: new Error('e2') })] })
    const r3 = await executeToolUse(tu('t3', 'boom'), ASSISTANT, deps)
    expect(r3.isError).toBe(false)
    expect(r3.newMessages).toHaveLength(1) // 失败也计数 → 第 3 次成功触首阈
    const errOnly = await executeToolUse(tu('t4', 'boom'), ASSISTANT, {
      ...deps,
      tools: [makeTool('boom', { throw: new Error('e3') })],
    })
    expect(errOnly.isError).toBe(true)
    expect(errOnly.newMessages).toBeUndefined() // 失败支不注入（无成功块不投递）
  })

  test('runToolBatch 携带（outcome.newMessages 透传）', async () => {
    const tracker = createRepeatToolCallTracker()
    const deps = { tools: [makeTool('r', { safe: true })], repeatToolTracker: tracker }
    await runToolBatch([tu('1', 'r', { q: 1 })], ASSISTANT, deps)
    await runToolBatch([tu('2', 'r', { q: 1 })], ASSISTANT, deps)
    const outcomes = await runToolBatch([tu('3', 'r', { q: 1 })], ASSISTANT, deps)
    expect(outcomes[0].newMessages).toHaveLength(1)
    const m0 = outcomes[0].newMessages![0] as Record<string, unknown>
    expect(String((m0.message as Record<string, unknown>).content)).toContain('r')
  })
})
