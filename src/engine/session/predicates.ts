/**
 * session 域 — 消息/entry 判别谓词族（E-7 S-7d d1，§8.49 详案；旧
 * sessionStorage.ts L134-190 + messages.ts L4596 isCompactBoundaryMessage
 * 逐字随迁；独立小文件供 project/record/load 三面共享，避免 record↔load
 * 运行时环依赖）
 */
import type { Message, Entry, TranscriptMessage, SystemCompactBoundaryMessage } from './types'

/**
 * 旧 L134 逐字。Type guard to check if an entry is a transcript message.
 * Transcript messages include user, assistant, attachment, and system
 * messages. IMPORTANT: This is the single source of truth for what
 * constitutes a transcript message. loadTranscriptFile() uses this to
 * determine which messages to load into the chain.
 *
 * Progress messages are NOT transcript messages. They are ephemeral UI
 * state and must not be persisted to the JSONL or participate in the
 * parentUuid chain. Including them caused chain forks that orphaned real
 * conversation messages on resume (see #14373, #23537).
 */
export function isTranscriptMessage(entry: Entry): entry is TranscriptMessage {
  return (
    entry.type === 'user' ||
    entry.type === 'assistant' ||
    entry.type === 'attachment' ||
    entry.type === 'system'
  )
}

/**
 * 旧 L149 逐字。Entries that participate in the parentUuid chain. Used on
 * the write path (insertMessageChain, useLogMessages) to skip progress when
 * assigning parentUuid. Old transcripts with progress already in the chain
 * are handled by the progressBridge rewrite in loadTranscriptFile.
 */
export function isChainParticipant(m: Pick<Message, 'type'>): boolean {
  return m.type !== 'progress'
}

export type LegacyProgressEntry = {
  type: 'progress'
  uuid: string
  parentUuid: string | null
}

/**
 * 旧 L164 逐字。Progress entries in transcripts written before PR #24099.
 * They are not in the Entry type union anymore but still exist on disk
 * with uuid and parentUuid fields. loadTranscriptFile bridges the chain
 * across them.
 */
export function isLegacyProgressEntry(entry: unknown): entry is LegacyProgressEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'type' in entry &&
    entry.type === 'progress' &&
    'uuid' in entry &&
    typeof entry.uuid === 'string'
  )
}

/**
 * 旧 L187 逐字。High-frequency tool progress ticks (1/sec for Sleep,
 * per-chunk for Bash). These are UI-only: not sent to the API, not rendered
 * after the tool completes. Used by REPL.tsx to replace-in-place instead of
 * appending, and by loadTranscriptFile to skip legacy entries from old
 * transcripts.
 */
const EPHEMERAL_PROGRESS_TYPES = new Set([
  'bash_progress',
  'powershell_progress',
  'mcp_progress',
])

export function isEphemeralToolProgress(dataType: unknown): boolean {
  return typeof dataType === 'string' && EPHEMERAL_PROGRESS_TYPES.has(dataType)
}

/**
 * 旧 messages.ts L4596 逐字（入参收敛为域 Message 型）。Checks if a message
 * is a compact boundary marker.
 */
export function isCompactBoundaryMessage(
  message: Message,
): message is SystemCompactBoundaryMessage {
  return message?.type === 'system' && message.subtype === 'compact_boundary'
}
