/**
 * session 域单测（E-7 S-7d d1，§8.49）：谓词族 / firstPrompt / project 纯
 * 函数 / json 域内工具 / record clean 族 + recordTranscript 返回语义 /
 * buildConversationChain（P-S2 探针锚点：并行 tool_result 恢复）/
 * sessionMemory 阈值状态机 + Port 5 注入窗口。零磁盘 / 零网络 → unit 层
 * （recordTranscript 在 NODE_ENV=test 下 shouldSkipPersistence 恒真 →
 * 写面 no-op，messageSet 内存面照常）。
 *
 * 探针锚点（§8.49 详案，突变须恰好 1 red）：
 *   P-S1 recordTranscript `!seenNewMessage && isChainParticipant(m)` 前缀
 *    守卫 → func 层 'P-S1 前缀守卫：非前缀旧消息不推进 parent'（func）
 *   P-S2 recoverOrphanedParallelToolResults 末段 inserts splice 循环 →
 *    本文件 'P-S2 并行 tool_result 恢复：off-chain TR 拼回锚点后'
 *   P-S3 scanner 前界截断支（scanChunkLines/processStraddle 的
 *    `s.out.len = 0`，非 finalizeOutput——它只做 carry 落写 + attr-snap
 *    EOF 重排）→ func 层大文件两态（func）
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  LITE_READ_BUF_SIZE,
  unescapeJsonString,
  extractLastJsonStringField,
  resetProjectForTesting,
  isTranscriptMessage,
  isChainParticipant,
  isLegacyProgressEntry,
  isEphemeralToolProgress,
  isCompactBoundaryMessage,
  COMMAND_NAME_TAG,
  getFirstMeaningfulUserMessageTextContent,
  extractFirstPrompt,
  parseJSONL,
  jsonParse,
  jsonStringify,
  sortLogs,
  isLoggableMessage,
  cleanMessagesForLogging,
  recordTranscript,
  buildConversationChain,
  getSessionMessages,
  clearSessionMessagesCache,
  getSessionEnv,
  DEFAULT_SESSION_MEMORY_CONFIG,
  hasMetInitializationThreshold,
  hasMetUpdateThreshold,
  recordExtractionTokenCount,
  getToolCallsBetweenUpdates,
  setSessionMemoryConfig,
  isSessionMemoryInitialized,
  markSessionMemoryInitialized,
  resetSessionMemoryState,
  setSessionMemoryPort,
  getSessionMemoryPort,
  getSessionMemoryContent,
  waitForSessionMemoryExtraction,
  type TranscriptMessage,
  type Message,
  type Entry,
  type LogOption,
} from '../../src/engine'

// ── 工厂 ─────────────────────────────────────────────────────────────────────

function tm(
  over: Partial<TranscriptMessage> & Pick<TranscriptMessage, 'uuid' | 'type'>,
): TranscriptMessage {
  return {
    cwd: '/tmp',
    userType: 'atlas',
    sessionId: 's1',
    timestamp: '2026-01-01T00:00:00Z',
    version: '0.0.0',
    parentUuid: null,
    isSidechain: false,
    ...over,
  }
}

function userMsg(
  uuid: string,
  content: unknown,
  over: Partial<Message> = {},
): Message {
  return {
    uuid,
    type: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content },
    ...over,
  }
}

function asstMsg(
  uuid: string,
  content: unknown,
  over: Partial<Message> = {},
): Message {
  return {
    uuid,
    type: 'assistant',
    timestamp: '2026-01-01T00:00:01Z',
    message: { content, id: over.id as string | undefined },
    ...over,
  }
}

// ── 谓词族 ────────────────────────────────────────────────────────────────────

describe('谓词族', () => {
  test('isTranscriptMessage 四型真 / progress 假', () => {
    for (const t of ['user', 'assistant', 'attachment', 'system'] as const) {
      expect(isTranscriptMessage(tm({ uuid: 'u', type: t }) as Entry)).toBe(
        true,
      )
    }
    expect(
      isTranscriptMessage({ type: 'summary', leafUuid: 'u', summary: 's' }),
    ).toBe(false)
  })

  test('isChainParticipant：progress 假，余真', () => {
    expect(isChainParticipant({ type: 'progress' })).toBe(false)
    expect(isChainParticipant({ type: 'user' })).toBe(true)
    expect(isChainParticipant({ type: undefined })).toBe(true)
  })

  test('isLegacyProgressEntry 须 type+uuid 双字段', () => {
    expect(
      isLegacyProgressEntry({ type: 'progress', uuid: 'p1', parentUuid: null }),
    ).toBe(true)
    expect(isLegacyProgressEntry({ type: 'progress' })).toBe(false)
    expect(isLegacyProgressEntry({ type: 'user', uuid: 'x' })).toBe(false)
    expect(isLegacyProgressEntry(null)).toBe(false)
  })

  test('isEphemeralToolProgress 三型 + 非字符串假', () => {
    for (const t of ['bash_progress', 'powershell_progress', 'mcp_progress']) {
      expect(isEphemeralToolProgress(t)).toBe(true)
    }
    expect(isEphemeralToolProgress('foo')).toBe(false)
    expect(isEphemeralToolProgress(42)).toBe(false)
  })

  test('isCompactBoundaryMessage 判别收窄', () => {
    const cb = {
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'cb1',
    } as Message
    expect(isCompactBoundaryMessage(cb)).toBe(true)
    expect(isCompactBoundaryMessage(userMsg('u1', 'hi'))).toBe(false)
  })
})

// ── firstPrompt ───────────────────────────────────────────────────────────────

describe('firstPrompt', () => {
  test('COMMAND_NAME_TAG 常量', () => {
    expect(COMMAND_NAME_TAG).toBe('command-name')
  })

  test('string content 直取', () => {
    const t = [userMsg('u1', 'fix the build')]
    expect(getFirstMeaningfulUserMessageTextContent(t)).toBe('fix the build')
  })

  test('array content 遍历 text 块（IDE 元标签后隐藏真 prompt）', () => {
    const t = [
      userMsg('u1', [
        { type: 'text', text: '<ide_opened_file>foo.ts</ide_opened_file>' },
        { type: 'text', text: 'real prompt' },
      ]),
    ]
    expect(getFirstMeaningfulUserMessageTextContent(t)).toBe('real prompt')
  })

  test('isMeta / compact summary 用户消息跳过', () => {
    const t = [
      userMsg('u1', 'meta noise', { isMeta: true }),
      userMsg('u2', 'compact noise', { isCompactSummary: true }),
      userMsg('u3', 'the prompt'),
    ]
    expect(getFirstMeaningfulUserMessageTextContent(t)).toBe('the prompt')
  })

  test('command-name：自定义命令带 args 返格式化串，无 args 跳过', () => {
    const withArgs = [
      userMsg(
        'u1',
        '<command-name>/review</command-name>\n<command-args>reticulate splines</command-args>',
      ),
    ]
    expect(getFirstMeaningfulUserMessageTextContent(withArgs)).toBe(
      '/review reticulate splines',
    )
    const noArgs = [
      userMsg('u1', '<command-name>/review</command-name>'),
      userMsg('u2', 'fallback prompt'),
    ]
    expect(getFirstMeaningfulUserMessageTextContent(noArgs)).toBe(
      'fallback prompt',
    )
  })

  test('bash-input 渲染 ! 前缀', () => {
    const t = [userMsg('u1', '<bash-input>ls -la</bash-input>')]
    expect(getFirstMeaningfulUserMessageTextContent(t)).toBe('! ls -la')
  })

  test('extractFirstPrompt 200 字截断 + …', () => {
    const long = 'a'.repeat(300)
    expect(extractFirstPrompt([tm({ uuid: 'u1', type: 'user', message: { content: long } })])).toBe(
      'a'.repeat(200) + '…',
    )
  })

  test('extractFirstPrompt 无内容 → No prompt', () => {
    expect(extractFirstPrompt([tm({ uuid: 'a1', type: 'assistant' })])).toBe(
      'No prompt',
    )
  })
})

// ── project 纯函数 ────────────────────────────────────────────────────────────

describe('project 纯函数', () => {
  test('LITE_READ_BUF_SIZE = 64KB', () => {
    expect(LITE_READ_BUF_SIZE).toBe(65536)
  })

  test('unescapeJsonString：转义还原 / 无转义原样 / 畸形原样', () => {
    expect(unescapeJsonString('a\\nb')).toBe('a\nb')
    const raw = 'plain'
    expect(unescapeJsonString(raw)).toBe(raw)
    // 悬尾反斜杠 → JSON.parse 失败 → 原样返回（不抛）
    expect(unescapeJsonString('a\\')).toBe('a\\')
  })

  test('extractLastJsonStringField：末次出现胜 + 反转义', () => {
    const text =
      '{"customTitle":"A"}\n{"customTitle":"B"}\n{"tag":"a\\"b"}'
    expect(extractLastJsonStringField(text, 'customTitle')).toBe('B')
    expect(extractLastJsonStringField(text, 'tag')).toBe('a"b')
    expect(extractLastJsonStringField(text, 'missing')).toBeUndefined()
  })
})

// ── json 域内工具 ─────────────────────────────────────────────────────────────

describe('json 域内工具', () => {
  test('parseJSONL 跳过畸形行（string + Buffer 双路）', () => {
    const lines = ['{"a":1}', 'not json', '{"a":2}', '', '{"a":3}']
    expect(parseJSONL<Record<string, number>>(lines.join('\n'))).toEqual([
      { a: 1 },
      { a: 2 },
      { a: 3 },
    ])
    expect(
      parseJSONL<Record<string, number>>(
        Buffer.from(lines.join('\n'), 'utf-8'),
      ),
    ).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }])
  })

  test('parseJSONL BOM 剥离（Buffer 路；Bun 快路仅 Buffer 剥 BOM）', () => {
    // 实现 quirk 登记：Bun.JSONL.parseChunk 对 string 入参不剥 BOM（解析
    // 失败 → 空值）；load 面恒走 Buffer（buf / Buffer.from），string BOM
    // 面 = 理论死角（与旧仓 json.ts 同构）。
    expect(
      parseJSONL<Record<string, number>>(
        Buffer.from('﻿{"a":1}', 'utf-8'),
      ),
    ).toEqual([{ a: 1 }])
  })

  test('jsonParse 语义 = JSON.parse（fast-path 分支）', () => {
    expect(jsonParse('{"a":1}')).toEqual({ a: 1 })
    expect(() => jsonParse('{bad')).toThrow()
  })

  test('jsonStringify = JSON.stringify', () => {
    expect(jsonStringify({ a: 1 })).toBe('{"a":1}')
  })
})

// ── types：sortLogs ───────────────────────────────────────────────────────────

describe('sortLogs', () => {
  function opt(
    modified: number,
    created: number,
  ): LogOption {
    return {
      date: '2026-01-01',
      messages: [],
      value: 0,
      created: new Date(created),
      modified: new Date(modified),
      firstPrompt: 'p',
      messageCount: 0,
      isSidechain: false,
    }
  }
  test('modified 降序，同 modified 按 created 降序', () => {
    const logs = sortLogs([opt(100, 10), opt(200, 5), opt(200, 50)])
    expect(logs.map(l => l.modified.getTime())).toEqual([200, 200, 100])
    expect(logs[0].created.getTime()).toBe(50)
  })
})

// ── record clean 族 ───────────────────────────────────────────────────────────

describe('isLoggableMessage', () => {
  test('progress 假 / attachment 缺省假 / user+assistant 真', () => {
    expect(isLoggableMessage({ type: 'progress' } as Message)).toBe(false)
    expect(isLoggableMessage({ type: 'attachment' } as Message)).toBe(false)
    expect(isLoggableMessage({ type: 'user' } as Message)).toBe(true)
    expect(isLoggableMessage({ type: 'assistant' } as Message)).toBe(true)
  })

  test('hook_additional_context 仅 env 开时放行', () => {
    const m = {
      type: 'attachment',
      attachment: { type: 'hook_additional_context' },
    } as Message
    expect(isLoggableMessage(m)).toBe(false)
    process.env.ATLAS_SAVE_HOOK_ADDITIONAL_CONTEXT = 'true'
    try {
      expect(isLoggableMessage(m)).toBe(true)
    } finally {
      delete process.env.ATLAS_SAVE_HOOK_ADDITIONAL_CONTEXT
    }
  })
})

describe('cleanMessagesForLogging（REPL 外部转录变换）', () => {
  const REPL = 'REPL'
  test('REPL tool_use/tool_result 成对剥离，他工具保留', () => {
    const a1 = asstMsg('a1', [
      { type: 'tool_use', id: 'r1', name: REPL, input: {} },
      { type: 'tool_use', id: 'b1', name: 'Bash', input: {} },
    ])
    const u1 = userMsg('u1', [
      { type: 'tool_result', tool_use_id: 'r1', content: 'repl out' },
      { type: 'tool_result', tool_use_id: 'b1', content: 'bash out' },
    ])
    const out = cleanMessagesForLogging([a1, u1], [a1, u1])
    expect(out).toHaveLength(2)
    expect((out[0].message?.content as Array<Record<string, unknown>>)).toEqual(
      [{ type: 'tool_use', id: 'b1', name: 'Bash', input: {} }],
    )
    expect((out[1].message?.content as Array<Record<string, unknown>>)).toEqual(
      [{ type: 'tool_result', tool_use_id: 'b1', content: 'bash out' }],
    )
  })

  test('仅含 REPL 块的 assistant 整条剥离', () => {
    const a1 = asstMsg('a1', [
      { type: 'tool_use', id: 'r1', name: REPL, input: {} },
    ])
    const u1 = userMsg('u1', [
      { type: 'tool_result', tool_use_id: 'r1', content: 'x' },
    ])
    const out = cleanMessagesForLogging([a1, u1], [a1, u1])
    expect(out).toHaveLength(0)
  })

  test('replIds 取自全量 allMessages（跨切片 orphan TR 不残留）', () => {
    const a1 = asstMsg('a1', [
      { type: 'tool_use', id: 'r1', name: REPL, input: {} },
    ])
    const u1 = userMsg('u1', [
      { type: 'tool_result', tool_use_id: 'r1', content: 'x' },
      { type: 'text', text: 'keep me' },
    ])
    // 切片只含 u1（REPL tool_use 在前一片渲染），allMessages 补全
    const out = cleanMessagesForLogging([u1], [a1, u1])
    expect(out).toHaveLength(1)
    expect((out[0].message?.content as Array<Record<string, unknown>>)).toEqual(
      [{ type: 'text', text: 'keep me' }],
    )
  })

  test('isVirtual 提升为实消息（键剥离）', () => {
    const u1 = userMsg('u1', 'hi', { isVirtual: true })
    const out = cleanMessagesForLogging([u1])
    expect(out).toHaveLength(1)
    expect('isVirtual' in (out[0] as Record<string, unknown>)).toBe(false)
  })
})

// ── recordTranscript 返回语义（unit 零磁盘：persistence skip）───────────────

describe('recordTranscript 返回语义', () => {
  beforeEach(() => {
    resetProjectForTesting()
    clearSessionMessagesCache()
  })
  afterEach(() => {
    resetProjectForTesting()
    clearSessionMessagesCache()
  })

  test('全新增 → 返回最后 chain participant uuid', async () => {
    getSessionEnv().switchSession('unit-rt-1')
    const out = await recordTranscript([
      userMsg('u1', 'hello'),
      asstMsg('a1', 'hi'),
      userMsg('u2', 'again'),
    ])
    expect(out).toBe('u2')
  })

  test('全已录 → 返回前缀跟踪 uuid（rewind/resume 场景）', async () => {
    getSessionEnv().switchSession('unit-rt-2')
    await recordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi')])
    // 第二次全切片已在 messageSet → 零新增，返回前缀末 uuid
    const out = await recordTranscript([userMsg('u1', 'hello'), asstMsg('a1', 'hi')])
    expect(out).toBe('a1')
  })

  test('无 chain participant → null', async () => {
    getSessionEnv().switchSession('unit-rt-3')
    const out = await recordTranscript([])
    expect(out).toBeNull()
  })
})

// ── buildConversationChain（P-S2 探针锚点）───────────────────────────────────

describe('buildConversationChain', () => {
  test('线性链反演 + 环检测截断', () => {
    const u1 = tm({ uuid: 'u1', type: 'user', parentUuid: null })
    const a1 = tm({ uuid: 'a1', type: 'assistant', parentUuid: 'u1' })
    const u2 = tm({ uuid: 'u2', type: 'user', parentUuid: 'a1' })
    const messages = new Map([
      ['u1', u1],
      ['a1', a1],
      ['u2', u2],
    ])
    const chain = buildConversationChain(messages, u2)
    expect(chain.map(m => m.uuid)).toEqual(['u1', 'a1', 'u2'])
  })

  test('环检测：x↔y 截断不挂死', () => {
    const x = tm({ uuid: 'x', type: 'user', parentUuid: 'y' })
    const y = tm({ uuid: 'y', type: 'assistant', parentUuid: 'x' })
    const messages = new Map([
      ['x', x],
      ['y', y],
    ])
    const chain = buildConversationChain(messages, x)
    // leaf x 走查 [x, y] 后反转 → [y, x]（退化环无真根，序非语义承诺）
    expect(chain.map(m => m.uuid)).toEqual(['y', 'x'])
  })

  test('P-S2 并行 tool_result 恢复：off-chain TR 拼回锚点后', () => {
    // 流式并行拓扑：同一 message.id 的 assistant 带两个 tool_use，
    // 两个 TR 同挂 parent=a1；leaf 走 c2 分支 → c1 成 orphan，
    // recoverOrphanedParallelToolResults 须将其拼回 a1 之后。
    const u1 = tm({ uuid: 'u1', type: 'user', parentUuid: null })
    const a1 = tm({
      uuid: 'a1',
      type: 'assistant',
      parentUuid: 'u1',
      message: {
        id: 'm1',
        content: [
          { type: 'tool_use', id: 't1', name: 'Bash' },
          { type: 'tool_use', id: 't2', name: 'Grep' },
        ],
      },
    })
    const c1 = tm({
      uuid: 'c1',
      type: 'user',
      parentUuid: 'a1',
      timestamp: '2026-01-01T00:00:02Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }],
      },
    })
    const c2 = tm({
      uuid: 'c2',
      type: 'user',
      parentUuid: 'a1',
      timestamp: '2026-01-01T00:00:03Z',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }],
      },
    })
    const n1 = tm({ uuid: 'n1', type: 'user', parentUuid: 'c2' })
    const messages = new Map([
      ['u1', u1],
      ['a1', a1],
      ['c1', c1],
      ['c2', c2],
      ['n1', n1],
    ])
    const chain = buildConversationChain(messages, n1)
    expect(chain.map(m => m.uuid)).toEqual(['u1', 'a1', 'c1', 'c2', 'n1'])
  })
})

// ── sessionMemory 阈值状态机 + Port 5 ────────────────────────────────────────

describe('sessionMemory 状态机', () => {
  beforeEach(() => {
    resetSessionMemoryState()
  })
  afterEach(() => {
    resetSessionMemoryState()
  })

  test('缺省配置 10000/5000/3', () => {
    expect(DEFAULT_SESSION_MEMORY_CONFIG).toEqual({
      minimumMessageTokensToInit: 10000,
      minimumTokensBetweenUpdate: 5000,
      toolCallsBetweenUpdates: 3,
    })
    expect(hasMetInitializationThreshold(9999)).toBe(false)
    expect(hasMetInitializationThreshold(10000)).toBe(true)
  })

  test('update 阈值 = 距上次抽取的 context 增量（非累计）', () => {
    expect(hasMetUpdateThreshold(4999)).toBe(false)
    expect(hasMetUpdateThreshold(5000)).toBe(true)
    recordExtractionTokenCount(10000)
    expect(hasMetUpdateThreshold(14999)).toBe(false)
    expect(hasMetUpdateThreshold(15000)).toBe(true)
  })

  test('config 覆写 + reset 回缺省', () => {
    setSessionMemoryConfig({
      minimumMessageTokensToInit: 5,
      minimumTokensBetweenUpdate: 2,
      toolCallsBetweenUpdates: 1,
    })
    expect(hasMetInitializationThreshold(5)).toBe(true)
    expect(getToolCallsBetweenUpdates()).toBe(1)
    resetSessionMemoryState()
    expect(hasMetInitializationThreshold(5)).toBe(false)
    expect(getToolCallsBetweenUpdates()).toBe(3)
  })

  test('initialized 标志位', () => {
    expect(isSessionMemoryInitialized()).toBe(false)
    markSessionMemoryInitialized()
    expect(isSessionMemoryInitialized()).toBe(true)
  })

  test('waitFor 未抽取时立即返回', async () => {
    await expect(waitForSessionMemoryExtraction()).resolves.toBeUndefined()
  })
})

describe('SessionMemoryPort 注入窗口（Port 5）', () => {
  afterEach(() => {
    setSessionMemoryPort(null)
  })

  test('未注 port → getSessionMemoryContent 诚实返 null（非假通过）', async () => {
    expect(getSessionMemoryPort()).toBeNull()
    await expect(getSessionMemoryContent()).resolves.toBeNull()
  })

  test('注 port 后 load 面透传', async () => {
    let saved: string | undefined
    setSessionMemoryPort({
      load: async () => 'memory-content',
      save: async content => {
        saved = content
      },
    })
    expect(getSessionMemoryPort()).not.toBeNull()
    await expect(getSessionMemoryContent()).resolves.toBe('memory-content')
    await getSessionMemoryPort()!.save('new')
    expect(saved).toBe('new')
  })
})

// ── getSessionMessages memoize 面（unit 零磁盘）──────────────────────────────

describe('getSessionMessages 域本地 memoize', () => {
  afterEach(() => {
    clearSessionMessagesCache()
  })

  test('同 sessionId 并发共享同一 Promise（in-flight 缓存）', async () => {
    const p1 = getSessionMessages('memo-1')
    const p2 = getSessionMessages('memo-1')
    expect(p1).toBe(p2)
    await expect(p1).resolves.toBeInstanceOf(Set)
  })

  test('clearSessionMessagesCache 后重加载', async () => {
    const p1 = await getSessionMessages('memo-2')
    clearSessionMessagesCache()
    const p2 = await getSessionMessages('memo-2')
    expect(p2).toBeInstanceOf(Set)
    expect(p2).not.toBe(p1)
    expect(p1).toBeInstanceOf(Set)
  })
})
