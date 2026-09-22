/**
 * InMemoryStore — MemoryStore 内存实现（单测文件系统隔离 + P-6 可换性证明）
 *
 * 从旧仓 core/memory/InMemoryStore.ts 迁入。
 * 无状态设计：构造不带 dirPath，方法接收调用方传入的绝对路径。
 * 写路径 YAGNI：接口只抽象读 + 目录列举 + mkdir。
 */
import type { FileReadResult, MemoryStore, StoreDirent } from './types'

/** 路径归一化：反斜杠转正斜杠、去尾部斜杠，统一键空间。 */
function normPath(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return s === '' ? '/' : s
}

export class InMemoryStore implements MemoryStore {
  private files = new Map<string, { content: string; mtimeMs: number }>()

  /** 测试侧播种：写入一条内存文件记录（path 归一化后作键）。 */
  setFile(path: string, content: string, mtimeMs = 0): void {
    this.files.set(normPath(path), { content, mtimeMs })
  }

  /** 当前内存中的文件数（测试断言辅助）。 */
  get size(): number {
    return this.files.size
  }

  async readFile(path: string, _encoding?: { encoding?: string }): Promise<string> {
    const f = this.files.get(normPath(path))
    if (!f) throw new Error(`ENOENT: no such file: ${path}`)
    return f.content
  }

  readFileSync(path: string, _encoding?: { encoding?: string }): string {
    const f = this.files.get(normPath(path))
    if (!f) throw new Error(`ENOENT: no such file: ${path}`)
    return f.content
  }

  async readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<StoreDirent[]> {
    const base = normPath(path)
    const prefix = base === '/' ? '/' : base + '/'
    const entries: StoreDirent[] = []
    const seenDirs = new Set<string>()
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue
      const rel = filePath.slice(prefix.length)
      const first = rel.split('/')[0]
      if (options?.recursive) {
        entries.push({ name: rel, isFile: () => true, isDirectory: () => false })
        if (rel.includes('/') && !seenDirs.has(first)) {
          seenDirs.add(first)
          entries.push({ name: first, isFile: () => false, isDirectory: () => true })
        }
      } else {
        if (rel.includes('/')) {
          if (!seenDirs.has(first)) {
            seenDirs.add(first)
            entries.push({ name: first, isFile: () => false, isDirectory: () => true })
          }
        } else {
          entries.push({ name: first, isFile: () => true, isDirectory: () => false })
        }
      }
    }
    return entries
  }

  async mkdir(_path: string): Promise<void> {
    // 内存版：无真实目录，mkdir 为 no-op
  }

  async readFileInRange(
    path: string,
    offset = 0,
    maxLines?: number,
    maxBytes?: number,
    _signal?: AbortSignal,
    options?: { truncateOnByteLimit?: boolean },
  ): Promise<FileReadResult> {
    const f = this.files.get(normPath(path))
    if (!f) throw new Error(`ENOENT: no such file: ${path}`)

    const truncateOnByteLimit = options?.truncateOnByteLimit ?? false
    const raw = f.content
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    if (!truncateOnByteLimit && maxBytes !== undefined) {
      const totalBytes = Buffer.byteLength(text, 'utf8')
      if (totalBytes > maxBytes) {
        throw new Error(
          `FileTooLarge: content ${totalBytes}B > max ${maxBytes}B`,
        )
      }
    }
    const endLine = maxLines !== undefined ? offset + maxLines : Infinity
    const lines = text.split('\n')
    const selectedLines: string[] = []
    let selectedBytes = 0
    let truncated = false
    for (let i = offset; i < lines.length && i < endLine && !truncated; i++) {
      const line = lines[i].replace(/\r$/, '')
      if (truncateOnByteLimit && maxBytes !== undefined) {
        const sep = selectedLines.length > 0 ? 1 : 0
        const nextBytes = selectedBytes + sep + Buffer.byteLength(line, 'utf8')
        if (nextBytes > maxBytes) {
          truncated = true
          break
        }
        selectedBytes = nextBytes
      }
      selectedLines.push(line)
    }
    return { content: selectedLines.join('\n'), mtimeMs: f.mtimeMs }
  }
}
