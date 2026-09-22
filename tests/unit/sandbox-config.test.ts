/**
 * sandbox config 单测（B 波 S1）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。env 通过 process.env 临时设置 + 清理。
 */
import { describe, test, expect, afterEach } from "bun:test"
import { createSandboxConfig } from "../../src/sandbox"

const ENV_KEYS = [
  "ATLAS_GLOB_TIMEOUT_SECONDS",
  "ATLAS_GLOB_HIDDEN",
  "ATLAS_GLOB_NO_IGNORE",
]

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe("createSandboxConfig", () => {
  test("全未设 → preset 默认（timeout 0 / hidden false / noIgnore false）", () => {
    for (const k of ENV_KEYS) delete process.env[k]
    const cfg = createSandboxConfig()
    expect(cfg.globTimeoutSeconds).toBe(0)
    expect(cfg.globHidden).toBe(false)
    expect(cfg.globNoIgnore).toBe(false)
  })

  test("ATLAS_GLOB_TIMEOUT_SECONDS 合法值 → 透传", () => {
    process.env.ATLAS_GLOB_TIMEOUT_SECONDS = "30"
    expect(createSandboxConfig().globTimeoutSeconds).toBe(30)
  })

  test("ATLAS_GLOB_TIMEOUT_SECONDS 超上限 → cap 1_800_000", () => {
    process.env.ATLAS_GLOB_TIMEOUT_SECONDS = "9999999"
    expect(createSandboxConfig().globTimeoutSeconds).toBe(1_800_000)
  })

  test("ATLAS_GLOB_TIMEOUT_SECONDS 无效 → 回落 0", () => {
    process.env.ATLAS_GLOB_TIMEOUT_SECONDS = "abc"
    expect(createSandboxConfig().globTimeoutSeconds).toBe(0)
  })

  test('ATLAS_GLOB_HIDDEN="true" → true', () => {
    process.env.ATLAS_GLOB_HIDDEN = "true"
    expect(createSandboxConfig().globHidden).toBe(true)
  })

  test('ATLAS_GLOB_NO_IGNORE="1" → true', () => {
    process.env.ATLAS_GLOB_NO_IGNORE = "1"
    expect(createSandboxConfig().globNoIgnore).toBe(true)
  })
})
