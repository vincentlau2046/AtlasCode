/**
 * AD-22 (0.1.50, CC 2.1.105) 判别单测：PreCompact hook block 消费支（压缩可控性）。
 *
 * 缺口（PAC 卡 D1/D2）：'PreCompact' 事件可触发（事件 enum + getMatchingHooks
 * case 'PreCompact'），但 compact 触发点未 honor hook 的 block 信号
 * （exit 2 / decision:block）→ 压缩照常执行。本测试钉消费支契约：
 * ① PreCompact block（宿主 executePreCompactHooks 自 executeHooksOutsideREPL
 *    结果项 exit-2 / decision:block 计算 blocked）→ 压缩被跳过 + 记 skip
 *    原因（summarize 不调用）——**修前红**（现富路径不 honor block）
 * ② 不 block → 正常压缩（行为零变更）
 * ③ 无 hook 配置（executePreCompactHooks → {}）→ 零回归（正常压缩）
 *
 * 富体经 CompactPorts DI 缝（setCompactPorts）注入；宿主（tui/utils/hooks.ts
 * executePreCompactHooks）把 raw 层 blocked 信号经 PreCompactHookResult 端口
 * 面（blocked?/blockingReason? 加性字段）透出给 engine 富路径。
 */
import {
  compactConversation,
  setCompactPorts,
  type CompactContext,
  type CompactionResult,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const user = (
  uuid: string,
  content?: unknown,
  extra: Record<string, unknown> = {},
): Message => ({
  uuid,
  type: 'user',
  role: 'user',
  timestamp: 't',
  ...(content !== undefined ? { message: { role: 'user', content } } : {}),
  ...extra,
})

const assistantMsg = (
  id: string,
  text: string,
  usage?: { input_tokens: number; output_tokens: number },
): Message =>
  ({
    uuid: `a-${id}`,
    type: 'assistant',
    role: 'assistant',
    timestamp: 't',
    message: {
      id,
      content: [{ type: 'text', text }],
      ...(usage ? { usage } : {}),
    },
  }) as Message

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

/**
 * AD-22 skip 载体面（加性字段）：修前经结构 cast 断言（RED），修后
 * CompactionResult 原生携带（GREEN）。
 */
type AD22CompactionResult = CompactionResult & {
  compactionSkipped?: boolean
  compactSkipReason?: string
}

const basePorts = {
  summarize: async (): Promise<Message> =>
    assistantMsg('s1', 'REAL-SUMMARY', { input_tokens: 10, output_tokens: 5 }),
  executePreCompactHooks: async () => ({}),
  executePostCompactHooks: async () => ({}),
  processSessionStartHooks: async () => [],
  buildPostCompactAttachments: async () => [],
}

describe('AD-22 PreCompact hook block 消费支（compact 富路径）', () => {
  afterEach(() => setCompactPorts(null))

  const runRich = async (
    isAutoCompact: boolean,
  ): Promise<AD22CompactionResult> =>
    (await compactConversation(
      [user('m1', 'hi'), user('m2', 'there')],
      makeContext(),
      cacheSafeParams(),
      false,
      undefined,
      isAutoCompact,
    )) as unknown as AD22CompactionResult

  test('① PreCompact block → 压缩被跳过 + 记 skip 原因（summarize 不调用）', async () => {
    let summarizeCalls = 0
    setCompactPorts({
      ...basePorts,
      summarize: async () => {
        summarizeCalls++
        return assistantMsg('s1', 'REAL-SUMMARY')
      },
      executePreCompactHooks: async () => ({
        blocked: true,
        blockingReason: "PreCompact hook 'guard' blocked compaction (exit 2)",
        userDisplayMessage: 'PRE-DISP',
      }),
    } as never)
    const result = await runRich(true)
    // block = 压缩不执行（不调摘要 LLM），skip 载体置位 + 原因记录
    expect(summarizeCalls).toBe(0)
    expect(result.compactionSkipped).toBe(true)
    expect(result.compactSkipReason).toBe(
      "PreCompact hook 'guard' blocked compaction (exit 2)",
    )
    expect(result.userDisplayMessage).toContain('skipped')
  })

  test('② 不 block → 正常压缩（skip 面不置位，摘要照常）', async () => {
    setCompactPorts({
      ...basePorts,
      executePreCompactHooks: async () => ({
        newCustomInstructions: 'HOOK-INST',
        userDisplayMessage: 'PRE-DISP',
      }),
    } as never)
    const result = await runRich(true)
    expect(result.compactionSkipped).toBeUndefined()
    expect(result.compactSkipReason).toBeUndefined()
    expect(String(result.summaryMessages[0].message.content)).toContain(
      'REAL-SUMMARY',
    )
    // hook 展示消息照旧透出（消费面零变更）
    expect(result.userDisplayMessage).toContain('PRE-DISP')
  })

  test('③ 无 hook 配置（executePreCompactHooks → {}）→ 零回归（正常压缩）', async () => {
    setCompactPorts(basePorts as never)
    const result = await runRich(true)
    expect(result.compactionSkipped).toBeUndefined()
    expect(String(result.summaryMessages[0].message.content)).toContain(
      'REAL-SUMMARY',
    )
    expect(result.userDisplayMessage).toBeUndefined()
  })
})
