/**
 * memory 域 memoryTypes + memoryAge 单测
 *
 * memoryTypes：纯常量/函数（无外部依赖）。
 * memoryAge：memoryFreshnessText 纯函数 + memoryAgeDays 真实临时文件（轻量 fs）。
 */
import { describe, test, expect } from "bun:test"
import { writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
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
import {
  memoryFreshnessText,
  memoryAgeDays,
  memoryAge,
  memoryFreshnessNote,
} from "../../src/memory"

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

  test("memoryAgeDays — 缺失文件返回 undefined", () => {
    expect(memoryAgeDays("/nonexistent-file-xyz.md")).toBeUndefined()
  })

  test("memoryAgeDays — 真实文件返回非负天数", () => {
    const f = join(tmpdir(), `mem-age-test-${Date.now()}.md`)
    writeFileSync(f, "test")
    try {
      const days = memoryAgeDays(f)
      expect(days).toBeDefined()
      expect(days!).toBeGreaterThanOrEqual(0)
      expect(days!).toBeLessThan(1) // 刚创建，不到 1 天
    } finally {
      rmSync(f, { force: true })
    }
  })

  test("memoryAge — 真实文件返回 days + text", () => {
    const f = join(tmpdir(), `mem-age-test2-${Date.now()}.md`)
    writeFileSync(f, "test")
    try {
      const age = memoryAge(f)
      expect(age).toBeDefined()
      expect(Math.abs(age!.days)).toBeLessThan(1)
      expect(age!.text).toBe("today")
    } finally {
      rmSync(f, { force: true })
    }
  })

  test("memoryFreshnessNote — 缺失文件返回空串", () => {
    expect(memoryFreshnessNote("/nonexistent-xyz.md")).toBe("")
  })

  test("memoryFreshnessNote — 真实文件含 updated", () => {
    const f = join(tmpdir(), `mem-age-note-${Date.now()}.md`)
    writeFileSync(f, "test")
    try {
      const note = memoryFreshnessNote(f)
      expect(note).toContain("updated")
      expect(note).toContain("today")
    } finally {
      rmSync(f, { force: true })
    }
  })
})
