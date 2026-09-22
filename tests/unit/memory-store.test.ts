/**
 * memory 域 store 单测 — InMemoryStore + CompositeMemoryStore + RootedMemoryStore
 *
 * 纯内存测试：无网络/无真实磁盘/无 PTY。
 */
import { describe, test, expect } from "bun:test"
import {
  InMemoryStore,
  CompositeMemoryStore,
  RootedMemoryStore,
} from "../../src/memory"

describe("InMemoryStore", () => {
  test("readFile — 存在文件返回内容", async () => {
    const store = new InMemoryStore()
    store.setFile("/a/b.md", "hello world")
    expect(await store.readFile("/a/b.md")).toBe("hello world")
  })

  test("readFile — 缺失抛 ENOENT", async () => {
    const store = new InMemoryStore()
    await expect(store.readFile("/nope.md")).rejects.toThrow(/ENOENT/)
  })

  test("readFileSync — 存在/缺失", () => {
    const store = new InMemoryStore()
    store.setFile("/x.md", "sync content")
    expect(store.readFileSync("/x.md")).toBe("sync content")
    expect(() => store.readFileSync("/missing.md")).toThrow(/ENOENT/)
  })

  test("readFileSync — 路径归一化（反斜杠/尾斜杠）", () => {
    const store = new InMemoryStore()
    store.setFile("/dir/file.md", "norm")
    expect(store.readFileSync("/dir/file.md")).toBe("norm")
    expect(store.readFileSync("/dir/file.md/")).toBe("norm")
  })

  test("readdir — 非递归列直接子项（文件+目录）", async () => {
    const store = new InMemoryStore()
    store.setFile("/mem/a.md", "a")
    store.setFile("/mem/b.md", "b")
    store.setFile("/mem/sub/c.md", "c")
    const entries = await store.readdir("/mem")
    const names = entries.map(e => e.name).sort()
    expect(names).toEqual(["a.md", "b.md", "sub"])
    const sub = entries.find(e => e.name === "sub")!
    expect(sub.isDirectory()).toBe(true)
    expect(sub.isFile()).toBe(false)
    const file = entries.find(e => e.name === "a.md")!
    expect(file.isFile()).toBe(true)
    expect(file.isDirectory()).toBe(false)
  })

  test("readdir — 递归列所有文件", async () => {
    const store = new InMemoryStore()
    store.setFile("/mem/a.md", "a")
    store.setFile("/mem/sub/c.md", "c")
    store.setFile("/mem/sub/deep/d.md", "d")
    const entries = await store.readdir("/mem", { recursive: true })
    const fileNames = entries.filter(e => e.isFile()).map(e => e.name).sort()
    expect(fileNames).toEqual(["a.md", "sub/c.md", "sub/deep/d.md"])
  })

  test("mkdir — no-op 不抛", async () => {
    const store = new InMemoryStore()
    await expect(store.mkdir("/any/dir")).resolves.toBeUndefined()
  })

  test("readFileInRange — 行范围选取", async () => {
    const store = new InMemoryStore()
    store.setFile("/f.txt", "line0\nline1\nline2\nline3\nline4")
    const r = await store.readFileInRange("/f.txt", 1, 2)
    expect(r.content).toBe("line1\nline2")
  })

  test("readFileInRange — 默认 offset=0 全量", async () => {
    const store = new InMemoryStore()
    store.setFile("/f.txt", "a\nb")
    const r = await store.readFileInRange("/f.txt")
    expect(r.content).toBe("a\nb")
  })

  test("readFileInRange — maxBytes 超限抛 FileTooLarge", async () => {
    const store = new InMemoryStore()
    store.setFile("/f.txt", "x".repeat(100))
    await expect(
      store.readFileInRange("/f.txt", 0, undefined, 10),
    ).rejects.toThrow(/FileTooLarge/)
  })

  test("readFileInRange — truncateOnByteLimit 截断不抛", async () => {
    const store = new InMemoryStore()
    store.setFile("/f.txt", "short\nloooooong-line\nmore")
    const r = await store.readFileInRange("/f.txt", 0, undefined, 10, undefined, {
      truncateOnByteLimit: true,
    })
    // 只能放 "short"（6B），放不下 "loooooong-line"（含分隔符超 10B）
    expect(r.content).toBe("short")
  })

  test("readFileInRange — BOM 剥除", async () => {
    const store = new InMemoryStore()
    store.setFile("/f.txt", "﻿hello")
    const r = await store.readFileInRange("/f.txt", 0, 1)
    expect(r.content).toBe("hello")
  })

  test("readFileInRange — 缺失抛 ENOENT", async () => {
    const store = new InMemoryStore()
    await expect(store.readFileInRange("/nope.txt")).rejects.toThrow(/ENOENT/)
  })

  test("size — 文件计数", () => {
    const store = new InMemoryStore()
    store.setFile("/a", "1")
    store.setFile("/b", "2")
    expect(store.size).toBe(2)
  })
})

describe("CompositeMemoryStore", () => {
  test("构造 — 空数组抛错", () => {
    expect(() => new CompositeMemoryStore()).toThrow(/at least one/)
  })

  test("readFile — 首个 store 命中", async () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    a.setFile("/x.md", "from-a")
    b.setFile("/x.md", "from-b")
    const comp = new CompositeMemoryStore(a, b)
    expect(await comp.readFile("/x.md")).toBe("from-a")
  })

  test("readFile — 首个 ENOENT 走第二个", async () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    b.setFile("/y.md", "from-b")
    const comp = new CompositeMemoryStore(a, b)
    expect(await comp.readFile("/y.md")).toBe("from-b")
  })

  test("readFile — 全部 ENOENT 抛错", async () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    const comp = new CompositeMemoryStore(a, b)
    await expect(comp.readFile("/none.md")).rejects.toThrow(/ENOENT/)
  })

  test("readFileSync — fan-out ENOENT", () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    a.setFile("/a.md", "a")
    b.setFile("/b.md", "b")
    const comp = new CompositeMemoryStore(a, b)
    expect(comp.readFileSync("/a.md")).toBe("a")
    expect(comp.readFileSync("/b.md")).toBe("b")
    expect(() => comp.readFileSync("/c.md")).toThrow(/ENOENT/)
  })

  test("readdir — 合并所有 store 条目", async () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    a.setFile("/mem/a1.md", "1")
    b.setFile("/mem/b1.md", "2")
    const comp = new CompositeMemoryStore(a, b)
    const entries = await comp.readdir("/mem")
    const names = entries.map(e => e.name).sort()
    expect(names).toEqual(["a1.md", "b1.md"])
  })

  test("mkdir — fan-out 全部", async () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    const comp = new CompositeMemoryStore(a, b)
    await expect(comp.mkdir("/dir")).resolves.toBeUndefined()
  })

  test("readFileInRange — fan-out ENOENT", async () => {
    const a = new InMemoryStore()
    const b = new InMemoryStore()
    b.setFile("/r.txt", "line0\nline1")
    const comp = new CompositeMemoryStore(a, b)
    const r = await comp.readFileInRange("/r.txt", 0, 1)
    expect(r.content).toBe("line0")
    await expect(comp.readFileInRange("/none.txt")).rejects.toThrow(/ENOENT/)
  })

  test("size — 子 store 数量", () => {
    const comp = new CompositeMemoryStore(
      new InMemoryStore(),
      new InMemoryStore(),
      new InMemoryStore(),
    )
    expect(comp.size).toBe(3)
  })
})

describe("RootedMemoryStore", () => {
  test("readFile — 逻辑路径映射到 rootDir", async () => {
    const backing = new InMemoryStore()
    backing.setFile("/root/mem/a.md", "rooted-content")
    const rooted = new RootedMemoryStore(backing, "/root")
    // 逻辑路径 "mem/a.md" → 物理 "/root/mem/a.md"
    expect(await rooted.readFile("mem/a.md")).toBe("rooted-content")
  })

  test("readFile — 已在 rootDir 内的路径不重复拼接", async () => {
    const backing = new InMemoryStore()
    backing.setFile("/root/mem/b.md", "pass-through")
    const rooted = new RootedMemoryStore(backing, "/root/")
    expect(await rooted.readFile("/root/mem/b.md")).toBe("pass-through")
  })

  test("readFileSync — 映射", () => {
    const backing = new InMemoryStore()
    backing.setFile("/root/sync.md", "sync")
    const rooted = new RootedMemoryStore(backing, "/root")
    expect(rooted.readFileSync("sync.md")).toBe("sync")
  })

  test("readdir — 映射", async () => {
    const backing = new InMemoryStore()
    backing.setFile("/root/mem/x.md", "x")
    const rooted = new RootedMemoryStore(backing, "/root")
    const entries = await rooted.readdir("mem")
    expect(entries.map(e => e.name)).toEqual(["x.md"])
  })

  test("mkdir — 映射", async () => {
    const backing = new InMemoryStore()
    const rooted = new RootedMemoryStore(backing, "/root")
    await expect(rooted.mkdir("mem")).resolves.toBeUndefined()
  })

  test("readFileInRange — 映射", async () => {
    const backing = new InMemoryStore()
    backing.setFile("/root/range.txt", "l0\nl1\nl2")
    const rooted = new RootedMemoryStore(backing, "/root")
    const r = await rooted.readFileInRange("range.txt", 1, 1)
    expect(r.content).toBe("l1")
  })

  test("backing — 暴露底层 store", () => {
    const backing = new InMemoryStore()
    const rooted = new RootedMemoryStore(backing, "/root")
    expect(rooted.backing).toBe(backing)
  })

  test("rootDir — 尾斜杠归一化", async () => {
    const backing = new InMemoryStore()
    backing.setFile("/root/n.md", "n")
    const rooted = new RootedMemoryStore(backing, "/root///")
    expect(await rooted.readFile("n.md")).toBe("n")
  })
})
