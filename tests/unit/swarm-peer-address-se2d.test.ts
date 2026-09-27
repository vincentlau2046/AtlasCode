/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）unit 层（零盘零模型）：peerAddress
 * 纯 parser 面（旧仓 a8af45b src/utils/peerAddress.ts 21L 逐字迁移，S-E2a
 * 叶子）。
 *
 * 测面 = parseAddress 3 分支（uds:/ 前缀 / bridge:/ 前缀 / 裸 '/' 路径
 * legacy 支 / other 兜底）+ 边界面（空前缀 target / 空串 / 非路径 plain
 * name 不 hijack——头注注释语义面：无 bare-session-ID 兜底，'bridge' 前缀
 * 不会劫持 session_manager 型 team 名）。
 */
import { describe, expect, test } from 'bun:test'
import { parseAddress } from '../../src/swarm'

describe('parseAddress 前缀分支', () => {
  test('uds: 前缀 → scheme uds + target 剥 4 字', () => {
    expect(parseAddress('uds:/tmp/atlas.sock')).toEqual({
      scheme: 'uds',
      target: '/tmp/atlas.sock',
    })
  })

  test('bridge: 前缀 → scheme bridge + target 剥 7 字', () => {
    expect(parseAddress('bridge:abc-123')).toEqual({
      scheme: 'bridge',
      target: 'abc-123',
    })
  })

  test('uds: 空前缀 → target 空串', () => {
    expect(parseAddress('uds:')).toEqual({ scheme: 'uds', target: '' })
  })

  test('bridge: 空前缀 → target 空串', () => {
    expect(parseAddress('bridge:')).toEqual({ scheme: 'bridge', target: '' })
  })
})

describe('parseAddress 裸路径 legacy 支（旧 UDS 发件人 from= 裸 socket 路径）', () => {
  test('单斜杠绝对路径 → uds 支（回复不落入 teammate 路由）', () => {
    expect(parseAddress('/var/run/atlas/peer.sock')).toEqual({
      scheme: 'uds',
      target: '/var/run/atlas/peer.sock',
    })
  })

  test('双斜杠路径 → uds 支（startsWith("/") 判定）', () => {
    expect(parseAddress('//double/slash.sock')).toEqual({
      scheme: 'uds',
      target: '//double/slash.sock',
    })
  })
})

describe('parseAddress other 兜底（plain 名不 hijack）', () => {
  test('bare team 名 → other + 原样 target', () => {
    expect(parseAddress('researcher')).toEqual({
      scheme: 'other',
      target: 'researcher',
    })
  })

  test('含 @ 的 teammate 全名 → other（name-routing 面）', () => {
    expect(parseAddress('worker-1@t1')).toEqual({
      scheme: 'other',
      target: 'worker-1@t1',
    })
  })

  test('broadcast 星号 → other', () => {
    expect(parseAddress('*')).toEqual({ scheme: 'other', target: '*' })
  })

  test('空串 → other + 空 target（无 bare-session-ID 兜底支）', () => {
    expect(parseAddress('')).toEqual({ scheme: 'other', target: '' })
  })

  test("'session-manager' 型名字不被 bridge 前缀劫持（头注注释语义）", () => {
    expect(parseAddress('session_manager')).toEqual({
      scheme: 'other',
      target: 'session_manager',
    })
  })
})
