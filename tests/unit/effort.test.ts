/**
 * modelprovider 域 effort 单测 — parseEffortValue + resolveAppliedEffort + modelSupportsEffort
 *
 * 纯函数测试：env override 语义 + effort level 解析。
 * 无网络/无磁盘/无 PTY。
 */
import { describe, test, expect, afterEach } from "bun:test"
import {
  EFFORT_LEVELS,
  isEffortLevel,
  parseEffortValue,
  convertEffortValueToLevel,
  modelSupportsEffort,
  getEffortEnvOverride,
  getDefaultEffortForModel,
  resolveAppliedEffort,
} from "../../src/modelprovider"

const ENV_KEY = "ATLAS_EFFORT_LEVEL"
const ALWAYS_ENABLE = "ATLAS_ALWAYS_ENABLE_EFFORT"

afterEach(() => {
  delete process.env[ENV_KEY]
  delete process.env[ALWAYS_ENABLE]
})

describe("EFFORT_LEVELS + isEffortLevel", () => {
  test("EFFORT_LEVELS 含 5 级", () => {
    expect(EFFORT_LEVELS).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ])
  })

  test("isEffortLevel — 有效 level", () => {
    expect(isEffortLevel("low")).toBe(true)
    expect(isEffortLevel("max")).toBe(true)
  })

  test("isEffortLevel — 无效", () => {
    expect(isEffortLevel("ultra")).toBe(false)
    expect(isEffortLevel("")).toBe(false)
  })
})

describe("parseEffortValue", () => {
  test("undefined/null/空 → undefined", () => {
    expect(parseEffortValue(undefined)).toBeUndefined()
    expect(parseEffortValue(null)).toBeUndefined()
    expect(parseEffortValue("")).toBeUndefined()
  })

  test("数字 → 数字", () => {
    expect(parseEffortValue(42)).toBe(42)
  })

  test("字符串 level → level", () => {
    expect(parseEffortValue("high")).toBe("high")
    expect(parseEffortValue("MAX")).toBe("max") // 大小写不敏感
  })

  test("数字字符串 → 数字", () => {
    expect(parseEffortValue("99")).toBe(99)
  })

  test("无效字符串 → undefined", () => {
    expect(parseEffortValue("not-a-level")).toBeUndefined()
  })
})

describe("convertEffortValueToLevel", () => {
  test("字符串 level → 原样", () => {
    expect(convertEffortValueToLevel("high")).toBe("high")
  })

  test("无效字符串 → high fallback", () => {
    expect(convertEffortValueToLevel("ultra")).toBe("high")
  })

  test("数字 → high", () => {
    expect(convertEffortValueToLevel(99)).toBe("high")
  })
})

describe("modelSupportsEffort", () => {
  test("fast/small/premium 模型 → false", () => {
    expect(modelSupportsEffort("fast-model")).toBe(false)
    expect(modelSupportsEffort("small-model")).toBe(false)
    expect(modelSupportsEffort("premium-model")).toBe(false)
  })

  test("其他模型 → true", () => {
    expect(modelSupportsEffort("gpt-4")).toBe(true)
    expect(modelSupportsEffort("claude-opus")).toBe(true)
  })

  test("ATLAS_ALWAYS_ENABLE_EFFORT=true → 全 true", () => {
    process.env[ALWAYS_ENABLE] = "true"
    expect(modelSupportsEffort("fast-model")).toBe(true)
    expect(modelSupportsEffort("small-model")).toBe(true)
  })

  test("ATLAS_ALWAYS_ENABLE_EFFORT=1 → true（isEnvTruthy）", () => {
    process.env[ALWAYS_ENABLE] = "1"
    expect(modelSupportsEffort("fast-model")).toBe(true)
  })

  test("ATLAS_ALWAYS_ENABLE_EFFORT=false → 不覆盖", () => {
    process.env[ALWAYS_ENABLE] = "false"
    expect(modelSupportsEffort("fast-model")).toBe(false)
  })
})

describe("getEffortEnvOverride", () => {
  test("未设 → undefined", () => {
    expect(getEffortEnvOverride()).toBeUndefined()
  })

  test("unset/auto → null（显式关闭）", () => {
    process.env[ENV_KEY] = "unset"
    expect(getEffortEnvOverride()).toBeNull()
    process.env[ENV_KEY] = "auto"
    expect(getEffortEnvOverride()).toBeNull()
  })

  test("有效 level → level", () => {
    process.env[ENV_KEY] = "high"
    expect(getEffortEnvOverride()).toBe("high")
  })
})

describe("getDefaultEffortForModel", () => {
  test("支持 effort 的模型 → medium", () => {
    expect(getDefaultEffortForModel("gpt-4")).toBe("medium")
  })

  test("不支持 effort 的模型 → medium（isUltrathinkEnabled stub false）", () => {
    expect(getDefaultEffortForModel("fast-model")).toBe("medium")
  })
})

describe("resolveAppliedEffort", () => {
  test("env override = null → undefined", () => {
    process.env[ENV_KEY] = "unset"
    expect(resolveAppliedEffort("gpt-4", "high")).toBeUndefined()
  })

  test("env override 优先于 appState", () => {
    process.env[ENV_KEY] = "max"
    expect(resolveAppliedEffort("gpt-4", "high")).toBe("max")
  })

  test("无 env → appState 值", () => {
    expect(resolveAppliedEffort("gpt-4", "high")).toBe("high")
  })

  test("无 env 无 appState → default", () => {
    expect(resolveAppliedEffort("gpt-4", undefined)).toBe("medium")
  })
})
