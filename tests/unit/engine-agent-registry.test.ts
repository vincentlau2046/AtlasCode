/**
 * engine/tools/agent 注册表 + 解析 + fork 机制 契约测试（§8.25 E-2 T-5c）。
 *
 * 被测能力（port 之下全真，非 tautology）：
 *   - getBuiltInAgents：默认内建注册表 + ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS 门。
 *   - parseAgentFromMarkdown：frontmatter 纯解析（name/description 必填门 / tools 列表 /
 *     model 'inherit'→继承 / 合法 role 透传 / whenToUse \n 反转义）。
 *   - getActiveAgentsFromList：优先级合并（built-in → plugin → user，后写覆盖同 agentType）。
 *   - loadAgentDefinitions：内建 + 注入自定义 → 合并（非 agent 文件静默跳过）。
 *   - fork：isForkSubagentEnabled env 门 + coordinator 互斥 / buildChildMessage 前缀稳定性 /
 *     buildForkedMessages 字节级前缀（占位 tool_result 全同，仅末位 directive 变化）/
 *     isInForkChild 递归防护 / buildWorktreeNotice。
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层；磁盘扫描抽为注入边界（InjectedAgentFile）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getBuiltInAgents,
  parseAgentFromMarkdown,
  getActiveAgentsFromList,
  loadAgentDefinitions,
  isForkSubagentEnabled,
  buildChildMessage,
  buildForkedMessages,
  isInForkChild,
  buildWorktreeNotice,
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
  GENERAL_PURPOSE_AGENT,
  AgentTool,
  getPrompt,
  formatAgentLine,
  resolveAgentTools,
  type AgentDefinition,
  type InjectedAgentFile,
} from '../../src/engine'
import type { AssistantMessage } from '../../src/shared'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'

const ENV_KEYS = [
  'ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS',
  'ATLAS_FORK_SUBAGENT',
  'ATLAS_COORDINATOR_MODE',
  'FEATURE_COORDINATOR_MODE',
] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  for (const k of ENV_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]!
  }
})

function def(agentType: string, source: AgentDefinition['source']): AgentDefinition {
  return { agentType, source, whenToUse: 'w', getSystemPrompt: () => 'p' }
}
function inj(file: Partial<InjectedAgentFile> & {
  frontmatter: Record<string, unknown>
  content: string
}): InjectedAgentFile {
  return {
    filePath: file.filePath ?? '/x/a.md',
    baseDir: file.baseDir ?? '/x',
    source: file.source ?? 'user',
    ...file,
  } as InjectedAgentFile
}

describe('getBuiltInAgents（内建注册表 + disable 门）', () => {
  test('① 默认 → 兜底 general-purpose（单一内建，其余残留守）', () => {
    const agents = getBuiltInAgents()
    expect(agents.map((a) => a.agentType)).toEqual(['general-purpose'])
    expect(agents[0]).toBe(GENERAL_PURPOSE_AGENT)
  })
  test('② ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1 → 空注册表', () => {
    process.env.ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS = '1'
    expect(getBuiltInAgents()).toEqual([])
  })
})

describe('parseAgentFromMarkdown（frontmatter 纯解析）', () => {
  test('① 合法（name + description + tools 逗号串）', () => {
    const a = parseAgentFromMarkdown(
      inj({ frontmatter: { name: 'reviewer', description: 'Reviews code', tools: 'Read, Grep' }, content: 'Be a reviewer.' }),
    )!
    expect(a.agentType).toBe('reviewer')
    expect(a.whenToUse).toBe('Reviews code')
    expect(a.tools).toEqual(['Read', 'Grep'])
    expect(a.source).toBe('user')
    expect(a.getSystemPrompt()).toBe('Be a reviewer.')
  })
  test('② 缺 name → null（静默跳过非 agent 文档）', () => {
    expect(parseAgentFromMarkdown(inj({ frontmatter: { description: 'x' }, content: 'c' }))).toBeNull()
  })
  test('③ 缺 description → null', () => {
    expect(parseAgentFromMarkdown(inj({ frontmatter: { name: 'x' }, content: 'c' }))).toBeNull()
  })
  test('④ tools 数组形态 + disallowedTools', () => {
    const a = parseAgentFromMarkdown(
      inj({ frontmatter: { name: 'a', description: 'd', tools: ['Read', 'Edit'], disallowedTools: 'Bash' }, content: 'c' }),
    )!
    expect(a.tools).toEqual(['Read', 'Edit'])
    expect(a.disallowedTools).toEqual(['Bash'])
  })
  test('⑤ model "inherit" → undefined（继承父 role）', () => {
    const a = parseAgentFromMarkdown(
      inj({ frontmatter: { name: 'a', description: 'd', model: 'inherit' }, content: 'c' }),
    )!
    expect(a.model).toBeUndefined()
  })
  test('⑥ model 合法 role 透传（premium）', () => {
    const a = parseAgentFromMarkdown(
      inj({ frontmatter: { name: 'a', description: 'd', model: 'premium' }, content: 'c' }),
    )!
    expect(a.model).toBe('premium')
  })
  test('⑦ model 非法值 → undefined（回落继承）', () => {
    const a = parseAgentFromMarkdown(
      inj({ frontmatter: { name: 'a', description: 'd', model: 'gpt-x' }, content: 'c' }),
    )!
    expect(a.model).toBeUndefined()
  })
  test('⑧ whenToUse 的 \\n 反转义为换行', () => {
    const a = parseAgentFromMarkdown(
      inj({ frontmatter: { name: 'a', description: 'line1\\nline2' }, content: 'c' }),
    )!
    expect(a.whenToUse).toBe('line1\nline2')
  })
})

describe('getActiveAgentsFromList（优先级合并：built-in → plugin → user）', () => {
  test('① 同 agentType 后写组覆盖（user 胜 built-in）', () => {
    const merged = getActiveAgentsFromList([
      def('gp', 'built-in'),
      def('gp', 'user'),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('user')
  })
  test('② 三组同 agentType → user 最终胜（plugin 居中）', () => {
    const merged = getActiveAgentsFromList([
      def('x', 'built-in'),
      def('x', 'plugin'),
      def('x', 'user'),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].source).toBe('user')
  })
  test('③ 不同 agentType 全保留', () => {
    const merged = getActiveAgentsFromList([def('a', 'built-in'), def('b', 'user')])
    expect(merged.map((a) => a.agentType).sort()).toEqual(['a', 'b'])
  })
})

describe('loadAgentDefinitions（内建 + 注入自定义 → 合并）', () => {
  test('① 无注入 → 仅内建 general-purpose', () => {
    expect(loadAgentDefinitions([]).map((a) => a.agentType)).toEqual(['general-purpose'])
  })
  test('② 注入 user agent（新 agentType）→ 内建 + 自定义并存', () => {
    const agents = loadAgentDefinitions([
      inj({ frontmatter: { name: 'custom', description: 'c' }, content: 'cp' }),
    ])
    expect(agents.map((a) => a.agentType).sort()).toEqual(['custom', 'general-purpose'])
  })
  test('③ 注入 user 覆盖内建同 agentType（user 胜）', () => {
    const agents = loadAgentDefinitions([
      inj({ frontmatter: { name: 'general-purpose', description: 'override' }, content: 'cp' }),
    ])
    const gp = agents.find((a) => a.agentType === 'general-purpose')!
    expect(gp.source).toBe('user')
    expect(gp.whenToUse).toBe('override')
  })
  test('④ 非 agent 文件（缺 name）静默跳过', () => {
    const agents = loadAgentDefinitions([
      inj({ frontmatter: { description: 'no name' }, content: 'c' }),
    ])
    expect(agents.map((a) => a.agentType)).toEqual(['general-purpose'])
  })
  test('⑤ disable 门 → 内建空，仅保留注入自定义', () => {
    process.env.ATLAS_AGENT_SDK_DISABLE_BUILTIN_AGENTS = '1'
    const agents = loadAgentDefinitions([
      inj({ frontmatter: { name: 'custom', description: 'c' }, content: 'cp' }),
    ])
    expect(agents.map((a) => a.agentType)).toEqual(['custom'])
  })
})

describe('fork：isForkSubagentEnabled（env 门 + coordinator 互斥）', () => {
  test('① env 未设 → false', () => {
    expect(isForkSubagentEnabled()).toBe(false)
  })
  test('② ATLAS_FORK_SUBAGENT=1 → true', () => {
    process.env.ATLAS_FORK_SUBAGENT = '1'
    expect(isForkSubagentEnabled()).toBe(true)
  })
  test('③ fork + coordinator 同开 → false（互斥）', () => {
    process.env.ATLAS_FORK_SUBAGENT = '1'
    process.env.ATLAS_COORDINATOR_MODE = '1'
    expect(isForkSubagentEnabled()).toBe(false)
  })
})

describe('fork：buildChildMessage（boilerplate 前缀稳定）', () => {
  test('① 含 fork-boilerplate 标签 + directive 前缀', () => {
    const msg = buildChildMessage('do X')
    expect(msg.startsWith(`<${FORK_BOILERPLATE_TAG}>`)).toBe(true)
    expect(msg.endsWith(`${FORK_DIRECTIVE_PREFIX}do X`)).toBe(true)
    expect(msg).toContain('You are a forked worker process')
  })
  test('② 确定性（同 directive 两次一致；不同 directive 仅末段差异）', () => {
    expect(buildChildMessage('a')).toBe(buildChildMessage('a'))
    const a = buildChildMessage('aaa')
    const b = buildChildMessage('bbb')
    // 公共前缀（boilerplate 全段）相同，仅 directive 段不同
    const commonLen = FORK_DIRECTIVE_PREFIX.length
    expect(a.slice(0, a.indexOf(FORK_DIRECTIVE_PREFIX))).toBe(b.slice(0, b.indexOf(FORK_DIRECTIVE_PREFIX)))
    expect(a.slice(-commonLen - 3)).toBe(`${FORK_DIRECTIVE_PREFIX}aaa`)
  })
})

describe('fork：buildForkedMessages（字节级前缀 + 占位 tool_result）', () => {
  const asst: AssistantMessage = {
    type: 'assistant',
    role: 'assistant',
    uuid: 'orig',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } },
        { type: 'tool_use', id: 't2', name: 'Grep', input: { q: 'x' } },
        { type: 'text', text: 'thinking' },
      ],
    },
  }
  test('① 有 tool_use → [assistant 克隆, user(占位 tool_result×N + directive)]', () => {
    const [a, u] = buildForkedMessages('do it', asst)
    expect(a.uuid).not.toBe('orig') // 克隆不突变原消息
    expect((a.message as { content: unknown[] }).content).toHaveLength(3)
    const blocks = (u.message as { content: unknown[] }).content as Array<{
      type: string
      tool_use_id?: string
      content?: Array<{ type: string; text: string }>
    }>
    expect(blocks[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 't1',
      content: [{ type: 'text', text: 'Fork started — processing in background' }],
    })
    expect(blocks[1].tool_use_id).toBe('t2')
    expect(blocks[1].content).toEqual([
      { type: 'text', text: 'Fork started — processing in background' },
    ])
    expect(blocks[2].type).toBe('text')
    expect(blocks[2].text).toBe(buildChildMessage('do it'))
  })
  test('② 字节级前缀：不同 directive 仅末位 text 块差异（占位前缀全同）', () => {
    const rA = buildForkedMessages('AAA', asst)
    const rB = buildForkedMessages('BBB', asst)
    const cA = (rA[1].message as { content: unknown[] }).content as unknown[]
    const cB = (rB[1].message as { content: unknown[] }).content as unknown[]
    // 前 N-1 块（占位 tool_result）字节相同
    expect(cA.slice(0, -1)).toEqual(cB.slice(0, -1))
    // 仅末位 directive 文本块不同
    expect((cA.at(-1) as { text: string }).text).not.toBe((cB.at(-1) as { text: string }).text)
  })
  test('③ 无 tool_use → 单条 user 消息（仅 directive 文本块）', () => {
    const textOnly: AssistantMessage = {
      type: 'assistant',
      role: 'assistant',
      uuid: 'o2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'no tools' }] },
    }
    const [only] = buildForkedMessages('d', textOnly)
    expect(only.type).toBe('user')
    const blocks = (only.message as { content: unknown[] }).content as Array<{ type: string }>
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
  })
})

describe('fork：isInForkChild + buildWorktreeNotice', () => {
  test('① 历史含 fork-boilerplate 的 user 消息 → true', () => {
    const msgs = [
      {
        type: 'user',
        role: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: buildChildMessage('x') }],
        },
      },
    ]
    expect(isInForkChild(msgs)).toBe(true)
  })
  test('② 无标记 → false', () => {
    const msgs = [{ type: 'user', role: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }]
    expect(isInForkChild(msgs)).toBe(false)
  })
  test('③ 顶层 content 字符串形态亦识别', () => {
    const msgs = [{ type: 'user', role: 'user', content: `<${FORK_BOILERPLATE_TAG}> hi` }]
    expect(isInForkChild(msgs)).toBe(true)
  })
  test('④ buildWorktreeNotice 含两 cwd', () => {
    const n = buildWorktreeNotice('/parent', '/wt')
    expect(n).toContain('/parent')
    expect(n).toContain('/wt')
    expect(n).toContain('isolated git worktree')
  })
})

// ── F-2：whenToUse / tools 经清单面消费（formatAgentLine / getPrompt）+ 注册表解析 ──
function fakeTerminalProvider(): ModelProvider {
  const unused = async () => {
    throw new Error('fake ModelProvider: 方法未被消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'u1',
      timestamp: '2026-09-23T00:00:00Z',
      message: {
        id: 'm1',
        model: 'fake',
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }),
    chatStream: unused as unknown as ModelProvider['chatStream'],
    healthCheck: unused as unknown as ModelProvider['healthCheck'],
    countTokens: unused as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: unused as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: unused as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

describe('getPrompt / formatAgentLine（F-2：whenToUse + tools 清单消费）', () => {
  test('① formatAgentLine 渲染 `- type: whenToUse (Tools: ...)`', () => {
    const line = formatAgentLine(GENERAL_PURPOSE_AGENT)
    expect(line.startsWith('- general-purpose: ')).toBe(true)
    expect(line).toContain(GENERAL_PURPOSE_AGENT.whenToUse)
    expect(line).toContain('(Tools: *)') // tools ['*'] → 逐字 join（旧仓同义，非归一为 All tools）
  })
  test('② tools 白名单 + 禁用集 → 有效工具描述', () => {
    const line = formatAgentLine({
      agentType: 'custom',
      whenToUse: 'w',
      source: 'user',
      tools: ['Read', 'Edit', 'Grep'],
      disallowedTools: ['Grep'],
      getSystemPrompt: () => '',
    })
    expect(line).toContain('(Tools: Read, Edit)') // 白名单按禁用集过滤
  })
  test('③ getPrompt(内建表) 含 general-purpose + whenToUse（清单非空）', async () => {
    const desc = await AgentTool.description(undefined, {
      isNonInteractiveSession: false,
      toolPermissionContext: null,
      tools: [],
    })
    expect(desc).toContain('general-purpose')
    expect(desc).toContain(GENERAL_PURPOSE_AGENT.whenToUse)
  })
  test('④ getPrompt([]) 回退 general-purpose 占位行', () => {
    expect(getPrompt([])).toContain('general-purpose')
  })
})

describe('AgentTool.call 注册表解析（F-2/F-10：已知/未知 subagent_type）', () => {
  test('① 已知 subagent_type=general-purpose → 注册表 agent（agentType 保留）', async () => {
    const res = await AgentTool.call(
      { description: 'x', prompt: 'p', subagent_type: 'general-purpose' },
      { modelProvider: fakeTerminalProvider(), parentRole: 'small' as ModelRole },
      undefined,
      undefined,
    )
    expect((res.data as { agentType?: string }).agentType).toBe('general-purpose')
  })
  test('② 未知 subagent_type → 回落 general-purpose 语义但保留请求 type 名', async () => {
    const res = await AgentTool.call(
      { description: 'x', prompt: 'p', subagent_type: 'weird-custom' },
      { modelProvider: fakeTerminalProvider(), parentRole: 'small' as ModelRole },
      undefined,
      undefined,
    )
    expect((res.data as { agentType?: string }).agentType).toBe('weird-custom')
  })
})

// ── F-3：frontmatter tools 列表解析（通配归一 / 空 / 非串）──
describe('parseAgentFromMarkdown tools 列表（F-3 通配归一 + 极性）', () => {
  test('① tools: "*" → undefined（全量，resolveAgentTools 判通配）', () => {
    const a = parseAgentFromMarkdown(inj({ frontmatter: { name: 'a', description: 'd', tools: '*' }, content: 'c' }))!
    expect(a.tools).toBeUndefined()
    const r = resolveAgentTools(a, []) // 空工具池：通配判定不依赖具体工具
    expect(r.hasWildcard).toBe(true)
  })
  test('② tools: "Read, *" 含通配 → undefined（全量，非仅 Read）', () => {
    const a = parseAgentFromMarkdown(inj({ frontmatter: { name: 'a', description: 'd', tools: 'Read, *' }, content: 'c' }))!
    expect(a.tools).toBeUndefined()
  })
  test('③ tools: "Read, Edit" → 按名列表', () => {
    const a = parseAgentFromMarkdown(inj({ frontmatter: { name: 'a', description: 'd', tools: 'Read, Edit' }, content: 'c' }))!
    expect(a.tools).toEqual(['Read', 'Edit'])
  })
  test('④ tools: "" 空串 → []（无工具）', () => {
    const a = parseAgentFromMarkdown(inj({ frontmatter: { name: 'a', description: 'd', tools: '' }, content: 'c' }))!
    expect(a.tools).toEqual([])
  })
  test('⑤ tools 非串非数组（数字）→ []（无工具）', () => {
    const a = parseAgentFromMarkdown(inj({ frontmatter: { name: 'a', description: 'd', tools: 5 }, content: 'c' }))!
    expect(a.tools).toEqual([])
  })
  test('⑥ tools 缺省 → undefined（全量）', () => {
    const a = parseAgentFromMarkdown(inj({ frontmatter: { name: 'a', description: 'd' }, content: 'c' }))!
    expect(a.tools).toBeUndefined()
  })
})
