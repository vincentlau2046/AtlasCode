/**
 * 文件系统抽象（C1 下沉，跨 ≥2 域：memory FileSystemMemoryStore +
 * C-Deep executor Shell.ts 移植（旧仓 utils/fsOperations.ts 消费方含 Shell.ts/debug.ts 等 10+ 文件））。
 *
 * 从 memory/fsOperations.ts 的 B 波裁剪版上移：最小集（旧仓 60+ 方法全量 YAGNI）。
 * C-Deep 时 executor 若需更多原语（writeFile/appendFile/rm…）→ 接口**加法式**扩展，
 * 不另开第二份抽象（防腐：fs 抽象单一事实源在 shared）。
 *
 * slowOperations 计时 / errors.getErrnoCode 依赖已断开。
 * mkdir 的 EEXIST 容错保留（Bun/Windows 只读目录位误判，旧仓 issue 30924）。
 */
import * as fs from 'fs'
import {
  mkdir as mkdirPromise,
  open as openPromise,
  readdir as readdirPromise,
  readFile as readFilePromise,
  stat as statPromise,
  type FileHandle,
} from 'fs/promises'

/**
 * 最小 FS 操作集（跨域共享，C-Deep 按需加法扩展）。
 *
 * C-Deep 切片 1 加法（executor Shell.ts 消费；防腐口径不变：fs 抽象单一
 * 事实源在 shared，executor 不直连 node:fs）：
 * - mkdir 加 mode 参数（沙箱临时目录 0o700；recursive + EEXIST 容错语义不变）
 * - realpathSync（setCwd 符号链接解析 + cwd 消失恢复，旧仓 fsOperations 同名原语）
 * - open（file 模式 spawn fd：O_WRONLY|O_CREAT|O_APPEND|O_NOFOLLOW）
 * - unlinkSync（cwd 跟踪临时文件清理，ENOENT 容错在调用方）
 *
 * E-3 S-3b 加法（engine/config settings 加载/写回消费；旧仓 settings.ts 经
 * getFsImplementation 走 sync 面，单测 mock 注入无真实磁盘）：
 * - readdirSync（withFileTypes，managed-settings.d drop-in 枚举）
 * - writeFileSync（settings 写回，UTF-8 字符串；旧仓 writeFileSyncAndFlush 的
 *   fsync 段为 durability 优化，新仓裁剪——settings 非 durability 敏感数据）
 * - mkdirSync（写回前建目录，recursive + EEXIST 容错，同 async mkdir 语义）
 */
export type FsOperations = {
  cwd(): string
  existsSync(path: string): boolean
  stat(path: string): Promise<fs.Stats>
  readdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<fs.Dirent[]>
  mkdir(path: string, options?: { mode?: number }): Promise<void>
  readFile(path: string, options: { encoding: BufferEncoding }): Promise<string>
  readFileSync(path: string, options: { encoding: BufferEncoding }): string
  statSync(path: string): fs.Stats
  realpathSync(path: string): string
  open(path: string, flags: number): Promise<FileHandle>
  unlinkSync(path: string): void
  // E-3 S-3b 加法（engine/config 消费，见头注）
  readdirSync(path: string): fs.Dirent[]
  writeFileSync(path: string, data: string): void
  mkdirSync(path: string): void
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

  async mkdir(dirPath, options) {
    try {
      await mkdirPromise(dirPath, { recursive: true, mode: options?.mode })
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

  realpathSync(fsPath) {
    return fs.realpathSync(fsPath)
  },

  async open(fsPath, flags) {
    return openPromise(fsPath, flags)
  },

  unlinkSync(fsPath) {
    fs.unlinkSync(fsPath)
  },

  readdirSync(fsPath) {
    return fs.readdirSync(fsPath, { withFileTypes: true })
  },

  writeFileSync(fsPath, data) {
    fs.writeFileSync(fsPath, data, 'utf-8')
  },

  mkdirSync(fsPath) {
    // recursive + EEXIST 容错，同 async mkdir 语义（旧仓 issue 30924 目录位误判）
    try {
      fs.mkdirSync(fsPath, { recursive: true })
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e
    }
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
