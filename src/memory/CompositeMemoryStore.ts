/**
 * CompositeMemoryStore — MemoryStore 组合聚合实现（Team 模式双目录聚合）
 *
 * 从旧仓 core/memory/CompositeMemoryStore.ts 迁入。
 * 读操作 fan-out 到所有子 store 并合并结果。
 */
import type { FileReadResult, MemoryStore, StoreDirent } from './types'

export class CompositeMemoryStore implements MemoryStore {
  private readonly stores: readonly MemoryStore[]

  constructor(...stores: MemoryStore[]) {
    if (stores.length === 0) {
      throw new Error('CompositeMemoryStore requires at least one backing store')
    }
    this.stores = stores
  }

  /** 组合内的后端数量（测试辅助）。 */
  get size(): number {
    return this.stores.length
  }

  async readFile(path: string, encoding?: { encoding?: string }): Promise<string> {
    for (const s of this.stores) {
      try {
        return await s.readFile(path, encoding)
      } catch (e) {
        if (isNotFound(e)) continue
        throw e
      }
    }
    throw new Error(`ENOENT: file not found in any backing store: ${path}`)
  }

  readFileSync(path: string, encoding?: { encoding?: string }): string {
    let lastErr: unknown
    for (const s of this.stores) {
      try {
        return s.readFileSync(path, encoding)
      } catch (e) {
        if (isNotFound(e)) {
          lastErr = e
          continue
        }
        throw e
      }
    }
    throw lastErr ?? new Error(`ENOENT: file not found in any backing store: ${path}`)
  }

  async readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<StoreDirent[]> {
    const results = await Promise.all(
      this.stores.map(s => s.readdir(path, options)),
    )
    return results.flat()
  }

  async mkdir(path: string): Promise<void> {
    await Promise.all(this.stores.map(s => s.mkdir(path)))
  }

  async readFileInRange(
    path: string,
    offset = 0,
    maxLines?: number,
    maxBytes?: number,
    signal?: AbortSignal,
    options?: { truncateOnByteLimit?: boolean },
  ): Promise<FileReadResult> {
    let lastErr: unknown
    for (const s of this.stores) {
      try {
        return await s.readFileInRange(path, offset, maxLines, maxBytes, signal, options)
      } catch (e) {
        if (isNotFound(e)) {
          lastErr = e
          continue
        }
        throw e
      }
    }
    throw lastErr ?? new Error(`ENOENT: file not found in any backing store: ${path}`)
  }
}

function isNotFound(e: unknown): boolean {
  return e instanceof Error && /ENOENT/.test(e.message)
}
