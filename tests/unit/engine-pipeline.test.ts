/**
 * engine/pipeline 单 tool_use 执行链 + 批次编排 契约测试（§8.21 E-1 窄 spine T-2）。
 *
 * 被测能力 = 执行链的 4 接缝真接线（权限 E-4 / 钩子 E-5 / 校验 / 错误分类）+ 分区调度行为。
 * 非 tautology：断言的是接缝是否真被消费（deny→is_error / hook 真被调 / 分类串正确），
 * 非 fake 自证。I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  classifyToolError,
  executeToolUse,
  partitionToolCalls,
  runToolBatch,
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

/** fake tool：只填执行链消费字段（name/call/mapResult/isConcurrencySafe/validateInput），非 tautology。 */
function makeTool(
  name: string,
  opts?: {
    safe?: boolean
    data?: unknown
    throw?: Error
    validateFail?: string
  },
): Tool {
  return {
    name,
    isConcurrencySafe: () => opts?.safe ?? false,
    validateInput: opts?.validateFail
      ? async () => ({ result: false, message: opts.validateFail!, errorCode: 1 })
      : undefined,
    call: async () => {
      if (opts?.throw) throw opts.throw
      return { data: opts?.data ?? `result:${name}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

describe('engine/pipeline 单 tool_use 执行链（4 接缝）', () => {
  test('① 已知 tool：真 call + mapResult（执行链主路径）', async () => {
    const r = await executeToolUse(tu('t1', 'echo'), ASSISTANT, { tools: [makeTool('echo')] })
    expect(r.isError).toBe(false)
    expect(r.block.content).toBe('result:echo')
    expect(r.block.tool_use_id).toBe('t1')
  })

  test('② 未知 tool：is_error `unknown tool`（不静默丢弃）', async () => {
    const r = await executeToolUse(tu('t2', 'ghost'), ASSISTANT, { tools: [makeTool('echo')] })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('unknown tool: ghost')
  })

  test('③ E-4 接缝：权限门 deny → is_error `permission denied`（门真被消费）', async () => {
    let gateCalled = false
    const r = await executeToolUse(tu('t3', 'echo'), ASSISTANT, {
      tools: [makeTool('echo')],
      checkPermission: async (tool) => {
        gateCalled = true
        return tool.name === 'echo' ? { allowed: false, reason: 'read-only fs' } : { allowed: true }
      },
    })
    expect(gateCalled).toBe(true)
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('permission denied: read-only fs')
  })

  test('④ 校验接缝：validateInput 失败 → is_error InputValidationError', async () => {
    const r = await executeToolUse(tu('t4', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', { validateFail: 'msg is required' })],
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('InputValidationError: msg is required')
  })

  test('⑤ 错误分类：call 抛 ENOENT → is_error 含 `Error:ENOENT`（classifyToolError 真接线）', async () => {
    const boom = new Error('no such file')
    ;(boom as NodeJS.ErrnoException).code = 'ENOENT'
    const r = await executeToolUse(tu('t5', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', { throw: boom })],
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('Error:ENOENT')
  })

  test('⑥ E-5 接缝：pre/post 钩子真被调（顺序 pre→post）', async () => {
    const calls: string[] = []
    const hooks: ToolHooks = {
      preToolUse: (t) => {
        calls.push(`pre:${t.name}`)
      },
      postToolUse: (t) => {
        calls.push(`post:${t.name}`)
      },
    }
    await executeToolUse(tu('t6', 'echo'), ASSISTANT, { tools: [makeTool('echo')], hooks })
    expect(calls).toEqual(['pre:echo', 'post:echo'])
  })
})

describe('engine/pipeline 批次编排（分区 + 串行）', () => {
  test('⑦ 分区：连续 concurrency-safe 归一批，非 safe 单独成批（旧仓 partitionToolCalls 真语义）', () => {
    const tools = [makeTool('read', { safe: true }), makeTool('write', { safe: false })]
    const batches = partitionToolCalls(
      [tu('1', 'read'), tu('2', 'read'), tu('3', 'write'), tu('4', 'read')],
      tools,
    )
    expect(batches.map((b) => b.blocks.map((x) => x.id))).toEqual([
      ['1', '2'],
      ['3'],
      ['4'],
    ])
    expect(batches.map((b) => b.isConcurrencySafe)).toEqual([true, false, true])
  })

  test('⑧ isConcurrencySafe 抛错 → 保守判非 safe（不崩）', () => {
    const hostile = makeTool('read', { safe: true })
    ;(hostile as { isConcurrencySafe: unknown }).isConcurrencySafe = () => {
      throw new Error('shell-quote parse failure')
    }
    const batches = partitionToolCalls([tu('1', 'read'), tu('2', 'read')], [hostile])
    // 两次都 throws → 都非 safe → 各自单独成批
    expect(batches).toHaveLength(2)
    expect(batches.every((b) => b.isConcurrencySafe === false)).toBe(true)
  })

  test('⑨ runToolBatch 串行：多 tool 顺序执行，结果按序', async () => {
    const outcomes = await runToolBatch(
      [tu('a', 'echo'), tu('b', 'ghost')],
      ASSISTANT,
      { tools: [makeTool('echo')] },
    )
    expect(outcomes.map((o) => o.name)).toEqual(['echo', 'ghost'])
    expect(outcomes[0].isError).toBe(false)
    expect(outcomes[1].isError).toBe(true)
  })
})

describe('engine/pipeline 执行链顺序（review I-3 回归：schema→validateInput→pre-hook→permission→call）', () => {
  test('① schema 校验失败先于权限门（门不被调，旧仓序 safeParse 最先）', async () => {
    const tool = makeTool('echo') as Tool & { inputSchema?: unknown }
    tool.inputSchema = {
      type: 'object',
      properties: { msg: { type: 'string' } },
      required: ['msg'],
    }
    let gateCalled = false
    const r = await executeToolUse(tu('t7', 'echo'), ASSISTANT, {
      tools: [tool],
      checkPermission: async () => {
        gateCalled = true
        return { allowed: false, reason: 'denied' }
      },
    })
    // input {} 缺 required msg → schema 失败先短路；重排前（权限门在前）gate 会被调
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('InputValidationError')
    expect(gateCalled).toBe(false)
  })

  test('② pre-hook 先于权限门、权限门紧贴 call 前（pre→gate→call）', async () => {
    const order: string[] = []
    const r = await executeToolUse(tu('t8', 'echo'), ASSISTANT, {
      tools: [
        {
          ...makeTool('echo'),
          call: async () => {
            order.push('call')
            return { data: 'ok' }
          },
        },
      ],
      checkPermission: async () => {
        order.push('gate')
        return { allowed: true }
      },
      hooks: {
        preToolUse: () => {
          order.push('pre')
        },
      },
    })
    expect(r.isError).toBe(false)
    expect(order).toEqual(['pre', 'gate', 'call'])
  })
})

describe('engine/pipeline G1 toolUseResult 挂法（#258：TUI 渲染面随消息携带工具原生 Output）', () => {
  test('G1-① 成功支：toolUseResult = res.data（原生 Output 对象，非 block 文本）', async () => {
    const data = { filePath: '/tmp/a', linesAdded: 5, linesRemoved: 1 }
    const r = await executeToolUse(tu('g1', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', { data })],
    })
    expect(r.isError).toBe(false)
    expect(r.toolUseResult).toBe(data)
  })

  test('G1-② catch 支：toolUseResult = 错误文本串（与 block content 内文同串，旧仓 detailedError 挂法）', async () => {
    const boom = new Error('kaboom')
    ;(boom as NodeJS.ErrnoException).code = 'ENOENT'
    const r = await executeToolUse(tu('g2', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', { throw: boom })],
    })
    expect(r.isError).toBe(true)
    expect(typeof r.toolUseResult).toBe('string')
    expect(r.toolUseResult as string).toContain('Error:ENOENT')
    expect(r.toolUseResult).toBe(String(r.block.content).replace(/^<tool_use_error>|<\/tool_use_error>$/g, ''))
  })

  test('G1-③ 早退支不挂（unknown tool / 权限 deny / validateInput 失败 → toolUseResult undefined）', async () => {
    const ghost = await executeToolUse(tu('g3a', 'ghost'), ASSISTANT, { tools: [makeTool('echo')] })
    expect(ghost.toolUseResult).toBeUndefined()
    const denied = await executeToolUse(tu('g3b', 'echo'), ASSISTANT, {
      tools: [makeTool('echo')],
      checkPermission: async () => ({ allowed: false, reason: 'no' }),
    })
    expect(denied.toolUseResult).toBeUndefined()
    const invalid = await executeToolUse(tu('g3c', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', { validateFail: 'bad' })],
    })
    expect(invalid.toolUseResult).toBeUndefined()
  })

  test('G1-④ runToolBatch 透传：outcome 携带 toolUseResult（成功挂 / 早退不挂）', async () => {
    const data = { linesAdded: 3 }
    const outcomes = await runToolBatch(
      [tu('g4a', 'echo'), tu('g4b', 'ghost')],
      ASSISTANT,
      { tools: [makeTool('echo', { data })] },
    )
    expect(outcomes[0].toolUseResult).toBe(data)
    expect(outcomes[1].toolUseResult).toBeUndefined()
  })
})

describe('engine/pipeline classifyToolError（错误分类小件）', () => {
  test('⑩ errno.code 优先（ENOENT → Error:ENOENT）', () => {
    const e = new Error('x')
    ;(e as NodeJS.ErrnoException).code = 'ENOENT'
    expect(classifyToolError(e)).toBe('Error:ENOENT')
  })
  test('⑪ 稳定 .name 次之（非 Error 构造器名）', () => {
    const e = new Error('x')
    e.name = 'ShellError'
    expect(classifyToolError(e)).toBe('ShellError')
  })
  test('⑫ 兜底 Error / 非 Error → UnknownError', () => {
    expect(classifyToolError(new Error('plain'))).toBe('Error')
    expect(classifyToolError('string-throw')).toBe('UnknownError')
  })
})
