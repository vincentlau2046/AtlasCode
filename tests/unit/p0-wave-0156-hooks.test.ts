/**
 * 0.1.56 hooks 扩展判别单测（修前红→绿，PAC §3 V2-04 C8）
 *
 * 被测面：
 *  A · PreModelSwitch/PostModelSwitch 事件（CC 2.1.251）
 *     - 双 HOOK_EVENTS 事实源同步（SDK coreSchemas + engine hookEvents，27→29）
 *     - engine 执行器 runPreModelSwitchHooks/runPostModelSwitchHooks 真触发
 *     - TUI 触发点（model.tsx 两处切换点 fire-and-forget）在场（静态面）
 *  B · PostToolUse updatedToolOutput 全工具化（CC 2.1.121）
 *     - interpretHookOutput 解析（hookSpecificOutput 嵌套形 + 顶层形）
 *     - mergeAggregated last-wins 聚合
 *     - createToolHooks 适配器透传 + executeToolUse 消费点改写 block/toolUseResult
 *
 * 分层纪律：unit 零磁盘（假 HookShellPort 纯内存 canned 返回 + 注入 bootstrap-env /
 * config provider，同 engine-hooks.test.ts 口径）；TUI 触发面 = 静态源断言。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createToolHooks,
  executeToolUse,
} from '../../src/engine'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'
import type { Tool } from '../../src/engine'
import {
  HOOK_EVENTS as ENGINE_EVENTS,
  resetHookConfigProvider,
  resetHookShellPort,
  resetHooksBootstrapEnv,
  runPostModelSwitchHooks,
  runPreModelSwitchHooks,
  setHookConfigProvider,
  setHooksBootstrapEnv,
  setHookShellPort,
  type HookShellExecution,
  type HookShellPort,
} from '../../src/hooks'
import { HOOK_EVENTS as SDK_EVENTS } from '../../src/tui/entrypoints/sdk/coreSchemas.js'

// ── 夹具（同 engine-hooks.test.ts 口径）─────────────────────────────────────
const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

function makeTool(name: string): Tool {
  return {
    name,
    call: async () => ({ data: `result:${name}` }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

class FakeHookShell implements HookShellPort {
  calls: Array<{ command: string }> = []
  private queue: HookShellExecution[] = []
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  async runCommand(
    command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    _timeoutMs?: number,
  ): Promise<HookShellExecution> {
    this.calls.push({ command })
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

function injectBootstrap(): void {
  setHooksBootstrapEnv({
    getSessionId: () => 'test-session',
    getCwd: () => '/tmp/proj',
    getTranscriptPath: (id) => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => undefined,
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
  })
}

function injectMatchers(
  map: Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>
  >,
): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event) => map[event] ?? [],
  })
}

beforeEach(() => {
  injectBootstrap()
  resetHookConfigProvider()
  resetHookShellPort()
})
afterEach(() => {
  resetHooksBootstrapEnv()
  resetHookConfigProvider()
  resetHookShellPort()
})

// ── A · 事件面（双 HOOK_EVENTS 事实源同步 27→29）────────────────────────────
describe('A · PreModelSwitch/PostModelSwitch 事件面（CC 2.1.251）', () => {
  test('A1 双事实源各含 2 新事件 + 长度 29 + 集合恒等（防漂移）', () => {
    for (const [label, events] of [
      ['engine', ENGINE_EVENTS],
      ['sdk', SDK_EVENTS],
    ] as const) {
      expect(events).toContain('PreModelSwitch')
      expect(events).toContain('PostModelSwitch')
      expect(events).toHaveLength(29)
      const set = new Set(events as readonly string[])
      expect(set.size).toBe(29) // 无重复
      void label
    }
    // 双源集合恒等（AD-45 双解析器映射先例：防单侧漂移）
    const a = new Set(ENGINE_EVENTS as readonly string[])
    const b = new Set(SDK_EVENTS as readonly string[])
    expect(a.size).toBe(b.size)
    for (const e of a) expect(b).toContain(e)
    for (const e of b) expect(a).toContain(e)
  })

  test('A2 engine 执行器 runPreModelSwitchHooks 真触发（假端口 + input 面）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PreModelSwitch: [
        { matcher: 'model-x', hooks: [{ type: 'command', command: 'pre-switch' }] },
      ],
    })
    port.enqueue({ stdout: '', stderr: '', code: 0 })
    const r = await runPreModelSwitchHooks('model-a', 'model-x', 'command')
    expect(port.calls).toHaveLength(1)
    expect(port.calls[0].command).toBe('pre-switch')
    expect(r.results).toHaveLength(1)
  })

  test('A3 engine 执行器 runPostModelSwitchHooks 真触发（matcher 不命中 → 空）', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PostModelSwitch: [
        // matcher = 目标模型过滤面：配置 model-x，触发 model-y → 不命中
        { matcher: 'model-x', hooks: [{ type: 'command', command: 'post-switch' }] },
      ],
    })
    const r = await runPostModelSwitchHooks('model-a', 'model-y', 'picker')
    expect(port.calls).toHaveLength(0) // 未命中 → 零执行（热路径零开销）
    expect(r.results).toHaveLength(0)
  })
})

// ── A · 触发面（TUI model.tsx 两处切换点，静态源断言）──────────────────────
describe('A · TUI 触发面（model.tsx 两处切换点 fire-and-forget）', () => {
  const modelTsx = readFileSync(
    join(import.meta.dir, '../../src/tui/commands/model/model.tsx'),
    'utf8',
  )
  const helperSrc = readFileSync(
    join(import.meta.dir, '../../src/tui/utils/modelSwitchHooks.ts'),
    'utf8',
  )
  test('A4 助手导出 firePreModelSwitch/firePostModelSwitch（fire-and-forget）', () => {
    expect(helperSrc).toContain('export function firePreModelSwitch')
    expect(helperSrc).toContain('export function firePostModelSwitch')
    expect(helperSrc).toContain('executePreModelSwitchHooks')
    expect(helperSrc).toContain('executePostModelSwitchHooks')
  })
  test('A5 model.tsx 两处切换点触发（command + picker 支）', () => {
    expect(modelTsx).toContain("from '../../utils/modelSwitchHooks.js'")
    // 命令支（SetModelAndClose.setModel，source='command'）
    expect(modelTsx).toContain("firePreModelSwitch(undefined, newModel, 'command')")
    expect(modelTsx).toContain("firePostModelSwitch(undefined, newModel, 'command')")
    // picker 支（ModelPickerWrapper.handleSelect，source='picker'，old=mainLoopModel）
    expect(modelTsx).toContain("firePreModelSwitch(mainLoopModel ?? undefined, newModel, 'picker')")
    expect(modelTsx).toContain("firePostModelSwitch(mainLoopModel ?? undefined, newModel, 'picker')")
  })
})

// ── B · updatedToolOutput 全工具化（CC 2.1.121）────────────────────────────
describe('B · PostToolUse updatedToolOutput（interpret→merge→adapter→consume 全链）', () => {
  function setupPostToolHook(commands: string[]): FakeHookShell {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PostToolUse: [
        { matcher: 'echo', hooks: commands.map(command => ({ type: 'command', command })) },
      ],
    })
    return port
  }

  test('B1 hookSpecificOutput.updatedToolOutput 嵌套形 → block/toolUseResult 改写', async () => {
    const port = setupPostToolHook(['replace-output'])
    port.enqueue({
      stdout:
        '{"hookSpecificOutput":{"hookEventName":"PostToolUse","updatedToolOutput":"REPLACED"}}',
      stderr: '',
      code: 0,
    })
    const r = await executeToolUse(tu('b1', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeTool('echo')],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(r.isError).toBe(false)
    expect(String(r.block.content)).toBe('REPLACED') // 原 'result:echo' 被改写
    expect(r.toolUseResult).toBe('REPLACED') // 原生 Output 同值
    expect(port.calls).toHaveLength(1)
  })

  test('B2 顶层 updatedToolOutput 形亦解析（顶层 wins，同 updatedInput 读取序）', async () => {
    const port = setupPostToolHook(['replace-output'])
    port.enqueue({
      stdout: '{"updatedToolOutput":"TOPLEVEL"}',
      stderr: '',
      code: 0,
    })
    const r = await executeToolUse(tu('b2', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeTool('echo')],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(String(r.block.content)).toBe('TOPLEVEL')
  })

  test('B3 多钩子 last-wins 聚合（mergeAggregated updatedToolOutput）', async () => {
    const port = setupPostToolHook(['first', 'second'])
    port.enqueue({
      stdout:
        '{"hookSpecificOutput":{"updatedToolOutput":"first"}}',
      stderr: '',
      code: 0,
    })
    port.enqueue({
      stdout:
        '{"hookSpecificOutput":{"updatedToolOutput":"second"}}',
      stderr: '',
      code: 0,
    })
    const r = await executeToolUse(tu('b3', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeTool('echo')],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(String(r.block.content)).toBe('second') // last wins
    expect(port.calls).toHaveLength(2)
  })

  test('B4 未返回 updatedToolOutput = 零行为变更（fail-safe，block 保持工具原输出）', async () => {
    const port = setupPostToolHook(['no-op'])
    port.enqueue({
      stdout: '{"hookSpecificOutput":{"additionalContext":"note"}}',
      stderr: '',
      code: 0,
    })
    const r = await executeToolUse(tu('b4', 'echo', { msg: 'hi' }), ASSISTANT, {
      tools: [makeTool('echo')],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(String(r.block.content)).toBe('result:echo') // 未被改写
    expect(r.toolUseResult).toBe('result:echo')
  })

  test('B5 全工具化：非 echo 工具（write）PostToolUse updatedToolOutput 亦生效', async () => {
    const port = new FakeHookShell()
    setHookShellPort(port)
    injectMatchers({
      PostToolUse: [
        { matcher: 'write', hooks: [{ type: 'command', command: 'sanitize' }] },
      ],
    })
    port.enqueue({
      stdout:
        '{"hookSpecificOutput":{"updatedToolOutput":"sanitized"}}',
      stderr: '',
      code: 0,
    })
    const r = await executeToolUse(tu('b5', 'write', { path: 'f.txt' }), ASSISTANT, {
      tools: [makeTool('write')],
      hooks: createToolHooks(),
      checkPermission: async () => ({ allowed: true }),
    })
    expect(String(r.block.content)).toBe('sanitized')
    expect(r.toolUseResult).toBe('sanitized')
  })
})
