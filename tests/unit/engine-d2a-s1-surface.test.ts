/**
 * D-2a S1（M5 切端波）engine context 低/中风险面回填判别单测：
 * 常量（ERROR_MESSAGE_INCOMPLETE_RESPONSE / SNIP_NUDGE_TEXT）/ 谓词
 * （isSnipMarkerMessage ≡ isSnipBoundaryMessage dedup + isCompactBoundaryMessage）/
 * 门控（isSnipRuntimeEnabled env kill-switch 四态）/ nudge 节奏（shouldNudgeForSnips
 * 三锚点 + 阈值）/ cachedMC stub（getCachedMCConfig）/ 压缩警告抑制 store
 * （compactWarningStore + suppress/clear 幂等语义）。
 * 判别目标（突变即红）：常量文案逐字 / 谓词三重条件 / DISABLE 优先于 FEATURE /
 * FEATURE=false 关、默认开 / 锚点取最近一个（post-anchor 才计数）/ 10k 阈值边界 /
 * store 幂等（同值不通知）。
 */
import { describe, test, expect } from 'bun:test'
import {
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  SNIP_NUDGE_TEXT,
  isSnipMarkerMessage,
  isSnipBoundaryMessage,
  isCompactBoundaryMessage,
  isSnipRuntimeEnabled,
  shouldNudgeForSnips,
  getCachedMCConfig,
  compactWarningStore,
  suppressCompactWarning,
  clearCompactWarningSuppression,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const systemMsg = (subtype: string): Message =>
  ({ type: 'system', subtype, role: 'system' }) as Message
const userText = (text: string): Message =>
  ({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  }) as Message
const nudgeMetaMsg = (): Message =>
  ({ type: 'user', isMeta: true, content: SNIP_NUDGE_TEXT }) as Message

// 40k 字符 text 经 estimateMessageTokens（chars/4 · 4/3 padding）≈ 13334 令牌 ≥ 10k 阈值
const BIG_TEXT = 'x'.repeat(40_000)
const SMALL_TEXT = 'y'.repeat(100)

describe('D-2a S1 · engine 常量面', () => {
  test('ERROR_MESSAGE_INCOMPLETE_RESPONSE 文案逐字（旧仓 compact.ts:283）', () => {
    expect(ERROR_MESSAGE_INCOMPLETE_RESPONSE).toBe(
      'Compaction interrupted · This may be due to network issues — please try again.',
    )
  })

  test('SNIP_NUDGE_TEXT 文案逐字（旧仓 snipCompact.ts:262）', () => {
    expect(SNIP_NUDGE_TEXT).toBe(
      'Your context is getting inefficient. If you have low-value, redundant, or ' +
        'superseded history, use the Snip tool to summarize and remove it, keeping ' +
        'only the most recent turns verbatim so the context window stays efficient.',
    )
  })
})

describe('D-2a S1 · engine 谓词面', () => {
  test('isSnipMarkerMessage：system + snip_boundary 三重条件', () => {
    expect(isSnipMarkerMessage(systemMsg('snip_boundary'))).toBe(true)
    expect(isSnipMarkerMessage(systemMsg('compact_boundary'))).toBe(false)
    expect(isSnipMarkerMessage(userText(BIG_TEXT))).toBe(false)
    // dedup 不变式：与 engine 已有 twin isSnipBoundaryMessage 全输入等价
    for (const m of [
      systemMsg('snip_boundary'),
      systemMsg('compact_boundary'),
      userText('z'),
      { type: 'user', content: 'plain' } as Message,
    ]) {
      expect(isSnipMarkerMessage(m)).toBe(isSnipBoundaryMessage(m))
    }
  })

  test('isCompactBoundaryMessage：system + compact_boundary 三重条件', () => {
    expect(isCompactBoundaryMessage(systemMsg('compact_boundary'))).toBe(true)
    expect(isCompactBoundaryMessage(systemMsg('snip_boundary'))).toBe(false)
    expect(isCompactBoundaryMessage(userText('z'))).toBe(false)
  })
})

describe('D-2a S1 · isSnipRuntimeEnabled（env kill-switch 四态）', () => {
  test('缺省 env = 开（旧 feature(HISTORY_SNIP) ON_BY_DEFAULT 语义）', () => {
    expect(isSnipRuntimeEnabled({} as NodeJS.ProcessEnv)).toBe(true)
    expect(isSnipRuntimeEnabled()).toBe(true)
  })
  test('ATLAS_DISABLE_SNIP=true 强制关（优先于 FEATURE=true 强开）', () => {
    expect(
      isSnipRuntimeEnabled({
        ATLAS_DISABLE_SNIP: 'true',
        FEATURE_HISTORY_SNIP: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false)
    expect(isSnipRuntimeEnabled({ ATLAS_DISABLE_SNIP: 'true' } as NodeJS.ProcessEnv)).toBe(false)
  })
  test('FEATURE_HISTORY_SNIP=false 关（kill-switch，engine 惯例）', () => {
    expect(isSnipRuntimeEnabled({ FEATURE_HISTORY_SNIP: 'false' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isSnipRuntimeEnabled({ FEATURE_HISTORY_SNIP: 'true' } as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('D-2a S1 · shouldNudgeForSnips（三锚点 + 10k 阈值）', () => {
  test('无锚点：全量估算 ≥10k → true', () => {
    expect(shouldNudgeForSnips([userText(BIG_TEXT)])).toBe(true)
  })
  test('无锚点：全量估算 <10k → false', () => {
    expect(shouldNudgeForSnips([userText(SMALL_TEXT)])).toBe(false)
  })
  test('snip 边界锚点：仅 post-anchor 计数（前段大消息不计）', () => {
    // 突变判别：若误计全量（含前段 BIG）→ 13k+13k 仍 ≥10k，但 post-anchor 仅 SMALL → false
    expect(shouldNudgeForSnips([userText(BIG_TEXT), systemMsg('snip_boundary'), userText(SMALL_TEXT)])).toBe(false)
  })
  test('compact 边界锚点：post-anchor 大消息 ≥10k → true', () => {
    expect(
      shouldNudgeForSnips([userText(SMALL_TEXT), systemMsg('compact_boundary'), userText(BIG_TEXT)]),
    ).toBe(true)
  })
  test('nudge meta 消息锚点：post-anchor 为空 → false', () => {
    // 突变判别：若 nudge meta 不算锚点 → 全量 BIG ≥10k → true（误判）
    expect(shouldNudgeForSnips([userText(BIG_TEXT), nudgeMetaMsg()])).toBe(false)
  })
  test('取最近锚点（多锚点取末位）', () => {
    expect(
      shouldNudgeForSnips([
        userText(BIG_TEXT),
        systemMsg('snip_boundary'),
        userText(BIG_TEXT),
        systemMsg('compact_boundary'),
        userText(SMALL_TEXT),
      ]),
    ).toBe(false)
  })
})

describe('D-2a S1 · getCachedMCConfig（CACHED_MICROCOMPACT 残留守 stub）', () => {
  test('缺省 OFF 态 = 空对象（死路径零运行时影响）', () => {
    expect(getCachedMCConfig()).toEqual({})
  })
})

describe('D-2a S1 · 压缩警告抑制 store（React-free，hook 留 tui）', () => {
  test('缺省 false → suppress → true → clear → false', () => {
    clearCompactWarningSuppression()
    expect(compactWarningStore.getState()).toBe(false)
    suppressCompactWarning()
    expect(compactWarningStore.getState()).toBe(true)
    clearCompactWarningSuppression()
    expect(compactWarningStore.getState()).toBe(false)
  })
  test('同值 setState 不通知（幂等）', () => {
    clearCompactWarningSuppression()
    let notified = 0
    const unsub = compactWarningStore.subscribe(() => {
      notified += 1
    })
    suppressCompactWarning() // false→true 通知 1
    expect(notified).toBe(1)
    suppressCompactWarning() // true→true 不通知
    expect(notified).toBe(1)
    clearCompactWarningSuppression() // true→false 通知 2
    expect(notified).toBe(2)
    unsub()
    suppressCompactWarning() // 已退订不通知
    expect(notified).toBe(2)
  })
})
