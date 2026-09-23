/**
 * engine/pipeline 输入 schema 浅校验 + schema-not-sent 提示 + signal 透传 契约测试（§8.23 E-1b T-4c/T-4d）。
 *
 * 被测能力 = 浅 JSON-schema 校验（required + 基础类型）/ not-sent 提示纯函数 / signal 经
 * tool.call 第 2 参 context 透传。非 tautology：断言的是校验真拒绝 / 提示真触发 / signal 真到达
 * tool.call（非 fake 自证）。I/O-free → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  buildSchemaNotSentHint,
  executeToolUse,
  validateInputBySchema,
  type Tool,
} from '../../src/engine'
import type { AssistantMessage, ToolUseBlock, ToolInputJSONSchema } from '../../src/shared'

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

function makeTool(
  name: string,
  opts?: {
    inputSchema?: ToolInputJSONSchema
    shouldDefer?: boolean
    data?: unknown
    captureContext?: (ctx: unknown) => void
  },
): Tool {
  return {
    name,
    inputSchema: opts?.inputSchema ?? { type: 'object', properties: {} },
    shouldDefer: opts?.shouldDefer,
    call: async (args: unknown, context: unknown) => {
      opts?.captureContext?.(context)
      return { data: opts?.data ?? `result:${name}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

const SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  required: ['msg'],
  properties: { msg: { type: 'string' }, count: { type: 'number' }, flag: { type: 'boolean' } },
}

describe('engine/pipeline validateInputBySchema（浅 JSON-schema）', () => {
  test('① 合法 object 通过', () => {
    expect(validateInputBySchema({ msg: 'hi', count: 2, flag: true }, SCHEMA)).toEqual({
      valid: true,
    })
  })
  test('② 缺 required 字段 → 拒绝（点出字段名）', () => {
    const r = validateInputBySchema({ count: 1 }, SCHEMA)
    expect(r.valid).toBe(false)
    expect(r.valid === false && r.message).toContain('missing required field "msg"')
  })
  test('③ 基础类型不符 → 拒绝（string 期望得 number）', () => {
    const r = validateInputBySchema({ msg: 42 }, SCHEMA)
    expect(r.valid).toBe(false)
    expect(r.valid === false && r.message).toContain('field "msg": expected string, got number')
  })
  test('④ null / 非 object 输入 → 拒绝', () => {
    expect(validateInputBySchema(null, SCHEMA).valid).toBe(false)
    expect(validateInputBySchema('str', SCHEMA).valid).toBe(false)
    expect(validateInputBySchema([1], SCHEMA).valid).toBe(false)
  })
  test('⑤ 未声明 key 不拒 + 复合/unknown 类型跳过（残留守，不假拒）', () => {
    const withAnyOf: ToolInputJSONSchema = {
      type: 'object',
      properties: { x: { anyOf: [{ type: 'string' }] }, msg: { type: 'string' } },
    }
    // x 是 unknown 类型（anyOf）→ 跳过；msg 合法 → 整体通过
    expect(validateInputBySchema({ x: 'anything', msg: 'ok', extra: 99 }, withAnyOf)).toEqual({
      valid: true,
    })
  })
  test('⑥ 无 schema（undefined）→ 恒通过', () => {
    expect(validateInputBySchema({ anything: true }, undefined)).toEqual({ valid: true })
  })
  test('⑦ array 类型 + integer 区分', () => {
    const s: ToolInputJSONSchema = {
      type: 'object',
      properties: { arr: { type: 'array' }, n: { type: 'integer' } },
    }
    expect(validateInputBySchema({ arr: [1, 2], n: 3 }, s)).toEqual({ valid: true })
    const r = validateInputBySchema({ arr: 'no', n: 3.5 }, s)
    expect(r.valid).toBe(false)
    expect(r.valid === false && r.message).toContain('expected array, got string')
    expect(r.valid === false && r.message).toContain('expected integer, got number')
  })
})

describe('engine/pipeline buildSchemaNotSentHint（纯函数）', () => {
  const discovered = new Set(['a', 'b'])
  test('① 非 deferred 工具 → null（schema 恒下发，不误报）', () => {
    expect(buildSchemaNotSentHint({ name: 'x', shouldDefer: false }, discovered)).toBeNull()
  })
  test('② deferred 且在 discovered 集 → null', () => {
    expect(buildSchemaNotSentHint({ name: 'a', shouldDefer: true }, discovered)).toBeNull()
  })
  test('③ deferred 且不在 discovered 集 → 提示文案', () => {
    const hint = buildSchemaNotSentHint({ name: 'c', shouldDefer: true }, discovered)
    expect(hint).not.toBeNull()
    expect(hint!).toContain("This tool's schema was not sent to the API")
  })
})

describe('engine/pipeline executeToolUse schema 校验 + signal 透传（T-4c 接线）', () => {
  test('⑧ schema 校验接进执行链：缺 required → is_error InputValidationError', async () => {
    const r = await executeToolUse(tu('t1', 'needMsg'), ASSISTANT, {
      tools: [makeTool('needMsg', { inputSchema: SCHEMA })],
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('InputValidationError: missing required field "msg"')
  })

  test('⑨ 合法 schema 输入 → 通过执行（call 真被调）', async () => {
    const r = await executeToolUse(tu('t2', 'ok', { msg: 'hi' }), ASSISTANT, {
      tools: [makeTool('ok', { inputSchema: SCHEMA, data: 'done' })],
    })
    expect(r.isError).toBe(false)
    expect(r.block.content).toBe('done')
  })

  test('⑩ signal 真到达 tool.call（第 2 参 context.signal）', async () => {
    const ac = new AbortController()
    let seen: unknown
    const r = await executeToolUse(tu('t3', 'sig'), ASSISTANT, {
      tools: [makeTool('sig', { captureContext: (c) => (seen = c) })],
      signal: ac.signal,
    })
    expect(r.isError).toBe(false)
    expect((seen as { signal?: AbortSignal })?.signal).toBe(ac.signal)
  })

  test('⑪ deferred 工具 + 未下发 discovered 集 → schema 校验失败回 not-sent 提示', async () => {
    const r = await executeToolUse(tu('t4', 'deferred'), ASSISTANT, {
      tools: [
        makeTool('deferred', { inputSchema: SCHEMA, shouldDefer: true }),
      ],
      discoveredToolNames: new Set<string>(), // 空集 = 该 deferred 工具 schema 未下发
    })
    expect(r.isError).toBe(true)
    const content = String(r.block.content)
    expect(content).toContain('InputValidationError: missing required field "msg"')
    expect(content).toContain("This tool's schema was not sent to the API")
  })

  test('⑫ 未注入 discoveredToolNames = 全注册工具均下发 → 提示恒不触发', async () => {
    const r = await executeToolUse(tu('t5', 'deferred2'), ASSISTANT, {
      tools: [makeTool('deferred2', { inputSchema: SCHEMA, shouldDefer: true })],
    })
    // 默认 discovered = 全注册工具（含 deferred2）→ schema 未下发不成立 → 无提示
    expect(r.isError).toBe(true) // 仍因缺 required 拒
    expect(String(r.block.content)).not.toContain('schema was not sent')
  })
})
