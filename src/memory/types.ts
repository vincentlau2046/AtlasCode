/**
 * MemoryStore 接口 — 从旧仓 core/memory/MemoryStore.ts 迁入
 *
 * 仅抽象文件 I/O（read/write/list/mkdir）。Prompt 生成、类型分类、相关性选择
 * 在 memdir 业务层（域内 paths.ts / memoryTypes.ts 等），不在此重复。
 *
 * sync + async 并存：buildMemoryPrompt 在 React sync render 上下文调用。
 *
 * 方案 B（无状态路径透传）：store 构造不带 dirPath，方法接收调用方传入的绝对路径。
 * 路径推导（memory 根目录 / 项目目录）留在业务层（paths.ts）。
 */

/**
 * 目录条目 — 保留 `name` 字段以兼容 fs.Dirent。
 */
export interface StoreDirent {
  name: string
  isFile(): boolean
  isDirectory(): boolean
}

/** Result of a ranged file read (content + mtime). */
export interface FileReadResult {
  content: string
  mtimeMs: number
}

/**
 * Memory storage abstraction.
 * Implementations wrap either the real filesystem or a test double.
 */
export interface MemoryStore {
  /** Async read of an entire file. */
  readFile(path: string, encoding?: { encoding?: string }): Promise<string>

  /** Sync read of an entire file. Used by prompt-building (React sync render). */
  readFileSync(path: string, encoding?: { encoding?: string }): string

  /** List directory entries. Returns Dirent-like objects. */
  readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<StoreDirent[]>

  /** Recursive directory creation. Idempotent (doesn't throw on EEXIST). */
  mkdir(path: string): Promise<void>

  /**
   * Read a specific line range from a file.
   * Returns content + mtimeMs without a separate stat call.
   */
  readFileInRange(
    path: string,
    offset?: number,
    maxLines?: number,
    maxBytes?: number,
    signal?: AbortSignal,
    options?: { truncateOnByteLimit?: boolean },
  ): Promise<FileReadResult>
}
