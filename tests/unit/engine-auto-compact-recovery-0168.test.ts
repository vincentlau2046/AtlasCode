/**
 * 0.1.68 块 F′ autocompact 恢复对齐 + F-3a 小窗守卫 判别单测。
 *
 * 工单 = docs/2026-10-14-p0-wave-0168-ticket.md §F-对齐 C1–C7 逐组件对应
 * 测试项（用户裁定「一定要有对应测试项」：每项一行单测，缺一 = 判据①不通过）
 * + F-AB 恢复完整性判定（B 面 C1–C7 全在场 = 完整，任一缺 = 不完整）
 * + F-3a 32K 阈值非正守卫（小窗禁用红→绿 + 大窗精确同值恒等锚）。
 *
 * 判别目标（突变即红）：
 *   - C1 续会话提示：A（裁剪）/B（富路径）双面 summary 文案恒等（B 面
 *     transcript 指针在场）
 *   - C2 文件态重建：N 文件 readFileState → post-compact attachments 含 N 重注
 *     （A 缺席红→B 在场绿）+ 无打开文件 = attachments 恒 ∅（恒等锚防误注）
 *   - C3 已加载工具续发：tool_reference 消息 → boundary compactMetadata
 *     .preCompactDiscoveredTools 在场（A 缺席→B 在场）
 *   - C4/C5 session_start/PostCompact hooks：hook 消息/userDisplay 在场
 *     （B 绿）+ 默认 no-op 面恒 ∅（恒等锚）
 *   - C6 元数据重钉判别式：post-compact 序列头 = compact boundary（0.1.67
 *     C-1 reAppend 触发面恒等锚）
 *   - C7 近期消息保留：富路径 keepRecent N>0 → messagesToKeep 含最近 N 条
 *     原文 + 摘要 recentMessagesPreserved 标志（N=0 恒等锚；裁剪 fail-safe
 *     面恒 0 零回归）
 *   - F-3a：32K 窗（阈值 −1000）= 触发面禁用 + 警告面退化 + 显形字段；
 *     大窗（200K/256K/1M）阈值/警告态 = 修前精确同值
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  AUTOCOMPACT_KEEP_RECENT,
  buildPostCompactMessages,
  calculateTokenWarningState,
  compactConversation,
  createAutoCompactCompact,
  isAutoCompactThresholdPositive,
  isCompactBoundaryMessage,
  setCompactPorts,
  shouldAutoCompact,
  type CompactionResult,
  type HookResultMessage,
} from '../../src/engine'
import type { Message } from '../../src/shared'
import type { CompactContext, CompactPorts } from '../../src/engine'

// ── fixtures（engine-compact-precompact-block 同款惯例）──────────────

const user = (uuid: string, content?: unknown): Message =>
  ({
    uuid,
    type: 'user',
    role: 'user',
    timestamp: 't',
    message: { role: 'user', content: content ?? `user-${uuid}` },
  }) as Message

const assistantMsg = (id: string, text: string): Message =>
  ({
    uuid: `a-${id}`,
    type: 'assistant',
    role: 'assistant',
    timestamp: 't',
    message: {
      id,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  }) as Message

const makeContext = (extra: Partial<CompactContext> = {}): CompactContext =>
  ({
    abortController: new AbortController(),
    readFileState: new Map<string, { content: string; timestamp: number }>(),
    getAppState: () => ({}),
    options: { mainLoopModel: 'test-model' },
    ...extra,
  }) as unknown as CompactContext

const cacheSafeParams = (msgs: Message[] = []) => ({
  systemPrompt: '',
  userContext: {},
  systemContext: {},
  forkContextMessages: msgs,
})

const basePorts: CompactPorts = {
  summarize: async () =>
    assistantMsg('s1', 'REAL-SUMMARY') as unknown as Message,
  executePreCompactHooks: async () => ({}),
  executePostCompactHooks: async () => ({}),
  processSessionStartHooks: async () => [],
  buildPostCompactAttachments: async () => [],
}

/** C3 判别面：tool_result 块携 tool_reference（extractDiscoveredToolNames 扫描形）。 */
const toolRefMessage = (uuid: string, toolName: string): Message =>
  ({
    uuid,
    type: 'user',
    role: 'user',
    timestamp: 't',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          content: [{ type: 'tool_reference', tool_name: toolName }],
        },
      ],
    },
  }) as Message

const fileAttachment = (path: string, content: string) =>
  ({
    uuid: `att-${path}`,
    type: 'user',
    role: 'user',
    timestamp: 't',
    message: { role: 'user', content: '' },
    attachment: { type: 'file', path, content },
  }) as never

const summaryText = (result: CompactionResult): string => {
  const content = (
    result.summaryMessages[0] as { message?: { content?: unknown } }
  )?.message?.content
  return typeof content === 'string' ? content : ''
}

const boundaryMetadata = (
  result: CompactionResult,
): { preCompactDiscoveredTools?: string[] } | undefined =>
  (
    result.boundaryMarker as { compactMetadata?: { preCompactDiscoveredTools?: string[] } }
  ).compactMetadata

/** B 面（对齐富路径）触发器：isAutoCompact=true + 第 8 参 keepRecent。 */
const runRich = async (
  ports: CompactPorts,
  context: CompactContext,
  messages: Message[],
  keepRecent?: number,
): Promise<CompactionResult> => {
  setCompactPorts(ports)
  return (await compactConversation(
    messages,
    context,
    cacheSafeParams(messages),
    true, // suppressFollowUpQuestions（auto-compact 面）
    undefined,
    true, // isAutoCompact
    undefined,
    keepRecent,
  )) as CompactionResult
}

/** A 面（现状裁剪）触发器 = 修前 auto-compact 消费体（keepRecent 0 + 附件空）。 */
const runTrimmed = async (
  messages: Message[],
): Promise<CompactionResult> =>
  (await compactConversation(
    messages,
    {
      summarize: async () => 'TRIMMED-SUMMARY',
      keepRecent: 0,
    },
  )) as CompactionResult

const richMessages = (): Message[] => [
  user('u1', 'hi'),
  assistantMsg('a1', 'hello'),
  toolRefMessage('u2', 'AlphaTool'),
  assistantMsg('a3', 'used AlphaTool'),
  user('u4', 'more'),
  assistantMsg('a5', 'done'),
]

describe('0.1.68 F′ C1 续会话提示（A/B 双面恒等）', () => {
  afterEach(() => setCompactPorts(null))

  test('A 面（裁剪）summary 含「This session is being continued」', async () => {
    const result = await runTrimmed(richMessages())
    expect(summaryText(result).includes('This session is being continued')).toBe(
      true,
    )
  })

  test('B 面（富路径）summary 续会话文案 + transcript 指针在场', async () => {
    const result = await runRich(basePorts, makeContext(), richMessages())
    const text = summaryText(result)
    expect(text.includes('This session is being continued')).toBe(true)
    // 富路径携 transcript 指针（getTranscriptPath 单源；裁剪面无 = A 面差异面）
    expect(text.includes('read the full transcript at:')).toBe(true)
  })
})

describe('0.1.68 F′ C2 文件态重建（buildPostCompactAttachments）', () => {
  afterEach(() => setCompactPorts(null))

  test('B 面 N 文件重注（A 缺席红→B 在场绿）', async () => {
    const files = new Map<string, { content: string; timestamp: number }>([
      ['/a.ts', { content: 'A', timestamp: 1 }],
      ['/b.ts', { content: 'B', timestamp: 2 }],
      ['/c.ts', { content: 'C', timestamp: 3 }],
    ])
    const ports: CompactPorts = {
      ...basePorts,
      buildPostCompactAttachments: async (preFileState) =>
        Object.entries(preFileState).map(
          ([path, s]) => fileAttachment(path, s.content),
        ),
    }
    const context = makeContext({
      readFileState: files,
    } as Partial<CompactContext>)
    const result = await runRich(ports, context, richMessages())
    // 3 文件 readFileState → post-compact attachments 含 3 重注（A 面恒 ∅ = 缺口坐实）
    expect(result.attachments.length).toBe(3)
    const paths = result.attachments.map(
      (a) => (a as { attachment?: { path?: string } }).attachment?.path,
    )
    expect(paths).toEqual(['/a.ts', '/b.ts', '/c.ts'])
    // post-compact 序列含附件（buildPostCompactMessages 消费面）
    expect(
      buildPostCompactMessages(result).filter(
        (m) => (m as { attachment?: unknown }).attachment !== undefined,
      ).length,
    ).toBe(3)
  })

  test('B 面 无打开文件 = attachments 恒 ∅（恒等锚，防误注）', async () => {
    const result = await runRich(
      basePorts,
      makeContext(), // readFileState 空 Map
      richMessages(),
    )
    expect(result.attachments.length).toBe(0)
  })

  test('A 面（裁剪）attachments 缺席（修前基线，缺口坐实）', async () => {
    const result = await runTrimmed(richMessages())
    expect(result.attachments.length).toBe(0)
  })
})

describe('0.1.68 F′ C3 已加载工具续发（preCompactDiscoveredTools）', () => {
  afterEach(() => setCompactPorts(null))

  test('B 面 boundary compactMetadata.preCompactDiscoveredTools 在场（A 缺席→B 在场）', async () => {
    const result = await runRich(
      basePorts,
      makeContext(),
      [
        toolRefMessage('u1', 'AlphaTool'),
        toolRefMessage('u2', 'BetaTool'),
        assistantMsg('a1', 'ok'),
      ],
    )
    const tools = boundaryMetadata(result)?.preCompactDiscoveredTools
    expect(tools).toEqual(['AlphaTool', 'BetaTool'])
  })

  test('A 面（裁剪）boundary 无 preCompactDiscoveredTools（C3 缺席坐实）', async () => {
    const result = await runTrimmed(richMessages())
    // 裁剪 boundary 的 compactMetadata 仅通用字段（preTokens/messagesSummarized/
    // createdAt）；C3 判别字段 preCompactDiscoveredTools 缺席
    expect(boundaryMetadata(result)?.preCompactDiscoveredTools).toBeUndefined()
  })
})

describe('0.1.68 F′ C4/C5 session_start/PostCompact hooks', () => {
  afterEach(() => setCompactPorts(null))

  test('B 面 hooks 开：session_start hook 消息 + PostCompact userDisplay 在场', async () => {
    const hookMsg: HookResultMessage = {
      type: 'hook_result',
      hookName: 'session-start',
      result: { ok: true },
    }
    const ports: CompactPorts = {
      ...basePorts,
      processSessionStartHooks: async () => [hookMsg],
      executePostCompactHooks: async () => ({
        userDisplayMessage: 'POST-COMPACT-DISP',
      }),
    }
    const result = await runRich(ports, makeContext(), richMessages())
    // C4：session_start hook 消息经 hookResults 进 post-compact 序列
    expect(result.hookResults.length).toBe(1)
    expect(
      (result.hookResults[0] as { type: string }).type,
    ).toBe('hook_result')
    // C5：PostCompact hook userDisplay 合并面
    expect(result.userDisplayMessage?.includes('POST-COMPACT-DISP')).toBe(
      true,
    )
  })

  test('B 面 hooks 关（默认 no-op）= 恒 ∅ 恒等锚', async () => {
    const result = await runRich(basePorts, makeContext(), richMessages())
    expect(result.hookResults.length).toBe(0)
    expect(result.userDisplayMessage).toBeUndefined()
  })
})

describe('0.1.68 F′ C6 元数据重钉判别式（0.1.67 C-1 恒等锚）', () => {
  afterEach(() => setCompactPorts(null))

  test('A/B 双路 post-compact 序列头 = compact boundary（reAppend 触发面在场）', async () => {
    const a = await runTrimmed(richMessages())
    const b = await runRich(basePorts, makeContext(), richMessages())
    for (const result of [a, b]) {
      const post = buildPostCompactMessages(result)
      expect(isCompactBoundaryMessage(post[0])).toBe(true)
    }
  })
})

describe('0.1.68 F′ C7 近期消息保留（keepRecent N）', () => {
  afterEach(() => setCompactPorts(null))

  test('定参常量 AUTOCOMPACT_KEEP_RECENT = 3（Main 定参登记）', () => {
    expect(AUTOCOMPACT_KEEP_RECENT).toBe(3)
  })

  test('B 面 N>0：messagesToKeep 含最近 N 条原文 + 摘要 preserved-verbatim 标志（红→绿）', async () => {
    const messages = richMessages()
    const result = await runRich(
      basePorts,
      makeContext(),
      messages,
      AUTOCOMPACT_KEEP_RECENT,
    )
    // fixture uuid 形：assistantMsg('a3') → 'a-a3'（helper 前缀 a-）
    expect(result.messagesToKeep?.map((m) => m.uuid)).toEqual([
      'a-a3',
      'u4',
      'a-a5',
    ])
    // 摘要提示词同步置位（getCompactUserSummaryMessage 第 4 参）
    expect(
      summaryText(result).includes('Recent messages are preserved verbatim.'),
    ).toBe(true)
  })

  test('B 面 N=0 恒等锚：messagesToKeep 缺席 + 无 preserved-verbatim 行', async () => {
    const result = await runRich(basePorts, makeContext(), richMessages(), 0)
    expect(result.messagesToKeep).toBeUndefined()
    expect(
      summaryText(result).includes('Recent messages are preserved verbatim.'),
    ).toBe(false)
  })

  test('createAutoCompactCompact 透传：富面 keepRecent 生效 + port 门控 fail-safe（裁剪面恒 0 零回归）', async () => {
    const messages = richMessages()
    // 富面（port 已注册 + richContext 非 null）
    const richBody = createAutoCompactCompact({
      trimmedSummarize: async () => 'TRIMMED-SUMMARY',
      richContext: makeContext(),
      buildCacheSafeParams: (m) => cacheSafeParams(m),
      keepRecent: AUTOCOMPACT_KEEP_RECENT,
    })
    setCompactPorts(basePorts)
    const richResult = await richBody(messages)
    expect(richResult.messagesToKeep?.length).toBe(AUTOCOMPACT_KEEP_RECENT)
    // port 门控 fail-safe：未注册 port = 裁剪路径逐字恒等（keepRecent 恒 0）
    setCompactPorts(null)
    let trimmedCalls = 0
    const trimmedBody = createAutoCompactCompact({
      trimmedSummarize: async () => {
        trimmedCalls++
        return 'TRIMMED-SUMMARY'
      },
      richContext: makeContext(),
      buildCacheSafeParams: (m) => cacheSafeParams(m),
      keepRecent: AUTOCOMPACT_KEEP_RECENT,
    })
    const trimmedResult = await trimmedBody(messages)
    expect(trimmedCalls).toBe(1)
    expect(trimmedResult.messagesToKeep).toBeUndefined()
    expect(trimmedResult.attachments.length).toBe(0)
    // richContext null = 同 fail-safe 面
    const narrowBody = createAutoCompactCompact({
      trimmedSummarize: async () => 'TRIMMED-SUMMARY',
      richContext: null,
      buildCacheSafeParams: (m) => cacheSafeParams(m),
      keepRecent: AUTOCOMPACT_KEEP_RECENT,
    })
    setCompactPorts(basePorts)
    const narrowResult = await narrowBody(messages)
    expect(narrowResult.messagesToKeep).toBeUndefined()
  })
})

describe('0.1.68 F-AB 恢复完整性判定（B 面 C1–C7 全在场 = 完整）', () => {
  afterEach(() => setCompactPorts(null))

  test('全 fixture 单结果断言 C1–C7 任一缺 = 不完整（GATE-OPEN 打回面）', async () => {
    const messages = richMessages()
    const files = new Map<string, { content: string; timestamp: number }>([
      ['/a.ts', { content: 'A', timestamp: 1 }],
      ['/b.ts', { content: 'B', timestamp: 2 }],
    ])
    const hookMsg: HookResultMessage = {
      type: 'hook_result',
      hookName: 'session-start',
    }
    const ports: CompactPorts = {
      ...basePorts,
      buildPostCompactAttachments: async (preFileState) =>
        Object.entries(preFileState).map(
          ([path, s]) => fileAttachment(path, s.content),
        ),
      processSessionStartHooks: async () => [hookMsg],
      executePostCompactHooks: async () => ({
        userDisplayMessage: 'POST-COMPACT-DISP',
      }),
    }
    const result = await runRich(
      ports,
      makeContext({ readFileState: files } as Partial<CompactContext>),
      messages,
      AUTOCOMPACT_KEEP_RECENT,
    )

    // C1 续会话提示
    expect(summaryText(result).includes('This session is being continued')).toBe(
      true,
    )
    // C2 文件态重建（2 文件）
    expect(result.attachments.length).toBe(2)
    // C3 工具续发
    expect(boundaryMetadata(result)?.preCompactDiscoveredTools).toContain(
      'AlphaTool',
    )
    // C4 session_start hooks
    expect(result.hookResults.length).toBe(1)
    // C5 PostCompact hooks
    expect(result.userDisplayMessage?.includes('POST-COMPACT-DISP')).toBe(true)
    // C6 重钉判别式（序列头 boundary）
    expect(isCompactBoundaryMessage(buildPostCompactMessages(result)[0])).toBe(
      true,
    )
    // C7 近期消息保留
    expect(result.messagesToKeep?.length).toBe(AUTOCOMPACT_KEEP_RECENT)
    // C8 会话记忆保全 = 登记面（0.1.69 候选，非本波硬门）——此处不硬断言
  })
})

describe('0.1.68 F-3a 小窗阈值非正守卫（32K 禁用红→绿 + 大窗精确同值恒等锚）', () => {
  test('isAutoCompactThresholdPositive 纯谓词', () => {
    // 32K 窗 = 有效 12K − 13K = −1000 → 非正
    expect(isAutoCompactThresholdPositive(32_000)).toBe(false)
    // 边界：CW=33000 → 阈值 0（非正）；CW=33001 → 阈值 1（正）
    expect(isAutoCompactThresholdPositive(33_000)).toBe(false)
    expect(isAutoCompactThresholdPositive(33_001)).toBe(true)
    // 大窗恒正
    expect(isAutoCompactThresholdPositive(100_000)).toBe(true)
    expect(isAutoCompactThresholdPositive(200_000)).toBe(true)
    expect(isAutoCompactThresholdPositive(1_000_000)).toBe(true)
    // windowOverride 小窗 cap 同守卫（100K cap 30K → 有效 10K → 阈值 −3000）
    expect(isAutoCompactThresholdPositive(100_000, undefined, undefined, 30_000)).toBe(
      false,
    )
    // pctOverride 应用后仍正（100K：min(4000, 67000) = 4000 > 0）
    expect(isAutoCompactThresholdPositive(100_000, undefined, 5)).toBe(true)
  })

  test('32K 窗触发面禁用（修前恒真红→修后禁用绿）', async () => {
    const compactStub = async () => {
      throw new Error('unused')
    }
    // 修前：999_999 ≥ 负阈值恒真 = 每轮压缩风暴；修后 = 守卫禁用
    expect(
      await shouldAutoCompact([user('u1')], {
        contextWindow: 32_000,
        countTokens: async () => 999_999,
        compact: compactStub,
      }),
    ).toBe(false)
  })

  test('大窗触发面精确同值恒等锚（200K：阈值 167K 边界同值）', async () => {
    const compactStub = async () => {
      throw new Error('unused')
    }
    const deps = {
      contextWindow: 200_000,
      countTokens: (m: Message[]) => Promise.resolve(m.length * 1_000),
      compact: compactStub,
    }
    // 阈值 = 180K − 13K = 167K：167 千 token = 触界（同值），166.999K = 不触发
    expect(
      await shouldAutoCompact(
        Array.from({ length: 167 }, (_, i) => user(`u${i}`)),
        deps,
      ),
    ).toBe(true)
    expect(
      await shouldAutoCompact(
        Array.from({ length: 167 }, (_, i) => user(`u${i}`)),
        {
          ...deps,
          countTokens: async () => 166_999,
        },
      ),
    ).toBe(false)
  })

  test('32K 窗警告态退化面（负阈值不假警告 + 显形字段置位）', () => {
    const state = calculateTokenWarningState(30_000, {
      contextWindow: 32_000,
    })
    // 退化到有效窗口 12K 面：percentLeft 地板 0（修前 = 负阈值假百分数）
    expect(state.percentLeft).toBe(0)
    // 小窗 = auto-compact 禁用 → 不置「已超 auto-compact 阈值」假信号
    expect(state.isAboveAutoCompactThreshold).toBe(false)
    // 显形字段（TUI TokenWarning 显形行消费）
    expect(state.autoCompactDisabledBySmallWindow).toBe(true)
    // 有效窗口 12K 面真值（30K 已超窗 → 警告/错误/阻塞全置位）
    expect(state.isAboveWarningThreshold).toBe(true)
    expect(state.isAboveErrorThreshold).toBe(true)
    expect(state.isAtBlockingLimit).toBe(true)
  })

  test('大窗警告态精确同值恒等锚（256K/1M 修前同值）', () => {
    // 256K：有效 236K，阈值 223K
    const s256 = calculateTokenWarningState(200_000, {
      contextWindow: 256_000,
    })
    expect(s256.percentLeft).toBe(10)
    expect(s256.isAboveWarningThreshold).toBe(false)
    expect(s256.isAboveErrorThreshold).toBe(false)
    expect(s256.isAboveAutoCompactThreshold).toBe(false)
    expect(s256.isAtBlockingLimit).toBe(false)
    // 大窗 = 显形字段缺席（零回归锚）
    expect(s256.autoCompactDisabledBySmallWindow).toBeUndefined()

    // 1M：有效 980K，阈值 967K
    const s1m = calculateTokenWarningState(800_000, {
      contextWindow: 1_000_000,
    })
    expect(s1m.percentLeft).toBe(17)
    expect(s1m.isAboveWarningThreshold).toBe(false)
    expect(s1m.isAboveAutoCompactThreshold).toBe(false)
    expect(s1m.autoCompactDisabledBySmallWindow).toBeUndefined()
  })

  test('用户自禁面不显形小窗（autoCompactEnabled=false + 32K = 显形字段缺席）', () => {
    const state = calculateTokenWarningState(30_000, {
      contextWindow: 32_000,
      autoCompactEnabled: false,
    })
    // 用户自己关的开关不提示窗口问题（仅 enabled && 阈值非正才显形）
    expect(state.autoCompactDisabledBySmallWindow).toBeUndefined()
  })
})
