/**
 * memory 域 memoryTypes + memoryAge 单测
 *
 * memoryTypes：纯常量/函数（无外部依赖）。
 * memoryAge：memoryFreshnessText 纯函数（分档边界全断言）。
 *
 * D3 层纪律（跨会话审视修复 2026-09-22）：原 5 个 fs-touching 用例
 * （memoryAgeDays/memoryAge/memoryFreshnessNote 真盘分档 + 缺失文件真
 * statSync）已移 tests/func/memory-real-fs.test.ts——unit 层零磁盘，
 * 真盘证据（含 utimesSync mtime 回退分档）归 func 层。
 */
import { describe, test, expect } from "bun:test"
import {
  MEMORY_TYPES,
  parseMemoryType,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
  MEMORY_DRIFT_CAVEAT,
  WHEN_TO_ACCESS_SECTION,
  TRUSTING_RECALL_SECTION,
  MEMORY_FRONTMATTER_EXAMPLE,
} from "../../src/memory"
import { memoryFreshnessText } from "../../src/memory"

describe("memoryTypes", () => {
  test("MEMORY_TYPES — 四类型", () => {
    expect(MEMORY_TYPES).toEqual(["user", "feedback", "project", "reference"])
  })

  test("parseMemoryType — 有效类型", () => {
    expect(parseMemoryType("user")).toBe("user")
    expect(parseMemoryType("feedback")).toBe("feedback")
    expect(parseMemoryType("project")).toBe("project")
    expect(parseMemoryType("reference")).toBe("reference")
  })

  test("parseMemoryType — 无效/缺失返回 undefined", () => {
    expect(parseMemoryType("nope")).toBeUndefined()
    expect(parseMemoryType(undefined)).toBeUndefined()
    expect(parseMemoryType(123)).toBeUndefined()
    expect(parseMemoryType("")).toBeUndefined()
  })

  test("TYPES_SECTION_COMBINED — 含四类型 + scope", () => {
    const text = TYPES_SECTION_COMBINED.join("\n")
    expect(text).toContain("<name>user</name>")
    expect(text).toContain("<name>feedback</name>")
    expect(text).toContain("<name>project</name>")
    expect(text).toContain("<name>reference</name>")
    expect(text).toContain("<scope>")
  })

  test("TYPES_SECTION_INDIVIDUAL — 无 scope", () => {
    const text = TYPES_SECTION_INDIVIDUAL.join("\n")
    expect(text).toContain("<name>user</name>")
    expect(text).not.toContain("<scope>")
  })

  test("WHAT_NOT_TO_SAVE_SECTION — 含排除项", () => {
    const text = WHAT_NOT_TO_SAVE_SECTION.join("\n")
    expect(text).toContain("Code patterns")
    expect(text).toContain("Git history")
    expect(text).toContain("ATLAS.md")
  })

  test("MEMORY_DRIFT_CAVEAT — 非空", () => {
    expect(MEMORY_DRIFT_CAVEAT.length).toBeGreaterThan(0)
    expect(MEMORY_DRIFT_CAVEAT).toContain("stale")
  })

  test("WHEN_TO_ACCESS_SECTION — 含 MUST + drift caveat", () => {
    const text = WHEN_TO_ACCESS_SECTION.join("\n")
    expect(text).toContain("MUST")
    expect(text).toContain("stale")
  })

  test("TRUSTING_RECALL_SECTION — 含 grep / file 验真", () => {
    const text = TRUSTING_RECALL_SECTION.join("\n")
    expect(text).toContain("grep")
    expect(text).toContain("file exists")
  })

  test("MEMORY_FRONTMATTER_EXAMPLE — 含 frontmatter 块 + 四类型", () => {
    const text = MEMORY_FRONTMATTER_EXAMPLE.join("\n")
    expect(text).toContain("---")
    expect(text).toContain("name:")
    expect(text).toContain("type:")
    expect(text).toContain("user, feedback, project, reference")
  })
})

describe("memoryAge", () => {
  test("memoryFreshnessText — 各档", () => {
    expect(memoryFreshnessText(0)).toBe("today")
    expect(memoryFreshnessText(0.5)).toBe("today")
    expect(memoryFreshnessText(1)).toBe("yesterday")
    expect(memoryFreshnessText(3)).toBe("3 days ago")
    expect(memoryFreshnessText(6)).toBe("6 days ago")
    expect(memoryFreshnessText(10)).toBe("last week")
    expect(memoryFreshnessText(20)).toBe("2 weeks ago")
    expect(memoryFreshnessText(45)).toBe("last month")
    expect(memoryFreshnessText(100)).toBe("3 months ago")
    expect(memoryFreshnessText(400)).toBe("1 years ago")
  })

})
