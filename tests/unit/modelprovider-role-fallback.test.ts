/**
 * P0b① 水平回退成功信号（docs/tui-differentiation-spec.md §4 P0b 门禁①）。
 *
 * spec §1 L29 钉死形状：queryWithRoleFallback 成功侧返回**加性**字段
 * servedRole（实际应答 role）/ fallbackUsed（是否走 fallbackRole），非 onFallbackSuccess
 * 回调（TUI 展示面在 await 点同步可得）。信任线「已从 X 回退到 Y」= 独立纯 leaf
 * roleFallbackStore 最近一次记录（primary 成功清除 / fallback 成功记录），segment 只读。
 *
 * 被测三块：
 *   ① roleFallbackStore 纯 leaf（record / clear / getLast / re-record 覆盖）
 *   ② queryWithRoleFallback 加性返回 + store 写入/清除时序 + 失败侧 onPrimaryError/
 *      onFallbackError 不变（provider 经 setModelProviderForTesting 注入缝，非 mock 网络）
 *   ③ RoleFallbackSegment 渲染谓词（无回退=null 不留分隔符；有回退=含 from→to 文本）
 *
 * 分层纪律：纯函数 + provider 注入缝 + React 元素谓词（无网络 / 无盘 / 无 PTY）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as React from 'react'
import {
  queryWithRoleFallback,
  type QueryWithRoleFallbackResult,
  setModelProviderForTesting,
  resetModelProviderForTesting,
  recordRoleFallback,
  clearRoleFallback,
  getLastRoleFallback,
  type ModelProvider,
} from '../../src/modelprovider'
import { asSystemPrompt } from '../../src/shared'
import { RoleFallbackSegment } from '../../src/tui/components/StatusLine/segments/RoleFallbackSegment.js'
import type {
  SegmentRenderContext,
  SegmentComponent,
} from '../../src/tui/components/StatusLine/segments/types.js'

// ── fake ModelProvider（§8.13 L-2：返固定 completion，非 mock 网络）────────
const FAKE_CONTENT: any[] = [{ type: 'text', text: 'FAKE-COMPLETION' }]
function fakeMessage() {
  return {
    type: 'assistant' as const,
    uuid: 'fake-uuid',
    timestamp: 'fake-ts',
    message: {
      id: 'fake-msg',
      model: 'fake-model',
      role: 'assistant' as const,
      content: FAKE_CONTENT,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  }
}

function makeProvider(chatImpl: (args: any) => Promise<unknown>): ModelProvider {
  const noop = async () => {
    throw new Error('fake ModelProvider: 方法未被本测消费')
  }
  // 测试 seam：仅 chat 被消费，其余 no-op。`as unknown as ModelProvider` 绕结构
  // 穷举（接口随波演进，本测只钉 chat 语义）。
  return {
    chat: chatImpl,
    chatStream: async function* () {},
    healthCheck: noop,
    countTokens: noop,
    listModels: async () => [],
    transcribeAudio: noop,
    synthesizeSpeech: noop,
    verifyKey: async () => true,
    getTimeoutMs: () => 600_000,
  } as unknown as ModelProvider
}

const EMPTY_OPTS = {
  messages: [] as never[],
  systemPrompt: asSystemPrompt([]),
  sessionModel: 'fake-model',
}

// ── ① roleFallbackStore 纯 leaf ──────────────────────────────────────────
describe('P0b① roleFallbackStore 纯 leaf', () => {
  beforeEach(() => clearRoleFallback())

  test('初始 getLast = null', () => {
    expect(getLastRoleFallback()).toBeNull()
  })
  test('record → 读取 {from,to}', () => {
    recordRoleFallback('premium', 'small')
    expect(getLastRoleFallback()).toEqual({ from: 'premium', to: 'small' })
  })
  test('clear → 回到 null', () => {
    recordRoleFallback('premium', 'fast')
    clearRoleFallback()
    expect(getLastRoleFallback()).toBeNull()
  })
  test('re-record 覆盖最近一次', () => {
    recordRoleFallback('premium', 'fast')
    recordRoleFallback('fast', 'small')
    expect(getLastRoleFallback()).toEqual({ from: 'fast', to: 'small' })
  })
})

// ── ② queryWithRoleFallback 加性返回 + store 时序 ─────────────────────────
describe('P0b① queryWithRoleFallback 加性返回 servedRole/fallbackUsed', () => {
  beforeEach(() => clearRoleFallback())
  afterEach(() => {
    resetModelProviderForTesting()
    clearRoleFallback()
  })

  test('primary 成功 → servedRole=role, fallbackUsed=false, store 清除, onPrimaryError 未触发', async () => {
    setModelProviderForTesting(makeProvider(async () => fakeMessage()))
    let primaryErrorFired = false
    const res: QueryWithRoleFallbackResult = await queryWithRoleFallback({
      ...EMPTY_OPTS,
      role: 'premium',
      fallbackRole: 'small',
      onPrimaryError: () => {
        primaryErrorFired = true
      },
    })
    expect(res.servedRole).toBe('premium')
    expect(res.fallbackUsed).toBe(false)
    // 加性 spread 保留原 chat 字段（消费者零签名变更）
    expect(res.message.content).toEqual(FAKE_CONTENT)
    // primary 成功 → 无活跃回退（清掉上一次记录）
    expect(getLastRoleFallback()).toBeNull()
    expect(primaryErrorFired).toBe(false)
  })

  test('primary 失败 + fallback 成功 → servedRole=fallbackRole, fallbackUsed=true, store 记录, onPrimaryError 触发', async () => {
    let calls = 0
    setModelProviderForTesting(
      makeProvider(async () => {
        calls++
        if (calls === 1) throw new Error('primary down')
        return fakeMessage()
      }),
    )
    const fired: unknown[] = []
    const res = await queryWithRoleFallback({
      ...EMPTY_OPTS,
      role: 'premium',
      fallbackRole: 'small',
      onPrimaryError: e => fired.push(e),
    })
    expect(calls).toBe(2)
    expect(res.servedRole).toBe('small')
    expect(res.fallbackUsed).toBe(true)
    expect(res.message.content).toEqual(FAKE_CONTENT)
    expect(getLastRoleFallback()).toEqual({ from: 'premium', to: 'small' })
    expect(fired.length).toBe(1)
  })

  test('无 fallbackRole + primary 失败 → 抛错，store 不变（null）', async () => {
    setModelProviderForTesting(makeProvider(async () => {
      throw new Error('primary down')
    }))
    await expect(
      queryWithRoleFallback({ ...EMPTY_OPTS, role: 'premium' }),
    ).rejects.toThrow('primary down')
    expect(getLastRoleFallback()).toBeNull()
  })

  test('两腿全失败 → onPrimaryError + onFallbackError 均触发，store 不记录', async () => {
    setModelProviderForTesting(makeProvider(async () => {
      throw new Error('both down')
    }))
    const fired = { primary: 0, fallback: 0 }
    await expect(
      queryWithRoleFallback({
        ...EMPTY_OPTS,
        role: 'premium',
        fallbackRole: 'small',
        onPrimaryError: () => {
          fired.primary++
        },
        onFallbackError: () => {
          fired.fallback++
        },
      }),
    ).rejects.toThrow('both down')
    expect(fired.primary).toBe(1)
    expect(fired.fallback).toBe(1)
    // fallback 未成功 → 不写信任线记录
    expect(getLastRoleFallback()).toBeNull()
  })
})

// ── ③ RoleFallbackSegment 渲染谓词 ───────────────────────────────────────
describe('P0b① RoleFallbackSegment 渲染谓词（信任线「已从 X 回退到 Y」）', () => {
  const ctx: SegmentRenderContext = {
    input: {} as SegmentRenderContext['input'],
    width: 120,
    density: 'detailed',
  }
  const children = (node: React.ReactNode): string => {
    if (node == null) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(children).join('')
    // React 元素：递归取 props.children
    return children((node as { props?: { children?: React.ReactNode } }).props?.children)
  }
  beforeEach(() => clearRoleFallback())

  test('无回退 → null（不留分隔符残余）', () => {
    expect(RoleFallbackSegment(ctx)).toBeNull()
  })

  test('有回退 → 元素文本含 from→to（已从 X 回退到 Y）', () => {
    recordRoleFallback('premium', 'small')
    const node = RoleFallbackSegment(ctx)
    expect(React.isValidElement(node)).toBe(true)
    const text = children(node)
    expect(text).toContain('premium')
    expect(text).toContain('small')
    expect(text).toContain('已从')
    expect(text).toContain('回退到')
  })

  test('re-record 后谓词跟随最近一次（fast→small）', () => {
    recordRoleFallback('premium', 'fast')
    recordRoleFallback('fast', 'small')
    const text = children(RoleFallbackSegment(ctx))
    expect(text).toContain('fast')
    expect(text).toContain('small')
    // 最近一次 from=fast（premium 已不是当前 from）
    expect(text).not.toContain('premium')
  })
})
