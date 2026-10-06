/**
 * E-4 S-4d engine 接线判别信号测试（§8.36）。
 *
 * 被测能力 = 权限面到 engine 的三处真接线（非 tautology，断言的是接缝被消费）：
 *   ① createPermissionGate（域规则求值树 → pipeline PermissionGate 3 值 verdict）
 *      × executeToolUse 映射支（deny → is_error `permission denied`；
 *      ask → fail-closed is_error + 确认标记）× queryOneRound deps 透传。
 *   ② getTools / filterToolsByDenyRules（deny 规则工具面过滤：blanket 名 +
 *      MCP server 级剥整 server）。
 *   ④ resolveAgentTools spec / disallowedTools 经域 permissionRuleValueFromString
 *      解析（旧仓 verbatim；红绿对照 = S-2 split(':') 截断固有误判面）。
 *   S-E1（E-wave-end，§8.52 A1/A2/A3）：
 *   - I-1 换回：门消费 base hasPermissionsToUseTool 全决策体（mode-level 支
 *     2a / 3 落 ask fail-closed / 门 updatedInput 采纳 executeToolUse call 入参）。
 *   - F1 子代理门透传：runAgent checkPermission → queryAgentLoop deps →
 *     子 loop 工具执行同门（deny 规则子 loop 可观察）。
 *   - F4 abort 重抛：1c catch 形判别（DOMException AbortError /
 *     APIUserAbortError 重抛 = 控制流；非 abort 吞掉 = 工具错误）。
 *
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。fake 仅 LLM（ModelProvider 替身）
 * + 最小 Tool（shared Tool.call 契约），非 fake 自证。
 */
import { describe, test, expect } from 'bun:test'
import {
  AgentTool,
  createDontAskTpc,
  createPermissionGate,
  executeToolUse,
  GENERAL_PURPOSE_AGENT,
  getTools,
  queryOneRound,
  resolveAgentTools,
  runAgent,
  type Tool,
} from '../../src/engine'
import { resolveHeadlessTpc } from '../../src/cli/print'
import {
  initDebugSink,
  resetDebugSinkForTesting,
} from '../../src/cli/debugSink'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import { APIUserAbortError } from '../../src/modelprovider/types'
import {
  checkRuleBasedPermissions,
  hasPermissionsToUseTool,
  isAbortShapedError,
  type PermissionTool,
} from '../../src/permissions'
import type {
  AssistantMessage,
  ToolPermissionContext,
  ToolUseBlock,
} from '../../src/shared'

/** 最小 ToolPermissionContext（域 readonly 版，session 源规则；S-E1 起带 mode 支）。 */
function ctx(
  deny: string[] = [],
  ask: string[] = [],
  mode: ToolPermissionContext['mode'] = 'default',
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: deny.length ? { session: deny } : {},
    alwaysAskRules: ask.length ? { session: ask } : {},
    isBypassPermissionsModeAvailable: false,
  }
}

/** 最小 fake tool（shared Tool 契约消费字段：name/isEnabled/call/mapResult；
 * S-E1 扩 checkPermissions 鸭子支 + recordInput call 入参捕获 + calls 调用记录）。 */
function makeTool(
  name: string,
  opts?: {
    mcpInfo?: { serverName: string; toolName: string }
    enabled?: boolean
    checkPermissions?: () => Promise<unknown> | unknown
    recordInput?: (input: unknown) => void
    calls?: string[]
  },
): Tool {
  return {
    name,
    ...(opts?.mcpInfo ? { mcpInfo: opts.mcpInfo } : {}),
    ...(opts?.checkPermissions ? { checkPermissions: opts.checkPermissions } : {}),
    isConcurrencySafe: () => false,
    isEnabled: () => opts?.enabled ?? true,
    call: async (input: unknown) => {
      opts?.calls?.push(name)
      opts?.recordInput?.(input)
      return { data: `ok:${name}` }
    },
    mapToolResultToToolResultBlockParam: (c: unknown, id: string) => ({
      type: 'tool_result',
      tool_use_id: id,
      content: String(c),
    }),
  } as unknown as Tool
}

/** 多轮 fake LLM（脚本式；ModelProvider 接口替身，同 engine-agent-tool 口径）。 */
interface ScriptStep {
  content: unknown[]
  stopReason?: string
}
function fakeProviderSteps(steps: ScriptStep[]): ModelProvider {
  let i = 0
  const unused = async () => {
    throw new Error('fake ModelProvider: 方法未被多轮 loop 消费')
  }
  return {
    chat: async () => {
      const step = steps[Math.min(i, steps.length - 1)]
      i++
      return {
        type: 'assistant',
        uuid: 'u' + i,
        timestamp: '2026-09-24T00:00:00Z',
        message: {
          id: 'm' + i,
          model: 'fake',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: unused as unknown as ModelProvider['chatStream'],
    healthCheck: unused as unknown as ModelProvider['healthCheck'],
    countTokens: unused as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: unused as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: unused as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  } as unknown as ModelProvider
}

function tu(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { type: 'tool_use', id, name, input }
}

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-24T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

/** fake LLM：固定返 content（ModelProvider 接口替身，同 engine-query-loop 口径）。 */
function fakeProvider(content: unknown[]): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被单轮 loop 消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'u-1',
      timestamp: '2026-09-24T00:00:00Z',
      message: {
        id: 'm-1',
        model: 'fake',
        role: 'assistant',
        content,
        stop_reason: 'tool_calls',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
    chatStream: notExercised,
    healthCheck: notExercised,
    countTokens: notExercised,
    listModels: async () => [],
    transcribeAudio: notExercised,
    synthesizeSpeech: notExercised,
    verifyKey: async () => true,
  } as unknown as ModelProvider
}

describe('① 权限门工厂 × 执行链映射 × loop 透传（3 值 verdict）', () => {
  test('①a 对照：未注入门 → 工具真执行（窄 spine 默认放行不变）', async () => {
    const r = await executeToolUse(tu('t1', 'echo'), ASSISTANT, {
      tools: [makeTool('echo')],
    })
    expect(r.isError).toBe(false)
    expect(r.block.content).toBe('ok:echo')
  })

  test('①b 门 + deny 规则 → is_error `permission denied`（门真被域规则树驱动）', async () => {
    const gate = createPermissionGate(ctx(['Bash']))
    const r = await executeToolUse(tu('t2', 'Bash'), ASSISTANT, {
      tools: [makeTool('Bash')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain('permission denied')
  })

  test('①c 门 + ask 规则 → fail-closed is_error + 确认标记（静默执行 = 安全洞）', async () => {
    const gate = createPermissionGate(ctx([], ['Bash']))
    const r = await executeToolUse(tu('t3', 'Bash'), ASSISTANT, {
      tools: [makeTool('Bash')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain(
      'permission confirmation required',
    )
  })

  test('①d loop 透传：queryOneRound deps.checkPermission 真接线（唯一点）', async () => {
    const gate = createPermissionGate(ctx(['echo']))
    const r = await queryOneRound(
      {
        modelProvider: fakeProvider([
          { type: 'tool_use', id: 'tu-1', name: 'echo', input: {} },
        ]),
        role: 'small' as ModelRole,
        checkPermission: gate,
      },
      [makeTool('echo')],
      [],
    )
    // loop toolResults 项 = { toolUseId, name, block }（无 isError 字段，
    // 判别信号在 block.is_error 上——pipeline 映射支产物）
    expect(r.toolResults).toHaveLength(1)
    expect(r.toolResults[0].block.is_error).toBe(true)
    expect(String(r.toolResults[0].block.content)).toContain(
      'permission denied',
    )
  })
})

describe('② deny 规则工具面过滤（getTools 池 + MCP server 级）', () => {
  test('②a blanket deny `Bash` → 池剔除 Bash，Read 保留', () => {
    const pool = getTools(ctx(['Bash']), {
      baseTools: [makeTool('Bash'), makeTool('Read')],
    })
    const names = pool.map(t => t.name)
    expect(names).not.toContain('Bash')
    expect(names).toContain('Read')
  })

  test('②b MCP server 级 deny `mcp__srv` → 剥整 server，他 server 保留', () => {
    const pool = getTools(ctx(['mcp__srv']), {
      mcpTools: [
        makeTool('mcp__srv__fetch', { serverName: 'srv', toolName: 'fetch' }),
        makeTool('mcp__other__x', { serverName: 'other', toolName: 'x' }),
      ],
    })
    const names = pool.map(t => t.name)
    expect(names).not.toContain('mcp__srv__fetch')
    expect(names).toContain('mcp__other__x')
  })

  test('②c 禁用工具（isEnabled false）不进池（旧 getTools 尾行过滤，§8.37 F2 回归）', () => {
    const pool = getTools(ctx(), {
      baseTools: [makeTool('Disabled', { enabled: false }), makeTool('Enabled')],
    })
    const names = pool.map(t => t.name)
    expect(names).not.toContain('Disabled')
    expect(names).toContain('Enabled')
  })
})

describe('④ resolveAgentTools spec 解析（域 parser 替 split(\':\') 截断）', () => {
  test('④a spec `Bash(npm install)` → validTools 保留 ruleContent 原串', () => {
    const r = resolveAgentTools(
      { tools: ['Bash(npm install)'], source: 'built-in' },
      [makeTool('Bash'), makeTool('Read')],
    )
    expect(r.validTools).toEqual(['Bash(npm install)'])
    expect(r.invalidTools).toEqual([])
    expect(r.resolvedTools.map(t => t.name)).toEqual(['Bash'])
  })

  test('④b disallowedTools `Bash(*)` → Bash 工具级剔除（非字面名匹配）', () => {
    const r = resolveAgentTools(
      { tools: undefined, disallowedTools: ['Bash(*)'], source: 'built-in' },
      [makeTool('Bash'), makeTool('Read')],
    )
    expect(r.hasWildcard).toBe(true)
    expect(r.resolvedTools.map(t => t.name)).toEqual(['Read'])
  })
})

/** S-E1（E-wave-end，§8.52 A1）：门消费面由规则支 checkRuleBasedPermissions
 * 换回 base hasPermissionsToUseTool 全决策体（E-6 M-1 消费面事实订正换回项）。
 * 判别信号 = 换回前规则支不覆盖的支路在门上变活：
 *   - default 态无规则 + 上下文已注入 → 3 落 ask（fail-closed；换回前
 *     规则支 null = 无规则反对 → 放行）
 *   - 2a mode-level 支（bypassPermissions 态 → allow；换回前门不读 mode）
 *   - 1c 工具面 allow + updatedInput → 门改写 call 入参（executeToolUse
 *     采纳 verdict.updatedInput，门晚于 hook last wins）
 */
describe('S-E1 I-1 门全决策体（I-1 换回，§8.52 A1）', () => {
  test('I-1a default 态无规则 + 上下文注入 → 3 落 ask fail-closed（换回前此路放行）', async () => {
    const gate = createPermissionGate(ctx())
    const r = await executeToolUse(tu('i1', 'Read'), ASSISTANT, {
      tools: [makeTool('Read')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain(
      'permission confirmation required',
    )
  })

  test('I-1b 2a mode-level：bypassPermissions 态 → allow（门读 mode 支）', async () => {
    const gate = createPermissionGate(ctx([], [], 'bypassPermissions'))
    const r = await executeToolUse(tu('i2', 'Read'), ASSISTANT, {
      tools: [makeTool('Read')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(false)
    expect(r.block.content).toBe('ok:Read')
  })

  test('I-1c 工具面 1c allow + updatedInput → 门改写 call 入参（call 收到改写后入参）', async () => {
    const inputs: unknown[] = []
    const tool = makeTool('Write', {
      checkPermissions: async () => ({
        behavior: 'allow',
        updatedInput: { path: '/rewritten' },
        message: 'tool checkPermissions allow',
      }),
      recordInput: (i) => inputs.push(i),
    })
    const gate = createPermissionGate(ctx())
    const r = await executeToolUse(
      tu('i3', 'Write', { path: '/original' }),
      ASSISTANT,
      { tools: [tool], checkPermission: gate },
    )
    expect(r.isError).toBe(false)
    // 门（全决策体 1c allow + updatedInput）改写 call 入参，tool.call 收到的
    // 是 /rewritten 而非 tu 原入参 /original（verdict.updatedInput ?? effectiveInput）
    expect(inputs).toEqual([{ path: '/rewritten' }])
  })
})

/** S-E1 F1（§8.52 A2）：子代理门透传——父 loop 门经 pipeline call context
 * （AgentTool 消费）→ RunAgentArgs.checkPermission → queryAgentLoop deps →
 * 子 loop 工具执行同门。判别 = 同规则树在子 loop 可观察（deny 规则子 loop
 * 工具 is_error），对照无门 = 窄 spine 默认放行（与父 loop 未注门语义对齐）。
 * F-1c（审视 N-4 补）钉链前两跳：executeToolUse call context 塞入 →
 * AgentTool ctx.checkPermission 转发 → runAgent。
 */
describe('S-E1 F1 子代理门透传（runAgent，§8.52 A2）', () => {
  const steps: ScriptStep[] = [
    {
      content: [
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
      ],
      stopReason: 'tool_calls',
    },
    { content: [{ type: 'text', text: 'done' }] },
  ]

  test('F-1a 门 deny 规则 → 子 loop 工具 is_error `permission denied`（门真达子 loop）', async () => {
    const gate = createPermissionGate(ctx(['Bash']))
    const r = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'list files',
      tools: [makeTool('Bash')],
      modelProvider: fakeProviderSteps(steps),
      parentRole: 'small',
      agentId: 'a-f1a',
      checkPermission: gate,
    })
    const dump = JSON.stringify(r.messages)
    expect(dump).toContain('permission denied')
    // 被拒工具未真执行（makeTool call 回显 ok:Bash 不出现在子 loop 消息序列）
    expect(dump).not.toContain('ok:Bash')
  })

  test('F-1b 对照：未注入门 → 子 loop 窄 spine 默认放行（工具真执行）', async () => {
    const r = await runAgent({
      agentDefinition: GENERAL_PURPOSE_AGENT,
      prompt: 'list files',
      tools: [makeTool('Bash')],
      modelProvider: fakeProviderSteps(steps),
      parentRole: 'small',
      agentId: 'a-f1b',
    })
    const dump = JSON.stringify(r.messages)
    expect(dump).toContain('ok:Bash')
    expect(dump).not.toContain('permission denied')
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(2)
  })

  test('F-1c AgentTool.call context 转发跳（审视 N-4）：带门 → 子 loop 拒执行 / 不带门 → 真执行', async () => {
    const gateSteps: ScriptStep[] = [
      {
        content: [{ type: 'tool_use', id: 't1', name: 'Grep', input: { q: 'x' } }],
        stopReason: 'tool_calls',
      },
      { content: [{ type: 'text', text: 'done' }] },
    ]
    const gate = createPermissionGate(ctx(['Grep']))
    const denied: string[] = []
    await AgentTool.call(
      { description: 'find', prompt: 'find x' },
      {
        modelProvider: fakeProviderSteps(gateSteps),
        parentRole: 'small',
        tools: [makeTool('Grep', { calls: denied })],
        checkPermission: gate,
      },
      undefined,
      undefined,
    )
    // 门经 call context 转发到子 loop（F1 链前两跳：executeToolUse 塞入 →
    // AgentTool 转发）→ deny 规则 Grep 被拒，工具真未执行
    expect(denied).toEqual([])
    const allowed: string[] = []
    await AgentTool.call(
      { description: 'find', prompt: 'find x' },
      {
        modelProvider: fakeProviderSteps(gateSteps),
        parentRole: 'small',
        tools: [makeTool('Grep', { calls: allowed })],
      },
      undefined,
      undefined,
    )
    // 对照：未注入门 = 子 loop 窄 spine 放行，工具真执行
    expect(allowed).toEqual(['Grep'])
  })
})

/** S-E1 F4（§8.52 A3）：1c catch abort 重抛——abort 是控制流非工具错误，
 * 吞掉 = 用户取消失效（旧仓 catch `if (isAbortError(e)) throw e` 逐字语义）。
 * 新仓双支形判别（DEP-2 C-Deep 禁 permissions 域 import modelprovider 值）：
 * DOMException name==='AbortError' 支 + constructor.name==='APIUserAbortError' 支。
 */
describe('S-E1 F4 abort 重抛（1c catch 控制流，§8.52 A3）', () => {
  test('F-4a 形判别：DOMException AbortError / APIUserAbortError 真；普通 Error / 非 Error 假', () => {
    expect(isAbortShapedError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortShapedError(new APIUserAbortError('user aborted'))).toBe(true)
    expect(isAbortShapedError(new Error('boom'))).toBe(false)
    expect(isAbortShapedError('not-an-error')).toBe(false)
  })

  test('F-4b 决策体：工具面 checkPermissions 抛 APIUserAbortError → hasPermissionsToUseTool 重抛', async () => {
    const tool = {
      name: 'Bash',
      checkPermissions: async () => {
        throw new APIUserAbortError('user aborted')
      },
    } as unknown as PermissionTool
    await expect(
      hasPermissionsToUseTool(tool, {}, { getToolPermissionContext: () => ctx() }),
    ).rejects.toBeInstanceOf(APIUserAbortError)
  })

  test('F-4c 原生 abort 面：DOMException(AbortError) 重抛', async () => {
    const tool = {
      name: 'Bash',
      checkPermissions: async () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
    } as unknown as PermissionTool
    await expect(
      hasPermissionsToUseTool(tool, {}, { getToolPermissionContext: () => ctx() }),
    ).rejects.toThrow('The operation was aborted.')
  })

  test('F-4d 非 abort 工具错误吞掉（1c 落 passthrough → 3 ask，控制流与工具错误分治）', async () => {
    const tool = {
      name: 'Bash',
      checkPermissions: async () => {
        throw new Error('tool broken')
      },
    } as unknown as PermissionTool
    const d = await hasPermissionsToUseTool(tool, {}, {
      getToolPermissionContext: () => ctx(),
    })
    expect(d.behavior).toBe('ask')
  })

  test('F-4e checkRuleBasedPermissions 镜像：abort 重抛 / 非 abort → null（无规则反对）', async () => {
    const abortTool = {
      name: 'Bash',
      checkPermissions: async () => {
        throw new APIUserAbortError('user aborted')
      },
    } as unknown as PermissionTool
    await expect(
      checkRuleBasedPermissions(abortTool, {}, {
        getToolPermissionContext: () => ctx(),
      }),
    ).rejects.toBeInstanceOf(APIUserAbortError)

    const plainTool = {
      name: 'Bash',
      checkPermissions: async () => {
        throw new Error('tool broken')
      },
    } as unknown as PermissionTool
    const r = await checkRuleBasedPermissions(plainTool, {}, {
      getToolPermissionContext: () => ctx(),
    })
    expect(r).toBeNull()
  })
})

/** P4（0.1.37 ④，trace 分析 P4 [MED]）：「无 TPC = allow」薄骨架默认硬化
 * （静默全放行风险）——headless lane fail-closed 处置三件：
 *   ① createPermissionGate 缺失 TPC warn 启动日志（gate 侧 shared logging
 *     port 前向接缝，C-4 占位 no-op，port 定案后自动活）
 *   ② headless lane 显式注入 dontAsk 语义 TPC（createDontAskTpc，deepseek
 *     'never' 策略：无交互应答者 = 确定性 deny；域决策体 applyDontAskMode
 *     将 dontAsk 态 ask 统一转 deny = DONT_ASK_REJECT_MESSAGE）
 *   ③ resolveHeadlessTpc 缺失支 = dontAsk TPC + 自家 sink warn 启动日志
 * 本测面 = 行为 ①（dontAsk gate → deny）+ 对照（default gate → ask 不变）
 * + ③（resolveHeadlessTpc 缺失支 warn + 原引用透传支）。 */
describe('P4（0.1.37 ④）TPC 缺失 fail-closed（headless dontAsk）', () => {
  test('P4a dontAsk TPC → ask 决策转 deny（确定性拒绝，don\'t ask 措辞）', async () => {
    const gate = createPermissionGate(createDontAskTpc())
    const r = await executeToolUse(tu('p4a', 'Bash'), ASSISTANT, {
      tools: [makeTool('Bash')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    const body = String(r.block.content)
    expect(body).toContain('permission denied')
    expect(body).toContain("don't ask mode")
  })

  test('P4b 对照：default TPC 无规则 → ask fail-closed（交互 lane 语义不变）', async () => {
    const gate = createPermissionGate(ctx())
    const r = await executeToolUse(tu('p4b', 'Bash'), ASSISTANT, {
      tools: [makeTool('Bash')],
      checkPermission: gate,
    })
    expect(r.isError).toBe(true)
    expect(String(r.block.content)).toContain(
      'permission confirmation required',
    )
  })

  test('P4c resolveHeadlessTpc 缺失支 → dontAsk TPC + warn 启动日志（stderr 同步捕获）；在场支 = 原引用透传 + 零日志', () => {
    const captured: string[] = []
    const origStderrWrite = process.stderr.write
    process.stderr.write = ((s: string | Uint8Array) => {
      captured.push(String(s))
      return true
    }) as typeof process.stderr.write
    const savedArgv = [...process.argv]
    process.argv = savedArgv.slice(0, 2).concat(['--debug-to-stderr'])
    resetDebugSinkForTesting()
    initDebugSink()
    try {
      const tpc = resolveHeadlessTpc(undefined)
      expect(tpc.mode).toBe('dontAsk')
      const joined = captured.join('')
      expect(joined).toContain('[WARN]')
      expect(joined).toContain('TPC 缺失')
      // 在场 TPC = 原引用透传 + 不触发 warn（热路径零噪声）
      const real = ctx()
      expect(resolveHeadlessTpc(real)).toBe(real)
      expect(captured.join('')).toBe(joined)
    } finally {
      resetDebugSinkForTesting()
      process.argv = savedArgv
      process.stderr.write = origStderrWrite
    }
  })
})
