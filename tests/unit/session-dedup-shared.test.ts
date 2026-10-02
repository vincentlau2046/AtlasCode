/**
 * R7（jsonl 双写收敛）：会话去重 Set 单一事实源判别测试（unit，无盘）。
 *
 * 被测能力 = engine/session/load.ts `_sessionMessagesCache` 是双写者（engine
 * loop sink / REPL useLogMessages）去重 Set 的单一事实源——tui sessionStorage
 * 的旧本地 lodash memoize 实例已裁，改经 engine 门面委托
 * （docs/r3-jsonl-double-write-root-cause.md 修复方向 ①）：
 *   ① 缓存实例共享：engine getSessionMessages 建缓存条目后，tui 面
 *      clearSessionMessagesCache（委托体）清掉它 → engine hasSessionMessagesCache
 *      = false（修前 tui 清的是本地 memoize，engine 缓存不受影响 = 红）。
 *   ② prime 面：primeSessionMessages 后 getSessionMessages resolve 同一 Set
 *      实例（--resume 挂载面预置语义，非重载文件）。
 *   ③ tui 读面（doesMessageExistInSession）见到 engine 侧登记的 uuid：
 *      engine 面 prime 的 Set 直接对 tui 面可见（修前 tui 读自家 memoize 盘
 *      快照 = 不见 = 红）。
 * prime 驱动零盘断言（cache Map 操作面）→ unit 层。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  getSessionMessages,
  clearSessionMessagesCache,
  primeSessionMessages,
  hasSessionMessagesCache,
} from '../../src/engine'
import {
  doesMessageExistInSession,
  clearSessionMessagesCache as tuiClearSessionMessagesCache,
} from '../../src/tui/utils/sessionStorage'

const SID = 'unit-dedup-session'

describe('R7 会话去重 Set 单一事实源（engine 缓存 = 双写者共享 Set）', () => {
  afterEach(() => {
    clearSessionMessagesCache()
  })

  test('① 缓存实例共享：tui 面 clear（委托）清掉 engine 缓存', async () => {
    // 建 engine 缓存条目（挂 handler 防无盘 load 的 unhandled rejection）
    void getSessionMessages(SID).catch(() => {})
    expect(hasSessionMessagesCache(SID)).toBe(true)
    // tui 面 clear = 委托 engine 缓存（修前仅清本地 lodash memoize → engine 缓存仍在）
    tuiClearSessionMessagesCache()
    expect(hasSessionMessagesCache(SID)).toBe(false)
  })

  test('② prime 面：primeSessionMessages → getSessionMessages resolve 同一 Set 实例', async () => {
    const primed = new Set(['u-1', 'u-2'])
    primeSessionMessages(SID, primed)
    const resolved = await getSessionMessages(SID)
    expect(resolved).toBe(primed)
    expect(hasSessionMessagesCache(SID)).toBe(true)
  })

  test('③ tui 读面见到 engine 侧登记的 uuid（共享 Set 跨域可见）', async () => {
    primeSessionMessages(SID, new Set(['u-9']))
    expect(await doesMessageExistInSession(SID, 'u-9')).toBe(true)
    expect(await doesMessageExistInSession(SID, 'u-absent')).toBe(false)
  })
})
