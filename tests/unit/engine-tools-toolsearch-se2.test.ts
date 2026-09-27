/**
 * engine/tools/toolsearch S-E2（§8.63）unit 层（零盘零模型）：ToolSearch
 * 工具对象面 + schema 面 + 门控面（getToolSearchMode 6 态 +
 * isToolSearchEnabledOptimistic 8 面）+ isDeferredTool 5 面 + call
 * select:/keyword 评分面 + memo 失效面 + mapToolResult 3 面 + render/
 * userFacingName/classifier 面。
 *
 * env 戳（3 戳 + 文件级还原，per-file 进程隔离）：ATLAS_ENABLE_TOOL_
 * SEARCH / ATLAS_DISABLE_EXPERIMENTAL_BETAS / OPENAI_BASE_URL。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  clearToolSearchDescriptionCache,
  getToolSearchMode,
  isDeferredTool,
  isToolSearchEnabledOptimistic,
  ToolSearchTool,
  TOOL_SEARCH_PROMPT,
  TOOL_SEARCH_TOOL_INPUT_SCHEMA,
  type ToolSearchOutput,
} from '../../src/engine/tools'
import { type Tool } from '../../src/shared'

// ── env 戳（3 戳，文件级捕获 + 逐测还原）──
const ORIG = {
  enable: process.env.ATLAS_ENABLE_TOOL_SEARCH,
  kill: process.env.ATLAS_DISABLE_EXPERIMENTAL_BETAS,
  base: process.env.OPENAI_BASE_URL,
}

function setGateEnv(opts: {
  enable?: string
  kill?: string
  base?: string
} = {}): void {
  const { enable, kill, base } = opts
  if (enable === undefined) delete process.env.ATLAS_ENABLE_TOOL_SEARCH
  else process.env.ATLAS_ENABLE_TOOL_SEARCH = enable
  if (kill === undefined) delete process.env.ATLAS_DISABLE_EXPERIMENTAL_BETAS
  else process.env.ATLAS_DISABLE_EXPERIMENTAL_BETAS = kill
  if (base === undefined) delete process.env.OPENAI_BASE_URL
  else process.env.OPENAI_BASE_URL = base
}

// S-E3 B 路 F1：Bun 下 `process.env.X = undefined` 写字符串 "undefined" 而非
// 删除（`in` 判真）→ 还原须条件 delete（ORIG.x 为 undefined 时）
function restoreEnv(
  name:
    | 'ATLAS_ENABLE_TOOL_SEARCH'
    | 'ATLAS_DISABLE_EXPERIMENTAL_BETAS'
    | 'OPENAI_BASE_URL',
  value: string | undefined,
): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  setGateEnv()
  clearToolSearchDescriptionCache()
})

afterEach(() => {
  restoreEnv('ATLAS_ENABLE_TOOL_SEARCH', ORIG.enable)
  restoreEnv('ATLAS_DISABLE_EXPERIMENTAL_BETAS', ORIG.kill)
  restoreEnv('OPENAI_BASE_URL', ORIG.base)
})

function tool(
  name: string,
  extra: {
    shouldDefer?: boolean
    isMcp?: boolean
    alwaysLoad?: boolean
    searchHint?: string
    description?: string
  } = {},
): Tool {
  let calls = 0
  const fake = {
    name,
    inputSchema: {} as Tool['inputSchema'],
    maxResultSizeChars: 1,
    shouldDefer: extra.shouldDefer,
    isMcp: extra.isMcp,
    alwaysLoad: extra.alwaysLoad,
    searchHint: extra.searchHint,
    // delta ② 消费面：fake description 可控（评分/ memo 面计数）
    description: async () => {
      calls += 1
      return extra.description ?? 'no description'
    },
  }
  ;(fake as { _calls?: () => number })._calls = () => calls
  return fake as unknown as Tool
}

function descCalls(t: Tool): number {
  return (t as unknown as { _calls: () => number })._calls()
}

// ── 对象面 / schema 面 ──
describe('ToolSearchTool 对象面', () => {
  test('静态成员逐字（name/strict/maxResultSizeChars）', () => {
    expect(ToolSearchTool.name).toBe('ToolSearch')
    expect(ToolSearchTool.strict).toBe(true)
    expect(ToolSearchTool.maxResultSizeChars).toBe(100_000)
    expect(ToolSearchTool.shouldDefer).toBeUndefined()
    expect(ToolSearchTool.searchHint).toBeUndefined()
    expect(ToolSearchTool.inputJSONSchema).toBe(TOOL_SEARCH_TOOL_INPUT_SCHEMA)
  })

  test('schema 面：query 必填 + additionalProperties false + 描述逐字', () => {
    expect(TOOL_SEARCH_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(TOOL_SEARCH_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false)
    expect(TOOL_SEARCH_TOOL_INPUT_SCHEMA.required).toEqual(['query'])
    const props = TOOL_SEARCH_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type: string; description: string }
    >
    expect(props.query.description).toBe(
      'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
    )
    expect(props.max_results.description).toBe(
      'Maximum number of results to return (default: 5)',
    )
  })

  test('behavior 面：isConcurrencySafe/isReadOnly/isDestructive + 裁面', () => {
    expect(ToolSearchTool.isConcurrencySafe({})).toBe(true)
    expect(ToolSearchTool.isReadOnly({})).toBe(true)
    expect(ToolSearchTool.isDestructive({})).toBe(false)
    // delta ⑧/⑨：UI + classifier 裁面逐字
    expect(ToolSearchTool.renderToolUseMessage({} as never)).toBe(null)
    expect(ToolSearchTool.userFacingName({} as never)).toBe('')
    expect(ToolSearchTool.toAutoClassifierInput({} as never)).toBe('')
  })

  test('description() 单面 = TOOL_SEARCH_PROMPT（delta-enabled hint 面）', async () => {
    expect(await ToolSearchTool.description(undefined, {})).toBe(
      TOOL_SEARCH_PROMPT,
    )
    expect(TOOL_SEARCH_PROMPT).toContain(
      'Deferred tools appear by name in <system-reminder> messages.',
    )
    expect(TOOL_SEARCH_PROMPT).toContain('select:Read,Edit,Grep')
  })
})

// ── 门控面 ──
describe('getToolSearchMode 6 态', () => {
  test('未设 → tst（默认）', () => {
    setGateEnv()
    expect(getToolSearchMode()).toBe('tst')
  })

  test('false → standard', () => {
    setGateEnv({ enable: 'false' })
    expect(getToolSearchMode()).toBe('standard')
  })

  test('true → tst', () => {
    setGateEnv({ enable: 'true' })
    expect(getToolSearchMode()).toBe('tst')
  })

  test('auto → tst-auto', () => {
    setGateEnv({ enable: 'auto' })
    expect(getToolSearchMode()).toBe('tst-auto')
  })

  test('auto:50 → tst-auto / auto:0 → tst / auto:100 → standard', () => {
    setGateEnv({ enable: 'auto:50' })
    expect(getToolSearchMode()).toBe('tst-auto')
    setGateEnv({ enable: 'auto:0' })
    expect(getToolSearchMode()).toBe('tst')
    setGateEnv({ enable: 'auto:100' })
    expect(getToolSearchMode()).toBe('standard')
  })

  test('kill-switch（ATLAS_DISABLE_EXPERIMENTAL_BETAS）→ standard 优先', () => {
    setGateEnv({ enable: 'auto', kill: '1' })
    expect(getToolSearchMode()).toBe('standard')
  })
})

describe('isToolSearchEnabledOptimistic 面', () => {
  test('未设 + 无 OPENAI_BASE_URL → true（默认 ON 面）', () => {
    setGateEnv()
    expect(isToolSearchEnabledOptimistic()).toBe(true)
  })

  test('未设 + OPENAI_BASE_URL → false（proxy 守卫逐字面）', () => {
    setGateEnv({ base: 'http://proxy.example' })
    expect(isToolSearchEnabledOptimistic()).toBe(false)
  })

  test('true + OPENAI_BASE_URL → true（显式设置越过守卫）', () => {
    setGateEnv({ enable: 'true', base: 'http://proxy.example' })
    expect(isToolSearchEnabledOptimistic()).toBe(true)
  })

  test('false → false（standard）', () => {
    setGateEnv({ enable: 'false' })
    expect(isToolSearchEnabledOptimistic()).toBe(false)
  })

  test('auto（无 base）→ true / auto:1 → true / auto:100 → false', () => {
    setGateEnv({ enable: 'auto' })
    expect(isToolSearchEnabledOptimistic()).toBe(true)
    setGateEnv({ enable: 'auto:1' })
    expect(isToolSearchEnabledOptimistic()).toBe(true)
    setGateEnv({ enable: 'auto:100' })
    expect(isToolSearchEnabledOptimistic()).toBe(false)
  })

  test('kill-switch → false', () => {
    setGateEnv({ kill: '1' })
    expect(isToolSearchEnabledOptimistic()).toBe(false)
  })

  test('ToolSearchTool.isEnabled() = gate 面透传', () => {
    setGateEnv()
    expect(ToolSearchTool.isEnabled()).toBe(true)
    setGateEnv({ base: 'http://proxy.example' })
    expect(ToolSearchTool.isEnabled()).toBe(false)
    setGateEnv({ enable: 'true', base: 'http://proxy.example' })
    expect(ToolSearchTool.isEnabled()).toBe(true)
  })
})

// ── isDeferredTool 面 ──
describe('isDeferredTool 5 面', () => {
  test('alwaysLoad true 优先（MCP 工具可 opt-out）', () => {
    expect(
      isDeferredTool(tool('mcp__s__a', { isMcp: true, alwaysLoad: true })),
    ).toBe(false)
  })

  test('isMcp true → true（workflow-specific 恒 defer）', () => {
    expect(isDeferredTool(tool('mcp__s__a', { isMcp: true }))).toBe(true)
  })

  test('自身 ToolSearch → false（永不 defer）', () => {
    expect(
      isDeferredTool(tool('ToolSearch', { shouldDefer: true })),
    ).toBe(false)
  })

  test('shouldDefer true → true', () => {
    expect(isDeferredTool(tool('X', { shouldDefer: true }))).toBe(true)
  })

  test('普通工具 → false', () => {
    expect(isDeferredTool(tool('X'))).toBe(false)
  })
})

// ── call 面 ──
describe('call select: 面', () => {
  test('deferred 命中（harmless no-op 面：full 集命中亦回）', async () => {
    const read = tool('Read', { shouldDefer: true })
    const res = await ToolSearchTool.call(
      { query: 'select:Read' },
      { options: { tools: [read] } },
    )
    expect(res.data.matches).toEqual(['Read'])
    expect(res.data.total_deferred_tools).toBe(1)
  })

  test('full 集命中（非 deferred 工具 select 亦回，retry-churn 面）', async () => {
    const read = tool('Read')
    const res = await ToolSearchTool.call(
      { query: 'select:Read' },
      { options: { tools: [read] } },
    )
    expect(res.data.matches).toEqual(['Read'])
    expect(res.data.total_deferred_tools).toBe(0)
  })

  test('全 miss → 空结果 + total_deferred_tools 面（无 pending 后缀支）', async () => {
    const res = await ToolSearchTool.call(
      { query: 'select:Nope' },
      { options: { tools: [tool('Read', { shouldDefer: true })] } },
    )
    expect(res.data.matches).toEqual([])
    expect(res.data.total_deferred_tools).toBe(1)
    expect(res.data.pending_mcp_servers).toBeUndefined()
  })

  test('多选逗号 + 去重面', async () => {
    const read = tool('Read', { shouldDefer: true })
    const edit = tool('Edit', { shouldDefer: true })
    const res = await ToolSearchTool.call(
      { query: 'select:Read,Read,Edit' },
      { options: { tools: [read, edit] } },
    )
    expect(res.data.matches).toEqual(['Read', 'Edit'])
  })
})

describe('call keyword 评分面', () => {
  test('parts exact 面（非 mcp 10 / mcp 12 权重逐字）', async () => {
    const plain = tool('ReadFileTool', { shouldDefer: true })
    const mcp = tool('mcp__slack__send', { isMcp: true })
    const res = await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [plain] } },
    )
    expect(res.data.matches).toEqual(['ReadFileTool'])
    const mcpRes = await ToolSearchTool.call(
      { query: 'slack' },
      { options: { tools: [mcp, tool('Notebook', { shouldDefer: true })] } },
    )
    expect(mcpRes.data.matches).toEqual(['mcp__slack__send'])
  })

  test('full 回落面（score===0 时 +3）', async () => {
    const t = tool('ReadFileTool', { shouldDefer: true })
    const res = await ToolSearchTool.call(
      { query: 'read file' },
      { options: { tools: [t] } },
    )
    expect(res.data.matches).toEqual(['ReadFileTool'])
  })

  test('searchHint +4 面', async () => {
    const t = tool('NbEdit', {
      shouldDefer: true,
      searchHint: 'notebook editing',
    })
    const res = await ToolSearchTool.call(
      { query: 'notebook' },
      { options: { tools: [t] } },
    )
    expect(res.data.matches).toEqual(['NbEdit'])
  })

  test('description +2 面（词边界）', async () => {
    const t = tool('Xy', { shouldDefer: true, description: 'handles grep' })
    const res = await ToolSearchTool.call(
      { query: 'grep' },
      { options: { tools: [t] } },
    )
    expect(res.data.matches).toEqual(['Xy'])
  })

  test('required + 前缀预过滤面（必含 term 才入候选）', async () => {
    const slack = tool('SlackSend', {
      shouldDefer: true,
      description: 'send messages via slack',
    })
    const gh = tool('GhIssue', {
      shouldDefer: true,
      description: 'open github issue',
    })
    const res = await ToolSearchTool.call(
      { query: '+slack send' },
      { options: { tools: [slack, gh] } },
    )
    expect(res.data.matches).toEqual(['SlackSend'])
  })

  test('快路径 exact name（非 select: 前缀裸名，full 集回落）', async () => {
    const read = tool('Read')
    const res = await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [read] } },
    )
    expect(res.data.matches).toEqual(['Read'])
  })

  test('快路径 mcp__ prefix 面', async () => {
    const a = tool('mcp__gh_issue', { isMcp: true })
    const b = tool('mcp__gh_pr', { isMcp: true })
    const c = tool('mcp__x', { isMcp: true })
    const res = await ToolSearchTool.call(
      { query: 'mcp__gh' },
      { options: { tools: [a, b, c] } },
    )
    expect(res.data.matches).toEqual(['mcp__gh_issue', 'mcp__gh_pr'])
  })

  test('max_results slice 面（缺省 5 / 显式 2）', async () => {
    const ts = [
      tool('AlphaTool', { shouldDefer: true }),
      tool('BetaTool', { shouldDefer: true }),
      tool('GammaTool', { shouldDefer: true }),
    ]
    const r2 = await ToolSearchTool.call(
      { query: 'tool', max_results: 2 },
      { options: { tools: ts } },
    )
    expect(r2.data.matches).toHaveLength(2)
  })

  test('无命中 → 空 matches + total_deferred_tools 面', async () => {
    const res = await ToolSearchTool.call(
      { query: 'zzzqqq' },
      { options: { tools: [tool('Read', { shouldDefer: true })] } },
    )
    expect(res.data.matches).toEqual([])
    expect(res.data.total_deferred_tools).toBe(1)
    expect(res.data.pending_mcp_servers).toBeUndefined()
  })
})

// ── memo 失效面 ──
describe('memo 失效面', () => {
  test('同集重查 → description 不重取（Map memo）', async () => {
    const t = tool('ReadFileTool', { shouldDefer: true, description: 'd' })
    await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [t] } },
    )
    await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [t] } },
    )
    expect(descCalls(t)).toBe(1)
  })

  test('tool 集变 → 缓存清 + 重取；clearToolSearchDescriptionCache 导出面', async () => {
    const t1 = tool('ReadFileTool', { shouldDefer: true, description: 'd' })
    await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [t1] } },
    )
    const t2 = tool('OtherTool', { shouldDefer: true, description: 'd' })
    await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [t1, t2] } },
    )
    expect(descCalls(t2)).toBe(1)

    clearToolSearchDescriptionCache()
    const t3 = tool('ReadFileTool', { shouldDefer: true, description: 'd2' })
    await ToolSearchTool.call(
      { query: 'read' },
      { options: { tools: [t3] } },
    )
    expect(descCalls(t3)).toBe(1)
  })
})

// ── mapToolResult 面 ──
describe('mapToolResult 面', () => {
  test('空 → No matching 逐字', () => {
    const block = ToolSearchTool.mapToolResultToToolResultBlockParam(
      { matches: [], query: 'q', total_deferred_tools: 0 },
      'tu_1',
    )
    expect(block).toEqual({
      tool_use_id: 'tu_1',
      type: 'tool_result',
      content: 'No matching deferred tools found',
    })
  })

  test('pending 后缀合成 content 面（数据契约面，⑮ 不可达支保留）', () => {
    const content: ToolSearchOutput = {
      matches: [],
      query: 'q',
      total_deferred_tools: 0,
      pending_mcp_servers: ['s1', 's2'],
    }
    const block = ToolSearchTool.mapToolResultToToolResultBlockParam(
      content,
      'tu_2',
    )
    expect(block.content).toBe(
      'No matching deferred tools found. Some MCP servers are still connecting: s1, s2. Their tools will become available shortly — try searching again.',
    )
  })

  test('matches → tool_reference 块数组面（⑱ 前向接缝 cast 逐字）', () => {
    const block = ToolSearchTool.mapToolResultToToolResultBlockParam(
      { matches: ['A', 'B'], query: 'q', total_deferred_tools: 2 },
      'tu_3',
    )
    expect(block).toEqual({
      tool_use_id: 'tu_3',
      type: 'tool_result',
      content: [
        { type: 'tool_reference', tool_name: 'A' },
        { type: 'tool_reference', tool_name: 'B' },
      ],
    })
  })
})
