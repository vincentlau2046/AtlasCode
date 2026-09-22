/**
 * shared/format 叶子单测（C1 叶子下沉：formatFileSize）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。纯函数。
 */
import { describe, test, expect } from "bun:test"
import { formatFileSize } from "../../src/shared"

describe("formatFileSize", () => {
  test("< 1KB → bytes", () => {
    expect(formatFileSize(0)).toBe("0 bytes")
    expect(formatFileSize(1023)).toBe("1023 bytes")
  })
  test("KB 区间：一位小数，去 .0", () => {
    expect(formatFileSize(1024)).toBe("1KB")
    expect(formatFileSize(1536)).toBe("1.5KB")
    expect(formatFileSize(1024 * 1023)).toBe("1023KB")
  })
  test("MB 区间", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1MB")
    expect(formatFileSize(1536 * 1024)).toBe("1.5MB")
  })
  test("GB 区间", () => {
    expect(formatFileSize(1024 ** 3)).toBe("1GB")
    expect(formatFileSize(2560 * 1024 ** 2)).toBe("2.5GB")
  })
})
