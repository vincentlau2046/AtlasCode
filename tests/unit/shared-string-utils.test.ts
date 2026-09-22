/**
 * shared/stringUtils 叶子单测（C1 叶子下沉，行为移植自旧仓 utils 单测口径）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。纯函数 + 纯类。
 */
import { describe, test, expect } from "bun:test"
import {
  escapeRegExp,
  capitalize,
  plural,
  firstLineOf,
  countCharInString,
  normalizeFullWidthDigits,
  normalizeFullWidthSpace,
  safeJoinLines,
  EndTruncatingAccumulator,
  truncateToLines,
} from "../../src/shared"

describe("escapeRegExp", () => {
  test("转义全部特殊字符为字面量", () => {
    const escaped = escapeRegExp("a.b*c?d^e$f(g)h|i[j]k\\l")
    // 用转义后的模式匹配原始字符串本身，且只匹配它
    expect(new RegExp(`^${escaped}$`).test("a.b*c?d^e$f(g)h|i[j]k\\l")).toBe(true)
    expect(new RegExp(`^${escaped}$`).test("abxc")).toBe(false)
  })
  test("普通字符串不变", () => {
    expect(escapeRegExp("plain-123")).toBe("plain-123")
  })
})

describe("capitalize", () => {
  test("首字母大写，其余不动（不同于 lodash capitalize）", () => {
    expect(capitalize("fooBar")).toBe("FooBar")
    expect(capitalize("hello world")).toBe("Hello world")
  })
  test("空串 → 空串", () => {
    expect(capitalize("")).toBe("")
  })
})

describe("plural", () => {
  test("n=1 → 单数", () => {
    expect(plural(1, "file")).toBe("file")
  })
  test("n≠1 → 默认加 s", () => {
    expect(plural(3, "file")).toBe("files")
    expect(plural(0, "file")).toBe("files")
  })
  test("自定义复数形式", () => {
    expect(plural(2, "entry", "entries")).toBe("entries")
    expect(plural(1, "entry", "entries")).toBe("entry")
  })
})

describe("firstLineOf", () => {
  test("无换行 → 整串", () => {
    expect(firstLineOf("abc")).toBe("abc")
  })
  test("有换行 → 第一行", () => {
    expect(firstLineOf("#!/bin/sh\necho hi")).toBe("#!/bin/sh")
  })
  test("空串 → 空串", () => {
    expect(firstLineOf("")).toBe("")
  })
})

describe("countCharInString", () => {
  test("计数正确", () => {
    expect(countCharInString("abcabc", "a")).toBe(2)
    expect(countCharInString("abc", "z")).toBe(0)
  })
  test("start 参数生效", () => {
    expect(countCharInString("abcabc", "a", 3)).toBe(1)
  })
  test("Buffer 结构化兼容（indexOf 同形）", () => {
    expect(countCharInString(Buffer.from("aaab"), "a")).toBe(3)
  })
})

describe("normalizeFullWidthDigits", () => {
  test("全角数字 → 半角", () => {
    expect(normalizeFullWidthDigits("０１２３")).toBe("0123")
  })
  test("混合输入只动全角", () => {
    expect(normalizeFullWidthDigits("a０b1")).toBe("a0b1")
  })
})

describe("normalizeFullWidthSpace", () => {
  test("U+3000 → 半角空格", () => {
    expect(normalizeFullWidthSpace("a　b")).toBe("a b")
  })
  test("普通空格不动", () => {
    expect(normalizeFullWidthSpace("a b")).toBe("a b")
  })
})

describe("safeJoinLines", () => {
  test("未超限 → 原样 join", () => {
    expect(safeJoinLines(["a", "b", "c"], ";", 100)).toBe("a;b;c")
  })
  test("空数组 → 空串", () => {
    expect(safeJoinLines([], ",", 10)).toBe("")
  })
  test("部分容纳 → 截断到剩余空间 + 标记（总长 = maxSize）", () => {
    // 50 a 已占 50；"," + b×50 放不下 → remainingSpace = 80-50-1-14 = 15
    // （标记 "...[truncated]" 14 字符：3 个点 + [truncated] 11 字符）
    const out = safeJoinLines(["a".repeat(50), "b".repeat(50)], ",", 80)
    expect(out.length).toBe(80)
    expect(out.endsWith("...[truncated]")).toBe(true)
    expect(out).toBe("a".repeat(50) + "," + "b".repeat(15) + "...[truncated]")
  })
  test("无剩余空间放内容 → 仅追加标记（可超 maxSize，标记不裁）", () => {
    const out = safeJoinLines(["aaaaa", "bbbbbb"], ",", 10)
    expect(out).toBe("aaaaa...[truncated]")
  })
})

describe("EndTruncatingAccumulator", () => {
  test("未超限：append 累积原样输出", () => {
    const acc = new EndTruncatingAccumulator(10)
    acc.append("hi")
    acc.append(" there")
    expect(acc.toString()).toBe("hi there")
    expect(acc.truncated).toBe(false)
    expect(acc.totalBytes).toBe(8)
  })
  test("超限：尾部截断 + 标记 + 保留 totalBytes 全量", () => {
    const acc = new EndTruncatingAccumulator(4)
    acc.append("abcdef")
    expect(acc.length).toBe(4)
    expect(acc.toString()).toContain("[output truncated")
    expect(acc.truncated).toBe(true)
    expect(acc.totalBytes).toBe(6)
  })
  test("超限后继续 append 不再膨胀内容", () => {
    const acc = new EndTruncatingAccumulator(4)
    acc.append("abcdef")
    const at = acc.length
    acc.append("ghijkl")
    expect(acc.length).toBe(at)
    expect(acc.totalBytes).toBe(12)
  })
  test("Buffer 输入", () => {
    const acc = new EndTruncatingAccumulator(10)
    acc.append(Buffer.from("ab"))
    acc.append(Buffer.from("cd"))
    expect(acc.toString()).toBe("abcd")
  })
  test("clear 重置全部状态", () => {
    const acc = new EndTruncatingAccumulator(4)
    acc.append("abcdef")
    acc.clear()
    expect(acc.length).toBe(0)
    expect(acc.truncated).toBe(false)
    expect(acc.totalBytes).toBe(0)
    expect(acc.toString()).toBe("")
  })
})

describe("truncateToLines", () => {
  test("行数 ≤ maxLines → 原样", () => {
    expect(truncateToLines("a\nb\nc", 3)).toBe("a\nb\nc")
    expect(truncateToLines("a\nb\nc", 5)).toBe("a\nb\nc")
  })
  test("超限行数 → 截断 + 省略号", () => {
    const out = truncateToLines("a\nb\nc\nd", 2)
    expect(out).toBe("a\nb…")
  })
})
