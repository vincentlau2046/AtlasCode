/**
 * cli 域 S-C3（§8.71.1.4）unit 测试（零模型 / 零网络 / 零磁盘）
 *
 * 测试面（预声明接缝 = 域外裁/前向接缝头注登记，复审勿当遗漏重提）：
 *  - ndjsonSafeStringify（U+2028/U+2029 转义 + 普通 JSON 透传）
 *  - Stream（异步队列流：enqueue/next/done/单次迭代守卫）
 *  - normalizeControlMessageKeys（camelCase requestId → snake_case 兼容层）
 *  - StructuredIO 行为面：
 *    - stdin user 行 → structuredInput yield user 消息
 *    - keep_alive / 未知 type 静默忽略
 *    - prependUserMessage 先于后续 stdin 消息
 *    - createCanUseTool → can_use_tool control_request 注册 + stdin
 *      control_response 决断（allow 支 updatedInput 采纳 / deny 支）
 *    - injectControlResponse（bridge 赢面：cancel 上流 + 决断落地）
 *    - abort → 降级 deny 决策（catch 面，非 AbortError 外抛）
 *  - getCanUseToolFn 3 支：stdio 支（control_request 路由）/ MCP 具名支
 *    （前向接缝 throw 明示 + not-found 支）
 *  - runHeadless 选项校验 5 门（process.exit stub 抛验；门在 MCP / 权限
 *    装配前同步触发 = 零磁盘）
 *  - streamJsonStdoutGuard（JSON 行透传 / 非 JSON 行转 stderr 带标记）
 */
import { describe, expect, test } from 'bun:test'
import {
  getCanUseToolFn,
  installStreamJsonStdoutGuard,
  type HeadlessOptions,
  ndjsonSafeStringify,
  normalizeControlMessageKeys,
  runHeadless,
  Stream,
  StructuredIO,
  STDOUT_GUARD_MARKER,
  _resetStreamJsonStdoutGuardForTesting,
  type SdkToolUseContext,
  type SdkToolView,
} from '../../src/cli'
import type {
  AssistantMessage,
  Tool,
  ToolPermissionContext,
} from '../../src/shared'

// ── 具 ─────────────────────────────────────────────────────────────

const fakeTool: SdkToolView = {
  name: 'FakeTool',
  userFacingName: () => 'fake tool',
}
const fakeAssistant = {} as AssistantMessage

/** 最小 TPC（mode default + 空规则 = 无规则命中 → ask 决断产点）。 */
function makeTpc(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

function makeCtx(): { ctx: SdkToolUseContext; abort: AbortController } {
  const tpcRef = { tpc: makeTpc() }
  const abort = new AbortController()
  const ctx: SdkToolUseContext = {
    abortController: abort,
    getAppState: () => ({ toolPermissionContext: tpcRef.tpc }),
    setAppState: updater => {
      tpcRef.tpc = updater({
        toolPermissionContext: tpcRef.tpc,
      }).toolPermissionContext
    },
  }
  return { ctx, abort }
}

/** 可控 push 型 stdin 流（结构化 IO 读面喂点）。 */
function pushableStdin() {
  let pendingResolve: ((v: IteratorResult<string>) => void) | undefined
  let queue: string[] = []
  let closed = false
  const iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<string>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false })
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true })
          }
          return new Promise<IteratorResult<string>>(resolve => {
            pendingResolve = resolve
          })
        },
      }
    },
  }
  return {
    iterable,
    push(line: string): void {
      if (pendingResolve) {
        const r = pendingResolve
        pendingResolve = undefined
        r({ value: line, done: false })
      } else {
        queue.push(line)
      }
    },
    close(): void {
      closed = true
      if (pendingResolve) {
        const r = pendingResolve
        pendingResolve = undefined
        r({ value: undefined, done: true })
      }
    },
  }
}

/**
 * stdin drain pump（结构化 IO read() 生成器须 for-await 消费者驱动——
 * 同 print.ts drainPump 架构不变量：control_response 经 read 环 processLine
 * 落地决断；无泵 = stdin 行永不处理）。测试面 = 纯 drain（不消费 yield 值）。
 */
function pumpStdin(io: StructuredIO): Promise<void> {
  return (async () => {
    for await (const _turn of io.structuredInput) {
      // drain only
    }
  })()
}

/** 轮询等待 can_use_tool control_request 注册（sendRequest 同步入队）。 */
async function waitForRequest(io: StructuredIO): Promise<string> {
  const start = Date.now()
  for (;;) {
    const pending = io.getPendingPermissionRequests()
    if (pending.length > 0) return pending[0].request_id
    if (Date.now() - start > 1000) {
      throw new Error('no can_use_tool request registered within 1s')
    }
    await new Promise(r => setTimeout(r, 5))
  }
}

function controlResponseLine(
  requestId: string,
  response: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response },
  }) + '\n'
}

// ── ndjsonSafeStringify ─────────────────────────────────────────────

describe('cli 域 S-C3 · ndjsonSafeStringify', () => {
  test('U+2028 / U+2029 转义为 \\u2028 / \\u2029（NDJSON 行分隔保真）', () => {
    const ls = String.fromCharCode(0x2028)
    const ps = String.fromCharCode(0x2029)
    const s = ndjsonSafeStringify({ a: `x${ls}y${ps}z` })
    expect(s).not.toContain(ls)
    expect(s).not.toContain(ps)
    expect(JSON.parse(s)).toEqual({ a: `x${ls}y${ps}z` })
  })

  test('普通对象透传（无开放分隔符 = 原 JSON 形态）', () => {
    expect(ndjsonSafeStringify({ b: 1 })).toBe('{"b":1}')
  })
})

// ── Stream ──────────────────────────────────────────────────────────

describe('cli 域 S-C3 · Stream 异步队列流', () => {
  test('enqueue/next 队列顺序 + done 终结挂起读点', async () => {
    const s = new Stream<number>()
    s.enqueue(1)
    s.enqueue(2)
    expect(await s.next()).toEqual({ done: false, value: 1 })
    s.enqueue(3)
    expect(await s.next()).toEqual({ done: false, value: 2 })
    expect(await s.next()).toEqual({ done: false, value: 3 })
    const pending = s.next()
    s.done()
    expect(await pending).toEqual({ done: true, value: undefined })
  })

  test('单次迭代守卫（第二次 [Symbol.asyncIterator] throw）', () => {
    const s = new Stream<number>()
    s[Symbol.asyncIterator]()
    expect(() => s[Symbol.asyncIterator]()).toThrow()
  })
})

// ── normalizeControlMessageKeys ─────────────────────────────────────

describe('cli 域 S-C3 · normalizeControlMessageKeys 兼容层', () => {
  test('顶层 requestId → request_id（原地变异 + 删除 camel）', () => {
    const msg = {
      type: 'control_response',
      requestId: 'r1',
      response: { subtype: 'success', requestId: 'r1' },
    } as Record<string, unknown>
    const out = normalizeControlMessageKeys(msg) as {
      request_id?: string
      requestId?: string
      response: { request_id?: string; requestId?: string }
    }
    expect(out.request_id).toBe('r1')
    expect(out.requestId).toBeUndefined()
    // 嵌套 response 层同规则
    expect(out.response.request_id).toBe('r1')
    expect(out.response.requestId).toBeUndefined()
  })

  test('snake_case 在场时 camel 保留（snake 优先不覆盖）', () => {
    const msg = { request_id: 'snake', requestId: 'camel' }
    normalizeControlMessageKeys(msg)
    expect(msg.request_id).toBe('snake')
    expect(msg.requestId).toBe('camel')
  })

  test('非对象透传（null / 原始值）', () => {
    expect(normalizeControlMessageKeys(null)).toBeNull()
    expect(normalizeControlMessageKeys('x' as unknown)).toBe('x')
  })
})

// ── StructuredIO 行为面 ─────────────────────────────────────────────

describe('cli 域 S-C3 · StructuredIO 行为面', () => {
  test('stdin user 行 → structuredInput yield user 消息', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    stdin.push(
      JSON.stringify({
        type: 'user',
        session_id: 's1',
        message: { role: 'user', content: 'hello' },
        parent_tool_use_id: null,
      }) + '\n',
    )
    const first = await io.structuredInput.next()
    expect((first.value as { type: string }).type).toBe('user')
  })

  test('keep_alive / 未知 type 静默忽略（不产消息，不崩）', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    stdin.push(JSON.stringify({ type: 'keep_alive' }) + '\n')
    stdin.push(JSON.stringify({ type: 'bogus_type' }) + '\n')
    stdin.push(
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'after-noise' },
      }) + '\n',
    )
    const first = await io.structuredInput.next()
    expect((first.value as { type: string; message: { content: string } })
      .message.content).toBe('after-noise')
  })

  test('prependUserMessage 先于后续 stdin 消息上流', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    io.prependUserMessage('prepended')
    stdin.push(
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'from-stdin' },
      }) + '\n',
    )
    const first = await io.structuredInput.next()
    const second = await io.structuredInput.next()
    expect((first.value as { message: { content: string } }).message.content)
      .toBe('prepended')
    expect((second.value as { message: { content: string } }).message.content)
      .toBe('from-stdin')
  })

  test('createCanUseTool：stdin control_response allow 支（updatedInput 采纳）', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    void pumpStdin(io)
    const { ctx } = makeCtx()
    const p = io.createCanUseTool()(
      fakeTool,
      { a: 1 },
      ctx,
      fakeAssistant,
      'toolu_1',
    )
    const requestId = await waitForRequest(io)
    stdin.push(
      controlResponseLine(requestId, {
        behavior: 'allow',
        updatedInput: { a: 2 },
        toolUseID: 'toolu_1',
      }),
    )
    const decision = await p
    expect(decision.behavior).toBe('allow')
    if (decision.behavior === 'allow') {
      expect(decision.updatedInput).toEqual({ a: 2 })
    }
  })

  test('createCanUseTool：deny 支（message 透传）', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    void pumpStdin(io)
    const { ctx } = makeCtx()
    const p = io.createCanUseTool()(
      fakeTool,
      { a: 1 },
      ctx,
      fakeAssistant,
      'toolu_2',
    )
    const requestId = await waitForRequest(io)
    stdin.push(
      controlResponseLine(requestId, {
        behavior: 'deny',
        message: 'not allowed',
        toolUseID: 'toolu_2',
      }),
    )
    const decision = await p
    expect(decision.behavior).toBe('deny')
  })

  test('injectControlResponse：bridge 赢面（cancel 上流 + 决断落地）', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    void pumpStdin(io)
    const { ctx } = makeCtx()
    const p = io.createCanUseTool()(
      fakeTool,
      {},
      ctx,
      fakeAssistant,
      'toolu_9',
    )
    const requestId = await waitForRequest(io)
    // cancel 上流 = write() 直出 stdout（非 outbound 队列——旧仓 bridge
    // 赢面语义：bridge 自身写点），stdout 捕获断言
    const realStdout = process.stdout.write
    let stdout = ''
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk)
      return true
    }) as typeof process.stdout.write
    io.injectControlResponse({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: { behavior: 'deny', message: 'bridge denied', toolUseID: 'toolu_9' },
      },
    })
    process.stdout.write = realStdout
    const decision = await p
    expect(decision.behavior).toBe('deny')
    // outbound 写点：control_request（sendRequest 入队，drain 环读点）
    const o1 = await io.outbound.next()
    expect((o1.value as { type: string }).type).toBe('control_request')
    // bridge 赢面：control_cancel_request 直出 stdout（SDK 消费侧 cancel 信号）
    expect(stdout).toContain('control_cancel_request')
    expect(stdout).toContain(requestId)
  })

  test('abort → 降级 deny 决策（catch 面，非外抛）', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    void pumpStdin(io)
    const { ctx, abort } = makeCtx()
    const p = io.createCanUseTool()(
      fakeTool,
      {},
      ctx,
      fakeAssistant,
      'toolu_a',
    )
    await waitForRequest(io)
    abort.abort()
    const decision = await p
    expect(decision.behavior).toBe('deny')
    expect(String((decision as { message?: string }).message)).toContain(
      'failed',
    )
  })
})

// ── getCanUseToolFn 3 支 ────────────────────────────────────────────

describe('cli 域 S-C3 · getCanUseToolFn 支面', () => {
  test('stdio 支：control_request 路由 + control_response 决断', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    void pumpStdin(io)
    const { ctx } = makeCtx()
    const canUseTool = getCanUseToolFn('stdio', io, () => [])
    const p = canUseTool(fakeTool, {}, ctx, fakeAssistant, 'toolu_s')
    const requestId = await waitForRequest(io)
    stdin.push(
      controlResponseLine(requestId, { behavior: 'allow', updatedInput: {} }),
    )
    const decision = await p
    expect(decision.behavior).toBe('allow')
  })

  test('MCP 具名支：前向接缝 throw 明示（非假绿）', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    const { ctx } = makeCtx()
    const mcpFakeTool = { name: 'mcp__srv__tool' } as unknown as Tool
    const canUseTool = getCanUseToolFn(
      'mcp__srv__tool',
      io,
      () => [mcpFakeTool],
    )
    await expect(
      canUseTool(fakeTool, {}, ctx, fakeAssistant, 'x'),
    ).rejects.toThrow('adapter is not yet available')
  })

  test('MCP 具名支 not-found：stderr 提示 + throw', async () => {
    const stdin = pushableStdin()
    const io = new StructuredIO(stdin.iterable)
    const { ctx } = makeCtx()
    const realStderr = process.stderr.write
    let stderr = ''
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk)
      return true
    }) as typeof process.stderr.write
    try {
      const canUseTool = getCanUseToolFn('mcp__srv__nope', io, () => [])
      await expect(
        canUseTool(fakeTool, {}, ctx, fakeAssistant, 'x'),
      ).rejects.toThrow('not found')
      expect(stderr).toContain('mcp__srv__nope')
    } finally {
      process.stderr.write = realStderr
    }
  })
})

// ── runHeadless 选项校验 5 门 ───────────────────────────────────────

describe('cli 域 S-C3 · runHeadless 选项校验门（process.exit stub 抛验）', () => {
  async function expectGateExit(
    inputPrompt: string,
    options: HeadlessOptions,
    stderrFragment: string,
  ): Promise<void> {
    const realExit = process.exit
    const realStderr = process.stderr.write
    let code: number | undefined
    let stderr = ''
    process.exit = ((c?: number) => {
      code = c
      throw new Error(`__gate_exit:${String(c)}`)
    }) as typeof process.exit
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk)
      return true
    }) as typeof process.stderr.write
    try {
      await runHeadless(inputPrompt, options)
      throw new Error('expected gate exit')
    } catch (e) {
      if (!String((e as Error).message).startsWith('__gate_exit:')) {
        throw e
      }
    } finally {
      process.exit = realExit
      process.stderr.write = realStderr
    }
    expect(code).toBe(1)
    expect(stderr).toContain(stderrFragment)
  }

  test('门 1：--resume-session-at 需 --resume', () =>
    expectGateExit(
      '',
      { resumeSessionAt: 'abc' },
      '--resume-session-at requires --resume',
    ))

  test('门 2：--rewind-files 需 --resume', () =>
    expectGateExit('', { rewindFiles: 'feat' }, '--rewind-files requires --resume'))

  test('门 3：--rewind-files 独立操作不与 prompt 同用', () =>
    expectGateExit(
      'hello',
      { rewindFiles: 'feat', resume: 'valid' },
      'standalone operation',
    ))

  test('门 4：无输入 / 无合法 resume / 无 sdk-url → 拒', () =>
    expectGateExit(
      '',
      {},
      'Input must be provided either through stdin or as a prompt argument',
    ))

  test('门 5：stream-json 需 --verbose', () =>
    expectGateExit(
      'hello',
      { outputFormat: 'stream-json' },
      '--output-format=stream-json requires --verbose',
    ))
})

// ── streamJsonStdoutGuard ───────────────────────────────────────────

describe('cli 域 S-C3 · streamJsonStdoutGuard', () => {
  test('JSON 行透传 / 非 JSON 行转 stderr 带标记', () => {
    const realStdout = process.stdout.write
    const realStderr = process.stderr.write
    let out = ''
    let errOut = ''
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errOut += String(chunk)
      return true
    }) as typeof process.stderr.write
    try {
      installStreamJsonStdoutGuard()
      process.stdout.write('{"type":"result"}\n')
      process.stdout.write('stray log line\n')
      expect(out).toContain('{"type":"result"}\n')
      expect(out).not.toContain('stray log line')
      expect(errOut).toContain(`${STDOUT_GUARD_MARKER} stray log line`)
    } finally {
      _resetStreamJsonStdoutGuardForTesting()
      process.stdout.write = realStdout
      process.stderr.write = realStderr
    }
  })

  test('幂等安装（二次安装 no-op）+ 空行容忍', () => {
    const realStdout = process.stdout.write
    let out = ''
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      installStreamJsonStdoutGuard()
      installStreamJsonStdoutGuard() // no-op（installed 守卫）
      process.stdout.write('\n') // 空行 = 有效（NDJSON 尾分隔容限）
      expect(out).toBe('\n')
    } finally {
      _resetStreamJsonStdoutGuardForTesting()
      process.stdout.write = realStdout
    }
  })
})
