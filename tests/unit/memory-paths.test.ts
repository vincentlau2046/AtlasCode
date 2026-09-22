/**
 * memory 域 paths 单测 — 路径解析 + 安全校验 + 启用门控
 *
 * 纯函数测试：env 读取/路径推导/安全拒绝。
 * 无网络/无真实磁盘/无 PTY。
 */
import { describe, test, expect, afterEach } from "bun:test"
import {
  isAutoMemoryEnabled,
  isExtractModeActive,
  getMemoryBaseDir,
  validateMemoryPath,
  getCoworkMemoryPathOverride,
  hasAutoMemPathOverride,
  getAutoMemPath,
  getAutoMemEntrypoint,
  isAutoMemPath,
} from "../../src/memory"

const ENV_KEYS = [
  "ATLAS_DISABLE_AUTO_MEMORY",
  "ATLAS_SIMPLE",
  "ATLAS_REMOTE",
  "ATLAS_REMOTE_MEMORY_DIR",
  "ATLAS_COWORK_MEMORY_PATH_OVERRIDE",
  "ATLAS_CONFIG_DIR",
]

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
})

describe("isAutoMemoryEnabled", () => {
  test("默认 ON", () => {
    expect(isAutoMemoryEnabled()).toBe(true)
  })

  test("ATLAS_DISABLE_AUTO_MEMORY=1 → OFF", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "1"
    expect(isAutoMemoryEnabled()).toBe(false)
  })

  test("ATLAS_DISABLE_AUTO_MEMORY=true → OFF", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "true"
    expect(isAutoMemoryEnabled()).toBe(false)
  })

  test("ATLAS_DISABLE_AUTO_MEMORY=0 → ON（显式假=显式开）", () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = "0"
    expect(isAutoMemoryEnabled()).toBe(true)
  })

  test("ATLAS_SIMPLE=1 → OFF", () => {
    process.env.ATLAS_SIMPLE = "1"
    expect(isAutoMemoryEnabled()).toBe(false)
  })

  test("ATLAS_REMOTE=1 且无 REMOTE_MEMORY_DIR → OFF", () => {
    process.env.ATLAS_REMOTE = "1"
    delete process.env.ATLAS_REMOTE_MEMORY_DIR
    expect(isAutoMemoryEnabled()).toBe(false)
  })

  test("ATLAS_REMOTE=1 且有 REMOTE_MEMORY_DIR → ON", () => {
    process.env.ATLAS_REMOTE = "1"
    process.env.ATLAS_REMOTE_MEMORY_DIR = "/remote/mem"
    expect(isAutoMemoryEnabled()).toBe(true)
  })
})

describe("isExtractModeActive", () => {
  test("B 波桩返 false（growthbook 未接线）", () => {
    expect(isExtractModeActive()).toBe(false)
  })
})

describe("getMemoryBaseDir", () => {
  test("ATLAS_REMOTE_MEMORY_DIR 覆盖", () => {
    process.env.ATLAS_REMOTE_MEMORY_DIR = "/remote/base"
    expect(getMemoryBaseDir()).toBe("/remote/base")
  })

  test("默认 ~/.atlas", () => {
    delete process.env.ATLAS_REMOTE_MEMORY_DIR
    expect(getMemoryBaseDir()).toMatch(/\.atlas$/)
  })
})

describe("validateMemoryPath", () => {
  test("合法绝对路径 → 带尾分隔符", () => {
    const result = validateMemoryPath("/home/user/mem", false)
    expect(result).toBe("/home/user/mem/")
  })

  test("未设 → undefined", () => {
    expect(validateMemoryPath(undefined, false)).toBeUndefined()
    expect(validateMemoryPath("", false)).toBeUndefined()
  })

  test("相对路径 → undefined（拒绝）", () => {
    expect(validateMemoryPath("../foo", false)).toBeUndefined()
    expect(validateMemoryPath("relative/path", false)).toBeUndefined()
  })

  test("根/近根 → undefined（拒绝）", () => {
    expect(validateMemoryPath("/", false)).toBeUndefined()
    expect(validateMemoryPath("/a", false)).toBeUndefined()
  })

  test("UNC 路径 → undefined（拒绝）", () => {
    // 反斜杠 UNC：POSIX 上 !isAbsolute 拒绝
    expect(validateMemoryPath("\\\\server\\share", false)).toBeUndefined()
    // 注：正斜杠 //server/share 在 POSIX 上被 normalize 折叠成 /server/share
    // （startsWith('//') 检查是 Windows-only；POSIX 不拒绝），与旧仓忠实行为一致
  })

  test("null 字节 → undefined（拒绝）", () => {
    expect(validateMemoryPath("/safe\0/evil", false)).toBeUndefined()
  })

  test("Windows 盘根 → undefined（拒绝）", () => {
    expect(validateMemoryPath("C:", false)).toBeUndefined()
  })

  test("tilde 展开（expandTilde=true）", () => {
    const result = validateMemoryPath("~/mymem", true)
    expect(result).toBeDefined()
    expect(result!).toMatch(/mymem\/$/)
  })

  test("bare ~ 不展开（防匹配 $HOME）", () => {
    expect(validateMemoryPath("~/", true)).toBeUndefined()
    expect(validateMemoryPath("~/..", true)).toBeUndefined()
  })

  test("尾斜杠归一化为单个", () => {
    const result = validateMemoryPath("/home/user/mem///", false)
    expect(result).toBe("/home/user/mem/")
  })
})

describe("getCoworkMemoryPathOverride + hasAutoMemPathOverride", () => {
  test("未设 → undefined / false", () => {
    expect(getCoworkMemoryPathOverride()).toBeUndefined()
    expect(hasAutoMemPathOverride()).toBe(false)
  })

  test("合法覆盖 → 返回路径 / true", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "/cowork/mem"
    expect(getCoworkMemoryPathOverride()).toBe("/cowork/mem/")
    expect(hasAutoMemPathOverride()).toBe(true)
  })

  test("非法覆盖（相对）→ undefined / false", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "../evil"
    expect(getCoworkMemoryPathOverride()).toBeUndefined()
    expect(hasAutoMemPathOverride()).toBe(false)
  })
})

describe("getAutoMemPath + getAutoMemEntrypoint", () => {
  test("默认结构：<base>/projects/<sanitized-root>/memory/", () => {
    process.env.ATLAS_CONFIG_DIR = "/tmp/atlas-test"
    const path = getAutoMemPath("/home/user/myproject")
    expect(path).toContain("/projects/")
    expect(path).toContain("/memory/")
    expect(path.endsWith("/")).toBe(true)
  })

  test("Cowork 覆盖优先", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "/cowork/mem"
    expect(getAutoMemPath("/any/project")).toBe("/cowork/mem/")
  })

  test("getAutoMemEntrypoint — MEMORY.md", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "/cowork/mem"
    expect(getAutoMemEntrypoint("/any")).toBe("/cowork/mem/MEMORY.md")
  })

  test("memoize — 同 projectRoot 缓存命中（同对象返回）", () => {
    process.env.ATLAS_CONFIG_DIR = "/tmp/atlas-test2"
    const p1 = getAutoMemPath("/proj/x")
    const p2 = getAutoMemPath("/proj/x")
    expect(p1).toBe(p2)
  })

  test("memoize — 不同 projectRoot 重算", () => {
    process.env.ATLAS_CONFIG_DIR = "/tmp/atlas-test3"
    const p1 = getAutoMemPath("/proj/a")
    const p2 = getAutoMemPath("/proj/b")
    expect(p1).not.toBe(p2)
  })
})

describe("isAutoMemPath", () => {
  test("目录内 → true", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "/cowork/mem"
    expect(isAutoMemPath("/cowork/mem/file.md", "/any")).toBe(true)
    expect(isAutoMemPath("/cowork/mem/sub/deep.md", "/any")).toBe(true)
  })

  test("目录外 → false", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "/cowork/mem"
    expect(isAutoMemPath("/etc/passwd", "/any")).toBe(false)
  })

  test(".. 穿透防护", () => {
    process.env.ATLAS_COWORK_MEMORY_PATH_OVERRIDE = "/cowork/mem"
    // /cowork/mem/../etc 应归一化后不在 /cowork/mem/ 内
    expect(isAutoMemPath("/cowork/mem/../etc/passwd", "/any")).toBe(false)
  })
})
