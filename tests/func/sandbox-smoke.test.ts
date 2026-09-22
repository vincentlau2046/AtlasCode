/**
 * sandbox 纵切功能 smoke（C-Deep 切片 2 · tests/func/ 层）
 *
 * §8.7 port 边界规则验真：**注入窗口之上可 fake**（真 runtime 包缺位 →
 * fake 经 setSandboxRuntimeModule 单点换入），**port 之下全真**——
 * 真建 manager（工厂闭包 + backend + runtime 转发全链真跑）、真 ripgrep
 * 查询（系统 rg 真 spawn；rg 缺失按纪律 skip 不红）。
 * 防"fake 到底"的空洞等价（H6）：本文件绿 = 迁移链真能建 manager +
 * 真查一次文件。
 *
 * 断言：① 真建 manager + 32 方法面全函数
 * ② 禁用态（placeholder runtime）：isSandboxingEnabled false + 原因 +
 *    依赖缺失错误非空
 * ③ 注入真 runtime 替身后 enabled 态：initialize 真收 runtime config
 *    （network/filesystem/ripgrep 字段真值）+ wrapWithSandbox 真转发
 * ④ ripgrep 真查询（--files 真列文件；rg 缺失 skip 不红）
 */
import { describe, test, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  checkRipgrep,
  createSandboxManager,
  resetSandboxRuntimeModule,
  ripGrep,
  setSandboxRuntimeModule,
} from "../../src/sandbox"
import {
  createFakeSandboxDeps,
  createFakeSandboxRuntime,
} from "../fixtures/sandbox-runtime-fake"

/** 32 方法面（SandboxManager 签名不变口径，与旧仓实测一致）。 */
const MANAGER_METHODS = [
  "initialize",
  "isSupportedPlatform",
  "isPlatformInEnabledList",
  "getSandboxUnavailableReason",
  "isSandboxingEnabled",
  "isSandboxEnabledInSettings",
  "checkDependencies",
  "isAutoAllowBashIfSandboxedEnabled",
  "areUnsandboxedCommandsAllowed",
  "isSandboxRequired",
  "areSandboxSettingsLockedByPolicy",
  "setSandboxSettings",
  "getFsReadConfig",
  "getFsWriteConfig",
  "getNetworkRestrictionConfig",
  "getAllowUnixSockets",
  "getAllowLocalBinding",
  "getIgnoreViolations",
  "getEnableWeakerNestedSandbox",
  "getExcludedCommands",
  "getProxyPort",
  "getSocksProxyPort",
  "getLinuxHttpSocketPath",
  "getLinuxSocksSocketPath",
  "waitForNetworkInitialization",
  "wrapWithSandbox",
  "cleanupAfterCommand",
  "getSandboxViolationStore",
  "annotateStderrWithSandboxFailures",
  "getLinuxGlobPatternWarnings",
  "refreshConfig",
  "reset",
] as const

let outDir: string | undefined

afterEach(() => {
  resetSandboxRuntimeModule()
  if (outDir) {
    rmSync(outDir, { recursive: true, force: true })
    outDir = undefined
  }
})

describe("sandbox 纵切功能 smoke（真建 manager + 真 ripgrep）", () => {
  test("① 真建 manager：32 方法面全为函数（工厂闭包 + backend + runtime 转发链）", () => {
    const deps = createFakeSandboxDeps()
    const manager = createSandboxManager(deps)
    for (const name of MANAGER_METHODS) {
      expect(typeof (manager as unknown as Record<string, unknown>)[name]).toBe(
        "function",
      )
    }
    expect(MANAGER_METHODS.length).toBe(32)
  })

  test("② 禁用态（placeholder runtime）：isSandboxingEnabled false + 原因 + 依赖错误", async () => {
    const deps = createFakeSandboxDeps({
      getSettings: () => ({ sandbox: { enabled: true } }),
    })
    const manager = createSandboxManager(deps)
    expect(manager.isSupportedPlatform()).toBe(false)
    expect(manager.isSandboxingEnabled()).toBe(false)
    expect(manager.checkDependencies().errors.length).toBeGreaterThan(0)
    expect(manager.getSandboxUnavailableReason()).toContain(
      "sandbox.enabled is set but",
    )
    // 禁用态 initialize 短路（不触碰 runtime 真行为方法）
    await manager.initialize()
    // 禁用态下直调 wrapWithSandbox = 生产不可达路径（ShellExecutor 先读
    // isSandboxingEnabled 短路，D6 注入序约束）；placeholder fail-fast 抛错
    // 防"沙箱以为开着"的空洞等价（静默透传命令 = H6 向量）
    await expect(manager.wrapWithSandbox("echo hi")).rejects.toThrow(
      "Sandbox runtime 未安装",
    )
  })

  test("③ 注入 runtime 替身：enabled 态 initialize 真收 config + wrap 真转发", async () => {
    const { runtime, state } = createFakeSandboxRuntime()
    setSandboxRuntimeModule(runtime)
    const deps = createFakeSandboxDeps({
      getSettings: () => ({
        sandbox: {
          enabled: true,
          network: { allowedDomains: ["example.com"] },
        },
      }),
    })
    const manager = createSandboxManager(deps)
    expect(manager.isSandboxingEnabled()).toBe(true)

    await manager.initialize()
    expect(state.initializedConfigs.length).toBe(1)
    const config = state.initializedConfigs[0]
    expect(config.network.allowedDomains).toEqual(["example.com"])
    expect(config.network.deniedDomains).toEqual([])
    expect(config.filesystem.allowWrite).toContain(".")
    expect(config.filesystem.allowWrite).toContain(
      "/tmp/atlascode-temp",
    )
    expect(config.ripgrep.command).toBe("rg")
    expect(config.ripgrep.args).toEqual([])

    const wrapped = await manager.wrapWithSandbox("echo hi")
    expect(wrapped).toBe("wrapped:echo hi")
    expect(state.wrapped.length).toBe(1)

    await manager.reset()
    expect(state.resets).toBe(1)
  })

  test("④ ripgrep 真查询：--files 真列 tmpdir 文件（rg 缺失 skip 不红）", async () => {
    outDir = mkdtempSync(join(tmpdir(), "atlascode-rg-"))
    writeFileSync(join(outDir, "probe.txt"), "needle-here\n")

    const available = await checkRipgrep()
    if (!available) {
      // unit 纪律：rg 缺失按 skip 不红（CI 无 rg 环境）
      console.log("SKIP: system ripgrep not available")
      return
    }
    const lines = await ripGrep(["--files"], outDir!, new AbortController().signal)
    expect(lines.map(l => l.replace(/\\/g, "/"))).toContain(
      join(outDir, "probe.txt").replace(/\\/g, "/"),
    )
  })
})
