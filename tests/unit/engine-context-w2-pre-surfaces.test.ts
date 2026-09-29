/**
 * engine/context W2-2-pre 缺面先迁②④判别单测（§8.74.2/§8.74.9）：
 * compact 纯函数面（stripImagesFromMessages / mergeHookInstructions）+
 * snip 投影面（isSnipBoundaryMessage / projectSnippedView / snipProjection）
 * + reactive-compact 4 谓词 + time-based MC 配置读侧。
 * 判别目标（突变即红）：媒体块替换文案（[image]/[document]）/ tool_result
 * 嵌套剥离 / 无媒体原引用返回 / 指令合并顺序与空串归一 / snip 边界排除语义
 * / 谓词三重条件（type + isApiErrorMessage + 文案前缀）/ env 门控两态。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  stripImagesFromMessages,
  mergeHookInstructions,
  isSnipBoundaryMessage,
  projectSnippedView,
  snipProjection,
  isReactiveCompactEnabled,
  isWithheldPromptTooLong,
  isWithheldMediaSizeError,
  isReactiveOnlyMode,
  getTimeBasedMCConfig,
  TIME_BASED_MC_CONFIG_DEFAULTS,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const userMsg = (content: unknown): Message =>
  ({ type: 'user', message: { role: 'user', content } }) as Message
const assistantMsg = (text: string, apiError = false): Message =>
  ({
    type: 'assistant',
    isApiErrorMessage: apiError,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  }) as Message

// ── stripImagesFromMessages（compact 缺面②）─────────────────────────

describe('engine stripImagesFromMessages', () => {
  test('非 user 消息原引用返回', () => {
    const a = assistantMsg('hello')
    const out = stripImagesFromMessages([a])
    expect(out[0]).toBe(a)
  })

  test('无媒体块 user 消息原引用返回', () => {
    const m = userMsg([{ type: 'text', text: 'hi' }])
    expect(stripImagesFromMessages([m])).toContainEqual(m)
    expect(stripImagesFromMessages([m])[0]).toBe(m)
  })

  test('image/document 块替换为文本标记（原消息引用改变）', () => {
    const m = userMsg([
      { type: 'text', text: 'see' },
      { type: 'image', source: 'x' },
      { type: 'document', file: 'y' },
    ])
    const [out] = stripImagesFromMessages([m])
    expect(out).not.toBe(m)
    const content = (out.message as { content: Array<{ type: string; text: string }> }).content
    expect(content).toEqual([
      { type: 'text', text: 'see' },
      { type: 'text', text: '[image]' },
      { type: 'text', text: '[document]' },
    ])
  })

  test('tool_result 嵌套 image 剥离（外层块保留、内容数组替换）', () => {
    const m = userMsg([
      {
        type: 'tool_result',
        tool_use_id: 't1',
        content: [{ type: 'image', source: 'x' }, { type: 'text', text: 'ok' }],
      },
    ])
    const [out] = stripImagesFromMessages([m])
    const tr = (
      (out.message as { content: Array<Record<string, unknown>> }).content[0] as {
        type: string
        content: Array<{ type: string; text?: string }>
      }
    )
    expect(tr.type).toBe('tool_result')
    expect(tr.content).toEqual([
      { type: 'text', text: '[image]' },
      { type: 'text', text: 'ok' },
    ])
  })

  test('string content（非数组）原引用返回', () => {
    const m = userMsg('plain string')
    expect(stripImagesFromMessages([m])[0]).toBe(m)
  })
})

// ── mergeHookInstructions（compact 缺面②）──────────────────────────

describe('engine mergeHookInstructions', () => {
  test('双有 = 用户指令在前 + 空行 + hook 指令', () => {
    expect(mergeHookInstructions('A', 'B')).toBe('A\n\nB')
  })
  test('仅用户指令', () => {
    expect(mergeHookInstructions('A', undefined)).toBe('A')
  })
  test('仅 hook 指令', () => {
    expect(mergeHookInstructions(undefined, 'B')).toBe('B')
  })
  test('空串归一 undefined', () => {
    expect(mergeHookInstructions('', undefined)).toBeUndefined()
    expect(mergeHookInstructions(undefined, '')).toBeUndefined()
    expect(mergeHookInstructions('', 'B')).toBe('B')
    expect(mergeHookInstructions('A', '')).toBe('A')
  })
  test('双无 = undefined', () => {
    expect(mergeHookInstructions(undefined, undefined)).toBeUndefined()
  })
})

// ── snip 投影面（context 扩面④）─────────────────────────────────────

describe('engine snip 投影面', () => {
  const boundary = (): Message =>
    ({ type: 'system', subtype: 'snip_boundary' }) as Message
  const user = (n: number): Message =>
    ({ type: 'user', n }) as Message

  test('isSnipBoundaryMessage 三重条件（system + subtype）', () => {
    expect(isSnipBoundaryMessage(boundary())).toBe(true)
    expect(isSnipBoundaryMessage(user(1))).toBe(false)
    expect(
      isSnipBoundaryMessage({ type: 'system', subtype: 'other' } as Message),
    ).toBe(false)
    expect(isSnipBoundaryMessage({} as Message)).toBe(false)
  })

  test('无边界 = 原数组原引用', () => {
    const msgs = [user(1), user(2)]
    expect(projectSnippedView(msgs)).toBe(msgs)
  })

  test('有边界 = 仅边界后消息（边界自身排除）', () => {
    const a = user(1)
    const b = boundary()
    const c = user(2)
    const d = boundary()
    const e = user(3)
    expect(projectSnippedView([a, b, c, d, e])).toEqual([e])
  })

  test('最近边界生效（向前倒扫首个命中）', () => {
    const b1 = boundary()
    const x = user(1)
    const b2 = boundary()
    const y = user(2)
    expect(projectSnippedView([b1, x, b2, y])).toEqual([y])
  })

  test('snipProjection 别名等价', () => {
    const msgs = [user(1), boundary(), user(2)]
    expect(snipProjection(msgs)).toEqual(projectSnippedView(msgs))
  })
})

// ── reactive-compact 4 谓词（context 扩面④）────────────────────────

const RC_ENV_KEYS = ['ATLAS_DISABLE_REACTIVE_COMPACT', 'ATLAS_REACTIVE_ONLY']
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of RC_ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of RC_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

describe('engine reactive-compact 谓词', () => {
  test('isReactiveCompactEnabled：缺省开 / ATLAS_DISABLE_REACTIVE_COMPACT=true 关', () => {
    expect(isReactiveCompactEnabled()).toBe(true)
    process.env.ATLAS_DISABLE_REACTIVE_COMPACT = 'true'
    expect(isReactiveCompactEnabled()).toBe(false)
    process.env.ATLAS_DISABLE_REACTIVE_COMPACT = 'false'
    expect(isReactiveCompactEnabled()).toBe(true)
  })

  test('isReactiveOnlyMode：ATLAS_REACTIVE_ONLY=true 两态', () => {
    expect(isReactiveOnlyMode()).toBe(false)
    process.env.ATLAS_REACTIVE_ONLY = 'true'
    expect(isReactiveOnlyMode()).toBe(true)
  })

  test('isWithheldPromptTooLong 三重条件', () => {
    expect(isWithheldPromptTooLong(assistantMsg('Prompt is too long', true))).toBe(
      true,
    )
    // 非 API 错误消息 → false
    expect(isWithheldPromptTooLong(assistantMsg('Prompt is too long', false))).toBe(
      false,
    )
    // 非 assistant → false
    expect(isWithheldPromptTooLong(userMsg('Prompt is too long'))).toBe(false)
    // 文案不符 → false
    expect(isWithheldPromptTooLong(assistantMsg('other error', true))).toBe(false)
    // content 非数组 → false
    expect(
      isWithheldPromptTooLong({
        type: 'assistant',
        isApiErrorMessage: true,
        message: { content: 'plain' },
      } as Message),
    ).toBe(false)
  })

  test('isWithheldMediaSizeError 三重条件', () => {
    expect(
      isWithheldMediaSizeError(assistantMsg('Image was too large', true)),
    ).toBe(true)
    expect(
      isWithheldMediaSizeError(assistantMsg('Image was too large', false)),
    ).toBe(false)
    expect(isWithheldMediaSizeError(assistantMsg('other', true))).toBe(false)
  })
})

// ── getTimeBasedMCConfig（context 扩面④ 配置读侧）───────────────────

describe('engine getTimeBasedMCConfig', () => {
  test('返回缺省值副本（GB-off 态等价）+ 副本独立性', () => {
    const cfg = getTimeBasedMCConfig()
    expect(cfg).toEqual(TIME_BASED_MC_CONFIG_DEFAULTS)
    cfg.keepRecent = 99
    expect(TIME_BASED_MC_CONFIG_DEFAULTS.keepRecent).toBe(5)
  })
})
