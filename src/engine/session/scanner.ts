/**
 * session 域 — pre-compact 大文件分块读取扫描器（E-7 S-7d d1，§8.49 详案）
 *
 * 旧仓来源：src/utils/sessionStoragePortable.ts L472-794 逐字随迁（含 L472
 * TRANSCRIPT_READ_CHUNK_SIZE const 头注 + compact-boundary 分块读：fd 级
 * attr-snap strip + in-stream compact boundary 截断）。
 * 151MB session 32MB alloc 优化（mimalloc RSS 不归还页，旧仓 loadTranscriptFile
 * 头注逐字保留）：peak allocation = OUTPUT size 非 file size。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 本块在旧仓「shared by loadTranscriptFile & SDK getSessionMessages」——
 *     SDK getSessionMessages 远程面 = 远程/teleport 波，本域只服务 load 路。
 *   - attr-snap / compact boundary 标记串 '"compact_boundary"' 逐字（与
 *     record 面 compact boundary 写入面同源；【#15 核销 S-E3 A11，§8.52】
 *     写面 = loop compact 写面（queryAgentLoop compact 支 record post-compact
 *     序列，boundaryMarker 携 subtype 判别式 → JSONL 标记字节面闭环））。
 * 消费面：load.ts loadTranscriptFile（>SKIP_PRECOMPACT_THRESHOLD 走本扫描器
 * + scanPreBoundaryMetadata 前界元数据恢复）。
 */
import { open as fsOpen } from 'fs/promises'
/** Chunk size for the forward transcript reader. 1 MB balances I/O calls vs buffer growth. */
const TRANSCRIPT_READ_CHUNK_SIZE = 1024 * 1024

/**
 * File size below which precompact filtering is skipped.
 * Large sessions (>5 MB) almost always have compact boundaries — they got big
 * because of many turns triggering auto-compact.
 */
export const SKIP_PRECOMPACT_THRESHOLD = 5 * 1024 * 1024

/** Marker bytes searched for when locating the boundary. Lazy: allocated on
 * first use, not at module load. Most sessions never resume. */
let _compactBoundaryMarker: Buffer | undefined
function compactBoundaryMarker(): Buffer {
  return (_compactBoundaryMarker ??= Buffer.from('"compact_boundary"'))
}

/**
 * Confirm a byte-matched line is a real compact_boundary (marker can appear
 * inside user content) and check for preservedSegment.
 */
function parseBoundaryLine(
  line: string,
): { hasPreservedSegment: boolean } | null {
  try {
    const parsed = JSON.parse(line) as {
      type?: string
      subtype?: string
      compactMetadata?: { preservedSegment?: unknown }
    }
    if (parsed.type !== 'system' || parsed.subtype !== 'compact_boundary') {
      return null
    }
    return {
      hasPreservedSegment: Boolean(parsed.compactMetadata?.preservedSegment),
    }
  } catch {
    return null
  }
}

/**
 * Single forward chunked read for the --resume load path. Attr-snap lines
 * are skipped at the fd level; compact boundaries truncate in-stream. Peak
 * is the output size, not the file size.
 *
 * The surviving (last) attr-snap is appended at EOF instead of in-place;
 * restoreAttributionStateFromSnapshots only reads [length-1] so position
 * doesn't matter.
 */

type Sink = { buf: Buffer; len: number; cap: number }

function sinkWrite(s: Sink, src: Buffer, start: number, end: number): void {
  const n = end - start
  if (n <= 0) return
  if (s.len + n > s.buf.length) {
    const grown = Buffer.allocUnsafe(
      Math.min(Math.max(s.buf.length * 2, s.len + n), s.cap),
    )
    s.buf.copy(grown, 0, 0, s.len)
    s.buf = grown
  }
  src.copy(s.buf, s.len, start, end)
  s.len += n
}

function hasPrefix(
  src: Buffer,
  prefix: Buffer,
  at: number,
  end: number,
): boolean {
  return (
    end - at >= prefix.length &&
    src.compare(prefix, 0, prefix.length, at, at + prefix.length) === 0
  )
}

const ATTR_SNAP_PREFIX = Buffer.from('{"type":"attribution-snapshot"')
const SYSTEM_PREFIX = Buffer.from('{"type":"system"')
const LF = 0x0a
const LF_BYTE = Buffer.from([LF])
const BOUNDARY_SEARCH_BOUND = 256 // marker sits ~28 bytes in; 256 is slack

type LoadState = {
  out: Sink
  boundaryStartOffset: number
  hasPreservedSegment: boolean
  lastSnapSrc: Buffer | null // most-recent attr-snap, appended at EOF
  lastSnapLen: number
  lastSnapBuf: Buffer | undefined
  bufFileOff: number // file offset of buf[0]
  carryLen: number
  carryBuf: Buffer | undefined
  straddleSnapCarryLen: number // per-chunk; reset by processStraddle
  straddleSnapTailEnd: number
}

// Line spanning the chunk seam. 0 = fall through to concat.
function processStraddle(
  s: LoadState,
  chunk: Buffer,
  bytesRead: number,
): number {
  s.straddleSnapCarryLen = 0
  s.straddleSnapTailEnd = 0
  if (s.carryLen === 0) return 0
  const cb = s.carryBuf!
  const firstNl = chunk.indexOf(LF)
  if (firstNl === -1 || firstNl >= bytesRead) return 0
  const tailEnd = firstNl + 1
  if (hasPrefix(cb, ATTR_SNAP_PREFIX, 0, s.carryLen)) {
    s.straddleSnapCarryLen = s.carryLen
    s.straddleSnapTailEnd = tailEnd
    s.lastSnapSrc = null
  } else if (s.carryLen < ATTR_SNAP_PREFIX.length) {
    return 0 // too short to rule out attr-snap
  } else {
    if (hasPrefix(cb, SYSTEM_PREFIX, 0, s.carryLen)) {
      const hit = parseBoundaryLine(
        cb.toString('utf-8', 0, s.carryLen) +
          chunk.toString('utf-8', 0, firstNl),
      )
      if (hit?.hasPreservedSegment) {
        s.hasPreservedSegment = true
      } else if (hit) {
        s.out.len = 0
        s.boundaryStartOffset = s.bufFileOff
        s.hasPreservedSegment = false
        s.lastSnapSrc = null
      }
    }
    sinkWrite(s.out, cb, 0, s.carryLen)
    sinkWrite(s.out, chunk, 0, tailEnd)
  }
  s.bufFileOff += s.carryLen + tailEnd
  s.carryLen = 0
  return tailEnd
}

// Strip attr-snaps, truncate on boundaries. Kept lines write as runs.
function scanChunkLines(
  s: LoadState,
  buf: Buffer,
  boundaryMarker: Buffer,
): { lastSnapStart: number; lastSnapEnd: number; trailStart: number } {
  let boundaryAt = buf.indexOf(boundaryMarker)
  let runStart = 0
  let lineStart = 0
  let lastSnapStart = -1
  let lastSnapEnd = -1
  let nl = buf.indexOf(LF)
  while (nl !== -1) {
    const lineEnd = nl + 1
    if (boundaryAt !== -1 && boundaryAt < lineStart) {
      boundaryAt = buf.indexOf(boundaryMarker, lineStart)
    }
    if (hasPrefix(buf, ATTR_SNAP_PREFIX, lineStart, lineEnd)) {
      sinkWrite(s.out, buf, runStart, lineStart)
      lastSnapStart = lineStart
      lastSnapEnd = lineEnd
      runStart = lineEnd
    } else if (
      boundaryAt >= lineStart &&
      boundaryAt < Math.min(lineStart + BOUNDARY_SEARCH_BOUND, lineEnd)
    ) {
      const hit = parseBoundaryLine(buf.toString('utf-8', lineStart, nl))
      if (hit?.hasPreservedSegment) {
        s.hasPreservedSegment = true // don't truncate; preserved msgs already in output
      } else if (hit) {
        s.out.len = 0
        s.boundaryStartOffset = s.bufFileOff + lineStart
        s.hasPreservedSegment = false
        s.lastSnapSrc = null
        lastSnapStart = -1
        s.straddleSnapCarryLen = 0
        runStart = lineStart
      }
      boundaryAt = buf.indexOf(
        boundaryMarker,
        boundaryAt + boundaryMarker.length,
      )
    }
    lineStart = lineEnd
    nl = buf.indexOf(LF, lineStart)
  }
  sinkWrite(s.out, buf, runStart, lineStart)
  return { lastSnapStart, lastSnapEnd, trailStart: lineStart }
}

// In-buf snap wins over straddle (later in file). carryBuf still valid here.
function captureSnap(
  s: LoadState,
  buf: Buffer,
  chunk: Buffer,
  lastSnapStart: number,
  lastSnapEnd: number,
): void {
  if (lastSnapStart !== -1) {
    s.lastSnapLen = lastSnapEnd - lastSnapStart
    if (s.lastSnapBuf === undefined || s.lastSnapLen > s.lastSnapBuf.length) {
      s.lastSnapBuf = Buffer.allocUnsafe(s.lastSnapLen)
    }
    buf.copy(s.lastSnapBuf, 0, lastSnapStart, lastSnapEnd)
    s.lastSnapSrc = s.lastSnapBuf
  } else if (s.straddleSnapCarryLen > 0) {
    s.lastSnapLen = s.straddleSnapCarryLen + s.straddleSnapTailEnd
    if (s.lastSnapBuf === undefined || s.lastSnapLen > s.lastSnapBuf.length) {
      s.lastSnapBuf = Buffer.allocUnsafe(s.lastSnapLen)
    }
    s.carryBuf!.copy(s.lastSnapBuf, 0, 0, s.straddleSnapCarryLen)
    chunk.copy(s.lastSnapBuf, s.straddleSnapCarryLen, 0, s.straddleSnapTailEnd)
    s.lastSnapSrc = s.lastSnapBuf
  }
}

function captureCarry(s: LoadState, buf: Buffer, trailStart: number): void {
  s.carryLen = buf.length - trailStart
  if (s.carryLen > 0) {
    if (s.carryBuf === undefined || s.carryLen > s.carryBuf.length) {
      s.carryBuf = Buffer.allocUnsafe(s.carryLen)
    }
    buf.copy(s.carryBuf, 0, trailStart, buf.length)
  }
}

function finalizeOutput(s: LoadState): void {
  if (s.carryLen > 0) {
    const cb = s.carryBuf!
    if (hasPrefix(cb, ATTR_SNAP_PREFIX, 0, s.carryLen)) {
      s.lastSnapSrc = cb
      s.lastSnapLen = s.carryLen
    } else {
      sinkWrite(s.out, cb, 0, s.carryLen)
    }
  }
  if (s.lastSnapSrc) {
    if (s.out.len > 0 && s.out.buf[s.out.len - 1] !== LF) {
      sinkWrite(s.out, LF_BYTE, 0, 1)
    }
    sinkWrite(s.out, s.lastSnapSrc, 0, s.lastSnapLen)
  }
}

export async function readTranscriptForLoad(
  filePath: string,
  fileSize: number,
): Promise<{
  boundaryStartOffset: number
  postBoundaryBuf: Buffer
  hasPreservedSegment: boolean
}> {
  const boundaryMarker = compactBoundaryMarker()
  const CHUNK_SIZE = TRANSCRIPT_READ_CHUNK_SIZE

  const s: LoadState = {
    out: {
      // Gated callers enter with fileSize > 5MB, so min(fileSize, 8MB) lands
      // in [5, 8]MB; large boundaryless sessions (24-31MB output) take 2
      // grows. Ungated callers (attribution.ts) pass small files too — the
      // min just right-sizes the initial buf, no grows.
      buf: Buffer.allocUnsafe(Math.min(fileSize, 8 * 1024 * 1024)),
      len: 0,
      // +1: finalizeOutput may insert one LF between a non-LF-terminated
      // carry and the reordered last attr-snap (crash-truncated file).
      cap: fileSize + 1,
    },
    boundaryStartOffset: 0,
    hasPreservedSegment: false,
    lastSnapSrc: null,
    lastSnapLen: 0,
    lastSnapBuf: undefined,
    bufFileOff: 0,
    carryLen: 0,
    carryBuf: undefined,
    straddleSnapCarryLen: 0,
    straddleSnapTailEnd: 0,
  }

  const chunk = Buffer.allocUnsafe(CHUNK_SIZE)
  const fd = await fsOpen(filePath, 'r')
  try {
    let filePos = 0
    while (filePos < fileSize) {
      const { bytesRead } = await fd.read(
        chunk,
        0,
        Math.min(CHUNK_SIZE, fileSize - filePos),
        filePos,
      )
      if (bytesRead === 0) break
      filePos += bytesRead

      const chunkOff = processStraddle(s, chunk, bytesRead)

      let buf: Buffer
      if (s.carryLen > 0) {
        const bufLen = s.carryLen + (bytesRead - chunkOff)
        buf = Buffer.allocUnsafe(bufLen)
        s.carryBuf!.copy(buf, 0, 0, s.carryLen)
        chunk.copy(buf, s.carryLen, chunkOff, bytesRead)
      } else {
        buf = chunk.subarray(chunkOff, bytesRead)
      }

      const r = scanChunkLines(s, buf, boundaryMarker)
      captureSnap(s, buf, chunk, r.lastSnapStart, r.lastSnapEnd)
      captureCarry(s, buf, r.trailStart)
      s.bufFileOff += r.trailStart
    }
    finalizeOutput(s)
  } finally {
    await fd.close()
  }

  return {
    boundaryStartOffset: s.boundaryStartOffset,
    postBoundaryBuf: s.out.buf.subarray(0, s.out.len),
    hasPreservedSegment: s.hasPreservedSegment,
  }
}
