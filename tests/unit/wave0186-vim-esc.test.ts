/**
 * 0.1.86 K6 · 任务 A · K6-2：vim 慢机 Escape 卡 INSERT（工单 §A）。
 *
 * 定因（Main 锁面探针实证）：慢机 PTY 读端落后时，OS tty 缓冲把连续按键合并为
 * 一个 read chunk——Esc 与下一键合并为 `\x1b`+letter。parse 层（parse-keypress.ts
 * META_KEY_CODE_RE）无字节时间戳，必须即刻决断 → 按 legacy Alt+letter 解析
 * （meta=true、name=''）。useVimInput INSERT 分支此前把它当普通字符输入：
 * 模式滞留 INSERT + 字母漏入 buffer（upstream 301「vim 模式慢机上 Escape 后
 * 滞留 INSERT」）。
 *
 * 修法（vim 域内）：INSERT 模式 meta+单字母 → Esc 语义（退 NORMAL）+ 按 NORMAL
 * 重放字母（Esc j = 下移、Esc i = 重进 INSERT）。parse 层不动（meta+b/f 词跳、
 * meta+y yank 等非 vim 车道零回归）；NORMAL 模式读 rawInput 本就忽略 meta。
 *
 * 分层纪律：纯函数门（escResolve.ts）+ parse 层机制实证。hook 接线为薄胶水，
 * 用户可见行为由 e2e gate 的 PTY 探针（合并 `\x1b`+j → NORMAL）复验。
 */
import { describe, expect, test } from 'bun:test'
import { isCoalescedEscape } from '../../src/tui/vim/escResolve.js'
import { INITIAL_STATE, parseMultipleKeypresses } from '../../src/tui/ink/parse-keypress.js'

describe('K6-2 · parse 层合并机制实证（慢机 PTY 分片语义，修前即真）', () => {
  test('ESC+letter 同 chunk → legacy Alt+letter（meta=true、name 空）——卡 INSERT 的机制源', () => {
    const [keys] = parseMultipleKeypresses(INITIAL_STATE, '\x1bj')
    expect(keys).toHaveLength(1)
    const k = keys[0]!
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('')
    expect(k.meta).toBe(true)
  })

  test('ESC 单 chunk + FLUSH → 纯 escape（分片正常路径，回归锚）', () => {
    const [k1, s1] = parseMultipleKeypresses(INITIAL_STATE, '\x1b')
    expect(k1).toHaveLength(0)
    const [k2] = parseMultipleKeypresses(s1, null)
    expect(k2).toHaveLength(1)
    expect(k2[0]).toMatchObject({ kind: 'key', name: 'escape' })
  })

  test('ESC 分片后箭头键同 chunk 到达 → escape + up 双投递（重合成路径，回归锚）', () => {
    const [, s1] = parseMultipleKeypresses(INITIAL_STATE, '\x1b')
    const [keys] = parseMultipleKeypresses(s1, '\x1b[A')
    expect(keys.map(k => (k.kind === 'key' ? k.name : '?'))).toEqual(['escape', 'up'])
  })
})

describe('K6-2 · isCoalescedEscape 门矩阵（新增出口；hook 接线消费）', () => {
  const base = {
    meta: true,
    escape: false,
    ctrl: false,
    return: false,
    backspace: false,
    delete: false,
  }

  test('INSERT + meta + 单字母 → 命中（Esc 语义解析）', () => {
    expect(isCoalescedEscape('INSERT', base, 'j')).toBe(true)
    expect(isCoalescedEscape('INSERT', base, 'i')).toBe(true)
    expect(isCoalescedEscape('INSERT', { ...base }, 'I')).toBe(true) // Esc I = insert-at-first-nonblank
    expect(isCoalescedEscape('INSERT', base, '5')).toBe(true) // Esc 5 = count 前缀
  })

  test('NORMAL 模式不命中（NORMAL 读 rawInput 本就忽略 meta，零变更）', () => {
    expect(isCoalescedEscape('NORMAL', base, 'j')).toBe(false)
  })

  test('纯 escape（\\x1b\\x1b 双击）不命中——走既有 escape 分支', () => {
    expect(isCoalescedEscape('INSERT', { ...base, escape: true }, '')).toBe(false)
  })

  test('ctrl/return/backspace/delete 修饰不命中——保留 useTextInput 编辑语义', () => {
    expect(isCoalescedEscape('INSERT', { ...base, ctrl: true }, 'j')).toBe(false)
    expect(isCoalescedEscape('INSERT', { ...base, return: true }, '')).toBe(false)
    expect(isCoalescedEscape('INSERT', { ...base, backspace: true }, '\x7f')).toBe(false)
    expect(isCoalescedEscape('INSERT', { ...base, delete: true }, '')).toBe(false)
  })

  test('meta+y（yank）等非字母数字不命中——Alt 编辑快捷键零回归', () => {
    expect(isCoalescedEscape('INSERT', base, 'y')).toBe(true) // y 是字母 → 命中（vim: Esc y = operator 待 motion）
    expect(isCoalescedEscape('INSERT', base, ' ')).toBe(false) // Alt+space 非 vim 意图
    expect(isCoalescedEscape('INSERT', base, '')).toBe(false)
  })

  test('多字符 input（粘贴/序列尾）不命中', () => {
    expect(isCoalescedEscape('INSERT', base, 'jj')).toBe(false)
    expect(isCoalescedEscape('INSERT', base, '\x1bj')).toBe(false)
  })
})
