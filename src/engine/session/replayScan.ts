/**
 * session 域 — replay 分页装窗读路径的 engine 侧 skeleton 扫描（F6-PAGE
 * S1，工单 docs/2026-11-25-f6-page-ticket.md §B 必改①定形）。
 *
 * 目标：>帽转录（全量 loadTranscriptFull 投影序列化 >4MiB / transcript
 * 字节超 L.maxTranscriptBytes）的内容可分页可达，且零全量驻留——
 *  - pass1（本模块）：流式逐行扫描 JSONL，每行建 **skeleton**（链字段
 *    uuid/parentUuid/type/timestamp + message.id + content 剥除为块型/标记
 *    + compactMetadata + subtype/snipMetadata），并记 uuid → 行字节范围 side map（last-wins，镜像
 *    loadTranscriptFile 的 messages.set 语义）。内容字节不入驻留——峰值
 *    分配 ∝ 记录数（骨架 ~百字节/条），与内容体量无关。
 *  - 装载期图变换复用真体（零逻辑复刻）：legacy progressBridge（镜像
 *    loadTranscriptFile 内联段）+ applyPreservedSegmentRelinks +
 *    applySnipRemovals（本波自 load.ts 加性导出）。全量路径（force-full）
 *    不施加 walkChainBeforeParse / precompact 截断，本扫描逐行全解析 =
 *    同语义（无死分支剔除差异）。
 *  - pass2（web 层 replayPaging.ts 消费）：链确定页窗口后按字节范围随机
 *    读页内记录原文 → JSON.parse → 全量投影渲染。仅页内记录驻留。
 *
 * 错误面复用定型错（零新错误类型）：maxBytes → TranscriptTooLargeError；
 * expectIno 错配 / 读断流 → TranscriptChangedDuringReadError（web 层既有
 * ioUnavailable retryable 映射不变）。
 */
import { constants as fsConstants } from 'node:fs'
import { open } from 'fs/promises'

import type { TranscriptMessage } from './types'
import {
  TranscriptChangedDuringReadError,
  TranscriptTooLargeError,
  applyPreservedSegmentRelinks,
  applySnipRemovals,
} from './load'
import { TRANSCRIPT_READ_CHUNK_SIZE } from './scanner'
import { isLegacyProgressEntry } from './predicates'

/** skeleton 记录 = 链/恢复 pass 所需字段的窄结构面（内容已剥除）。 */
export interface ReplaySkeletonRecord {
  uuid: string
  parentUuid: string | null
  type: string
  timestamp?: string | null
  isSidechain?: boolean
  compactMetadata?: unknown
  // S1 修形①（审计必改，工单 §E 采记 @3d20e9c5）：boundary 判别与 snip
  // 重放所需——subtype 缺失 → isCompactBoundaryMessage 恒 false →
  // applyPreservedSegmentRelinks 空转；snipMetadata 缺失 →
  // applySnipRemovals 空转（phantom 历史外泄）。
  subtype?: string
  snipMetadata?: unknown
  message?: { id?: string; content?: unknown }
}

/** 行字节范围（文件绝对坐标；length 不含换行）。 */
export interface ReplayByteRange {
  offset: number
  length: number
}

export interface ReplayPageReader {
  /** skeleton Map（last-wins；relink/snip 已施加）。 */
  skeletons: Map<string, ReplaySkeletonRecord>
  /** uuid → 行字节范围（与 skeletons 同键集；被 relink/snip 剪枝的残键无害）。 */
  ranges: Map<string, ReplayByteRange>
  /** open 后 fstat 身份（web 层 adapter stPost 三元组对表的 ino 侧）。 */
  ino: number
  size: number
  /** pass2：按字节范围读页内记录原文（返回序 = 入参序；公共面用
   *  Uint8Array——S0-R 打包出口 d.ts 消费 tsconfig 无 node types，
   *  Buffer 类型名不入 .d.ts，实现体仍可用 Buffer）。 */
  readRanges(ranges: ReadonlyArray<ReplayByteRange>): Promise<Uint8Array[]>
  close(): Promise<void>
}

/**
 * content 剥除（可渲染性守恒）：text 块以空性 \u0000/'' 守恒（projectBlocks
 * 只判 text.length>0）；tool_use 保留 id（恢复 pass 无依赖但保型）；
 * tool_result 保留 tool_use_id（孤儿并行 tool result 恢复 pass 的检测面 =
 * content 数组含 tool_result 块）；其余块型只留 type（projectBlocks 不投影）。
 * 字符串 content 以空性守恒。
 */
function stripContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return content.length > 0 ? '\u0000' : ''
  }
  if (!Array.isArray(content)) return undefined
  return content.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item
    const rec = item as Record<string, unknown>
    switch (rec.type) {
      case 'text':
        return {
          type: 'text',
          text:
            typeof rec.text === 'string' && rec.text.length > 0 ? '\u0000' : '',
        }
      case 'tool_use':
        return { type: 'tool_use', id: rec.id }
      case 'tool_result':
        return { type: 'tool_result', tool_use_id: rec.tool_use_id }
      default:
        return { type: rec.type }
    }
  })
}

/** JSONL 行 → skeleton（非 transcript 行返回 undefined）。 */
function stripToSkeleton(entry: Record<string, unknown>): ReplaySkeletonRecord | undefined {
  const type = entry.type
  if (type !== 'user' && type !== 'assistant' && type !== 'attachment' && type !== 'system') {
    return undefined
  }
  const message = entry.message
  const skeleton: ReplaySkeletonRecord = {
    uuid: entry.uuid as string,
    parentUuid: (entry.parentUuid as string | null) ?? null,
    type,
    timestamp: (entry.timestamp as string | undefined) ?? null,
  }
  if (typeof entry.isSidechain === 'boolean') skeleton.isSidechain = entry.isSidechain
  if (entry.compactMetadata !== undefined) skeleton.compactMetadata = entry.compactMetadata
  // S1 修形①：subtype（string 在场才留）+ snipMetadata（存在才留）——
  // 装载期两变换（applyPreservedSegmentRelinks 边界判别 /
  // applySnipRemovals removedUuids 重放）的判别字段，缺一则恒空转。
  if (typeof entry.subtype === 'string') skeleton.subtype = entry.subtype
  if (entry.snipMetadata !== undefined) skeleton.snipMetadata = entry.snipMetadata
  if (message && typeof message === 'object') {
    const m = message as Record<string, unknown>
    const out: { id?: string; content?: unknown } = {}
    if (typeof m.id === 'string') out.id = m.id
    const content = stripContent(m.content)
    if (content !== undefined) out.content = content
    skeleton.message = out
  }
  return skeleton
}

/**
 * 打开 replay 分页读取器：open（O_NOFOLLOW 旗标，POSIX；Windows 守卫跳过
 * ——load.ts S0-R4 F1 同形）→ fstat 身份/尺寸检查点 → 流式逐行 skeleton
 * 扫描 → 装载期图变换（relink/snip）。fd 保持打开供 pass2 readRanges；
 * close 恒由调用方 finally 触达（成功路径 fd 移交 reader，失败路径此处
 * 关闭）。
 */
export async function openReplayPageReader(
  filePath: string,
  opts?: { maxBytes?: number; expectIno?: number },
): Promise<ReplayPageReader> {
  const noFollow = (fsConstants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0
  const fd = await open(filePath, fsConstants.O_RDONLY | noFollow)
  try {
    const fst = await fd.stat()
    if (opts?.expectIno !== undefined && fst.ino !== opts.expectIno) {
      throw new TranscriptChangedDuringReadError()
    }
    if (opts?.maxBytes !== undefined && fst.size > opts.maxBytes) {
      throw new TranscriptTooLargeError(fst.size, opts.maxBytes)
    }

    const skeletons = new Map<string, ReplaySkeletonRecord>()
    const ranges = new Map<string, ReplayByteRange>()
    // legacy progress 链桥（loadTranscriptFile 同规则镜像：progress 行不在
    // Entry 并集但旧盘仍在；后续 message 的 parentUuid 落桥 → 链式解析改写）
    const progressBridge = new Map<string, string | null>()

    const buf = Buffer.allocUnsafe(TRANSCRIPT_READ_CHUNK_SIZE)
    let carry: Buffer = Buffer.alloc(0)
    let carryFileStart = 0 // carry 首字节的文件绝对坐标
    let readPos = 0 // 下一次 fd.read 的文件绝对坐标
    let firstChunk = true

    // lineStart = 行在 data 内偏移；dataFileStart = data 首字节文件坐标
    const processLine = (line: Buffer, fileOffset: number): void => {
      const text = line.toString('utf8').trim()
      if (!text) return
      let entry: unknown
      try {
        entry = JSON.parse(text)
      } catch {
        return // malformed 行跳过（parseJSONL 同语义）
      }
      if (!entry || typeof entry !== 'object') return
      const rec = entry as Record<string, unknown>
      if (isLegacyProgressEntry(entry)) {
        const parent = rec.parentUuid as string | null
        progressBridge.set(
          rec.uuid as string,
          parent && progressBridge.has(parent)
            ? (progressBridge.get(parent) ?? null)
            : parent,
        )
        return
      }
      const skeleton = stripToSkeleton(rec)
      if (!skeleton) return // metadata 行（summary/custom-title/...）不入链
      if (skeleton.parentUuid && progressBridge.has(skeleton.parentUuid)) {
        skeleton.parentUuid = progressBridge.get(skeleton.parentUuid) ?? null
      }
      // last-wins（loadTranscriptFile messages.set 同语义）
      skeletons.set(skeleton.uuid, skeleton)
      ranges.set(skeleton.uuid, { offset: fileOffset, length: line.length })
    }

    for (;;) {
      const { bytesRead } = await fd.read(buf, 0, buf.length, readPos)
      if (bytesRead <= 0) break
      const chunkFileStart = readPos
      readPos += bytesRead
      let chunk = buf.subarray(0, bytesRead)
      let contentSkip = 0 // 本块内跳过的前导字节（BOM）
      if (firstChunk) {
        firstChunk = false
        if (
          bytesRead >= 3 &&
          buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
        ) {
          contentSkip = 3
          chunk = chunk.subarray(3)
        }
      }
      const data = carry.length > 0 ? Buffer.concat([carry, chunk]) : Buffer.from(chunk)
      const dataFileStart = chunkFileStart + contentSkip - carry.length
      let lineStart = 0
      for (;;) {
        const nl = data.indexOf(0x0a, lineStart)
        if (nl < 0) break
        processLine(data.subarray(lineStart, nl), dataFileStart + lineStart)
        lineStart = nl + 1
      }
      carry = Buffer.from(data.subarray(lineStart))
      carryFileStart = dataFileStart + lineStart
    }
    if (carry.length > 0) {
      // 尾行无换行（loadTranscriptFile 尾行同处理）
      processLine(carry, carryFileStart)
    }

    // 装载期图变换（真体复用；cast = 骨架结构面 → TranscriptMessage 参数面，
    // 变换只触 skeleton 保留字段，边界一次完成——runtimeDefault 焊接同形）
    const asTranscriptMap = skeletons as unknown as Map<string, TranscriptMessage>
    applyPreservedSegmentRelinks(asTranscriptMap)
    applySnipRemovals(asTranscriptMap)

    return {
      skeletons,
      ranges,
      ino: fst.ino,
      size: fst.size,
      readRanges: async (list: ReadonlyArray<ReplayByteRange>) => {
        const out: Buffer[] = []
        for (const r of list) {
          const b = Buffer.alloc(r.length)
          let filled = 0
          while (filled < r.length) {
            const { bytesRead: n } = await fd.read(
              b, filled, r.length - filled, r.offset + filled,
            )
            if (n <= 0) throw new TranscriptChangedDuringReadError()
            filled += n
          }
          out.push(b)
        }
        return out
      },
      close: async () => {
        await fd.close()
      },
    }
  } catch (e) {
    await fd.close().catch(() => {})
    throw e
  }
}
