/**
 * modelprovider 域角色路由单测 — normalizeModelStringForAPI + modelToRole + MODEL_ROLES
 *
 * normalizeModelStringForAPI 是纯函数；modelToRole 依赖 EndpointConfigSource
 * （未注入 → 空 stub → 默认 'small'）。
 * 无网络/无磁盘/无 PTY。
 */
import { describe, test, expect } from "bun:test"
import {
  normalizeModelStringForAPI,
  modelToRole,
  MODEL_ROLES,
} from "../../src/modelprovider/roles"

describe("MODEL_ROLES", () => {
  test("含 premium/fast/small 三角色", () => {
    expect(MODEL_ROLES).toEqual(["premium", "fast", "small"])
  })
})

describe("normalizeModelStringForAPI", () => {
  test("无 ANSI → 原样", () => {
    expect(normalizeModelStringForAPI("gpt-4")).toBe("gpt-4")
  })

  test("[1m] 后缀 → 剥离", () => {
    expect(normalizeModelStringForAPI("gpt-4[1m]")).toBe("gpt-4")
  })

  test("[2m] 后缀 → 剥离", () => {
    expect(normalizeModelStringForAPI("claude[2m]")).toBe("claude")
  })

  test("大写 [1M] → 剥离（大小写不敏感）", () => {
    expect(normalizeModelStringForAPI("model[1M]")).toBe("model")
  })

  test("多个 ANSI → 全剥离", () => {
    expect(normalizeModelStringForAPI("a[1m][2m]")).toBe("a")
  })

  test("空字符串 → 空字符串", () => {
    expect(normalizeModelStringForAPI("")).toBe("")
  })
})

describe("modelToRole — 未注入 EndpointConfigSource", () => {
  // 未注入 config source → 空 stub adapter → getRoleModel 全返回 undefined
  // → modelToRole 总回落 'small'
  test("任意模型 → 'small'（无注入）", () => {
    expect(modelToRole("any-model")).toBe("small")
  })

  test("空字符串 → 'small'", () => {
    expect(modelToRole("")).toBe("small")
  })

  test("含 ANSI 的模型 → 'small'（先 normalize 再判）", () => {
    expect(modelToRole("model[1m]")).toBe("small")
  })
})
