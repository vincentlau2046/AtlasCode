/**
 * A 波 test gate: 框架 smoke + shared 纯函数测试（A-4）
 *
 * charter L630: test gate = 测试框架 smoke 绿 + shared 纯函数测试（若有）。
 * A 波唯一实装代码 = shared/feature.ts，此处验其语义 + import 走门面（STR-1）。
 */
import { describe, test, expect, afterEach } from "bun:test"
import { feature, FEATURE_ON_BY_DEFAULT } from "../src/shared"

describe("smoke: 测试框架加载", () => {
  test("bun:test describe/test/expect 可用", () => {
    expect(1 + 1).toBe(2)
  })
  test("shared 门面 import 成功（STR-1: 经 index.ts 非 internal）", () => {
    expect(typeof feature).toBe("function")
    expect(Array.isArray(FEATURE_ON_BY_DEFAULT)).toBe(true)
  })
})

describe("shared/feature.ts — feature() 语义", () => {
  const KEY = "FEATURE_TEST_FLAG"

  afterEach(() => {
    delete process.env[KEY]
  })

  test("env 未设 → ON_BY_DEFAULT 判定（COORDINATOR_MODE 默认开）", () => {
    expect(feature("COORDINATOR_MODE")).toBe(true)
  })

  test("env 未设 → 非 ON_BY_DEFAULT 默认关（ASCEND_TOOLS）", () => {
    expect(feature("ASCEND_TOOLS")).toBe(false)
  })

  test("env=true → 开（覆盖默认关）", () => {
    process.env[KEY] = "true"
    expect(feature("TEST_FLAG")).toBe(true)
  })

  test("env=false → 关（覆盖默认开）", () => {
    process.env["FEATURE_COORDINATOR_MODE"] = "false"
    expect(feature("COORDINATOR_MODE")).toBe(false)
    delete process.env["FEATURE_COORDINATOR_MODE"]
  })

  test("FEATURE_ON_BY_DEFAULT 含 TRANSCRIPT_CLASSIFIER + COORDINATOR_MODE", () => {
    expect(FEATURE_ON_BY_DEFAULT).toContain("TRANSCRIPT_CLASSIFIER")
    expect(FEATURE_ON_BY_DEFAULT).toContain("COORDINATOR_MODE")
  })
})
