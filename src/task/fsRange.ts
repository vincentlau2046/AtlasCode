/**
 * task 域 — 文件范围读（旧仓 utils/fsOperations.ts 的 readFileRange/tailFile
 * 随迁，C-Deep 切片 3 T2）
 *
 * task 域内消费：TaskOutput #tick 轮询 tail 读 / #readStdoutFromFile 前 N
 * 字节读 / diskOutput（T3）队列落盘读。
 *
 * 裁定注：memory 域自带 fsOperations.readFileInRange（FileTooLargeError
 * 语义，C1 DEP-3 留 memory）——本文件是字节范围纯读（无大小错误语义），
 * 两套勿混。若未来第二域消费，按 "fs 叶子" 裁定上提 shared（C1 R1：扩展
 * 只加 shared 不造第二套）。
 *
 * 移植注：旧仓用 `await using fh`（explicit resource management，需
 * ES2022+ lib 支持），新仓 tsconfig target ES2022 / lib ES2023 —— 改
 * try/finally 显式 close（语义等价，target 无关）。
 */
import { open } from 'fs/promises'

export type ReadFileRangeResult = {
  content: string
  bytesRead: number
  bytesTotal: number
}

/**
 * Read up to `maxBytes` from a file starting at `offset`.
 * Returns a flat string from Buffer — no sliced string references to a
 * larger parent. Returns null if the file is smaller than the offset.
 */
export async function readFileRange(
  path: string,
  offset: number,
  maxBytes: number,
): Promise<ReadFileRangeResult | null> {
  const fh = await open(path, 'r')
  try {
    const size = (await fh.stat()).size
    if (size <= offset) {
      return null
    }
    const bytesToRead = Math.min(size - offset, maxBytes)
    const buffer = Buffer.allocUnsafe(bytesToRead)

    let totalRead = 0
    while (totalRead < bytesToRead) {
      const { bytesRead } = await fh.read(
        buffer,
        totalRead,
        bytesToRead - totalRead,
        offset + totalRead,
      )
      if (bytesRead === 0) {
        break
      }
      totalRead += bytesRead
    }

    return {
      content: buffer.toString('utf8', 0, totalRead),
      bytesRead: totalRead,
      bytesTotal: size,
    }
  } finally {
    await fh.close()
  }
}

/**
 * Read the last `maxBytes` of a file.
 * Returns the whole file if it's smaller than maxBytes.
 */
export async function tailFile(
  path: string,
  maxBytes: number,
): Promise<ReadFileRangeResult> {
  const fh = await open(path, 'r')
  try {
    const size = (await fh.stat()).size
    if (size === 0) {
      return { content: '', bytesRead: 0, bytesTotal: 0 }
    }
    const offset = Math.max(0, size - maxBytes)
    const bytesToRead = size - offset
    const buffer = Buffer.allocUnsafe(bytesToRead)

    let totalRead = 0
    while (totalRead < bytesToRead) {
      const { bytesRead } = await fh.read(
        buffer,
        totalRead,
        bytesToRead - totalRead,
        offset + totalRead,
      )
      if (bytesRead === 0) {
        break
      }
      totalRead += bytesRead
    }

    return {
      content: buffer.toString('utf8', 0, totalRead),
      bytesRead: totalRead,
      bytesTotal: size,
    }
  } finally {
    await fh.close()
  }
}
