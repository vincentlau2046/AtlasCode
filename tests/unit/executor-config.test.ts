/**
 * executor config 单测（B 波 S1）。
 *
 * unit 层纪律：无网络/无真实磁盘/无 PTY。env 通过 process.env 临时设置 + 清理。
 */
import { describe, test, expect, afterEach } from "bun:test"
import { createShellExecutorConfig } from "../../src/executor"

const ENV_KEYS = [
  "ATLAS_SHELL",
  "ATLAS_SHELL_PREFIX",
  "ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR",
]

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe("createShellExecutorConfig", () => {
  test("全未设 → shell/shellPrefix undefined, maintainProjectWorkingDir false", () => {
    for (const k of ENV_KEYS) delete process.env[k]
    const cfg = createShellExecutorConfig()
    expect(cfg.shell).toBeUndefined()
    expect(cfg.shellPrefix).toBeUndefined()
    expect(cfg.maintainProjectWorkingDir).toBe(false)
  })

  test("ATLAS_SHELL 设置 → 透传", () => {
    process.env.ATLAS_SHELL = "/bin/bash"
    expect(createShellExecutorConfig().shell).toBe("/bin/bash")
  })

  test("ATLAS_SHELL_PREFIX 设置 → 透传", () => {
    process.env.ATLAS_SHELL_PREFIX = "sudo -E"
    expect(createShellExecutorConfig().shellPrefix).toBe("sudo -E")
  })

  test('ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR="1" → true', () => {
    process.env.ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR = "1"
    expect(createShellExecutorConfig().maintainProjectWorkingDir).toBe(true)
  })

  test('ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR="true" → true（大小写不敏感）', () => {
    process.env.ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR = "true"
    expect(createShellExecutorConfig().maintainProjectWorkingDir).toBe(true)
  })

  test('ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR="0" → false', () => {
    process.env.ATLAS_BASH_MAINTAIN_PROJECT_WORKING_DIR = "0"
    expect(createShellExecutorConfig().maintainProjectWorkingDir).toBe(false)
  })
})
