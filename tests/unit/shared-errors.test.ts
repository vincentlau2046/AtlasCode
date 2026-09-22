/**
 * shared/errors 纯助手单测（C1 叶子下沉）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。仅错误对象形状检查。
 */
import { describe, test, expect } from "bun:test"
import {
  hasExactErrorMessage,
  toError,
  errorMessage,
  getErrnoCode,
  isENOENT,
  getErrnoPath,
  shortErrorStack,
  isFsInaccessible,
} from "../../src/shared"

function errnoError(code: string, path?: string): NodeJS.ErrnoException {
  const e = new Error(`test error ${code}`) as NodeJS.ErrnoException
  e.code = code
  if (path) e.path = path
  return e
}

describe("hasExactErrorMessage", () => {
  test("精确匹配 → true", () => {
    expect(hasExactErrorMessage(new Error("boom"), "boom")).toBe(true)
  })
  test("非 Error / 消息不符 → false", () => {
    expect(hasExactErrorMessage("boom", "boom")).toBe(false)
    expect(hasExactErrorMessage(new Error("boom"), "other")).toBe(false)
  })
})

describe("toError", () => {
  test("Error 透传（同实例）", () => {
    const e = new Error("x")
    expect(toError(e)).toBe(e)
  })
  test("非 Error 归一化（字符串值保留）", () => {
    const e = toError("stringy")
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("stringy")
    const n = toError(42)
    expect(n.message).toBe("42")
  })
})

describe("errorMessage", () => {
  test("Error → message；非 Error → String(e)", () => {
    expect(errorMessage(new Error("m"))).toBe("m")
    expect(errorMessage("plain")).toBe("plain")
    expect(errorMessage(null)).toBe("null")
  })
})

describe("getErrnoCode / isENOENT / getErrnoPath", () => {
  test("带 code 的 Error 取 code；ENOENT 判定", () => {
    const e = errnoError("ENOENT", "/a/b")
    expect(getErrnoCode(e)).toBe("ENOENT")
    expect(isENOENT(e)).toBe(true)
    expect(isENOENT(errnoError("EACCES"))).toBe(false)
  })
  test("无 code 的对象 / 非对象 → undefined / false", () => {
    expect(getErrnoCode(new Error("plain"))).toBe(undefined)
    expect(getErrnoCode("str")).toBe(undefined)
    expect(isENOENT("ENOENT")).toBe(false)
  })
  test("code 非 string 不取", () => {
    const e = new Error("x") as NodeJS.ErrnoException
    ;(e as { code: unknown }).code = 123
    expect(getErrnoCode(e)).toBe(undefined)
  })
  test("getErrnoPath 取 path；无 path → undefined", () => {
    expect(getErrnoPath(errnoError("EACCES", "/x/y"))).toBe("/x/y")
    expect(getErrnoPath(new Error("no path"))).toBe(undefined)
  })
})

describe("shortErrorStack", () => {
  test("非 Error → String(e)", () => {
    expect(shortErrorStack("boom")).toBe("boom")
  })

  test("无 stack → message", () => {
    const e = new Error("msg")
    e.stack = undefined
    expect(shortErrorStack(e)).toBe("msg")
  })

  test("帧数 ≤ maxFrames → 原 stack", () => {
    const e = new Error("short")
    // 手工构造 2 帧 stack（V8/Bun 格式）
    e.stack = "short\n    at f1 (a.ts:1:1)\n    at f2 (b.ts:2:2)"
    expect(shortErrorStack(e, 5)).toBe(e.stack)
  })

  test("帧数 > maxFrames → 头部 + 前 N 帧", () => {
    const e = new Error("long")
    e.stack = "long" + [1, 2, 3, 4, 5, 6, 7].map((i) => `\n    at frame${i} (x.ts:${i}:1)`).join("")
    const out = shortErrorStack(e, 3)
    const lines = out.split("\n")
    expect(lines[0]).toBe("long")
    expect(lines.length).toBe(4) // 头部 + 3 帧
    expect(lines[1]).toContain("frame1")
    expect(lines[3]).toContain("frame3")
    expect(out).not.toContain("frame4")
  })
})

describe("isFsInaccessible", () => {
  test("五类码全部命中", () => {
    for (const code of ["ENOENT", "EACCES", "EPERM", "ENOTDIR", "ELOOP"]) {
      expect(isFsInaccessible(errnoError(code))).toBe(true)
    }
  })
  test("其他码 / 无码 → false", () => {
    expect(isFsInaccessible(errnoError("EPIPE"))).toBe(false)
    expect(isFsInaccessible(new Error("plain"))).toBe(false)
    expect(isFsInaccessible("ENOENT")).toBe(false)
  })
})
