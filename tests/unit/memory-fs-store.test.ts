/**
 * memory 域 FileSystemMemoryStore 单测 — 用 mock FsOperations 验证委托
 *
 * 无网络/无真实磁盘（mock fs）/无 PTY。
 * FileSystemMemoryStore 构造时调 getFsImplementation()，故 setFs 须先于 new。
 */
import { describe, test, expect, afterEach } from "bun:test"
import { FileSystemMemoryStore } from "../../src/memory"
// C1 下沉后 fs 抽象在 shared（跨域），测试经 shared 门面导入
import {
  setFsImplementation as setFs,
  setOriginalFsImplementation as resetFs,
  type FsOperations,
} from "../../src/shared"

function makeMock(overrides: Partial<FsOperations> = {}): FsOperations {
  return {
    cwd: () => "/mock",
    existsSync: () => true,
    stat: async () => ({ isDirectory: () => false } as never),
    readdir: async () => [],
    mkdir: async () => {},
    readFile: async () => "",
    readFileSync: () => "",
    statSync: () => ({ mtimeMs: 0 } as never),
    ...overrides,
  }
}

afterEach(() => {
  resetFs()
})

describe("FileSystemMemoryStore", () => {
  test("readFile — 委托 fs.readFile（utf-8）", async () => {
    let capturedPath = ""
    let capturedEnc = ""
    setFs(
      makeMock({
        readFile: async (p, o) => {
          capturedPath = p
          capturedEnc = o.encoding
          return "file-content"
        },
      }),
    )
    const store = new FileSystemMemoryStore()
    expect(await store.readFile("/path/to/mem.md")).toBe("file-content")
    expect(capturedPath).toBe("/path/to/mem.md")
    expect(capturedEnc).toBe("utf-8")
  })

  test("readFileSync — 委托 fs.readFileSync", () => {
    let capturedPath = ""
    setFs(
      makeMock({
        readFileSync: (p) => {
          capturedPath = p
          return "sync-content"
        },
      }),
    )
    const store = new FileSystemMemoryStore()
    expect(store.readFileSync("/sync.md")).toBe("sync-content")
    expect(capturedPath).toBe("/sync.md")
  })

  test("readdir — 委托 fs.readdir + 透传 recursive", async () => {
    let capturedOpts: { recursive?: boolean } | undefined
    setFs(
      makeMock({
        readdir: async (_p, o) => {
          capturedOpts = o
          return [
            { name: "a.md", isFile: () => true, isDirectory: () => false },
            { name: "sub", isFile: () => false, isDirectory: () => true },
          ]
        },
      }),
    )
    const store = new FileSystemMemoryStore()
    const entries = await store.readdir("/mem", { recursive: true })
    expect(capturedOpts?.recursive).toBe(true)
    expect(entries.length).toBe(2)
    expect(entries[0]!.name).toBe("a.md")
  })

  test("mkdir — 委托 fs.mkdir", async () => {
    let capturedPath = ""
    setFs(
      makeMock({
        mkdir: async (p) => {
          capturedPath = p
        },
      }),
    )
    const store = new FileSystemMemoryStore()
    await store.mkdir("/new/dir")
    expect(capturedPath).toBe("/new/dir")
  })

  test("readFileInRange — 不存在文件抛错（委托链路通）", async () => {
    // readFileInRange 用域本地 readFileInRange.ts（真实 fs）
    const store = new FileSystemMemoryStore()
    await expect(
      store.readFileInRange("/nonexistent-file-path-xyz.md"),
    ).rejects.toThrow()
  })
})
