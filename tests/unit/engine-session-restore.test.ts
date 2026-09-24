/**
 * session 域 restore/search/Port 1 单测（E-7 S-7d d2，§8.49）：
 * processResumedConversation slim（非 fork switchSession 所有权 / 缺 sid
 * 不翻转 / fork 不翻转 / onWorktreeRestore 接缝时点 / agentColor 归一）/
 * transcriptSearch 全面（sentinel 滤防虚影 / tool_result duck（P-S4 锚点）/
 * tool_use input / attachment 双变体守卫 / system-reminder 剥离 / WeakMap
 * 幂等）/ SessionContextPort 假适配器（view 语义）。
 *
 * 分层纪律：零磁盘——非 fork 路会经 adoptResumedSessionFile →
 * reAppendSessionMetadata，但 appendEntryToFile 各支全部以缓存字段为
 * 条件，本层测试输入不带 meta 字段（customTitle / tag / mode / agent* /
 * pr* / worktreeSession）→ 缓存空 → 零写盘；readFileTailSync 缺文件 →
 * ''（不抛）。
 * fork 路不经 adopt → 天然零盘。fork seed 写断言 + resume 链重建端到端
 * 归 func 真盘层（tests/func/engine-session-restore-fs.test.ts，P-S5 探针
 * 锚点所在）。
 *
 * 探针锚点（§8.49 d2，突变须恰好 1 red）：
 *   P-S4 toolResultSearchText `if (typeof o.stdout === 'string')` 支 →
 *    本文件 'P-S4 tool_result duck：Bash {stdout,stderr} native Out'
 *   P-S5 restore fork 支 recordContentReplacement 调用删 → func 层
 *    'P-S5 fork seed：content-replacement entry 落新会话文件'（func）
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  processResumedConversation,
  renderableSearchText,
  toolUseSearchText,
  toolResultSearchText,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  resetProjectForTesting,
  clearSessionMessagesCache,
  getSessionEnv,
  type RenderableMessage,
  type SessionContextPort,
  type SessionSnapshot,
} from '../../src/engine'

// ── processResumedConversation（slim 面）────────────────────────────────────

describe('processResumedConversation（slim）', () => {
  beforeEach(() => {
    resetProjectForTesting()
    clearSessionMessagesCache()
  })
  afterEach(() => {
    resetProjectForTesting()
    clearSessionMessagesCache()
  })

  test('非 fork：env 翻到 result.sessionId（sessionIdOverride 缺省）', async () => {
    getSessionEnv().switchSession('fresh-startup')
    const out = await processResumedConversation(
      { messages: [], sessionId: 'orig-1' },
      { forkSession: false },
    )
    expect(getSessionEnv().getSessionId()).toBe('orig-1')
    expect(out.messages).toEqual([])
  })

  test('非 fork：sessionIdOverride 优先于 result.sessionId', async () => {
    getSessionEnv().switchSession('fresh-startup')
    await processResumedConversation(
      { messages: [], sessionId: 'orig-1' },
      { forkSession: false, sessionIdOverride: 'override-9' },
    )
    expect(getSessionEnv().getSessionId()).toBe('override-9')
  })

  test('非 fork：sid 缺失 → env 不翻转', async () => {
    getSessionEnv().switchSession('fresh-startup')
    await processResumedConversation({ messages: [] }, { forkSession: false })
    expect(getSessionEnv().getSessionId()).toBe('fresh-startup')
  })

  test('fork：env 不翻转（保留 fresh startup 会话 ID）', async () => {
    getSessionEnv().switchSession('fresh-startup')
    await processResumedConversation(
      { messages: [], sessionId: 'orig-1' },
      { forkSession: true },
    )
    expect(getSessionEnv().getSessionId()).toBe('fresh-startup')
  })

  test('onWorktreeRestore 接缝：非 fork 恰调一次 / fork 不调', async () => {
    // 值透传（以 result.worktreeSession 调用）断言归 func 层（带
    // worktreeSession 的非 fork 路会经 restoreSessionMetadata 置 worktree
    // 缓存 → reAppend 写盘，破本层零磁盘纪律）。
    const seen: unknown[] = []
    await processResumedConversation(
      { messages: [], sessionId: 'orig-1' },
      { forkSession: false, onWorktreeRestore: w => seen.push(w) },
    )
    expect(seen).toEqual([undefined])
    seen.length = 0
    await processResumedConversation(
      { messages: [], sessionId: 'orig-1' },
      { forkSession: true, onWorktreeRestore: w => seen.push(w) },
    )
    expect(seen).toEqual([])
  })

  test('agentColor：default 归一 undefined / 其余串透传（string 面）', async () => {
    const r1 = await processResumedConversation(
      { messages: [], agentColor: 'default' },
      { forkSession: true },
    )
    expect(r1.agentColor).toBeUndefined()
    const r2 = await processResumedConversation(
      { messages: [], agentColor: 'red' },
      { forkSession: true },
    )
    expect(r2.agentColor).toBe('red')
  })
})

// ── transcriptSearch ─────────────────────────────────────────────────────────

describe('transcriptSearch：renderableSearchText', () => {
  test('user string content 命中（lowercase）', () => {
    const m: RenderableMessage = {
      type: 'user',
      message: { content: 'Hello World' },
    }
    expect(renderableSearchText(m)).toBe('hello world')
  })

  test('sentinel 滤：INTERRUPT 常量文本不入索引（虚影防）', () => {
    for (const s of [INTERRUPT_MESSAGE, INTERRUPT_MESSAGE_FOR_TOOL_USE]) {
      const m: RenderableMessage = { type: 'user', message: { content: s } }
      expect(renderableSearchText(m)).toBe('')
    }
    expect(INTERRUPT_MESSAGE).toBe('[Request interrupted by user]')
    expect(INTERRUPT_MESSAGE_FOR_TOOL_USE).toBe(
      '[Request interrupted by user for tool use]',
    )
  })

  test('P-S4 tool_result duck：Bash {stdout,stderr} native Out', () => {
    const m: RenderableMessage = {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] },
      toolUseResult: { stdout: 'OUT-TEXT', stderr: 'ERR-TEXT' },
    }
    expect(renderableSearchText(m)).toBe('out-text\nerr-text')
  })

  test('tool_use input：command 字段可见', () => {
    const m: RenderableMessage = {
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'Bash',
            input: { command: 'ls -la' },
          },
        ],
      },
    }
    expect(renderableSearchText(m)).toBe('ls -la')
  })

  test('attachment relevant_memories：memories content 全入索引', () => {
    const m: RenderableMessage = {
      type: 'attachment',
      attachment: {
        type: 'relevant_memories',
        memories: [{ content: 'Mem A' }, { content: 'Mem B' }],
      },
    }
    expect(renderableSearchText(m)).toBe('mem a\nmem b')
  })

  test('attachment queued_command：task-notification / isMeta 跳过', () => {
    expect(
      renderableSearchText({
        type: 'attachment',
        attachment: {
          type: 'queued_command',
          commandMode: 'task-notification',
          prompt: 'P',
        },
      }),
    ).toBe('')
    expect(
      renderableSearchText({
        type: 'attachment',
        attachment: { type: 'queued_command', isMeta: true, prompt: 'P' },
      }),
    ).toBe('')
    expect(
      renderableSearchText({
        type: 'attachment',
        attachment: { type: 'queued_command', prompt: 'Queued Prompt' },
      }),
    ).toBe('queued prompt')
  })

  test('collapsed_read_search：relevantMemories 镜像入索引', () => {
    const m: RenderableMessage = {
      type: 'collapsed_read_search',
      relevantMemories: [{ content: 'Collapsed Mem' }],
    }
    expect(renderableSearchText(m)).toBe('collapsed mem')
  })

  test('system-reminder 剥离（含 mid-message 多段）', () => {
    const m: RenderableMessage = {
      type: 'user',
      message: {
        content:
          'before <system-reminder>hidden</system-reminder> mid <system-reminder>x</system-reminder> after',
      },
    }
    expect(renderableSearchText(m)).toBe('before  mid  after')
  })

  test('grouped_tool_use / system → 空', () => {
    expect(renderableSearchText({ type: 'grouped_tool_use' })).toBe('')
    expect(renderableSearchText({ type: 'system' })).toBe('')
  })

  test('WeakMap 缓存幂等（同引用 → cached）', () => {
    const m: RenderableMessage = {
      type: 'user',
      message: { content: 'Stable' },
    }
    expect(renderableSearchText(m)).toBe('stable')
    expect(renderableSearchText(m)).toBe('stable')
  })
})

describe('transcriptSearch：duck 工具直接面', () => {
  test('toolResultSearchText：string 透传 / file.content / allowlist / 数组 / 未知空（大小写保留——lowercase 归 renderableSearchText 缓存面）', () => {
    expect(toolResultSearchText('plain string')).toBe('plain string')
    expect(toolResultSearchText({ file: { content: 'FILE-BODY' } })).toBe(
      'FILE-BODY',
    )
    expect(toolResultSearchText({ content: 'C', output: 'O' })).toBe('C\nO')
    expect(toolResultSearchText({ filenames: ['a.ts', 'b.ts'] })).toBe(
      'a.ts\nb.ts',
    )
    expect(toolResultSearchText({ unknownField: 'x' })).toBe('')
    expect(toolResultSearchText(null)).toBe('')
  })

  test('toolUseSearchText：args/files 数组拼接 / 非对象空', () => {
    expect(toolUseSearchText({ args: ['a', 'b'], files: ['f1', 'f2'] })).toBe(
      'a b\nf1 f2',
    )
    expect(toolUseSearchText('not object')).toBe('')
    expect(toolUseSearchText(undefined)).toBe('')
  })
})

// ── SessionContextPort（Port 1）假适配器 ─────────────────────────────────────

describe('SessionContextPort（Port 1）假适配器：view 语义', () => {
  // 假适配器只验 get/set view 语义（快照字段面由壳侧/组合根装配真对象；
  // toolPermissionContext 以 cast 占位，不断言字段结构）。
  function makeFake(): { port: SessionContextPort; snap: () => SessionSnapshot } {
    let current: SessionSnapshot = {
      toolPermissionContext: {} as SessionSnapshot['toolPermissionContext'],
      mcp: { tools: [], clients: [] },
      effortValue: 'low',
      advisorModel: undefined,
      tasks: {},
    }
    const port: SessionContextPort = {
      get: () => current,
      set: f => {
        current = f(current)
      },
    }
    return { port, snap: () => current }
  }

  test('get 返回当前快照引用（view 语义：非深拷贝）', () => {
    const { port, snap } = makeFake()
    expect(port.get()).toBe(snap())
  })

  test('set 按字段写回（f(prev) → 新快照）', () => {
    const { port, snap } = makeFake()
    port.set(prev => ({ ...prev, advisorModel: 'adv-1', effortValue: 'high' }))
    expect(port.get().advisorModel).toBe('adv-1')
    expect(port.get().effortValue).toBe('high')
    expect(snap().advisorModel).toBe('adv-1')
  })
})
