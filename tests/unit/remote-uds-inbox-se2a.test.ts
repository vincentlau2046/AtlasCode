/**
 * remote 域 S-E2a（§8.68 R1 UDS 5 站点族基础设施）unit 层（零盘零模型）：
 * isUdsInboxEnabled 门双向（env opt-in 默认 OFF = 旧编译期 gate-OFF 保真，
 * 每次访问重读 env-live）+ stub 面 3 件（sendToUdsSocket /
 * startUdsMessaging / postInterClaudeMessage = 旧仓自身 any stub 逐字，
 * H6 登记非真行为）+ peerBridge handle 指针面 + isReplBridgeActive
 * boolean stub + parseAddress re-export 单一事实源（= swarm 域同一引用）。
 * prompt 门双态面 = engine/tools/team 模块消费面，落
 * engine-tools-send-message-uds-se2a.test.ts（U-P5，提交切分保 bisect 面）。
 *
 * env 卫生：ATLAS_EXPERIMENTAL_UDS_INBOX 用例内存取还原（isolated-process
 * runner 下文件间无泄漏，本文件自洁 = 复审口径）。
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  getReplBridgeHandle,
  isReplBridgeActive,
  isUdsInboxEnabled,
  parseAddress,
  postInterClaudeMessage,
  sendToUdsSocket,
  setReplBridgeHandle,
  startUdsMessaging,
} from '../../src/remote'
import { parseAddress as swarmParseAddress } from '../../src/swarm'

let saved: string | undefined

beforeEach(() => {
  saved = process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
  delete process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
})

afterEach(() => {
  if (saved === undefined) {
    delete process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
  } else {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = saved
  }
  setReplBridgeHandle(null)
})

// ── R-P1 门双向（isUdsInboxEnabled）────────────────────────────────────

describe('R-P1 isUdsInboxEnabled 门双向', () => {
  test('缺省关（env 未设 = 旧编译期 gate-OFF 保真）', () => {
    expect(isUdsInboxEnabled()).toBe(false)
  })

  test('ATLAS_EXPERIMENTAL_UDS_INBOX=1 开（isEnvTruthy 面）', () => {
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = '1'
    expect(isUdsInboxEnabled()).toBe(true)
  })

  test('env-live：模块加载后设 env 即翻转（每次访问重读）', () => {
    expect(isUdsInboxEnabled()).toBe(false)
    process.env.ATLAS_EXPERIMENTAL_UDS_INBOX = 'true'
    expect(isUdsInboxEnabled()).toBe(true)
    delete process.env.ATLAS_EXPERIMENTAL_UDS_INBOX
    expect(isUdsInboxEnabled()).toBe(false)
  })
})

// ── R-P2 stub 面 3 件（旧仓自身 any stub 逐字，H6 登记）────────────────

describe('R-P2 stub 面（no-op / {} 返回）', () => {
  test('sendToUdsSocket no-op resolve（真实现新旧仓均 0-hit）', async () => {
    await expect(
      sendToUdsSocket('/tmp/x.sock', 'hi'),
    ).resolves.toBeUndefined()
  })

  test('startUdsMessaging no-op resolve（CLI 面域外登记）', async () => {
    await expect(startUdsMessaging('/tmp/x.sock')).resolves.toBeUndefined()
  })

  test('postInterClaudeMessage 返回 {}（无 ok/error 键，旧 call 支假值 → 失败面）', async () => {
    const r = await postInterClaudeMessage('session_1', 'hi')
    expect(r).toEqual({})
    expect(r.ok).toBeUndefined()
  })
})

// ── R-P3 peerBridge handle 指针面 + boolean stub ───────────────────────

describe('R-P3 peerBridge', () => {
  test('handle 缺省 null / set / get / 清除', () => {
    expect(getReplBridgeHandle()).toBeNull()
    setReplBridgeHandle({ bridgeSessionId: 'b1' })
    expect(getReplBridgeHandle()).toEqual({ bridgeSessionId: 'b1' })
    setReplBridgeHandle(null)
    expect(getReplBridgeHandle()).toBeNull()
  })

  test('isReplBridgeActive = boolean stub true（旧 any stub {} truthy 等价）', () => {
    expect(isReplBridgeActive()).toBe(true)
  })
})

// ── R-P4 parseAddress re-export 单一事实源 ─────────────────────────────

describe('R-P4 parseAddress（remote 门面 re-export = swarm 同一引用）', () => {
  test('同一函数引用（engine↛swarm L3 经 remote 门面保持）', () => {
    expect(parseAddress).toBe(swarmParseAddress)
  })

  test('4 支行为面逐字（uds:/bridge:/bare path/other）', () => {
    expect(parseAddress('uds:/tmp/a.sock')).toEqual({
      scheme: 'uds',
      target: '/tmp/a.sock',
    })
    expect(parseAddress('bridge:session_1')).toEqual({
      scheme: 'bridge',
      target: 'session_1',
    })
    expect(parseAddress('/tmp/legacy.sock')).toEqual({
      scheme: 'uds',
      target: '/tmp/legacy.sock',
    })
    expect(parseAddress('researcher')).toEqual({
      scheme: 'other',
      target: 'researcher',
    })
  })
})
