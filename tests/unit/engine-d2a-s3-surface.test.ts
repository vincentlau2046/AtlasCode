/**
 * D-2a S3（M5 切端）判别单测：compactConversation 富体回填 + PTL 重试族 +
 * 纯逻辑移植（groupMessagesByApiRound / truncateHeadForPTLRetry /
 * getAssistantMessageText / getPromptTooLongTokenGap / extractDiscoveredToolNames）
 * + token 工具（getTokenUsage / tokenCountWithEstimation）+
 * getCompactUserSummaryMessage 4 参 + createCompactBoundaryMessage 富重载。
 *
 * 富体经 CompactPorts DI 缝（setCompactPorts）注入 LLM-bound / tui 耦合叶，
 * engine 本体零 tui 依赖（React-free 红线）；无端口注册时富路径显式报错。
 */
import {
  compactConversation,
  createCompactBoundaryMessage,
  extractDiscoveredToolNames,
  getAssistantMessageText,
  getCompactUserSummaryMessage,
  getPromptTooLongTokenGap,
  groupMessagesByApiRound,
  getTokenUsage,
  setCompactPorts,
  tokenCountWithEstimation,
  truncateHeadForPTLRetry,
  type CompactContext,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const user = (uuid: string, content?: unknown, extra: Record<string, unknown> = {}): Message => ({
  uuid,
  type: 'user',
  role: 'user',
  timestamp: 't',
  ...(content !== undefined ? { message: { role: 'user', content } } : {}),
  ...extra,
})

const assistant = (
  id: string,
  text: string,
  extra: Record<string, unknown> = {},
): Message => ({
  uuid: `a-${id}`,
  type: 'assistant',
  role: 'assistant',
  timestamp: 't',
  message: { id, content: [{ type: 'text', text }] },
  ...extra,
})

const makeContext = (extra: Partial<CompactContext> = {}): CompactContext => ({
  abortController: new AbortController(),
  readFileState: new Map<string, { content: string; timestamp: number }>(),
  getAppState: () => ({}),
  options: { mainLoopModel: 'test-model' },
  ...extra,
})

const cacheSafeParams = () => ({
  systemPrompt: '',
  userContext: {},
  systemContext: {},
  forkContextMessages: [] as Message[],
})

describe('D-2a S3 groupMessagesByApiRound（assistant-id 边界分组）', () => {
  test('新 assistant id 开新组（同 id 流式块留组内）', () => {
    const msgs = [
      user('u1'),
      assistant('A', 'r1'),
      user('u2', [{ type: 'tool_result' }]),
      assistant('A', 'r2'),
      assistant('B', 'r3'),
      user('u3'),
    ]
    const groups = groupMessagesByApiRound(msgs)
    expect(groups.map((g) => g.map((m) => m.uuid).join('+'))).toEqual([
      'u1',
      'a-A+u2+a-A',
      'a-B+u3',
    ])
  })
})

describe('D-2a S3 truncateHeadForPTLRetry（CC-1180 逃逸阀）', () => {
  const big = 'x'.repeat(100_000) // rough ≈ 25_000 tokens
  const ptlResponse = assistant('ptl', 'Prompt is too long', {
    isApiErrorMessage: true,
    errorDetails: 'prompt is too long 200000 tokens > 100000',
  })
  const msgs = [
    user('u1', big),
    assistant('A', big),
    user('u2', big),
    assistant('B', big),
    user('u3', big),
    assistant('C', big),
  ]

  test('tokenGap 可解析 → 丢最旧组至覆盖 gap（assistant 头补 meta marker）', () => {
    const out = truncateHeadForPTLRetry(msgs, ptlResponse)
    expect(out).not.toBeNull()
    // 组 = [u1],[aA,u2],[aB,u3],[aC]；gap 100k → 丢 3 组（25k+50k+50k=125k≥100k）
    expect(out!.length).toBe(2) // [aC] 前补 marker
    expect((out![0] as { message?: { content?: unknown } }).message?.content).toBe(
      '[earlier conversation truncated for compaction retry]',
    )
    expect((out![0] as { isMeta?: boolean }).isMeta).toBe(true)
    expect(out![1].uuid).toBe('a-C')
  })

  test('单组不可丢 → null', () => {
    expect(truncateHeadForPTLRetry([user('u1', big)], ptlResponse)).toBeNull()
  })

  test('gap 不可解析 → 20% 兜底（floor，≥1）', () => {
    const noGap = assistant('ptl2', 'Prompt is too long', { isApiErrorMessage: true })
    const ten: Message[] = []
    for (let i = 0; i < 5; i++) {
      ten.push(user(`u${i}`, big))
      ten.push(assistant(`id${i}`, big))
    }
    // 6 组（[u0],[a0,u1],[a1,u2],[a2,u3],[a3,u4],[a4]），
    // floor(6*0.2)=1 → 丢 1 组留 9 条；组头 assistant → 补 marker = 10 条
    const out = truncateHeadForPTLRetry(ten, noGap)
    expect(out!.length).toBe(10)
  })
})

describe('D-2a S3 getAssistantMessageText（纯）', () => {
  test('assistant 文本块拼接 / 非 assistant null / 字符串 content null', () => {
    const withBlocks = {
      uuid: 'x',
      type: 'assistant',
      message: {
        id: 'x',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      },
    } as Message
    expect(getAssistantMessageText(withBlocks)).toBe('a\nb')
    expect(getAssistantMessageText(user('u', 'hi'))).toBeNull()
    const strContent = {
      uuid: 'y',
      type: 'assistant',
      message: { id: 'y', content: 'plain' },
    } as Message
    expect(getAssistantMessageText(strContent)).toBeNull()
  })
})

describe('D-2a S3 getPromptTooLongTokenGap（纯）', () => {
  test('可解析差值 / 非 PTL 消息 undefined', () => {
    const ptl = assistant('p', 'Prompt is too long', {
      isApiErrorMessage: true,
      errorDetails: 'prompt is too long 150000 tokens > 100000',
    })
    expect(getPromptTooLongTokenGap(ptl)).toBe(50_000)
    expect(getPromptTooLongTokenGap(assistant('n', 'other error'))).toBeUndefined()
  })
})

describe('D-2a S3 extractDiscoveredToolNames（纯）', () => {
  test('tool_reference 块 + compact 边界携载集', () => {
    const toolResultMsg = user('u1', [
      {
        type: 'tool_result',
        content: [
          { type: 'tool_reference', tool_name: 'AlphaTool' },
          { type: 'text', text: 'x' },
        ],
      },
    ])
    const boundary = {
      uuid: 'b1',
      type: 'system',
      subtype: 'compact_boundary',
      compactMetadata: { preCompactDiscoveredTools: ['BetaTool'] },
    } as Message
    const found = extractDiscoveredToolNames([boundary, toolResultMsg])
    expect(found.has('AlphaTool')).toBe(true)
    expect(found.has('BetaTool')).toBe(true)
  })
})

describe('D-2a S3 token 工具（纯移植）', () => {
  test('getTokenUsage：assistant usage 取回 / 非 assistant undefined', () => {
    const usage = { input_tokens: 10, output_tokens: 5 }
    expect(getTokenUsage(assistant('A', 'x', { message: { id: 'A', content: [], usage } }))).toEqual(
      usage,
    )
    expect(getTokenUsage(user('u', 'x'))).toBeUndefined()
  })

  test('tokenCountWithEstimation：末 usage + 尾部 rough 估算', () => {
    const withUsage = assistant('A', 'x', { message: { id: 'A', content: [], usage: { input_tokens: 100 } } })
    const tail = user('u', 'x'.repeat(4000)) // rough = 1000
    // usage 100 + tail rough round(4000/4)=1000
    expect(tokenCountWithEstimation([withUsage, tail])).toBe(1100)
  })
})

describe('D-2a S3 getCompactUserSummaryMessage 4 参（旧仓 prompt.ts:328 逐字）', () => {
  test('transcriptPath 段 + recentMessagesPreserved 段 + suppress 续接段', () => {
    const full = getCompactUserSummaryMessage('S', true, '/tmp/transcript.jsonl', true)
    expect(full).toContain('read the full transcript at: /tmp/transcript.jsonl')
    expect(full).toContain('Recent messages are preserved verbatim.')
    expect(full).toContain('Pick up the last task as if the break never happened.')
    const plain = getCompactUserSummaryMessage('S')
    expect(plain).not.toContain('read the full transcript at:')
    expect(plain).not.toContain('Continue the conversation')
  })
})

describe('D-2a S3 createCompactBoundaryMessage 富重载', () => {
  test('3 参形：trigger 元信息 + logicalParentUuid', () => {
    const b = createCompactBoundaryMessage('auto', 123, 'last-uuid')
    expect(b.type).toBe('system')
    expect(b.subtype).toBe('compact_boundary')
    expect((b as { compactMetadata?: Record<string, unknown> }).compactMetadata?.trigger).toBe(
      'auto',
    )
    expect((b as { compactMetadata?: Record<string, unknown> }).compactMetadata?.preTokens).toBe(
      123,
    )
    expect((b as { logicalParentUuid?: string }).logicalParentUuid).toBe('last-uuid')
  })

  test('2 参裁剪形不变（messagesSummarized 元信息）', () => {
    const b = createCompactBoundaryMessage(456, 7)
    expect((b as { compactMetadata?: Record<string, unknown> }).compactMetadata?.messagesSummarized)
      .toBe(7)
  })
})

describe('D-2a S3 compactConversation 富路径（CompactPorts DI 缝）', () => {
  afterEach(() => setCompactPorts(null))

  const richDeps = {
    summaryText: 'REAL-SUMMARY',
    calls: [] as { messages: Message[] }[],
    failFirstWithPTL: false,
    marked: false,
  }
  const makePorts = (o: typeof richDeps & { lastSummaryRequest?: Message }) => ({
    summarize: async (p: { messages: Message[]; summaryRequest: Message }): Promise<Message> => {
      o.calls.push({ messages: p.messages })
      o.lastSummaryRequest = p.summaryRequest
      if (o.failFirstWithPTL && o.calls.length === 1) {
        return assistant('ptl', 'Prompt is too long', {
          isApiErrorMessage: true,
          errorDetails: 'prompt is too long 200000 tokens > 100000',
        })
      }
      return {
        uuid: 'a-s1',
        type: 'assistant',
        role: 'assistant',
        timestamp: 't',
        message: {
          id: 's1',
          content: [{ type: 'text', text: o.summaryText }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      } as Message
    },
    executePreCompactHooks: async () => ({
      newCustomInstructions: 'HOOK-INST',
      userDisplayMessage: 'PRE-DISP',
    }),
    executePostCompactHooks: async () => ({ userDisplayMessage: 'POST-DISP' }),
    processSessionStartHooks: async () => [
      { type: 'hook_result', hookName: 'session_start', uuid: 'h1' },
    ],
    buildPostCompactAttachments: async () => [
      { uuid: 'att1', type: 'attachment', attachment: { type: 'file' } } as Message,
    ],
    markPostCompaction: () => {
      o.marked = true
    },
  })
  test('富路径：attachments/hookResults/userDisplayMessage/usage/边界 trigger 全置位', async () => {
    const o = { ...richDeps }
    setCompactPorts(makePorts(o) as never)
    const ctx = makeContext()
    const result = await compactConversation(
      [user('m1', 'hi'), user('m2', 'there')],
      ctx,
      cacheSafeParams(),
      false,
      'CUSTOM',
      true,
    )
    expect(result.attachments.map((a) => a.uuid)).toEqual(['att1'])
    expect(result.hookResults).toHaveLength(1)
    expect(result.hookResults[0] as { uuid?: string }).toEqual(
      expect.objectContaining({ hookName: 'session_start' }),
    )
    expect(result.userDisplayMessage).toBe('PRE-DISP\nPOST-DISP')
    expect(result.compactionUsage).toEqual({ input_tokens: 10, output_tokens: 5 })
    expect(typeof result.truePostCompactTokenCount).toBe('number')
    expect(
      (result.boundaryMarker as { compactMetadata?: Record<string, unknown> }).compactMetadata
        ?.trigger,
    ).toBe('auto')
    expect(o.marked).toBe(true)
    // hook 指令合并进摘要 prompt（mergeHookInstructions 逐字）
    const promptText = String(
      (o.lastSummaryRequest as { message?: { content?: unknown } }).message?.content,
    )
    expect(promptText).toContain('CUSTOM')
    expect(promptText).toContain('HOOK-INST')
  })

  test('PTL 重试：摘要命中 prompt-too-long → 截头重试（组截断 + marker 头）', async () => {
    const o = { ...richDeps, calls: [] as { messages: Message[] }[], failFirstWithPTL: true }
    setCompactPorts(makePorts(o) as never)
    const big = 'x'.repeat(100_000)
    const msgs = [
      user('u1', big),
      assistant('A', big),
      user('u2', big),
      assistant('B', big),
      user('u3', big),
      assistant('C', big),
    ]
    const result = await compactConversation(
      msgs,
      makeContext(),
      cacheSafeParams(),
      true,
    )
    expect(o.calls.length).toBe(2)
    expect(o.calls[0].messages.length).toBe(6)
    // gap 100k：组 [u1],[aA,u2],[aB,u3],[aC] 丢 3 组 → [aC] + marker = 2
    expect(o.calls[1].messages.length).toBe(2)
    expect(String(result.summaryMessages[0].message.content)).toContain('REAL-SUMMARY')
  })

  test('手动压缩失败 → addNotification；自动压缩失败 → 静默', async () => {
    const failingPorts = {
      summarize: async (): Promise<Message> => {
        throw new Error('boom')
      },
      executePreCompactHooks: async () => ({}),
      executePostCompactHooks: async () => ({}),
      processSessionStartHooks: async () => [],
      buildPostCompactAttachments: async () => [],
    }
    let manualKey: string | undefined
    const ctxManual = makeContext({
      addNotification: (n: { key: string }) => {
        manualKey = n.key
      },
    })
    setCompactPorts(failingPorts as never)
    await expect(
      compactConversation([user('m1', 'hi')], ctxManual, cacheSafeParams(), false, undefined, false),
    ).rejects.toThrow('boom')
    expect(manualKey).toBe('error-compacting-conversation')

    let autoNotified = false
    const ctxAuto = makeContext({
      addNotification: () => {
        autoNotified = true
      },
    })
    await expect(
      compactConversation([user('m1', 'hi')], ctxAuto, cacheSafeParams(), true, undefined, true),
    ).rejects.toThrow('boom')
    expect(autoNotified).toBe(false)
  })

  test('无端口注册 → 富路径显式报错（不静默退化）', async () => {
    setCompactPorts(null)
    await expect(
      compactConversation([user('m1', 'hi')], makeContext(), cacheSafeParams(), false),
    ).rejects.toThrow(/setCompactPorts/)
  })
})
