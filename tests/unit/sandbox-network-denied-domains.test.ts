/**
 * AD-08（0.1.49 A-④ · CC 2.1.113 TOP #12）：sandbox.network.deniedDomains
 * schema 键 + createSandboxManager 接线 + denied-优先判定原语
 * （工单 §1.2 改法 3 件 + §2 判别单测）。
 *
 * 缺口定位（工单 §1.2 PAC 卡 D1）：SandboxNetworkConfigSchema 无 deniedDomains
 * 键；createSandboxManager 硬编码 `deniedDomains: []`（残余①「由 permissions
 * WebFetch 规则解析」未做）；运行时类型已预留（runtime-types network.deniedDomains
 * + sandbox-backend getNetworkRestrictionConfig {deniedHosts?}）+ 后端接线在场。
 *
 * 判别判据（工单 §2 AD-08）：
 * ① `deniedDomains:['evil.com']` + `allowedDomains:['*.com']` → evil.com 拒
 *    —— 修前红（键不存在恒 [] → 放行；判定原语不存在）→ 修后绿。
 * ② deniedDomains 空/缺省 → allowedDomains 行为恒等 —— 零回归（恒绿：修前
 *    硬编码 [] ≡ 修后空透传，runtime config 逐字恒等）。
 * ③ schema 校验（拒非数组）+ 既有形状零回归 —— 零回归部分恒绿（既有形状
 *    不动）；校验部分 = 新键契约（修前键不存在 → 红，与 ① 同根因；修后绿）。
 *
 * 接缝：fake runtime（sandbox-runtime-fake，initialize 捕获 config）+ fake deps，
 * 零磁盘零网络零子进程。判定原语经 barrel 动态 import 取可选属性（修前不存在
 * → undefined → 仅 ① 断言红，②③ 不消费 → 保持工单分类：修前红 = ①；
 * 零回归 ②③ 恒绿）。
 */
import { describe, test, expect, beforeEach } from "bun:test"
import {
  createSandboxManager,
  resetSandboxRuntimeModule,
  setSandboxRuntimeModule,
  type SandboxRuntimeConfig,
  type SettingsJson,
} from "../../src/sandbox"
import {
  createFakeSandboxDeps,
  createFakeSandboxRuntime,
} from "../fixtures/sandbox-runtime-fake"

// 判定原语取可选属性（修前 barrel 无此导出 = undefined，仅 ① 红）
const sandboxMod = await import("../../src/sandbox")
const decideHostNetwork:
  | ((
      host: string,
      network: { allowedDomains: string[]; deniedDomains: string[] },
    ) => "deny" | "allow" | "passthrough")
  | undefined = (sandboxMod as Record<string, unknown>)
  .decideHostNetwork as (typeof decideHostNetwork)
const domainPatternMatches:
  | ((host: string, pattern: string) => boolean)
  | undefined = (sandboxMod as Record<string, unknown>)
  .domainPatternMatches as (typeof domainPatternMatches)

const { SandboxNetworkConfigSchema } = await import(
  "../../src/tui/entrypoints/sandboxTypes"
)

/** settings.sandbox.network 面 initialize → 捕获 runtime config（⑥b 模式）。 */
async function captureRuntimeConfig(
  network: Record<string, unknown>,
): Promise<SandboxRuntimeConfig> {
  const { runtime, state } = createFakeSandboxRuntime()
  setSandboxRuntimeModule(runtime)
  const manager = createSandboxManager(
    createFakeSandboxDeps({
      getSettings: () =>
        ({ sandbox: { enabled: true, network } }) as SettingsJson,
    }),
  )
  await manager.initialize()
  expect(state.initializedConfigs).toHaveLength(1)
  return state.initializedConfigs[0]
}

describe("AD-08 sandbox.network.deniedDomains（工单 §2 ①修前红 / ②③零回归+校验）", () => {
  beforeEach(() => {
    resetSandboxRuntimeModule()
  })

  test("① denied 优先判定原语：denied 命中即拒（即使 allowed 通配也命中）", () => {
    expect(decideHostNetwork).toBeTypeOf("function")
    expect(domainPatternMatches).toBeTypeOf("function")
    const network = { allowedDomains: ["*.com"], deniedDomains: ["evil.com"] }
    // denied 命中 → 拒（允许面不能覆盖拒绝面，工单 §1.2 改法 3）
    expect(decideHostNetwork!("evil.com", network)).toBe("deny")
    expect(decideHostNetwork!("sub.evil.com", network)).toBe("deny")
    // 非 denied 域名：allowed 通配放行
    expect(decideHostNetwork!("good.com", network)).toBe("allow")
    // 两侧均未命中 → passthrough（无域名级限制，归后端隔离面决定）
    expect(decideHostNetwork!("other.org", network)).toBe("passthrough")
  })

  test("① 域名模式：子域感知 + *.suffix 通配归一（WebFetch domain 约定）", () => {
    expect(domainPatternMatches!("api.evil.com", "evil.com")).toBe(true)
    // 非子域前缀不算命中（notevil.com ≠ 子域 of evil.com）
    expect(domainPatternMatches!("notevil.com", "evil.com")).toBe(false)
    // *.suffix 通配形归一为 suffix 子域匹配（apex 自身亦命中，与非通配形
    // 精确命中语义一致：*.com ≡ com）
    expect(domainPatternMatches!("x.y.com", "*.com")).toBe(true)
    expect(domainPatternMatches!("com", "*.com")).toBe(true)
  })

  test("① 接线：settings.deniedDomains 达 runtime config → 判定拒（修前红：恒 []）", async () => {
    const config = await captureRuntimeConfig({
      allowedDomains: ["*.com"],
      deniedDomains: ["evil.com"],
    })
    expect(config.network.deniedDomains).toEqual(["evil.com"])
    expect(config.network.allowedDomains).toEqual(["*.com"])
    // 捕获的 config 喂判定原语 = denied 优先拒
    expect(
      decideHostNetwork!(
        "evil.com",
        {
          allowedDomains: config.network.allowedDomains,
          deniedDomains: config.network.deniedDomains,
        },
      ),
    ).toBe("deny")
  })

  test("② deniedDomains 空/缺省 → allowedDomains 行为恒等（零回归，恒绿）", async () => {
    // 缺省（用户现状）：runtime config deniedDomains = [] 且 allowedDomains
    // 透传不动 = 修前行为（硬编码 []）逐字恒等
    const absent = await captureRuntimeConfig({ allowedDomains: ["a.com"] })
    expect(absent.network.deniedDomains).toEqual([])
    expect(absent.network.allowedDomains).toEqual(["a.com"])
    // 显式空数组：同恒等
    const empty = await captureRuntimeConfig({
      allowedDomains: ["a.com"],
      deniedDomains: [],
    })
    expect(empty.network.deniedDomains).toEqual([])
    expect(empty.network.allowedDomains).toEqual(["a.com"])
  })

  test("③ 零回归：既有 network 形状 schema 校验不动（恒绿）", () => {
    const schema = SandboxNetworkConfigSchema()
    expect(schema.parse(undefined)).toBeUndefined()
    expect(schema.parse({ allowedDomains: ["a.com"] })).toEqual({
      allowedDomains: ["a.com"],
    })
    expect(schema.parse({})).toEqual({})
  })

  test("③ 校验：deniedDomains 拒非数组（新键契约；修前键不存在 → 红，与 ① 同根）", () => {
    const schema = SandboxNetworkConfigSchema()
    expect(() => schema.parse({ deniedDomains: "x" })).toThrow()
    expect(schema.parse({ deniedDomains: ["a.com"] })).toEqual({
      deniedDomains: ["a.com"],
    })
  })
})
