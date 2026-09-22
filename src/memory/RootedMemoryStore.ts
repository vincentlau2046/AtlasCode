/**
 * RootedMemoryStore — MemoryStore 路径根装饰器（B2）
 *
 * 从旧仓 core/memory/RootedMemoryStore.ts 迁入。
 * 用 rootDir 把逻辑路径映射到物理目录。与 CompositeMemoryStore 组合使用。
 */
import { join } from 'path'
import type { FileReadResult, MemoryStore, StoreDirent } from './types'

export class RootedMemoryStore implements MemoryStore {
  private readonly delegate: MemoryStore
  private readonly rootDir: string

  constructor(delegate: MemoryStore, rootDir: string) {
    this.delegate = delegate
    this.rootDir = rootDir.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  }

  /** 逻辑路径 → 物理路径。 */
  private resolve(p: string): string {
    if (p === this.rootDir || p.startsWith(this.rootDir)) {
      return p
    }
    return join(this.rootDir, p)
  }

  async readFile(path: string, encoding?: { encoding?: string }): Promise<string> {
    return this.delegate.readFile(this.resolve(path), encoding)
  }

  readFileSync(path: string, encoding?: { encoding?: string }): string {
    return this.delegate.readFileSync(this.resolve(path), encoding)
  }

  async readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<StoreDirent[]> {
    return this.delegate.readdir(this.resolve(path), options)
  }

  async mkdir(path: string): Promise<void> {
    await this.delegate.mkdir(this.resolve(path))
  }

  async readFileInRange(
    path: string,
    offset = 0,
    maxLines?: number,
    maxBytes?: number,
    signal?: AbortSignal,
    options?: { truncateOnByteLimit?: boolean },
  ): Promise<FileReadResult> {
    return this.delegate.readFileInRange(
      this.resolve(path),
      offset,
      maxLines,
      maxBytes,
      signal,
      options,
    )
  }

  /** 暴露底层 store 供测试断言 / 组合（只读）。 */
  get backing(): MemoryStore {
    return this.delegate
  }
}
