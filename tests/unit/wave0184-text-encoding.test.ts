/**
 * 0.1.84 V3-5 K5-3 — decodeTextLosslessly 无损编码判别矩阵（unit 层零磁盘）。
 *
 * 上游 303：编码元数据只靠 4096B 前缀探测——非法 UTF-8 晚于 4096B 采样窗
 * 即漏检（读成乱码后写回 = 二次损坏）；UTF-16LE 只在 BOM 命中时读对，但
 * 奇数尾字节/坏代理项静默吞掉（toString 丢字节/漏代理项，无报错）；
 * UTF-16BE/传统编码（GBK/Shift-JIS…）一律按 UTF-8 宽容解码成 U+FFFD 乱码。
 *
 * 契约（工单 §B Interfaces）：
 *  - decodeTextLosslessly(bytes) → {content, encoding:'utf8'|'utf16le', bom}
 *  - content 不含开头编码 BOM；不支持/不合法抛带明确原因的 error
 *    （UndecodableTextError，message 含字节偏移/码元位置）；
 *  - UTF-8 严格验证全输入（非 4096B 采样）；LE 仅明确 FF FE BOM 识别并
 *    验证合法 code units；BE/非法 UTF-8 不猜传统编码、不尝试转码；
 *  - 合法 U+FFFD（EF BF BD）是正常内容——合法性判定不依赖「是否含 �」。
 *
 * RED 基线（05ec0bc+Task A）：模块不存在 → 全文件 import-error 非行为红
 * （工单 §0 规则）；本族行为红由 func 族 wave0184-read-utf16 承载。
 */
import { describe, expect, test } from 'bun:test'
import { decodeTextLosslessly, UndecodableTextError } from '../../src/shared'

/** 断言「明确拒绝」：类型 + 不吞（不能靠返回内容含 � 判定）。 */
function expectReject(bytes: Buffer, messagePattern: RegExp): void {
  let threw: unknown
  try {
    decodeTextLosslessly(bytes)
  } catch (e) {
    threw = e
  }
  expect(threw).toBeInstanceOf(UndecodableTextError)
  expect((threw as Error).message).toMatch(messagePattern)
}

// ── UTF-8 族 ─────────────────────────────────────────────────────────────

describe('decodeTextLosslessly：UTF-8（严格验证，全输入扫描）', () => {
  test('ASCII 无 BOM → utf8 / bom:false / 原文', () => {
    expect(decodeTextLosslessly(Buffer.from('hello world', 'utf8'))).toEqual({
      content: 'hello world',
      encoding: 'utf8',
      bom: false,
    })
  })

  test('多字节无 BOM（CJK 3 字节 + emoji 4 字节代理对）→ 原文', () => {
    const text = '你好 wörld 😀 end'
    expect(decodeTextLosslessly(Buffer.from(text, 'utf8'))).toEqual({
      content: text,
      encoding: 'utf8',
      bom: false,
    })
  })

  test('UTF-8 BOM（EF BB BF）→ bom:true 且 content 不含 BOM', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('alpha', 'utf8'),
    ])
    expect(decodeTextLosslessly(bytes)).toEqual({
      content: 'alpha',
      encoding: 'utf8',
      bom: true,
    })
  })

  test('空文件 → utf8 / bom:false / 空串（旧仓空文件 emoji 腐坏修复支保持）', () => {
    expect(decodeTextLosslessly(Buffer.alloc(0))).toEqual({
      content: '',
      encoding: 'utf8',
      bom: false,
    })
  })

  test('合法 U+FFFD（EF BF BD）是正常内容，非非法证据', () => {
    const bytes = Buffer.from('a�b', 'utf8')
    const result = decodeTextLosslessly(bytes)
    expect(result.encoding).toBe('utf8')
    expect(result.content).toBe('a�b')
  })

  test('非法 UTF-8 晚于 4096B 采样窗 → 全输入扫描命中（偏移入消息）', () => {
    // 5000 个 'a' 后置 0xFF：4096B 前缀探测窗必然漏检，全输入验证必命中。
    const bytes = Buffer.concat([
      Buffer.alloc(5000, 0x61),
      Buffer.from([0xff]),
    ])
    expectReject(bytes, /offset 5000/i)
  })

  test('孤立续字节（0x80）→ 拒绝', () => {
    expectReject(Buffer.from([0x80, 0x61]), /continuation/i)
  })

  test('截断多字节序列（EOF 处 0xE4 0xB8）→ 拒绝', () => {
    expectReject(Buffer.from([0x61, 0xe4, 0xb8]), /truncated|incomplete/i)
  })

  test('超长编码 lead（0xC0 0x80 = 假 NUL）→ 拒绝', () => {
    expectReject(Buffer.from([0xc0, 0x80]), /overlong/i)
  })

  test('UTF-8 编码代理项（ED A0 80 = U+D800）→ 拒绝', () => {
    expectReject(Buffer.from([0xed, 0xa0, 0x80]), /surrogate|0xed/i)
  })

  test('超 U+10FFFF（F4 90 80 80）→ 拒绝', () => {
    expectReject(Buffer.from([0xf4, 0x90, 0x80, 0x80]), /0xf4|10FFFF/i)
  })

  test('非法 lead（0xF5）→ 拒绝', () => {
    expectReject(Buffer.from([0xf5, 0x80, 0x80, 0x80]), /lead|0xf5/i)
  })
})

// ── UTF-16LE 族（仅明确 BOM 识别 + code unit 验证）──────────────────────

describe('decodeTextLosslessly：UTF-16LE（FF FE BOM 识别 + 码元验证）', () => {
  test('LE BOM + CJK/emoji/CRLF/无 LF 尾 → 正确解码 + bom:true', () => {
    const text = '第一行\r\nlíne 😀 two\nno trailing newline'
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le'),
    ])
    expect(decodeTextLosslessly(bytes)).toEqual({
      content: text,
      encoding: 'utf16le',
      bom: true,
    })
  })

  test('仅 BOM（FF FE）→ 空串 + bom:true', () => {
    expect(decodeTextLosslessly(Buffer.from([0xff, 0xfe]))).toEqual({
      content: '',
      encoding: 'utf16le',
      bom: true,
    })
  })

  test('双重 BOM（FF FE FF FE）→ 仅剥第一层，第二层是内容 U+FEFF', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe, 0xff, 0xfe]),
      Buffer.from('x', 'utf16le'),
    ])
    const result = decodeTextLosslessly(bytes)
    expect(result.encoding).toBe('utf16le')
    expect(result.bom).toBe(true)
    expect(result.content).toBe('﻿x')
  })

  test('LE 奇数字节（BOM 后余 1 字节）→ 拒绝（旧 toString 静默丢字节）', () => {
    const bytes = Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x00])
    expectReject(bytes, /odd/i)
  })

  test('LE 高代理项在结尾无低配对 → 拒绝', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('ab', 'utf16le'),
      Buffer.from([0x3d, 0xd8]), // U+D83D 高代理项，EOF
    ])
    expectReject(bytes, /high surrogate/i)
  })

  test('LE 高代理项后非低代理项 → 拒绝', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from([0x3d, 0xd8, 0x41, 0x00]), // U+D83D + 'A'
    ])
    expectReject(bytes, /high surrogate/i)
  })

  test('LE 孤立低代理项 → 拒绝', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from([0x00, 0xdc, 0x41, 0x00]), // U+DC00 + 'A'
    ])
    expectReject(bytes, /low surrogate/i)
  })
})

// ── 不支持面（不猜传统编码）──────────────────────────────────────────────

describe('decodeTextLosslessly：不支持编码明确拒绝', () => {
  test('UTF-16BE BOM（FE FF）→ 明确拒绝（不按 UTF-8 猜乱码）', () => {
    // 'A' 的 BE 编码 = 00 41（Node Buffer 无 'utf16be' encoding，手工字节）
    const bytes = Buffer.from([0xfe, 0xff, 0x00, 0x41])
    expectReject(bytes, /UTF-16BE/i)
  })
})
