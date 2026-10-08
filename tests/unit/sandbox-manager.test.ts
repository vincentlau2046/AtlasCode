/**
 * sandbox manager 单测（C-Deep 切片 2 · unit 层，零磁盘零网络零 PTY）
 *
 * 覆盖：① 禁用态口径（placeholder runtime：平台/依赖/原因/短路）
 * ② settings readers 默认值族（autoAllow/unsandboxed/sandboxRequired/
 *    policy lock/excludedCommands）
 * ③ setSandboxSettings 写 localSettings
 * ④ violation store（100 上限 / totalCount / subscribe / clear / limit）
 * ⑤ memoize 缓存 + reset 失效（换注入 runtime 后 checkDependencies 真换源）
 * ⑥ ripgrep 纯面（ripgrepCommand 形状 + RipgrepTimeoutError 携带部分结果；
 *    真 spawn 探测 checkRipgrep 归 func 层）
 */
import { describe, test, expect, beforeEach } from "bun:test"
import {
  createSandboxManager,
  getSandboxRuntimeModule,
  resetSandboxRuntimeModule,
  ripGrep,
  ripgrepCommand,
  RipgrepTimeoutError,
  setRipgrepResolutionForTest,
  setSandboxRuntimeModule,
  type SandboxViolationEvent,
  type SettingsJson,
} from "../../src/sandbox"
import {
  createFakeSandboxDeps,
  createFakeSandboxRuntime,
} from "../fixtures/sandbox-runtime-fake"

describe("sandbox manager 单测", () => {
  beforeEach(() => {
    resetSandboxRuntimeModule()
  })

  test("① 禁用态（placeholder）：三检查全禁用口径", () => {
    const manager = createSandboxManager(
      createFakeSandboxDeps({
        getSettings: () => ({ sandbox: { enabled: true } }),
      }),
    )
    expect(manager.isSupportedPlatform()).toBe(false)
    expect(manager.checkDependencies().errors).toEqual([
      "sandbox runtime not installed",
    ])
    expect(manager.isSandboxingEnabled()).toBe(false)
    expect(manager.isSandboxEnabledInSettings()).toBe(true)
    expect(manager.getSandboxUnavailableReason()).toContain(
      "is not supported",
    )
    // 未设 enabled → 无原因
    const disabled = createSandboxManager(createFakeSandboxDeps())
    expect(disabled.getSandboxUnavailableReason()).toBeUndefined()
  })

  test("② settings readers 默认值族", () => {
    const manager = createSandboxManager(createFakeSandboxDeps())
    expect(manager.isAutoAllowBashIfSandboxedEnabled()).toBe(true)
    expect(manager.areUnsandboxedCommandsAllowed()).toBe(true)
    expect(manager.isSandboxRequired()).toBe(false)
    expect(manager.areSandboxSettingsLockedByPolicy()).toBe(false)
    expect(manager.getExcludedCommands()).toEqual([])
    expect(manager.getLinuxGlobPatternWarnings()).toEqual([])
  })

  test("②b policy lock：flagSettings/policySettings 任一设 sandbox 键即锁", () => {
    const manager = createSandboxManager(
      createFakeSandboxDeps({
        getSettingsForSource: source =>
          source === "flagSettings"
            ? ({ sandbox: { enabled: true } } as unknown as SettingsJson)
            : undefined,
      }),
    )
    expect(manager.areSandboxSettingsLockedByPolicy()).toBe(true)
  })

  test("③ setSandboxSettings 写 localSettings（sandbox 键合并）", async () => {
    const deps = createFakeSandboxDeps()
    const manager = createSandboxManager(deps)
    await manager.setSandboxSettings({ enabled: true })
    const written = deps.getSettingsForSource("localSettings")
    expect(
      (written as { sandbox?: { enabled?: boolean } } | undefined)?.sandbox
        ?.enabled,
    ).toBe(true)
  })

  test("④ violation store：100 上限 + totalCount + subscribe + clear + limit", () => {
    const manager = createSandboxManager(createFakeSandboxDeps())
    const store = manager.getSandboxViolationStore()

    const ev = (i: number): SandboxViolationEvent => ({
      type: "fs:write",
      path: `/deny/${i}`,
      command: "cp",
      message: `violation ${i}`,
      timestamp: i,
    })
    for (let i = 0; i < 105; i++) store.addViolation(ev(i))
    expect(store.getCount()).toBe(100)
    expect(store.getTotalCount()).toBe(105)
    const tail = store.getViolations(5)
    expect(tail.length).toBe(5)
    expect(tail[0].path).toBe("/deny/100")
    expect(tail[4].path).toBe("/deny/104")

    let subscribed: SandboxViolationEvent[] | undefined
    const unsub = store.subscribe(list => {
      subscribed = list
    })
    expect(subscribed?.length).toBe(100) // 订阅即发当前快照
    store.addViolation(ev(999))
    // 100 上限：push 后超 1 即裁头（999 进窗、最旧出窗），快照恒 100
    expect(subscribed?.length).toBe(100)
    expect(subscribed?.[99]?.message).toBe("violation 999")
    store.clear()
    expect(store.getCount()).toBe(0)
    expect(subscribed?.length).toBe(0)
    unsub()
  })

  test("⑤ memoize + reset：换注入 runtime 后 checkDependencies 真换源", async () => {
    const probe = { calls: 0 }
    const rtA = createFakeSandboxRuntime({
      checkDependencies: () => {
        probe.calls++
        return { errors: [], warnings: [] }
      },
    })
    setSandboxRuntimeModule(rtA.runtime)
    const manager = createSandboxManager(createFakeSandboxDeps())
    expect(manager.checkDependencies().errors).toEqual([])
    expect(manager.checkDependencies().errors).toEqual([])
    expect(probe.calls).toBe(1) // memoize 命中

    const rtB = createFakeSandboxRuntime({
      checkDependencies: () => ({
        errors: ["dep-b missing"],
        warnings: [],
      }),
    })
    setSandboxRuntimeModule(rtB.runtime)
    // 未 reset 前仍是 A 的缓存值
    expect(manager.checkDependencies().errors).toEqual([])
    await manager.reset()
    // reset 清 memoize 缓存 → 真换源 rtB（rtB 不探针，probe 计数不变）
    expect(manager.checkDependencies().errors).toEqual(["dep-b missing"])
    expect(probe.calls).toBe(1)
  })

  test("⑥ 禁用态下 initialize 短路（零 runtime 真行为调用）", async () => {
    const { runtime, state } = createFakeSandboxRuntime()
    setSandboxRuntimeModule(runtime)
    // 保持 disabled：settings 未设 enabled
    const manager = createSandboxManager(createFakeSandboxDeps())
    await manager.initialize()
    expect(state.initializedConfigs).toEqual([])
  })

  test("⑥b enabled 态 initialize 真收 config + onSettingsChange 触发 updateConfig", async () => {
    const { runtime, state } = createFakeSandboxRuntime()
    setSandboxRuntimeModule(runtime)
    let changeCallback: (() => void) | undefined
    const deps = createFakeSandboxDeps({
      getSettings: () => ({
        sandbox: {
          enabled: true,
          network: { allowedDomains: ["a.com"] },
        },
      }),
      onSettingsChange: callback => {
        changeCallback = callback
        return () => {}
      },
    })
    const manager = createSandboxManager(deps)
    await manager.initialize()
    expect(state.initializedConfigs.length).toBe(1)

    changeCallback?.()
    expect(state.updatedConfigs.length).toBe(1)
    expect(state.updatedConfigs[0].network.allowedDomains).toEqual(["a.com"])

    await manager.reset()
    expect(state.resets).toBe(1)
  })

  test("⑥c enabled 态 wrapWithSandbox 先 await 初始化再转发", async () => {
    let resolveInit: () => void
    const slowInit = new Promise<void>(r => {
      resolveInit = r
    })
    const { runtime } = createFakeSandboxRuntime({
      initialize: async () => {
        await slowInit
      },
    })
    setSandboxRuntimeModule(runtime)
    const manager = createSandboxManager(
      createFakeSandboxDeps({
        getSettings: () => ({ sandbox: { enabled: true } }),
      }),
    )
    // 旧仓启动序：initialize() 先立 initializationPromise，wrap 才 await 它
    const init = manager.initialize()
    const pending = manager.wrapWithSandbox("echo x")
    resolveInit!()
    expect(await pending).toBe("wrapped:echo x")
    expect(await init).toBeUndefined()
  })

  test("⑦ ripgrep 纯面：ripgrepCommand 形状 + RipgrepTimeoutError 部分结果", () => {
    // A+S3（0.1.44）：resolver 真解析三级（system/vscode-ripgrep/none），单测
    // 挂测试钩子强制 path 级保形状断言确定（自然 env 行为面归 sandbox-ripgrep-as3.test.ts）
    setRipgrepResolutionForTest({ command: "rg", args: [], source: "path" })
    try {
      const cmd = ripgrepCommand()
      expect(cmd.rgPath).toBe("rg")
      expect(cmd.rgArgs).toEqual([])
      expect(cmd.argv0).toBeUndefined()
    } finally {
      setRipgrepResolutionForTest(null)
    }

    const timeout = new RipgrepTimeoutError("t", ["partial-1"])
    expect(timeout.partialResults).toEqual(["partial-1"])
    expect(timeout).toBeInstanceOf(RipgrepTimeoutError)
    // 未注入真 runtime 时 get 面 = placeholder（禁用态 3 方法可查）
    expect(getSandboxRuntimeModule().isSupportedPlatform()).toBe(false)
    // 真 spawn 探测 checkRipgrep 归 func 层（unit 零 spawn 纪律）
    expect(ripGrep).toBeInstanceOf(Function)
  })
})
