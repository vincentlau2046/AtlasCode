/**
 * A+S3 ripgrep resolver 单测（0.1.44 Grep ENOENT 根修 · 工单
 * docs/2026-10-08-grep-enent-rootfix.md §4.2 G3/G4 承载）
 *
 * 覆盖：① none 级错误面（RipgrepMissingError 可操作消息 + 各入口行为）
 *      ② path 级形状（rg/$PATH + argv0 缺席 + source）
 *      ③ 自然 env 三级解析（系统 rg 优先 or 平台二进制兜底，不 none）
 *      ④ G4 平台矩阵格（npm_config_arch 覆盖 → 本机无包 + 系统缺席 → none）
 *      ⑤ countFilesRoundedRg keyed memo + 吞错纪律
 *      ⑥ getRipgrepStatus 形状族
 * 真 PTY 行为探针（G1 系统 rg 面 / G2 PATH 隔离兜底面）归 e2e 层。
 */
import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import {
  checkRipgrep,
  countFilesRoundedRg,
  getRipgrepStatus,
  ripGrep,
  ripGrepStream,
  ripgrepCommand,
  setRipgrepResolutionForTest,
  RipgrepMissingError,
  type ResolvedRg,
} from "../../src/sandbox"

const NONE: ResolvedRg = { command: "rg", args: [], source: "none" }
const PATH_FORCED: ResolvedRg = { command: "rg", args: [], source: "path" }
const SIG = () => AbortSignal.timeout(1_000)

describe("A+S3 ripgrep resolver（0.1.44）", () => {
  beforeEach(() => {
    setRipgrepResolutionForTest(null)
  })
  afterAll(() => {
    setRipgrepResolutionForTest(null)
  })

  test("① none 级：ripGrep/ripGrepStream 抛 RipgrepMissingError（可操作消息，非裸 ENOENT）", async () => {
    setRipgrepResolutionForTest(NONE)
    await expect(ripGrep(["-e", "x"], ".", SIG())).rejects.toBeInstanceOf(
      RipgrepMissingError,
    )
    await expect(
      ripGrepStream(["-e", "x"], ".", SIG(), () => {}),
    ).rejects.toBeInstanceOf(RipgrepMissingError)

    const err = (await ripGrep(["-e", "x"], ".", SIG()).catch(e => e)) as Error
    const msg = String(err.message)
    expect(msg).toContain("ripgrep not found")
    expect(msg).toContain("apt") // 安装指引（各平台包名族）在场
    expect(msg).toContain("re-run the package install") // 兜底二进制修复路径在场
    expect(msg).not.toContain("ENOENT") // 非裸 ENOENT 面
  })

  test("①b none 级：checkRipgrep=false / getRipgrepStatus=missing / countFilesRoundedRg 吞错 undefined", async () => {
    setRipgrepResolutionForTest(NONE)
    expect(await checkRipgrep()).toBe(false)
    expect(getRipgrepStatus()).toEqual({
      mode: "missing",
      path: "rg",
      working: false,
    })
    expect(await countFilesRoundedRg("/tmp/as3-none-a", SIG())).toBeUndefined()
  })

  test("② path 级：ripgrepCommand 形状（命令名 rg 经 $PATH、argv0 缺席、source=path）", () => {
    setRipgrepResolutionForTest(PATH_FORCED)
    const cmd = ripgrepCommand()
    expect(cmd.rgPath).toBe("rg")
    expect(cmd.rgArgs).toEqual([])
    expect(cmd.source).toBe("path")
    expect(cmd.argv0).toBeUndefined()
  })

  test("③ 自然 env 三级解析：系统 rg 优先 or @vscode/ripgrep 平台二进制兜底（本环境必非 none）", () => {
    setRipgrepResolutionForTest(null)
    const { rgPath, source } = ripgrepCommand()
    // 本仓依赖树装 @vscode/ripgrep（平台包随 install 在场）→ 系统 rg 缺席也必落兜底
    expect(["path", "vscode-ripgrep"]).toContain(source)
    expect(rgPath.length).toBeGreaterThan(0)
  })

  test("④ G4 平台矩阵格：npm_config_arch=不支持平台（本机无包）+ 系统缺席 → none 级错误面", async () => {
    const savedArch = process.env.npm_config_arch
    const savedPath = process.env.PATH
    try {
      // s390x 平台包本机未安装（bun install 只拉当前平台 linux-x64）
      process.env.npm_config_arch = "s390x"
      // PATH 隔离：剥系统 rg（探测必 fail）
      process.env.PATH = "/nonexistent-rg-probe"
      setRipgrepResolutionForTest(null)

      const { source } = ripgrepCommand()
      expect(source).toBe("none")
      await expect(ripGrep(["-e", "x"], ".", SIG())).rejects.toBeInstanceOf(
        RipgrepMissingError,
      )
      expect(getRipgrepStatus().mode).toBe("missing")
    } finally {
      if (savedArch === undefined) delete process.env.npm_config_arch
      else process.env.npm_config_arch = savedArch
      process.env.PATH = savedPath
      setRipgrepResolutionForTest(null)
    }
  })

  test("⑤ countFilesRoundedRg keyed memo：同键同 Promise 实例 / 异键新实例（吞错后 undefined）", async () => {
    setRipgrepResolutionForTest(NONE)
    const p1 = countFilesRoundedRg("/tmp/as3-memo-a", SIG())
    const p2 = countFilesRoundedRg("/tmp/as3-memo-a", SIG())
    const p3 = countFilesRoundedRg("/tmp/as3-memo-b", SIG())
    expect(p2).toBe(p1) // 同键 memo（缓存键 = dirPath + ignorePatterns）
    expect(p3).not.toBe(p1)
    expect(await p1).toBeUndefined() // 错误吞掉（调用方 fire-and-forget 纪律）
  })

  test("⑥ getRipgrepStatus：自然 env 形状（mode 值域 + working 必 boolean）", () => {
    setRipgrepResolutionForTest(null)
    const s = getRipgrepStatus()
    expect(["system", "bundled", "missing"]).toContain(s.mode)
    expect(typeof s.working).toBe("boolean")
    expect(s.path.length).toBeGreaterThan(0)
  })
})
