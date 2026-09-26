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
 *
 * E-4 S-4c1 加法（engine/permissions 规则磁盘加载/写回消费）：
 * - lstatSync（safeResolvePath 特殊文件守卫）
 * - safeResolvePath 助手（接口外纯函数，旧仓 utils/fsOperations.ts:138 逐字）
 *
 * §8.55 S-C1 加法（engine/tools/files 依赖闭包层消费，旧仓
 * utils/fsOperations.ts NodeFsOperations 同名原语逐字，slowLogging 裁）：
 * - readFileBytes（fs.readFile 无 encoding → Buffer；FileRead 图像支
 *   消费；readFile 强制 encoding 成员不复用）
 * - readSync（openSync + readSync(fd) + closeSync 逐字，非 Node 22
 *   fs.readSync(path, opts) 新 API；detectLineEndings 4KB 采样）
 * - isDirEmptySync（readdirSync withFileTypes length===0 逐字）
 * - readlinkSync / renameSync（writeFileSyncAndFlush_DEPRECATED 原子写
 *   面符号链接保留 + 原子 rename）
 *
 * 存量 setFsImplementation 测试 stub（9 文件字面实现）不补新成员：
 * tests/ 不在 tsconfig include（tsc 0 基线实证）+ 各 stub 消费面
 * 零调用新成员（运行时安全）——E-4 lstatSync 加法同款裁定先例。
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
  // E-4 S-4c1 加法（safeResolvePath 特殊文件守卫消费，见下）
  lstatSync(path: string): fs.Stats
  // §8.55 S-C1 加法（engine/tools/files 依赖闭包层消费，见头注）
  readFileBytes(path: string): Promise<Buffer>
  readSync(
    path: string,
    options: { length: number },
  ): { buffer: Buffer; bytesRead: number }
  isDirEmptySync(path: string): boolean
  readlinkSync(path: string): string
  renameSync(oldPath: string, newPath: string): void
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

  lstatSync(fsPath) {
    return fs.lstatSync(fsPath)
  },

  // §8.55 S-C1 加法（readFile 无 encoding → Buffer；旧仓
  // getFsImplementation().readFileBytes 消费面，FileRead 图像支 L983）
  async readFileBytes(fsPath) {
    return readFilePromise(fsPath)
  },

  // §8.55 S-C1 加法（旧仓 NodeFsOperations.readSync 逐字：openSync +
  // readSync(fd, buffer, 0, length, 0) + closeSync；非 Node 22 的
  // fs.readSync(path, opts) 新 API——旧仓此实现兼容低版本 node）
  readSync(fsPath, options) {
    let fd: number | undefined = undefined
    try {
      fd = fs.openSync(fsPath, 'r')
      const buffer = Buffer.alloc(options.length)
      const bytesRead = fs.readSync(fd, buffer, 0, options.length, 0)
      return { buffer, bytesRead }
    } finally {
      if (fd) fs.closeSync(fd)
    }
  },

  // §8.55 S-C1 加法（旧仓 NodeFsOperations.isDirEmptySync 逐字：
  // readdirSync（本实现 withFileTypes）length === 0）
  isDirEmptySync(dirPath) {
    return this.readdirSync(dirPath).length === 0
  },

  // §8.55 S-C1 加法（旧仓 NodeFsOperations 同名原语直转）
  readlinkSync(path) {
    return fs.readlinkSync(path)
  },

  renameSync(oldPath: string, newPath: string) {
    fs.renameSync(oldPath, newPath)
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

/**
 * 安全解析路径（E-4 S-4c1 加法，旧仓 utils/fsOperations.ts:138 逐字）：
 * realpath 解析 + 符号链接判定，失败回落原路径（不抛）。
 *
 * 语义（旧仓逐字）：
 * - UNC 路径（// 或 \\ 开头）在任何 fs 访问前阻塞（Windows DNS/SMB 防网络请求）
 * - 特殊文件（FIFO/socket/字符/块设备）不 realpath（realpathSync 会阻塞等写入者）
 * - 文件不存在 / 符号链接断裂 / EACCES / ELOOP → 回落原路径（允许文件创建场景）
 * - isCanonical = realpath 成功（全路径分量符号链接已解，调用方可跳过再解析）
 *
 * 消费点：engine/permissions permissionRulesLoader lenient reader +
 * permissionSetup isSymlinkTo（H6 实挂）。
 */
export function safeResolvePath(
  fs: FsOperations,
  filePath: string,
): { resolvedPath: string; isSymlink: boolean; isCanonical: boolean } {
  if (filePath.startsWith('//') || filePath.startsWith('\\\\')) {
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
  }

  try {
    const stats = fs.lstatSync(filePath)
    if (
      stats.isFIFO() ||
      stats.isSocket() ||
      stats.isCharacterDevice() ||
      stats.isBlockDevice()
    ) {
      return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
    }

    const resolvedPath = fs.realpathSync(filePath)
    return {
      resolvedPath,
      isSymlink: resolvedPath !== filePath,
      isCanonical: true,
    }
  } catch (_error) {
    // lstat/realpath 任意失败（ENOENT / 断链 / EACCES / ELOOP）→ 原路径继续
    return { resolvedPath: filePath, isSymlink: false, isCanonical: false }
  }
}
