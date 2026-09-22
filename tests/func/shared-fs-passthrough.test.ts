/**
 * shared fs-operations 默认 node:fs 透传腿 func 用例（跨会话审视修复 2026-09-22）
 *
 * 缺口背景：FsOperations 抽象的测试只覆盖"注入 mock"一条腿
 * （memory-fs-store.test.ts 用 mock FsOperations 验委托；切片 1 加法 4 原语
 * 同），默认 NodeFsOperations（node:fs 透传）无直接行为证据——而它正是
 * 生产路径（组合根不注入 fs 实现时 getFsImplementation() 即此腿）。
 *
 * 本文件 = 不 setFsImplementation，直用默认腿真 tmpdir 跑：
 *   ① 默认身份（getFsImplementation() === NodeFsOperations）
 *   ② 存在性/统计（existsSync/stat/statSync 真往返）
 *   ③ realpathSync 真符号链接解析
 *   ④ mkdir mode 真断言（0o700 落地 + EEXIST 幂等）
 *   ⑤ open 真写 + readFile 回读（FileHandle 真 I/O）
 *   ⑥ unlinkSync 真删 + ENOENT 真抛（容错在调用方，接口不吞）
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  constants as fsConstants,
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  NodeFsOperations,
  getFsImplementation,
  setOriginalFsImplementation,
} from "../../src/shared"

describe("shared fs-operations 默认 node:fs 透传腿", () => {
  const fsOps = NodeFsOperations
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-fs-default-"))
  })

  afterEach(() => {
    setOriginalFsImplementation() // 卫生：即使本文件不注入也归位默认腿
    rmSync(dir, { recursive: true, force: true })
  })

  test("① 默认腿身份——未注入时 getFsImplementation() 即 NodeFsOperations", () => {
    expect(getFsImplementation()).toBe(NodeFsOperations)
  })

  test("② existsSync/stat/statSync — 真往返", async () => {
    const f = join(dir, "f.txt")
    expect(fsOps.existsSync(f)).toBe(false)
    writeFileSync(f, "payload")
    expect(fsOps.existsSync(f)).toBe(true)
    const stats = await fsOps.stat(f)
    expect(stats.isFile()).toBe(true)
    expect(stats.size).toBe(7)
    expect(fsOps.statSync(f).mtimeMs).toBeGreaterThan(0)
  })

  test("③ realpathSync — 真符号链接解析到目标", () => {
    const target = join(dir, "target.txt")
    writeFileSync(target, "t")
    const link = join(dir, "link.txt")
    symlinkSync(target, link)
    const resolved = fsOps.realpathSync(link)
    expect(resolved).toBe(target)
    expect(resolved).not.toBe(link)
  })

  test("④ mkdir mode — 0o700 真落地 + EEXIST 幂等", async () => {
    const p = join(dir, "p")
    await fsOps.mkdir(p, { mode: 0o700 })
    expect(statSync(p).mode & 0o777).toBe(0o700)
    await fsOps.mkdir(p, { mode: 0o700 }) // 第二次不得抛（EEXIST 容错）
  })

  test("⑤ open 真写 + readFile 回读（FileHandle 真 I/O）", async () => {
    const f = join(dir, "handle.txt")
    const fh = await fsOps.open(
      f,
      fsConstants.O_WRONLY | fsConstants.O_CREAT,
    )
    await fh.write("hello-default")
    await fh.close()
    expect(await fsOps.readFile(f, { encoding: "utf8" })).toBe(
      "hello-default",
    )
  })

  test("⑥ unlinkSync — 真删 + ENOENT 真抛（接口不吞错）", () => {
    const f = join(dir, "gone.txt")
    writeFileSync(f, "x")
    fsOps.unlinkSync(f)
    expect(existsSync(f)).toBe(false)
    expect(() => fsOps.unlinkSync(f)).toThrow("ENOENT")
  })
})
