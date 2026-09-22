/**
 * memory 域 config + envUtils + pathUtils 单测
 *
 * 纯函数测试：env 读取/解析 + 路径安全化 + 哈希。
 * 无网络/无真实磁盘/无 PTY。
 */
import { describe, test, expect, afterEach } from "bun:test"
import {
  createMemoryConfig,
  autoMemoryEnabledFromEnv,
} from "../../src/memory"
import {
  isEnvTruthy,
  isEnvDefinedFalsy,
  getAtlasConfigHomeDir,
} from "../../src/memory/envUtils"
import { sanitizePath, djb2Hash } from "../../src/memory/pathUtils"

const ENV_KEYS = [
  "ATLAS_DISABLE_AUTO_MEMORY",
  "ATLAS_SIMPLE",
  "ATLAS_REMOTE",
  "ATLAS_REMOTE_MEMORY_DIR",
  "ATLAS_IDLE_THRESHOLD_MINUTES",
  "ATLAS_IDLE_TOKEN_THRESHOLD",
  "ATLAS_CONFIG_DIR",
]

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe("envUtils", () => {
  test("isEnvTruthy — 真值集合", () => {
    expect(isEnvTruthy("1")).toBe(true)
    expect(isEnvTruthy("true")).toBe(true)
    expect(isEnvTruthy("TRUE")).toBe(true)
    expect(isEnvTruthy("yes")).toBe(true)
    expect(isEnvTruthy("on")).toBe(true)
    expect(isEnvTruthy(true)).toBe(true)
  })

  test("isEnvTruthy — 假值/空", () => {
    expect(isEnvTruthy("0")).toBe(false)
    expect(isEnvTruthy("false")).toBe(false)
    expect(isEnvTruthy("")).toBe(false)
    expect(isEnvTruthy(undefined)).toBe(false)
    expect(isEnvTruthy(false)).toBe(false)
  })

  test("isEnvDefinedFalsy — 假值集合", () => {
    expect(isEnvDefinedFalsy("0")).toBe(true)
    expect(isEnvDefinedFalsy("false")).toBe(true)
    expect(isEnvDefinedFalsy("no")).toBe(true)
    expect(isEnvDefinedFalsy("off")).toBe(true)
    expect(isEnvDefinedFalsy(false)).toBe(true)
  })

  test("isEnvDefinedFalsy — 未设/真值返回 false", () => {
    expect(isEnvDefinedFalsy(undefined)).toBe(false)
    expect(isEnvDefinedFalsy("1")).toBe(false)
    expect(isEnvDefinedFalsy("true")).toBe(false)
    expect(isEnvDefinedFalsy(true)).toBe(false)
  })

  test("getAtlasConfigHomeDir — ATLAS_CONFIG_DIR 覆盖", () => {
    process.env.ATLAS_CONFIG_DIR = "/custom/atlas"
    expect(getAtlasConfigHomeDir()).toBe("/custom/atlas")
  })

  test("getAtlasConfigHomeDir — 默认 ~/.atlas", () => {
    delete process.env.ATLAS_CONFIG_DIR
    const dir = getAtlasConfigHomeDir()
    expect(dir).toMatch(/\.atlas$/)
  })
})

describe("pathUtils", () => {
  test("sanitizePath — 非字母数字转连字符", () => {
    expect(sanitizePath("/Users/foo/my-project")).toBe("-Users-foo-my-project")
    expect(sanitizePath("plugin:name:server")).toBe("plugin-name-server")
  })

  test("sanitizePath — 纯字母数字不变", () => {
    expect(sanitizePath("abc123")).toBe("abc123")
  })

  test("sanitizePath — 超长截断 + 哈希后缀", () => {
    const long = "a".repeat(300)
    const result = sanitizePath(long)
    expect(result.length).toBeLessThanOrEqual(300)
    // 截断后追加 -<hash>
    expect(result).toContain("-")
    expect(result.startsWith("a")).toBe(true)
  })

  test("djb2Hash — 确定性 + 同输入同输出", () => {
    const h1 = djb2Hash("test")
    const h2 = djb2Hash("test")
    expect(h1).toBe(h2)
    expect(typeof h1).toBe("number")
    expect(djb2Hash("different")).not.toBe(h1)
  })
})

describe("config — createMemoryConfig", () => {
  test("默认值：autoMemoryEnabled=true / 75 / 100_000", () => {
    const cfg = createMemoryConfig()
    expect(cfg.autoMemoryEnabled).toBe(true)
    expect(cfg.idleThresholdMinutes).toBe(75)
    expect(cfg.idleTokenThreshold).toBe(100_000)
  })

  test("ATLAS_DISABLE_AUTO_MEMORY=1 → autoMemoryEnabled=false", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "1"
    expect(createMemoryConfig().autoMemoryEnabled).toBe(false)
  })

  test("ATLAS_DISABLE_AUTO_MEMORY=0 → autoMemoryEnabled=true", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "0"
    expect(createMemoryConfig().autoMemoryEnabled).toBe(true)
  })

  test("ATLAS_SIMPLE=1 → autoMemoryEnabled=false", () => {
    process.env.ATLAS_SIMPLE = "1"
    expect(createMemoryConfig().autoMemoryEnabled).toBe(false)
  })

  test("ATLAS_IDLE_THRESHOLD_MINUTES 覆盖", () => {
    process.env.ATLAS_IDLE_THRESHOLD_MINUTES = "30"
    expect(createMemoryConfig().idleThresholdMinutes).toBe(30)
  })

  test("ATLAS_IDLE_TOKEN_THRESHOLD 覆盖", () => {
    process.env.ATLAS_IDLE_TOKEN_THRESHOLD = "50000"
    expect(createMemoryConfig().idleTokenThreshold).toBe(50000)
  })

  test("无效 IDLE 值回落默认", () => {
    process.env.ATLAS_IDLE_THRESHOLD_MINUTES = "not-a-number"
    expect(createMemoryConfig().idleThresholdMinutes).toBe(75)
    process.env.ATLAS_IDLE_TOKEN_THRESHOLD = "-5"
    expect(createMemoryConfig().idleTokenThreshold).toBe(100_000)
  })

  test("空字符串 IDLE 回落默认", () => {
    process.env.ATLAS_IDLE_THRESHOLD_MINUTES = ""
    expect(createMemoryConfig().idleThresholdMinutes).toBe(75)
  })
})

describe("config — autoMemoryEnabledFromEnv", () => {
  test("未设 → true", () => {
    expect(autoMemoryEnabledFromEnv()).toBe(true)
  })

  test("=1 → false", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "1"
    expect(autoMemoryEnabledFromEnv()).toBe(false)
  })

  test("=0 → true（显式开）", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "0"
    expect(autoMemoryEnabledFromEnv()).toBe(true)
  })
})
