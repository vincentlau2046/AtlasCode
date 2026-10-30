/**
 * 0.1.82 K3-D D2 判别单测（上游 301）：插件/skill 钩子 ask 权限提示显示来源。
 *
 * 缺口（上游 301）：插件/skill 钩子 permissionDecision:'ask' 触发的权限提示
 * 只有固定字面 'hook requested confirmation'——不显示是哪个插件/skill 的
 * 钩子要求确认。来源数据在匹配层已在场（getMatchingHooks 展开的
 * MatchedHook.source = 'plugin:<名>' / 'skill:<名>' / 'settings'），但
 * 四段链全部丢弃：
 *   ① runOneHook 不把 source 写进 HookResult
 *   ② mergeAggregated 不随权限 winner 聚合来源
 *   ③ toolHooks 适配器不透传（PreToolUseHookOutcome 无载体字段）
 *   ④ mergeHookPermission ask 支用固定字面
 *
 * 修（来源归附链四段，加性）：
 *   ① HookResult.source（runOneHook 从 MatchedHook.source 写入）
 *   ② AggregatedHookResult.permissionDecisionSource（mergeAggregated 随权限
 *      winner 更替维护，同 permissionDecisionReason 语义——winner 更替时无
 *      来源则清陈旧值）
 *   ③ PreToolUseHookOutcome.hookSource（engine/hooks/toolHooks.ts 透传）
 *   ④ mergeHookPermission 第 4 加性参：ask 支来源归附文案
 *      `hook requested confirmation (from plugin:foo)`；'settings' 与缺省
 *      不归附（字面逐字不变——settings 钩子零行为差，既有断言兼容）。
 *
 * 判别面：hooks 域真注入链（config provider + 假 shell port，engine-hooks
 * 先例口径，零 mock.module）+ pipeline 纯函数矩阵 + executeToolUse 端到端
 * （用户可见 tool_use_error 文案面）。修前红：①②③④全断（来源链不存在，
 * 字面恒定）；恒等锚：deny/defer 支不归附、settings/无来源 ask 支字面不变。
 *
 * TUI 侧 executePreToolHooks（tui/utils/hooks.ts）零消费面（生产 PreToolUse
 * 路径 = engine pipeline createToolHooks 单点）——本修落 engine 域单点，无
 * 双体同步面（死面登记随工单批注）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  resetHookConfigProvider,
  resetHookShellPort,
  resetHooksBootstrapEnv,
  runPreToolUseHooks,
  setHookConfigProvider,
  setHookShellPort,
  setHooksBootstrapEnv,
  type HookShellExecution,
  type HookShellPort,
} from '../../src/hooks'
import {
  executeToolUse,
  mergeHookPermission,
  createToolHooks,
  type Tool,
} from '../../src/engine'
import type { AssistantMessage, ToolUseBlock } from '../../src/shared'

// 域内面直 import（mergeAggregated/runOneHook 不进域根门面，wave0179 先例）
const { runOneHook } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../src/hooks/runHooks.js') as typeof import('../../src/hooks/runHooks.js')

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

function makeTool(name: string, calls: unknown[]): Tool {
  return {
    name,
    call: async (input: unknown) => {
      calls.push(input)
      return { data: `result:${name}` }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

/** 假 shell 端口：按序返 canned 结果（纯内存，零 spawn，engine-hooks 先例）。 */
class FakeHookShell implements HookShellPort {
  private queue: HookShellExecution[] = []
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  async runCommand(): Promise<HookShellExecution> {
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

const ASK_JSON = JSON.stringify({
  hookSpecificOutput: { permissionDecision: 'ask' },
})
const DENY_JSON = JSON.stringify({
  hookSpecificOutput: { permissionDecision: 'deny' },
})

function injectBootstrap(): void {
  setHooksBootstrapEnv({
    getSessionId: () => 'test-session',
    getCwd: () => '/tmp/proj',
    getTranscriptPath: (id: string) => `/tmp/transcript-${id}.jsonl`,
    getMainThreadAgentType: () => undefined,
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
  })
}

/** 插件钩子 matcher（loadPluginHooks convertPluginHooksToMatchers 同形）。 */
function pluginMatcher(name: string, command: string): Record<string, unknown> {
  return {
    matcher: 'echo',
    hooks: [{ type: 'command', command }],
    pluginRoot: `/plugins/${name}`,
    pluginName: name,
    pluginId: `${name}@test-mkt`,
  }
}

/** skill 钩子 matcher（registerSkillHooks 同形：skillRoot/skillName 上下文）。 */
function skillMatcher(name: string, command: string): Record<string, unknown> {
  return {
    matcher: 'echo',
    hooks: [{ type: 'command', command }],
    skillRoot: `/skills/${name}`,
    skillName: name,
  }
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

describe('K3-D D2：hooks 域来源链（真注入，①②③）', () => {
  test('① runOneHook 把 MatchedHook.source 写进 HookResult', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    const result = await runOneHook(
      {
        hook: { type: 'command', command: 'guard' },
        matcher: 'echo',
        source: 'plugin:demo-guard',
      },
      port,
      {},
      new AbortController().signal,
      {},
    )
    expect(result.permissionBehavior).toBe('ask')
    expect(result.source).toBe('plugin:demo-guard')
  })

  test('② 插件钩子 ask → 聚合面 permissionDecisionSource = plugin:<名>（全链）', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'PreToolUse' ? [pluginMatcher('demo-guard', 'guard')] : [],
    })
    const r = await runPreToolUseHooks('echo', {}, 'tu-1')
    expect(r.permissionBehavior).toBe('ask')
    expect(r.permissionDecisionSource).toBe('plugin:demo-guard')
  })

  test('②b skill 钩子同链 → skill:<名>', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'PreToolUse' ? [skillMatcher('demo-skill', 'guard')] : [],
    })
    const r = await runPreToolUseHooks('echo', {}, 'tu-1')
    expect(r.permissionBehavior).toBe('ask')
    expect(r.permissionDecisionSource).toBe('skill:demo-skill')
  })

  test('②c winner 更替：ask(plugin:a) 后 deny(skill:b) → 来源随更严 winner 更替', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    port.enqueue({ stdout: DENY_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'PreToolUse'
          ? [pluginMatcher('plugin-a', 'guard-a'), skillMatcher('skill-b', 'guard-b')]
          : [],
    })
    const r = await runPreToolUseHooks('echo', {}, 'tu-1')
    expect(r.permissionBehavior).toBe('deny')
    expect(r.permissionDecisionSource).toBe('skill:skill-b')
  })

  test('②d rank 守卫：deny(plugin:a) 先、ask(skill:b) 后 → 不更替', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: DENY_JSON, stderr: '', code: 0 })
    port.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'PreToolUse'
          ? [pluginMatcher('plugin-a', 'guard-a'), skillMatcher('skill-b', 'guard-b')]
          : [],
    })
    const r = await runPreToolUseHooks('echo', {}, 'tu-1')
    expect(r.permissionBehavior).toBe('deny')
    expect(r.permissionDecisionSource).toBe('plugin:plugin-a')
  })

  test('③ toolHooks 适配器透传：outcome.hookSource（AggregatedHookResult → pipeline 载体）', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: ASK_JSON, stderr: '', code: 0 })
    setHookShellPort(port)
    setHookConfigProvider({
      getHookMatchersForEvent: event =>
        event === 'PreToolUse' ? [pluginMatcher('demo-guard', 'guard')] : [],
    })
    const hooks = createToolHooks()
    const outcome = await hooks.preToolUse(makeTool('echo', []), {}, 'tu-1')
    expect(outcome.hookBehavior).toBe('ask')
    expect(outcome.hookSource).toBe('plugin:demo-guard')
  })
})

describe('K3-D D2：mergeHookPermission ask 支来源归附（④，纯函数矩阵）', () => {
  const GATE_ALLOW = { allowed: true }

  test('ask + plugin 来源 → 归附文案', () => {
    const v = mergeHookPermission('ask', GATE_ALLOW, undefined, 'plugin:demo-guard')
    expect(v.allowed).toBe(false)
    expect(v.ask).toBe(true)
    expect(v.reason).toBe('hook requested confirmation (from plugin:demo-guard)')
  })

  test('ask + skill 来源 → 归附文案', () => {
    const v = mergeHookPermission('ask', GATE_ALLOW, undefined, 'skill:demo-skill')
    expect(v.reason).toBe('hook requested confirmation (from skill:demo-skill)')
  })

  test('恒等锚：ask + settings 来源 → 字面逐字不变（settings 钩子零行为差）', () => {
    const v = mergeHookPermission('ask', GATE_ALLOW, undefined, 'settings')
    expect(v.reason).toBe('hook requested confirmation')
  })

  test('恒等锚：ask + 无来源（3 参既有调用面）→ 字面逐字不变', () => {
    const v = mergeHookPermission('ask', GATE_ALLOW)
    expect(v.reason).toBe('hook requested confirmation')
  })

  test('恒等锚：deny 支不归附（来源只进 ask 支文案）', () => {
    const v = mergeHookPermission('deny', GATE_ALLOW, undefined, 'plugin:demo-guard')
    expect(v.reason).toBe('blocked by hook')
  })

  test('恒等锚：defer 支挂起理由原文（不归附）', () => {
    const v = mergeHookPermission('defer', GATE_ALLOW, 'manual review', 'plugin:demo-guard')
    expect(v.deferred).toBe(true)
    expect(v.reason).toBe('manual review')
  })

  test('恒等锚：门已拒时门优先（ask + 来源不翻案门 verdict）', () => {
    const v = mergeHookPermission(
      'ask',
      { allowed: false, reason: 'read-only fs' },
      undefined,
      'plugin:demo-guard',
    )
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('read-only fs')
  })
})

describe('K3-D D2：executeToolUse 端到端（用户可见 tool_use_error 文案面）', () => {
  test('插件钩子 ask → 错误文案含来源 + 工具不执行', async () => {
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t-1', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', calls)],
      hooks: {
        preToolUse: async () => ({ hookBehavior: 'ask', hookSource: 'plugin:demo-guard' }),
      } as never,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block?.content)).toContain(
      'hook requested confirmation (from plugin:demo-guard)',
    )
    expect(calls.length).toBe(0)
  })

  test('skill 钩子 ask → 错误文案含来源', async () => {
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t-2', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', calls)],
      hooks: {
        preToolUse: async () => ({ hookBehavior: 'ask', hookSource: 'skill:demo-skill' }),
      } as never,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block?.content)).toContain(
      'hook requested confirmation (from skill:demo-skill)',
    )
  })

  test('恒等锚：无来源 ask → 字面不含 (from', async () => {
    const calls: unknown[] = []
    const r = await executeToolUse(tu('t-3', 'echo'), ASSISTANT, {
      tools: [makeTool('echo', calls)],
      hooks: { preToolUse: async () => ({ hookBehavior: 'ask' }) } as never,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block?.content)).toContain('permission confirmation required')
    expect(String(r.block?.content)).not.toContain('(from')
  })
})
