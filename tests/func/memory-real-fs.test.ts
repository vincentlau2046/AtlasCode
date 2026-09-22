/**
 * memory 域真磁盘 func 证据（跨会话独立审视修复 2026-09-22，F1+F3）
 *
 * 缺口背景：FS 适配器 FileSystemMemoryStore 原本只有 mock-fs 单测（委托验证），
 * 能力矩阵 "memory 写+读" done 行 proof 指向 InMemoryStore → 真 FS 适配器无
 * 行为证据（H6 空洞同类）。本文件 = 真 tmpdir + 默认 node:fs 透传
 * （不 setFsImplementation——默认腿本身就是证据对象）：
 *   ① FileSystemMemoryStore 真盘读（readFile/readFileSync/readdir/mkdir 幂等/
 *      readFileInRange 行范围+截断+FileTooLargeError/ENOENT 透传）
 *   ② memoryAge 真盘分档（新建文件 today 档 + utimesSync 回退 mtime → last week 档）
 *
 * 层纪律（D3 严格口径）：原 unit/memory-types-age.test.ts 的 5 个 fs-touching
 * 用例（3 个 writeFileSync 真写 + 2 个 statSync 缺失真 syscall）随本修复移入
 * func 层——审视裁定按 3 写盘用例计，本修复取严格超集（缺失文件 statSync 同属
 * 真盘 syscall，一并移迁）；unit 层只留纯函数（memoryFreshnessText 分档/
 * memoryTypes 常量族）。
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  utimesSync,
  statSync,
} from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  FileSystemMemoryStore,
  memoryAgeDays,
  memoryAge,
  memoryFreshnessNote,
} from "../../src/memory"

const DAY_MS = 24 * 60 * 60 * 1000

describe("memory 域真磁盘 func 证据", () => {
  let dir: string
  let store: FileSystemMemoryStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-mem-real-"))
    // 默认 node:fs 透传——不注入 fs 实现（FileSystemMemoryStore 构造时
    // 捕获 getFsImplementation()，此处 = NodeFsOperations 真 node:fs）
    store = new FileSystemMemoryStore()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("①a readFile/readFileSync — 真盘往返 + ENOENT 真透传", async () => {
    const f = join(dir, "note.md")
    writeFileSync(f, "# memory\nsecond line\n")
    expect(await store.readFile(f)).toBe("# memory\nsecond line\n")
    expect(store.readFileSync(f)).toBe("# memory\nsecond line\n")
    // 缺失文件：真 ENOENT 透传（非 mock 恒等）
    await expect(store.readFile(join(dir, "missing.md"))).rejects.toThrow(
      "ENOENT",
    )
  })

  test("①b readdir — 真目录条目（文件/目录识别）", async () => {
    writeFileSync(join(dir, "a.md"), "a")
    await store.mkdir(join(dir, "sub"))
    writeFileSync(join(dir, "sub", "b.md"), "b")
    const entries = await store.readdir(dir)
    expect(entries.map((e) => e.name).sort()).toEqual(["a.md", "sub"])
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]))
    expect(byName["a.md"].isFile()).toBe(true)
    expect(byName["sub"].isDirectory()).toBe(true)
  })

  test("①c mkdir — 递归创建 + 幂等（EEXIST 容错）", async () => {
    const deep = join(dir, "x", "y", "z")
    await store.mkdir(deep)
    await store.mkdir(deep) // 第二次不得抛（Bun/Windows EEXIST 容错语义）
    expect(statSync(deep).isDirectory()).toBe(true)
  })

  test("①d readFileInRange — 真文件行范围 + mtime + 字节限两态", async () => {
    const f = join(dir, "lines.txt")
    // 无尾换行（14 字节）：5 行全读 = join 无尾 \n 口径
    writeFileSync(f, "l1\nl2\nl3\nl4\nl5")
    const mtimeBefore = statSync(f).mtimeMs

    const ranged = await store.readFileInRange(f, 1, 2)
    expect(ranged.content).toBe("l2\nl3")
    expect(ranged.mtimeMs).toBe(mtimeBefore)

    const all = await store.readFileInRange(f)
    expect(all.content).toBe("l1\nl2\nl3\nl4\nl5")

    // maxBytes 超限 + 非截断模式 → FileTooLargeError（消息口径 shared/format）
    await expect(
      store.readFileInRange(f, 0, undefined, 6),
    ).rejects.toThrow("exceeds maximum allowed size")

    // 截断模式：停在最后一个完整行（10 字节容 l1..l3，l4 越限被裁）
    const truncated = await store.readFileInRange(
      f,
      0,
      undefined,
      10,
      undefined,
      { truncateOnByteLimit: true },
    )
    expect(truncated.content).toBe("l1\nl2\nl3")
  })

  test("② memoryAgeDays/memoryAge — 真文件 today 档 + mtime 回退 last week 档", () => {
    const f = join(dir, "age.md")
    writeFileSync(f, "test")
    const fresh = memoryAgeDays(f)
    expect(fresh).toBeDefined()
    expect(fresh!).toBeGreaterThanOrEqual(0)
    expect(fresh!).toBeLessThan(1) // 刚创建，不到 1 天
    expect(memoryAge(f)).toEqual({ days: 0, text: "today" })

    // 真 mtime 回退 10 天（utimesSync）→ last week 档（7≤10<14 分档边界）
    const past = new Date(Date.now() - 10 * DAY_MS)
    utimesSync(f, past, past)
    const aged = memoryAgeDays(f)
    expect(aged!).toBeGreaterThanOrEqual(9.9)
    expect(aged!).toBeLessThan(11)
    expect(memoryAge(f)!.text).toBe("last week")
  })

  test("②b memoryFreshnessNote — 真文件含 updated / 缺失文件空串", () => {
    const f = join(dir, "note.md")
    writeFileSync(f, "test")
    const note = memoryFreshnessNote(f)
    expect(note).toContain("updated")
    expect(note).toContain("today")
    // 缺失文件：statSync 真 syscall 走 ENOENT 分支（自 unit 层移入，D3）
    expect(memoryFreshnessNote(join(dir, "missing-xyz.md"))).toBe("")
  })

  test("②c memoryAgeDays — 缺失文件返回 undefined（自 unit 层移入，D3）", () => {
    expect(memoryAgeDays(join(dir, "nonexistent-file-xyz.md"))).toBeUndefined()
  })
})
