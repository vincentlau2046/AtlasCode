/**
 * FileSystemMemoryStore — 具体文件系统 MemoryStore 实现
 *
 * 从旧仓 core/memory/FileSystemMemoryStore.ts 迁入。
 * 包 getFsImplementation()（域本地 fsOperations.ts）+ readFileInRange()（域本地）。
 * 纯薄适配器——不新增 FS 原语。
 *
 * charter DEP-3：utils 依赖（fsOperations/readFileInRange）已收进域内。
 */
import type { MemoryStore, StoreDirent } from './types'

import { getFsImplementation } from './fsOperations'
import { readFileInRange } from './readFileInRange'

export class FileSystemMemoryStore implements MemoryStore {
  private readonly fs = getFsImplementation()

  async readFile(
    path: string,
    _encoding?: { encoding?: string },
  ): Promise<string> {
    return this.fs.readFile(path, { encoding: 'utf-8' })
  }

  readFileSync(path: string, _encoding?: { encoding?: string }): string {
    return this.fs.readFileSync(path, { encoding: 'utf-8' })
  }

  async readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<StoreDirent[]> {
    const entries = await this.fs.readdir(path, options)
    return entries as unknown as StoreDirent[]
  }

  async mkdir(path: string): Promise<void> {
    return this.fs.mkdir(path)
  }

  async readFileInRange(
    path: string,
    offset?: number,
    maxLines?: number,
    maxBytes?: number,
    signal?: AbortSignal,
    options?: { truncateOnByteLimit?: boolean },
  ): Promise<{ content: string; mtimeMs: number }> {
    const result = await readFileInRange(
      path,
      offset,
      maxLines,
      maxBytes,
      signal,
      options,
    )
    return { content: result.content, mtimeMs: result.mtimeMs }
  }
}
