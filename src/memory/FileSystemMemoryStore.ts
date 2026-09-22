/**
 * FileSystemMemoryStore — 具体文件系统 MemoryStore 实现
 *
 * 从旧仓 core/memory/FileSystemMemoryStore.ts 迁入。
 * 包 getFsImplementation()（shared，C1 下沉跨域 fs 抽象）+ readFileInRange()（域本地）。
 * 纯薄适配器——不新增 FS 原语。
 *
 * charter DEP-3：readFileInRange 收进域内；fsOperations C1 已下沉 shared（跨域）。
 */
import type { MemoryStore, StoreDirent } from './types'

import { getFsImplementation } from '../shared'
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
