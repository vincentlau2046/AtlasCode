/**
 * parse-keypress 双协议 modifier 解码判别单测（kitty CSI-u / xterm modifyOtherKeys）。
 *
 * 来源：原 tests/unit/sidepanel-sbs-keychain.test.ts 协议层/事件层 6 例
 * （0.1.22 P1a R1 修波「kitty CSI-u 1-based 误解码」9 例键链单测之协议面）。
 * 0.1.24 C 波 P1a 全量回退：sidePanel 绑定（sidePanel:toggleDiffLayout）随
 * SidePanel 目录删除，匹配层 3 例弃；协议层/事件层是 parse-keypress 通用输入
 * 修复（非 P1a 专属）→ 按 §4b 判据「kitty 解码单测在 parse-keypress 名下绿」
 * 迁到本文件。
 *
 * 关键协议事实：
 * ① Kitty CSI-u modifier 字段是 **0-based 位掩码**（1=shift/2=alt/4=ctrl/8=super），
 *    真 kitty 终端 Ctrl+Shift+D 发 `\x1b[100;5u`（1+4），不是 6u；
 * ② XTerm modifyOtherKeys modifier 是 **1-based**（1 + shift·1 + alt·2 + ctrl·4），
 *    Ctrl+Shift+D 发 `\x1b[27;6;100~`。
 * 两协议编码不同——CSI-u 分支若误用 1-based 解码，kitty 的 5 会解成 ctrl-only
 * （shift 静默丢失），ctrl+shift 组合键在 kitty 协议终端永不触发。
 * 分层纪律：纯解析/纯匹配（无 React 渲染/无网络/无盘）。
 */
import { describe, test, expect } from 'bun:test'
import {
  INITIAL_STATE,
  parseMultipleKeypresses,
  type ParsedKey,
} from '../../src/tui/ink/parse-keypress'
import { InputEvent } from '../../src/tui/ink/events/input-event'

function firstKey(seq: string): ParsedKey {
  const [keys, state] = parseMultipleKeypresses(INITIAL_STATE, seq)
  const k = keys.find(x => x.kind === 'key') as ParsedKey | undefined
  if (k) return k
  // 防御：序列被分块缓冲时 flush 拿尾
  const [more] = parseMultipleKeypresses(state, null)
  return more.find(x => x.kind === 'key') as ParsedKey
}

describe('协议层：双协议 modifier 解码（parse-keypress）', () => {
  test('kitty CSI-u 0-based：\\x1b[100;5u = ctrl+shift+d', () => {
    const k = firstKey('\x1b[100;5u')
    expect(k.name).toBe('d')
    expect(k.ctrl).toBe(true)
    expect(k.shift).toBe(true)
  })

  test('xterm modifyOtherKeys 1-based：\\x1b[27;6;100~ = ctrl+shift+d', () => {
    const k = firstKey('\x1b[27;6;100~')
    expect(k.name).toBe('d')
    expect(k.ctrl).toBe(true)
    expect(k.shift).toBe(true)
  })

  test('kitty 裸字母无 modifier 字段 = 0（无修饰），非 shift', () => {
    const k = firstKey('\x1b[100u')
    expect(k.name).toBe('d')
    expect(k.ctrl).toBe(false)
    expect(k.shift).toBe(false)
  })

  test('kitty ctrl-only（\\x1b[100;4u）不带 shift（负例钉住位掩码语义）', () => {
    const k = firstKey('\x1b[100;4u')
    expect(k.ctrl).toBe(true)
    expect(k.shift).toBe(false)
  })

  test('kitty alt+d（\\x1b[100;2u）= meta 非 ctrl', () => {
    const k = firstKey('\x1b[100;2u')
    expect(k.meta).toBe(true)
    expect(k.ctrl).toBe(false)
  })
})

describe('事件层：InputEvent 契约（input/key 供键位匹配）', () => {
  test('两协议序列 → event.input="d" + key.ctrl + key.shift', () => {
    for (const seq of ['\x1b[100;5u', '\x1b[27;6;100~']) {
      const event = new InputEvent(firstKey(seq))
      expect(event.input).toBe('d')
      expect(event.key.ctrl).toBe(true)
      expect(event.key.shift).toBe(true)
      expect(event.key.meta).toBe(false)
    }
  })
})
