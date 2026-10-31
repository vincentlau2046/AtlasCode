/**
 * shared/boundedImageRead — 有界文件源读（0.1.84 V3-5 K5-1）。
 *
 * 图片支读源守卫（engine readTool readImageWithTokenBudget + TUI
 * FileReadTool 同名 twin + TUI attachments @image 消费面共用）：
 *  - 上限 MAX_IMAGE_SOURCE_BYTES = 128×1024×1024 = 134217728B：fstat
 *    size > 上限在读取前拒（sparse/巨图零分配拒）；等于上限不因 size 拒。
 *  - FIFO/字符/块设备/socket：O_NONBLOCK 打开（无 writer 的 FIFO 打开即
 *    返，不等 producer；/dev/zero 类无穷源打开即返）→ fstat 类型判别
 *    拒绝，绝不进读循环/解码器。BLOCKED_DEVICE_PATHS 路径名单只覆盖固定
 *    路径，任意名字 FIFO/别名设备由此面兜住。
 *  - 读累计上限：分块读、单次读长按剩余预算收口，累计 > maxBytes 拒
 *    （stat 后增长不绕过；替换无效——读的是打开时钉住的 inode）。
 *  - symlink：打开解析目标后 fstat 判类型——→regular 放行、→pipe/device 拒。
 *
 * 纯叶子：仅 node fs 依赖（不依赖 settings/工具/UI/FS seam——seam 加法
 * 成员有「存量 stub 不补」先例，此处直接真 fs，func 层真盘验证）。
 */
import { constants as fsConstants } from 'fs'
import { open } from 'fs/promises'

/** 图片源读上限：128 MiB（上游 302：>128MB 应拒）。 */
export const MAX_IMAGE_SOURCE_BYTES = 128 * 1024 * 1024 // 134217728

/** 读循环分块：驻内存上界 = maxBytes + 1 chunk 内收口（读长按预算封顶）。 */
const READ_CHUNK_BYTES = 1024 * 1024

/** 非 regular 文件（FIFO/设备/socket）：类型拒绝，读循环/解码器不可达。 */
export class NonRegularFileError extends Error {
  constructor(filePath: string, fileKindDescription: string) {
    super(
      `Cannot read '${filePath}': not a regular file (${fileKindDescription}). ` +
        `Pipes, devices, and sockets are rejected to avoid blocking or unbounded reads.`,
    )
    this.name = 'NonRegularFileError'
  }
}

/** 源超限：fstat 阶段（读取前）或读循环累计超限（增长守卫）拒绝。 */
export class ImageSourceTooLargeError extends Error {
  constructor(filePath: string, sizeBytes: number, maxBytes: number) {
    super(
      `Image file is too large: ${sizeBytes} bytes exceeds the maximum of ${maxBytes} bytes ('${filePath}').`,
    )
    this.name = 'ImageSourceTooLargeError'
  }
}

/** 读循环 duck 句柄（fs.promises.FileHandle 满足；测试可注 fake）。 */
export interface BoundedReadHandle {
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null,
  ): Promise<{ bytesRead: number }>
  close(): Promise<void>
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Bounded image read aborted')
  }
}

function describeSpecialFile(stats: {
  isFIFO(): boolean
  isCharacterDevice(): boolean
  isBlockDevice(): boolean
  isSocket(): boolean
}): string {
  if (stats.isFIFO()) return 'FIFO/pipe'
  if (stats.isCharacterDevice()) return 'character device'
  if (stats.isBlockDevice()) return 'block device'
  if (stats.isSocket()) return 'socket'
  return 'special file'
}

/**
 * 有界读循环（核心）：分块读至 EOF；单次读长 = min(chunk, 剩余预算+1)
 * （增长面不整块过读）；累计 > maxBytes 拒；chunk 间查 abort。
 * 句柄 duck 注入面（单测 fake 无盘判别：EOF 恰内容/无穷流累计帽/abort）。
 */
export async function readBoundedFromHandle(
  handle: BoundedReadHandle,
  maxBytes: number,
  signal?: AbortSignal,
  sourcePath: string = '<stream>',
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  const chunk = Buffer.alloc(READ_CHUNK_BYTES)
  while (true) {
    throwIfAborted(signal)
    const readLength = Math.min(chunk.length, maxBytes - total + 1)
    const { bytesRead } = await handle.read(chunk, 0, readLength, null)
    if (bytesRead === 0) break
    chunks.push(Buffer.from(chunk.subarray(0, bytesRead)))
    total += bytesRead
    if (total > maxBytes) {
      throw new ImageSourceTooLargeError(sourcePath, total, maxBytes)
    }
  }
  return Buffer.concat(chunks, total)
}

/**
 * 有界文件读：O_NONBLOCK 打开（FIFO/设备不阻塞等 producer）→ fstat
 * 类型 + 大小双验（读取前）→ 有界读循环 → 恒 close（close 失败不吞读
 * 结果；handle 非空态直接 .catch，无可选链短路面）。
 */
export async function readBoundedFileBytes(
  filePath: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const handle = await open(
    filePath,
    fsConstants.O_RDONLY | fsConstants.O_NONBLOCK,
  )
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) {
      throw new NonRegularFileError(filePath, describeSpecialFile(stats))
    }
    if (stats.size > maxBytes) {
      throw new ImageSourceTooLargeError(filePath, stats.size, maxBytes)
    }
    return await readBoundedFromHandle(handle, maxBytes, signal, filePath)
  } finally {
    await handle.close().catch(() => {})
  }
}

/** 图片源读固定上限面（K5-1 产品入口）。 */
export async function readBoundedImageBytes(
  filePath: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  return readBoundedFileBytes(filePath, MAX_IMAGE_SOURCE_BYTES, signal)
}
