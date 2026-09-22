/**
 * sandbox violationText + sandbox-events 单测（B 波 S1）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。纯函数 + 自包含 event bus。
 */
import { describe, test, expect } from "bun:test"
import {
  removeSandboxViolationTags,
  extractSandboxViolationsBlock,
  DefaultSandboxEventBus,
  type ViolationEvent,
} from "../../src/sandbox"

describe("removeSandboxViolationTags", () => {
  test("移除单个 block", () => {
    const text = "before <sandbox_violations>bad</sandbox_violations> after"
    expect(removeSandboxViolationTags(text)).toBe("before  after")
  })

  test("移除多行 block", () => {
    const text =
      "<sandbox_violations>\nline1\nline2\n</sandbox_violations>"
    expect(removeSandboxViolationTags(text)).toBe("")
  })

  test("无 block → 原文不变", () => {
    expect(removeSandboxViolationTags("clean text")).toBe("clean text")
  })

  test("移除多个 block", () => {
    const text =
      "<sandbox_violations>a</sandbox_violations>x<sandbox_violations>b</sandbox_violations>"
    expect(removeSandboxViolationTags(text)).toBe("x")
  })
})

describe("extractSandboxViolationsBlock", () => {
  test("提取首个 block 内容", () => {
    const text = "<sandbox_violations>inner content</sandbox_violations>"
    expect(extractSandboxViolationsBlock(text)).toEqual({
      present: true,
      content: "inner content",
    })
  })

  test("无 block → present false, content null", () => {
    expect(extractSandboxViolationsBlock("no tags")).toEqual({
      present: false,
      content: null,
    })
  })

  test("多 block 取首个", () => {
    const text =
      "<sandbox_violations>first</sandbox_violations><sandbox_violations>second</sandbox_violations>"
    expect(extractSandboxViolationsBlock(text)).toEqual({
      present: true,
      content: "first",
    })
  })
})

describe("DefaultSandboxEventBus", () => {
  function makeEvent(msg: string): ViolationEvent {
    return {
      category: "fs:write",
      message: msg,
      timestamp: Date.now(),
    }
  }

  test("emit → listener 收到", () => {
    const bus = new DefaultSandboxEventBus()
    const received: ViolationEvent[] = []
    bus.onViolation(e => received.push(e))
    bus.emitViolation(makeEvent("v1"))
    expect(received).toHaveLength(1)
    expect(received[0].message).toBe("v1")
  })

  test("unsubscribe 后不再收到", () => {
    const bus = new DefaultSandboxEventBus()
    const received: ViolationEvent[] = []
    const unsub = bus.onViolation(e => received.push(e))
    bus.emitViolation(makeEvent("v1"))
    unsub()
    bus.emitViolation(makeEvent("v2"))
    expect(received).toHaveLength(1)
  })

  test("getTotalViolationCount 累计", () => {
    const bus = new DefaultSandboxEventBus()
    bus.emitViolation(makeEvent("a"))
    bus.emitViolation(makeEvent("b"))
    bus.emitViolation(makeEvent("c"))
    expect(bus.getTotalViolationCount()).toBe(3)
  })

  test("listener 抛异常不影响其他 listener", () => {
    const bus = new DefaultSandboxEventBus()
    const received: ViolationEvent[] = []
    bus.onViolation(() => {
      throw new Error("boom")
    })
    bus.onViolation(e => received.push(e))
    bus.emitViolation(makeEvent("v"))
    expect(received).toHaveLength(1)
  })

  test("clear 不重置 count", () => {
    const bus = new DefaultSandboxEventBus()
    bus.emitViolation(makeEvent("a"))
    bus.clear()
    expect(bus.getTotalViolationCount()).toBe(1)
  })
})
