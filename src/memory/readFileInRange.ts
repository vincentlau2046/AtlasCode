// ---------------------------------------------------------------------------
// readFileInRange — 行导向文件读取器（从旧仓 utils/readFileInRange.ts 迁入）
// ---------------------------------------------------------------------------
//
// 返回文件 [offset, offset + maxLines) 行。
//
// 快路径（常规文件 < 10 MB）：readFile 整读 + 内存分行。
// 流式路径（大文件/管道/设备）：createReadStream + 手动 \n 扫描，仅积累范围内行。
//
// 两条路径都剥 UTF-8 BOM 和 \r（CRLF → LF）。
// mtime 来自已打开 fd 的 fstat/stat——无额外 open()。
//
// K5-3（0.1.84）：UTF-16LE（FF FE BOM）识别与正确解码（上游 303：两路径
// 原先一律按 UTF-8 解码，LE 文件整篇 mojibake、字节口径源/输出混淆）。
//  - 快路径：全字节 decodeTextLosslessly 严格解码（LE 是新能力，无既有
//    容错可保——坏码元明确 throw）；UTF-8 面既有宽容语义保持（非法 →
//    U+FFFD，不顺带收紧普通 UTF-8 Read）。
//  - 流路径：Node 流解码器宽容解码 LE（跨 chunk 码元/代理项原生正确；
//    不验合法性——快路径 <10MB 覆盖绝大多数 LE 文件，不对称如实登记）。
//  - 字节口径：totalBytes = 源字节（含 BOM；LE 按码元 ×2 累计）、
//    readBytes = 输出 UTF-8 字节；byte 上限一律按源字节。
//  - fastPathMaxBytes/streamChunkBytes = 测试 seam（生产缺省 10MB/512KB）。
//
// maxBytes 行为取决于 options.truncateOnByteLimit：
//   false（默认）：FILE 大小/流总字节超 maxBytes 抛 FileTooLargeError。
//   true：SELECTED OUTPUT 截到 maxBytes，在最后一个完整行停；设 truncatedByBytes。永不抛。
//
// C1b：formatFileSize 切 shared 单一事实源（旧仓 "N bytes / 1.5KB" 口径；
// B 波本地 "512B" 变体是本地化偏差，去重时回归旧仓基准）。
// ---------------------------------------------------------------------------

import { createReadStream, fstat } from 'fs'
import { open as fsOpen, stat as fsStat, readFile } from 'fs/promises'
import {
  decodeTextLosslessly,
  formatFileSize,
  hasUtf16LeBom,
} from '../shared'

const FAST_PATH_MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export type ReadFileRangeResult = {
  content: string
  lineCount: number
  totalLines: number
  totalBytes: number
  readBytes: number
  mtimeMs: number
  /** true when output was clipped to maxBytes under truncate mode */
  truncatedByBytes?: boolean
}

export class FileTooLargeError extends Error {
  constructor(
    public sizeInBytes: number,
    public maxSizeBytes: number,
  ) {
    super(
      `File content (${formatFileSize(sizeInBytes)}) exceeds maximum allowed size (${formatFileSize(maxSizeBytes)}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`,
    )
    this.name = 'FileTooLargeError'
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function readFileInRange(
  filePath: string,
  offset = 0,
  maxLines?: number,
  maxBytes?: number,
  signal?: AbortSignal,
  options?: {
    truncateOnByteLimit?: boolean
    /** 测试 seam：压快路径门（生产缺省 10MB）。 */
    fastPathMaxBytes?: number
    /** 测试 seam：压流 chunk 尺寸（生产缺省 512KB）。 */
    streamChunkBytes?: number
  },
): Promise<ReadFileRangeResult> {
  signal?.throwIfAborted()
  const truncateOnByteLimit = options?.truncateOnByteLimit ?? false

  const stats = await fsStat(filePath)

  if (stats.isDirectory()) {
    throw new Error(
      `EISDIR: illegal operation on a directory, read '${filePath}'`,
    )
  }

  if (
    stats.isFile() &&
    stats.size < (options?.fastPathMaxBytes ?? FAST_PATH_MAX_SIZE)
  ) {
    if (
      !truncateOnByteLimit &&
      maxBytes !== undefined &&
      stats.size > maxBytes
    ) {
      throw new FileTooLargeError(stats.size, maxBytes)
    }

    // K5-3：全字节读入后按 BOM 分流解码（见文件头注口径）。
    const bytes = await readFile(filePath, { signal })
    let text: string
    if (hasUtf16LeBom(bytes)) {
      text = decodeTextLosslessly(bytes).content
    } else {
      text = bytes.toString('utf8')
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1)
      }
    }
    return readFileInRangeFast(
      text,
      bytes.length,
      stats.mtimeMs,
      offset,
      maxLines,
      truncateOnByteLimit ? maxBytes : undefined,
    )
  }

  return readFileInRangeStreaming(
    filePath,
    stats.isFile(),
    offset,
    maxLines,
    maxBytes,
    truncateOnByteLimit,
    signal,
    options,
  )
}

// ---------------------------------------------------------------------------
// Fast path — readFile + in-memory split
// ---------------------------------------------------------------------------

function readFileInRangeFast(
  text: string,
  totalBytes: number,
  mtimeMs: number,
  offset: number,
  maxLines: number | undefined,
  truncateAtBytes: number | undefined,
): ReadFileRangeResult {
  const endLine = maxLines !== undefined ? offset + maxLines : Infinity

  // （K5-3：BOM 剥离移至调用方——LE 由 decodeTextLosslessly 剥、UTF-8 由
  // 调用方 toString 后剥；text 已是无 BOM 正文，totalBytes 已是源字节。）

  // Split lines, strip \r, select range.
  const selectedLines: string[] = []
  let lineIndex = 0
  let startPos = 0
  let newlinePos: number
  let selectedBytes = 0
  let truncatedByBytes = false

  function tryPush(line: string): boolean {
    if (truncateAtBytes !== undefined) {
      const sep = selectedLines.length > 0 ? 1 : 0
      const nextBytes = selectedBytes + sep + Buffer.byteLength(line)
      if (nextBytes > truncateAtBytes) {
        truncatedByBytes = true
        return false
      }
      selectedBytes = nextBytes
    }
    selectedLines.push(line)
    return true
  }

  while ((newlinePos = text.indexOf('\n', startPos)) !== -1) {
    if (lineIndex >= offset && lineIndex < endLine && !truncatedByBytes) {
      let line = text.slice(startPos, newlinePos)
      if (line.endsWith('\r')) {
        line = line.slice(0, -1)
      }
      tryPush(line)
    }
    lineIndex++
    startPos = newlinePos + 1
  }

  // Final fragment (no trailing newline).
  if (lineIndex >= offset && lineIndex < endLine && !truncatedByBytes) {
    let line = text.slice(startPos)
    if (line.endsWith('\r')) {
      line = line.slice(0, -1)
    }
    tryPush(line)
  }
  lineIndex++

  const content = selectedLines.join('\n')
  return {
    content,
    lineCount: selectedLines.length,
    totalLines: lineIndex,
    totalBytes,
    readBytes: Buffer.byteLength(content, 'utf8'),
    mtimeMs,
    ...(truncatedByBytes ? { truncatedByBytes: true } : {}),
  }
}

// ---------------------------------------------------------------------------
// Streaming path — createReadStream + event handlers
// ---------------------------------------------------------------------------

type StreamState = {
  stream: ReturnType<typeof createReadStream>
  encoding: 'utf8' | 'utf16le'
  offset: number
  endLine: number
  maxBytes: number | undefined
  truncateOnByteLimit: boolean
  resolve: (value: ReadFileRangeResult) => void
  totalBytesRead: number
  selectedBytes: number
  truncatedByBytes: boolean
  currentLineIndex: number
  selectedLines: string[]
  partial: string
  isFirstChunk: boolean
  resolveMtime: (ms: number) => void
  mtimeReady: Promise<number>
}

function streamOnOpen(this: StreamState, fd: number): void {
  fstat(fd, (err, stats) => {
    this.resolveMtime(err ? 0 : stats.mtimeMs)
  })
}

function streamOnData(this: StreamState, chunk: string): void {
  if (this.isFirstChunk) {
    this.isFirstChunk = false
    // LE 的 BOM 已由 createReadStream start:2 跳过（双 BOM 的第二层是内容
    // U+FEFF，保留）；UTF-8 BOM 解码为 ﻿ 首字符，既有剥离语义保持。
    if (this.encoding === 'utf8' && chunk.charCodeAt(0) === 0xfeff) {
      chunk = chunk.slice(1)
    }
  }

  // 源字节记账：LE chunk 是解码后字符串，按码元 ×2（BOM 2B 在流初始值）；
  // UTF-8 按解码后字符串的 UTF-8 字节数（既有口径）。byte 上限一律按源字节。
  this.totalBytesRead +=
    this.encoding === 'utf16le' ? chunk.length * 2 : Buffer.byteLength(chunk)
  if (
    !this.truncateOnByteLimit &&
    this.maxBytes !== undefined &&
    this.totalBytesRead > this.maxBytes
  ) {
    this.stream.destroy(
      new FileTooLargeError(this.totalBytesRead, this.maxBytes),
    )
    return
  }

  const data = this.partial.length > 0 ? this.partial + chunk : chunk
  this.partial = ''

  let startPos = 0
  let newlinePos: number
  while ((newlinePos = data.indexOf('\n', startPos)) !== -1) {
    if (
      this.currentLineIndex >= this.offset &&
      this.currentLineIndex < this.endLine
    ) {
      let line = data.slice(startPos, newlinePos)
      if (line.endsWith('\r')) {
        line = line.slice(0, -1)
      }
      if (this.truncateOnByteLimit && this.maxBytes !== undefined) {
        const sep = this.selectedLines.length > 0 ? 1 : 0
        const nextBytes = this.selectedBytes + sep + Buffer.byteLength(line)
        if (nextBytes > this.maxBytes) {
          this.truncatedByBytes = true
          this.endLine = this.currentLineIndex
        } else {
          this.selectedBytes = nextBytes
          this.selectedLines.push(line)
        }
      } else {
        this.selectedLines.push(line)
      }
    }
    this.currentLineIndex++
    startPos = newlinePos + 1
  }

  if (startPos < data.length) {
    if (
      this.currentLineIndex >= this.offset &&
      this.currentLineIndex < this.endLine
    ) {
      const fragment = data.slice(startPos)
      if (this.truncateOnByteLimit && this.maxBytes !== undefined) {
        const sep = this.selectedLines.length > 0 ? 1 : 0
        const fragBytes = this.selectedBytes + sep + Buffer.byteLength(fragment)
        if (fragBytes > this.maxBytes) {
          this.truncatedByBytes = true
          this.endLine = this.currentLineIndex
          return
        }
      }
      this.partial = fragment
    }
  }
}

function streamOnEnd(this: StreamState): void {
  let line = this.partial
  if (line.endsWith('\r')) {
    line = line.slice(0, -1)
  }
  if (
    this.currentLineIndex >= this.offset &&
    this.currentLineIndex < this.endLine
  ) {
    if (this.truncateOnByteLimit && this.maxBytes !== undefined) {
      const sep = this.selectedLines.length > 0 ? 1 : 0
      const nextBytes = this.selectedBytes + sep + Buffer.byteLength(line)
      if (nextBytes > this.maxBytes) {
        this.truncatedByBytes = true
      } else {
        this.selectedLines.push(line)
      }
    } else {
      this.selectedLines.push(line)
    }
  }
  this.currentLineIndex++

  const content = this.selectedLines.join('\n')
  const truncated = this.truncatedByBytes
  this.mtimeReady.then(mtimeMs => {
    this.resolve({
      content,
      lineCount: this.selectedLines.length,
      totalLines: this.currentLineIndex,
      totalBytes: this.totalBytesRead,
      readBytes: Buffer.byteLength(content, 'utf8'),
      mtimeMs,
      ...(truncated ? { truncatedByBytes: true } : {}),
    })
  })
}

/**
 * 预读文件头 2 字节判 LE BOM。仅 regular file 消费（FIFO/设备的预读会吞掉
 * 生产者数据——非 regular file 保持 utf8 流既有行为）。
 */
async function sniffUtf16LeBom(filePath: string): Promise<boolean> {
  const handle = await fsOpen(filePath, 'r')
  try {
    const buffer = Buffer.alloc(2)
    const { bytesRead } = await handle.read(buffer, 0, 2, 0)
    return bytesRead >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe
  } finally {
    await handle.close()
  }
}

async function readFileInRangeStreaming(
  filePath: string,
  isRegularFile: boolean,
  offset: number,
  maxLines: number | undefined,
  maxBytes: number | undefined,
  truncateOnByteLimit: boolean,
  signal: AbortSignal | undefined,
  options: { streamChunkBytes?: number } | undefined,
): Promise<ReadFileRangeResult> {
  signal?.throwIfAborted()
  const isLe = isRegularFile ? await sniffUtf16LeBom(filePath) : false
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const state: StreamState = {
      stream: createReadStream(filePath, {
        // LE 宽容解码：Node 流解码器原生处理跨 chunk 码元/代理项（奇数尾
        // 字节静默丢——快路径严格面覆盖 <10MB 绝大多数 LE 文件，不对称如
        // 实登记，见文件头注）；start:2 跳过 BOM 字节。
        encoding: isLe ? 'utf16le' : 'utf8',
        ...(isLe ? { start: 2 } : {}),
        highWaterMark: options?.streamChunkBytes ?? 512 * 1024,
        ...(signal ? { signal } : undefined),
      }),
      encoding: isLe ? 'utf16le' : 'utf8',
      offset,
      endLine: maxLines !== undefined ? offset + maxLines : Infinity,
      maxBytes,
      truncateOnByteLimit,
      resolve,
      // LE 初始值 = 已跳过的 2B BOM（onData 按码元 ×2 累计正文源字节）
      totalBytesRead: isLe ? 2 : 0,
      selectedBytes: 0,
      truncatedByBytes: false,
      currentLineIndex: 0,
      selectedLines: [],
      partial: '',
      isFirstChunk: true,
      resolveMtime: () => {},
      mtimeReady: null as unknown as Promise<number>,
    }
    state.mtimeReady = new Promise<number>(r => {
      state.resolveMtime = r
    })

    state.stream.once('open', streamOnOpen.bind(state))
    state.stream.on('data', streamOnData.bind(state))
    state.stream.once('end', streamOnEnd.bind(state))
    state.stream.once('error', reject)
  })
}
