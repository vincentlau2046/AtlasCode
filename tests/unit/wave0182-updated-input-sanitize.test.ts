/**
 * 0.1.82 K3-A2 判别单测：PreToolUse hook updatedInput 未知键丢弃（上游对齐）。
 *
 * 红基线 = 8404fd0：toolExecution.ts:410 `preOutcome?.updatedInput ?? tu.input`
 * 整体替换——hook 注入的未知键原样进入 tool.call 入参（行为红例）。
 * 修后：sanitizeUpdatedInput 键交集（已知键 last-wins 保留钩子改写值，未知键丢弃；
 * 非 plain object 面 fail-safe 保原入参）。
 *
 * 注意区分面：hooks.test.ts MAJOR-2 锁的是 updatedInput 的**解释**面（钩子 JSON
 * 双形读取，不变）；本件锁的是**消费**面（pipeline 采纳时的键白名单）。
 * 权限门 verdict.updatedInput（内部全决策体）不在本件范围（0.1.77 I-1c 语义）。
 */
import { describe, test, expect } from 'bun:test'
import {
  executeToolUse,
  type Tool,
  type ToolHooks,
} from '../../src/engine'
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

/** 入参捕获 fake tool（只填执行链消费字段）。 */
function recordingTool(name: string, inputs: unknown[]): Tool {
  return {
    name,
    isConcurrencySafe: () => false,
    call: async (input: unknown) => {
      inputs.push(input)
      return { data: 'ok' }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

describe('K3-A2 hook updatedInput 未知键丢弃（消费面；红基线 8404fd0 整体替换）', () => {
  test('① 行为红例：hook 注入未知键 → tool.call 不见未知键（修前原样透传 → 红）', async () => {
    const inputs: unknown[] = []
    const hooks = {
      preToolUse: async () => ({
        updatedInput: { path: '/rewritten', injected_key: 'evil' },
      }),
    } as unknown as ToolHooks
    const r = await executeToolUse(
      tu('s1', 'Write', { path: '/original' }),
      ASSISTANT,
      { tools: [recordingTool('Write', inputs)], hooks },
    )
    expect(r.isError).toBe(false)
    // 已知键保留钩子改写值；未知键丢弃（修前 = { path: '/rewritten', injected_key: 'evil' }）
    expect(inputs[0]).toEqual({ path: '/rewritten' })
  })

  test('② 已知键 last-wins 全保真：hook 改写多个已知键 → 全部生效', async () => {
    const inputs: unknown[] = []
    const hooks = {
      preToolUse: async () => ({
        updatedInput: { command: 'safe-cmd', description: 'rewritten' },
      }),
    } as unknown as ToolHooks
    await executeToolUse(
      tu('s2', 'Bash', { command: 'orig', description: 'orig-desc', timeout: 30 }),
      ASSISTANT,
      { tools: [recordingTool('Bash', inputs)], hooks },
    )
    // 未被 hook 提及的已知键（timeout）保留原值
    expect(inputs[0]).toEqual({
      command: 'safe-cmd',
      description: 'rewritten',
      timeout: 30,
    })
  })

  test('③ 纯 hook 改写正常面恒等：updatedInput 全为已知键 → 与修前行为一致', async () => {
    const inputs: unknown[] = []
    const hooks = {
      preToolUse: async () => ({ updatedInput: { path: '/ok' } }),
    } as unknown as ToolHooks
    await executeToolUse(
      tu('s3', 'Write', { path: '/original' }),
      ASSISTANT,
      { tools: [recordingTool('Write', inputs)], hooks },
    )
    expect(inputs[0]).toEqual({ path: '/ok' })
  })
})

describe('K3-A2 sanitizeUpdatedInput 纯函数矩阵（动态 import；基线无此导出 → 红）', () => {
  test('④ 键交集：已知键取改写值 / 未知键丢弃 / 未提及已知键保原值', async () => {
    const { sanitizeUpdatedInput } = await import(
      '../../src/engine/pipeline/sanitizeUpdatedInput'
    )
    expect(
      sanitizeUpdatedInput({ a: 1, b: 2, c: 3 }, { b: 20, d: 4 }),
    ).toEqual({ a: 1, b: 20, c: 3 })
  })

  test('⑤ fail-safe：updatedInput 非 plain object（string/数组/null）→ 保原入参', async () => {
    const { sanitizeUpdatedInput } = await import(
      '../../src/engine/pipeline/sanitizeUpdatedInput'
    )
    const original = { a: 1 }
    expect(sanitizeUpdatedInput(original, 'evil-string')).toBe(original)
    expect(sanitizeUpdatedInput(original, ['array'])).toBe(original)
    expect(sanitizeUpdatedInput(original, null)).toBe(original)
  })

  test('⑥ 原入参非 plain object → 保原入参（无从交集）', async () => {
    const { sanitizeUpdatedInput } = await import(
      '../../src/engine/pipeline/sanitizeUpdatedInput'
    )
    const original = 'not-an-object'
    expect(sanitizeUpdatedInput(original, { a: 1 })).toBe(original)
  })

  test('⑦ 空 updatedInput {} → 全键保原值（不丢键）', async () => {
    const { sanitizeUpdatedInput } = await import(
      '../../src/engine/pipeline/sanitizeUpdatedInput'
    )
    expect(sanitizeUpdatedInput({ a: 1, b: 2 }, {})).toEqual({ a: 1, b: 2 })
  })

  test('⑧ 原型链安全：plain object 判定不含 Object.create(null) 陷阱与 Date 等对象', async () => {
    const { sanitizeUpdatedInput } = await import(
      '../../src/engine/pipeline/sanitizeUpdatedInput'
    )
    // Date 非 plain object → fail-safe 保原值
    const original = { a: 1 }
    expect(sanitizeUpdatedInput(original, new Date())).toBe(original)
  })
})
