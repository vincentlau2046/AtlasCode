/**
 * 0.1.80 V3-1 K1-B②③ 判别锁 — 网关链行为锁（判别先行：实现在场，测试锁行为）
 *
 * K1-B② 响应模型名≠请求名以请求名为键防反复压缩 (@301)：
 *   网关改写响应 `message.model` ≠ 请求名时，auto-compact 触发/档位/阈值链
 *   全以请求名为键（loop 传 deps / model-string 形入参），响应 model 字段
 *   零消费——不因响应名 miss 配置而反复压缩（上游 301 症状 = 响应名重键
 *   → 每轮重压缩）。锁面：
 *     a) shouldAutoCompact 判定不读 message.model（响应名字段零影响）
 *     b) model-string 便捷形档位/阈值/启用按请求名取档（响应名档不泄漏）
 *     c) autoCompactIfNeeded 富路径端到端：响应名 ≠ 请求名 → 单次压缩成功
 *
 * K1-B③ 近窗压缩失败 PTL 降级链 (@299)：
 *   auto-compact 富路径（autoCompactRich createAutoCompactCompact →
 *   compactConversation CC-1180 PTL 截头重试，工单锚 :80/91 双门面）在场：
 *     d) 摘要请求自身 prompt-too-long → 截头重试（非用户卡死）
 *     e) 截头不可行（单组）/耗尽 → 有界抛错 → autoCompactIfNeeded 熔断计数
 *        （不无限循环）
 *
 * 纯函数 + DI 缝测试：零网络/零磁盘/零 PTY；接缝 = setCompactPorts +
 * setAutoCompactWindowSettingsSource（engine 注入窗口）。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  autoCompactIfNeeded,
  createAutoCompactCompact,
  getAutoCompactThreshold,
  isAutoCompactEnabledForModel,
  setAutoCompactSettingsSource,
  setAutoCompactWindowSettingsSource,
  setCompactPorts,
  shouldAutoCompact,
  type AutoCompactDeps,
  type CompactContext,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const user = (uuid: string, content?: unknown): Message => ({
  uuid,
  type: 'user',
  role: 'user',
  timestamp: 't',
  ...(content !== undefined ? { message: { role: 'user', content } } : {}),
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

/** 网关改写响应面：assistant message 携 `model` 字段 ≠ 请求名（K1-B② 载体）。 */
const gatewayAssistant = (id: string, text: string, responseModel: string): Message =>
  ({
    uuid: `a-${id}`,
    type: 'assistant',
    role: 'assistant',
    timestamp: 't',
    message: { id, model: responseModel, content: [{ type: 'text', text }] },
  }) as unknown as Message

const makeContext = (extra: Partial<CompactContext> = {}): CompactContext => ({
  abortController: new AbortController(),
  readFileState: new Map<string, { content: string; timestamp: number }>(),
  getAppState: () => ({}),
  options: { mainLoopModel: 'req-model' },
  ...extra,
})

const cacheSafeParams = () => ({
  systemPrompt: '',
  userContext: {},
  systemContext: {},
  forkContextMessages: [] as Message[],
})

/** CompactPorts 测试替身（d2a-s3 惯例 + responseModel 可注入 K1-B② 载体）。 */
const makePorts = (o: {
  summaryText?: string
  responseModel?: string
  failFirstWithPTL?: boolean
  failAlwaysWithPTL?: boolean
  calls?: { messages: Message[] }[]
}) => ({
  summarize: async (p: { messages: Message[] }): Promise<Message> => {
    o.calls?.push({ messages: p.messages })
    if (o.failAlwaysWithPTL || (o.failFirstWithPTL && o.calls?.length === 1)) {
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
        ...(o.responseModel ? { model: o.responseModel } : {}),
        content: [{ type: 'text', text: o.summaryText ?? 'REAL-SUMMARY' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    } as unknown as Message
  },
  executePreCompactHooks: async () => ({
    newCustomInstructions: undefined,
    userDisplayMessage: undefined,
  }),
  executePostCompactHooks: async () => ({}),
  processSessionStartHooks: async () => [],
  buildPostCompactAttachments: async () => [],
})

/** 触发 deps：窗 100k → 有效 80k → 阈值 67k；countTokens 70k = 超阈值必触发。 */
const makeTriggerDeps = (
  compact: AutoCompactDeps['compact'],
  tokenCount = 70_000,
): AutoCompactDeps => ({
  contextWindow: 100_000,
  countTokens: async () => tokenCount,
  compact,
})

const ENV_KEYS = [
  'DISABLE_COMPACT',
  'DISABLE_AUTO_COMPACT',
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'ATLAS_AUTO_COMPACT_WINDOW',
  'ATLAS_BLOCKING_LIMIT_OVERRIDE',
] as const
const savedEnv = new Map<string, string | undefined>()

afterEach(() => {
  setCompactPorts(null)
  setAutoCompactWindowSettingsSource(null)
  setAutoCompactSettingsSource(null)
  for (const k of ENV_KEYS) {
    const v = savedEnv.get(k)
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
    savedEnv.delete(k)
  }
})

/** env 覆写清场（model-string 形读 getAutoCompactEnvOverrides；防宿主环境污染档位断言）。 */
function clearEnvOverrides(): void {
  for (const k of ENV_KEYS) {
    savedEnv.set(k, process.env[k])
    delete process.env[k]
  }
}

describe('K1-B② 请求名键控锁（响应 model ≠ 请求名不重键/不反复压缩）', () => {
  test('a) shouldAutoCompact 判定不读 message.model——响应名字段零影响', async () => {
    const compactStub = (async () => {
      throw new Error('unreached')
    }) as AutoCompactDeps['compact']
    const plain = [user('u1', 'hi'), assistant('A', 'answer'), user('u2', 'more')]
    const alien = [
      user('u1', 'hi'),
      gatewayAssistant('A', 'answer', 'gateway/rewritten-name'),
      user('u2', 'more'),
    ]
    // 超阈值：两消息集同判定（响应 model 字段不参与触发决策）
    expect(await shouldAutoCompact(plain, makeTriggerDeps(compactStub))).toBe(true)
    expect(await shouldAutoCompact(alien, makeTriggerDeps(compactStub))).toBe(true)
    // 阈值下：同判定 false（不因响应名 miss 配置而误触发）
    expect(
      await shouldAutoCompact(alien, makeTriggerDeps(compactStub, 50_000)),
    ).toBe(false)
  })

  test('b) 档位/阈值/启用按请求名取档——响应名档位不泄漏进请求名阈值', () => {
    clearEnvOverrides()
    setAutoCompactWindowSettingsSource(() => ({
      'req-model': { kind: 'window', tokens: 60_000 },
      'gateway/resp-model': { kind: 'window', tokens: 40_000 },
    }))
    // 请求名档：cap 60k → 有效 40k → 阈值 27k（非响应名档的 7k）
    expect(getAutoCompactThreshold('req-model')).toBe(27_000)
    // 各模型各取己档（响应名档只对响应名生效）
    expect(getAutoCompactThreshold('gateway/resp-model')).toBe(7_000)

    setAutoCompactWindowSettingsSource(() => ({
      'gateway/resp-model': { kind: 'off' },
    }))
    // 响应名 off 档不关请求名 auto-compact（per-model 键控 = 请求名单键）
    expect(isAutoCompactEnabledForModel('req-model')).toBe(true)
    expect(isAutoCompactEnabledForModel('gateway/resp-model')).toBe(false)
  })

  test('c) 富路径端到端：响应名 ≠ 请求名 → 单次压缩成功，不反复压缩', async () => {
    clearEnvOverrides()
    const calls: { messages: Message[] }[] = []
    setCompactPorts(
      makePorts({ responseModel: 'gateway/resp-model', calls }) as never,
    )
    const compact = createAutoCompactCompact({
      trimmedSummarize: async () => 'TRIMMED',
      richContext: makeContext(),
      buildCacheSafeParams: () => cacheSafeParams(),
      keepRecent: 3,
    })
    const msgs = [
      user('u0', 'hi'),
      gatewayAssistant('X1', 'answer', 'gateway/resp-model'),
      user('u1', 'there'),
    ]
    const outcome = await autoCompactIfNeeded(
      msgs,
      undefined,
      makeTriggerDeps(compact),
    )
    // 上游 301 症状（响应名重键 → 反复压缩）在本链不存在：单次摘要、成功、
    // 熔断计数清零
    expect(outcome.wasCompacted).toBe(true)
    expect(calls).toHaveLength(1)
    expect(outcome.tracking?.consecutiveFailures).toBe(0)
  })
})

describe('K1-B③ 近窗压缩失败 PTL 降级链锁（autoCompactRich 富路径消费面）', () => {
  const big = 'x'.repeat(100_000)
  const bigMsgs = [
    user('u1', big),
    assistant('A', big),
    user('u2', big),
    assistant('B', big),
    user('u3', big),
    assistant('C', big),
  ]

  const makeRichCompact = () =>
    createAutoCompactCompact({
      trimmedSummarize: async () => 'TRIMMED',
      richContext: makeContext(),
      buildCacheSafeParams: () => cacheSafeParams(),
    })

  test('d) 摘要命中 prompt-too-long → CC-1180 截头重试（组截断 + marker 头）', async () => {
    const calls: { messages: Message[] }[] = []
    setCompactPorts(
      makePorts({ failFirstWithPTL: true, calls }) as never,
    )
    const result = await makeRichCompact()(bigMsgs)
    // 首试全量 6 条；PTL → 截头重试（gap 100k 丢 3 组 → [aC] + marker = 2）
    expect(calls).toHaveLength(2)
    expect(calls[0].messages).toHaveLength(6)
    expect(calls[1].messages).toHaveLength(2)
    expect(
      String(
        (calls[1].messages[0] as { message?: { content?: unknown } }).message
          ?.content,
      ),
    ).toContain('truncated for compaction retry')
    // 降级链消化 PTL → 压缩成功（近窗失败不卡死用户）
    expect(
      String(
        (result.summaryMessages[0] as { message?: { content?: unknown } })
          .message?.content,
      ),
    ).toContain('REAL-SUMMARY')
  })

  test('e) 截头不可行（单组）→ 有界抛错 → autoCompactIfNeeded 熔断计数', async () => {
    const calls: { messages: Message[] }[] = []
    setCompactPorts(
      makePorts({ failAlwaysWithPTL: true, calls }) as never,
    )
    // 单组消息：truncateHeadForPTLRetry 无组可丢 → 首试即抛（不无限重试）
    const outcome = await autoCompactIfNeeded(
      [user('u1', big)],
      undefined,
      makeTriggerDeps(makeRichCompact()),
    )
    expect(calls).toHaveLength(1)
    expect(outcome.wasCompacted).toBe(false)
    expect(outcome.consecutiveFailures).toBe(1)
    expect(outcome.error).toContain('too long')
  })
})
