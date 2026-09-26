/**
 * engine/tools/files — 文件内容内存缓存（C 桶 ① 子波 3 §8.55 S-C1 依赖
 * 闭包层，旧仓 src/utils/fileReadCache.ts 96L 逐字随迁；delta 仅 import
 * 重指）。
 *
 * delta 登记：
 *  - detectFileEncoding → ./fileUtils（旧仓 ./file.js；新仓域内拆 fileUtils
 *    承载旧 file.ts 面）；getFsImplementation → shared。
 *  - 与 fileUtils 的 ESM 循环导入（fileUtils import fileReadCache 供
 *    readFileSyncCached；本文件 import detectFileEncoding）= 旧仓 file.ts ↔
 *    fileReadCache.ts 同款循环——模块级单例构造不调 detectFileEncoding，
 *    函数级惰性消费，运行时安全（旧仓逐字行为）。
 *  - 模块级单例 `fileReadCache` = PRT-2 例外先例（旧仓逐字；单例状态位，
 *    非 import-time side effect 调用）。
 */
import { getFsImplementation } from '../../../shared'
import { detectFileEncoding } from './fileUtils'

type CachedFileData = {
  content: string
  encoding: BufferEncoding
  mtime: number
}

/**
 * A simple in-memory cache for file contents with automatic invalidation based on modification time.
 * This eliminates redundant file reads in FileEditTool operations.
 */
class FileReadCache {
  private cache = new Map<string, CachedFileData>()
  private readonly maxCacheSize = 1000

  /**
   * Reads a file with caching. Returns both content and encoding.
   * Cache key includes file path and modification time for automatic invalidation.
   */
  readFile(filePath: string): { content: string; encoding: BufferEncoding } {
    const fs = getFsImplementation()

    // Get file stats for cache invalidation
    let stats
    try {
      stats = fs.statSync(filePath)
    } catch (error) {
      // File was deleted, remove from cache and re-throw
      this.cache.delete(filePath)
      throw error
    }

    const cacheKey = filePath
    const cachedData = this.cache.get(cacheKey)

    // Check if we have valid cached data
    if (cachedData && cachedData.mtime === stats.mtimeMs) {
      return {
        content: cachedData.content,
        encoding: cachedData.encoding,
      }
    }

    // Cache miss or stale data - read the file
    const encoding = detectFileEncoding(filePath)
    const content = fs
      .readFileSync(filePath, { encoding })
      .replaceAll('\r\n', '\n')

    // Update cache
    this.cache.set(cacheKey, {
      content,
      encoding,
      mtime: stats.mtimeMs,
    })

    // Evict oldest entries if cache is too large
    if (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    return { content, encoding }
  }

  /**
   * Clears the entire cache. Useful for testing or memory management.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Removes a specific file from the cache.
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath)
  }

  /**
   * Gets cache statistics for debugging/monitoring.
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    }
  }
}

// Export a singleton instance
export const fileReadCache = new FileReadCache()
