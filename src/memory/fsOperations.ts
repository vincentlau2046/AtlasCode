/**
 * fsOperations — 域本地文件系统抽象（从旧仓 utils/fsOperations.ts 裁剪收进）
 *
 * charter DEP-3：utils 依赖收进域内。memory 域的 FileSystemMemoryStore 只需
 * readFile/readFileSync/readdir(recursive)/mkdir/statSync 这几个原语，
 * 故裁剪到最小集（旧仓 FsOperations 60+ 方法全量 YAGNI）。
 *
 * slowOperations 计时 / errors.getErrnoCode 依赖已断开（memory 域不需要）。
 * mkdir 的 EEXIST 容错保留（Bun/Windows 只读目录位误判，旧仓 issue 30924）。
 */
import * as fs from 'fs'
import {
  mkdir as mkdirPromise,
  readdir as readdirPromise,
  readFile as readFilePromise,
  stat as statPromise,
} from 'fs/promises'

/**
 * memory 域所需的最小 FS 操作集。
 */
export type FsOperations = {
  cwd(): string
  existsSync(path: string): boolean
  stat(path: string): Promise<fs.Stats>
  readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<fs.Dirent[]>
  mkdir(path: string): Promise<void>
  readFile(path: string, options: { encoding: BufferEncoding }): Promise<string>
  readFileSync(path: string, options: { encoding: BufferEncoding }): string
  statSync(path: string): fs.Stats
}

export const NodeFsOperations: FsOperations = {
  cwd() {
    return process.cwd()
  },

  existsSync(fsPath) {
    return fs.existsSync(fsPath)
  },

  async stat(fsPath) {
    return statPromise(fsPath)
  },

  async readdir(fsPath, options) {
    return readdirPromise(fsPath, { withFileTypes: true, ...options })
  },

  async mkdir(dirPath) {
    try {
      await mkdirPromise(dirPath, { recursive: true })
    } catch (e) {
      // Bun/Windows: recursive:true 在带 FILE_ATTRIBUTE_READONLY 位的目录上
      // 抛 EEXIST（Bun directoryExistsAt 误判 DIRECTORY+READONLY 非目录）。
      // 目录已存在，忽略。
      if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e
    }
  },

  async readFile(fsPath, options) {
    return readFilePromise(fsPath, { encoding: options.encoding })
  },

  readFileSync(fsPath, options) {
    return fs.readFileSync(fsPath, { encoding: options.encoding })
  },

  statSync(fsPath) {
    return fs.statSync(fsPath)
  },
}

let activeFs: FsOperations = NodeFsOperations

/** 覆盖 FS 实现（测试注入）。 */
export function setFsImplementation(implementation: FsOperations): void {
  activeFs = implementation
}

/** 当前活跃 FS 实现。 */
export function getFsImplementation(): FsOperations {
  return activeFs
}

/** 重置为 Node 默认实现。 */
export function setOriginalFsImplementation(): void {
  activeFs = NodeFsOperations
}
