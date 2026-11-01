/**
 * 无损文本编码判别（0.1.84 V3-5 K5-3，工单 §B）。
 *
 * 单一解码权威：UTF-8（严格验证全输入）与 UTF-16LE（仅明确 FF FE BOM 识别
 * + 合法 code unit 验证）。其余（UTF-16BE / GBK / Shift-JIS / Win-1252 …
 * 传统编码）一律明确拒绝——不猜编码、不尝试转码、不靠 U+FFFD 出现与否
 * 判合法性（合法 U+FFFD = EF BF BD 是正常内容）。
 *
 * 与 4096B 前缀探测（fileRead detectEncodingForResolvedPath）的关系：探测
 * 仅作提示（hint），不能认证可安全写回——非法字节晚于 4096B 采样窗时探测
 * 必漏检。本模块对完整输入做判别，是 mutation 面（Write/Edit/NotebookEdit
 * 经 readFileSyncWithMetadata）与 Read LE 支的唯一解码事实源。
 *
 * 消费面：engine/TUI 双体 fileRead.ts（readFileSyncWithMetadata 元数据）+
 * 双体 readFileInRange.ts（LE BOM Read）。纯叶子：不依赖 settings/工具/UI。
 */

/** 解码失败（不支持编码 / 非法字节 / 坏码元）——带可定位原因。 */
export class UndecodableTextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UndecodableTextError'
  }
}

export type DecodedText = {
  /** 已剥离开头编码 BOM 的文本内容。 */
  content: string
  encoding: 'utf8' | 'utf16le'
  /** 输入是否以本编码的 BOM 开头（LE 识别必带 BOM → 恒 true）。 */
  bom: boolean
}

/**
 * 判别输入是否以 UTF-16LE BOM（FF FE）开头。
 * readFileInRange 快/流路径的编码分流探针（Read 面轻判别入口）。
 */
export function hasUtf16LeBom(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
}

/**
 * 无损解码：全输入判别 + 严格验证，失败抛 UndecodableTextError。
 *
 * 判别序（互斥、无猜测）：
 *  1. FF FE 前缀 → UTF-16LE（BOM 剥离 + 码元/代理项验证；奇数字节拒绝）；
 *  2. FE FF 前缀 → UTF-16BE，明确拒绝（不倒转字节、不猜传统编码）；
 *  3. 其余 → UTF-8 严格验证（超长/代理项/>U+10FFFF/截断序列全拒）。
 */
export function decodeTextLosslessly(bytes: Buffer): DecodedText {
  if (hasUtf16LeBom(bytes)) {
    return decodeUtf16Le(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    throw new UndecodableTextError(
      'UTF-16BE encoded text is not supported (UTF-16BE BOM detected). ' +
        'Re-save the file as UTF-8 or UTF-16LE.',
    )
  }
  return decodeUtf8Strict(bytes)
}

// ── UTF-8：严格验证 + 原生解码 ───────────────────────────────────────────

function decodeUtf8Strict(bytes: Buffer): DecodedText {
  validateUtf8(bytes)
  const bom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  const body = bom ? bytes.subarray(3) : bytes
  // 验证已过 → 原生 toString 无替换歧义（输出中的 U+FFFD 只能来自源字节）
  return { content: body.toString('utf8'), encoding: 'utf8', bom }
}

/**
 * 严格 UTF-8 验证（WHATWG 编码规范等价）：仅扫描不分配。
 * 拒绝：孤立续字节、截断多字节序列、超长编码（C0/C1/E0 80..、F0 80..）、
 * UTF-8 编码代理项（ED A0..BF）、超 U+10FFFF（F4 90..）。
 */
function validateUtf8(bytes: Buffer): void {
  const len = bytes.length
  let i = 0
  while (i < len) {
    const b0 = bytes[i]!
    if (b0 < 0x80) {
      i++
      continue
    }
    if (b0 < 0xc0) {
      throw new UndecodableTextError(
        `Invalid UTF-8: unexpected continuation byte 0x${hex(b0)} at offset ${i}.`,
      )
    }
    if (b0 < 0xe0) {
      if (b0 < 0xc2) {
        throw new UndecodableTextError(
          `Invalid UTF-8: overlong lead byte 0x${hex(b0)} at offset ${i}.`,
        )
      }
      requireContinuation(bytes, i + 1)
      i += 2
      continue
    }
    if (b0 < 0xf0) {
      // E0: A0..BF（禁超长）；ED: 80..9F（禁代理项）；其余 80..BF
      const lo = b0 === 0xe0 ? 0xa0 : 0x80
      const hi = b0 === 0xe0 ? 0xbf : b0 === 0xed ? 0x9f : 0xbf
      requireRange(
        bytes,
        i + 1,
        lo,
        hi,
        b0 === 0xed
          ? 'surrogate code point (U+D800..U+DFFF) is not valid UTF-8'
          : undefined,
      )
      requireContinuation(bytes, i + 2)
      i += 3
      continue
    }
    if (b0 < 0xf5) {
      // F0: 90..BF（禁超长）；F4: 80..8F（禁 > U+10FFFF）；其余 80..BF
      const lo = b0 === 0xf0 ? 0x90 : 0x80
      const hi = b0 === 0xf4 ? 0x8f : 0xbf
      requireRange(
        bytes,
        i + 1,
        lo,
        hi,
        b0 === 0xf4 ? 'code point beyond U+10FFFF' : undefined,
      )
      requireContinuation(bytes, i + 2)
      requireContinuation(bytes, i + 3)
      i += 4
      continue
    }
    throw new UndecodableTextError(
      `Invalid UTF-8: invalid lead byte 0x${hex(b0)} at offset ${i} ` +
        `(beyond U+10FFFF).`,
    )
  }
}

function requireContinuation(bytes: Buffer, i: number): void {
  if (i >= bytes.length || bytes[i]! < 0x80 || bytes[i]! > 0xbf) {
    throw new UndecodableTextError(
      `Invalid UTF-8: truncated multi-byte sequence at offset ${i - 1}.`,
    )
  }
}

function requireRange(
  bytes: Buffer,
  i: number,
  lo: number,
  hi: number,
  reason?: string,
): void {
  if (i >= bytes.length || bytes[i]! < lo || bytes[i]! > hi) {
    const detail = reason
      ? `: ${reason}`
      : ` (expected 0x${hex(lo)}..0x${hex(hi)})`
    throw new UndecodableTextError(
      `Invalid UTF-8: illegal continuation byte at offset ${i}${detail}.`,
    )
  }
}

function hex(b: number): string {
  return b.toString(16).padStart(2, '0')
}

// ── UTF-16LE：BOM 剥离 + 码元验证 ────────────────────────────────────────

function decodeUtf16Le(bytes: Buffer): DecodedText {
  const body = bytes.subarray(2)
  if (body.length % 2 !== 0) {
    throw new UndecodableTextError(
      `UTF-16LE input has an odd number of bytes (${body.length} after the ` +
        `BOM); the final code unit is truncated.`,
    )
  }
  const units = body.length / 2
  for (let u = 0; u < units; u++) {
    const unit = body.readUInt16LE(u * 2)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = u + 1 < units ? body.readUInt16LE((u + 1) * 2) : undefined
      if (next === undefined || next < 0xdc00 || next > 0xdfff) {
        throw new UndecodableTextError(
          `UTF-16LE: unpaired high surrogate 0x${unit
            .toString(16)
            .padStart(4, '0')} at code unit ${u}.`,
        )
      }
      u++ // 高低代理项成对消费
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new UndecodableTextError(
        `UTF-16LE: unpaired low surrogate 0x${unit
          .toString(16)
          .padStart(4, '0')} at code unit ${u}.`,
      )
    }
  }
  // 码元已验证 → 原生 toString 无损（代理项对在 JS 字符串内重组）
  return { content: body.toString('utf16le'), encoding: 'utf16le', bom: true }
}
