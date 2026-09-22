/**
 * executor toolchain 单测（B 波 S1）。
 *
 * applyToolchainPlaceholders 是纯函数 token 替换，无副作用。
 */
import { describe, test, expect } from "bun:test"
import { applyToolchainPlaceholders, type NpuToolchain } from "../../src/executor"

function makeToolchain(commands: Record<string, string>): NpuToolchain {
  return {
    name: "test",
    commands,
    reservedEnv: () => ({}),
    shouldMock: () => false,
    exec: async () => ({
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      ok: true,
    }),
    isAvailable: () => true,
    availableCommands: () => Object.values(commands),
  }
}

describe("applyToolchainPlaceholders", () => {
  test("替换单个 {{toolchain.commands.*}}", () => {
    const tc = makeToolchain({ compile: "bisheng" })
    const out = applyToolchainPlaceholders(
      "Run {{toolchain.commands.compile}} to build.",
      tc,
    )
    expect(out).toBe("Run bisheng to build.")
  })

  test("替换多个不同 key", () => {
    const tc = makeToolchain({ compile: "bisheng", profile: "msprof" })
    const out = applyToolchainPlaceholders(
      "{{toolchain.commands.compile}} && {{toolchain.commands.profile}}",
      tc,
    )
    expect(out).toBe("bisheng && msprof")
  })

  test("同 key 多次出现全替换", () => {
    const tc = makeToolchain({ compile: "bisheng" })
    const out = applyToolchainPlaceholders(
      "{{toolchain.commands.compile}}-{{toolchain.commands.compile}}",
      tc,
    )
    expect(out).toBe("bisheng-bisheng")
  })

  test("无匹配占位符 → 原文不变", () => {
    const tc = makeToolchain({ compile: "bisheng" })
    const out = applyToolchainPlaceholders("no placeholders here", tc)
    expect(out).toBe("no placeholders here")
  })

  test("未提供 key 的占位符 → 保留", () => {
    const tc = makeToolchain({ compile: "bisheng" })
    const out = applyToolchainPlaceholders(
      "{{toolchain.commands.compile}} {{toolchain.commands.unknown}}",
      tc,
    )
    expect(out).toBe("bisheng {{toolchain.commands.unknown}}")
  })
})
