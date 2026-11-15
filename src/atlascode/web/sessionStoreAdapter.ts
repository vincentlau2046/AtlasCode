/**
 * AtlasWeb S0-R 受授权真实读取 adapter（工单 §4.1/§4.2；呈批书 §7.4
 * 同 fd 校验读取链，f4 批复 @f1f1099d 必改 2 扩项）。
 *
 * 安全读链（禁 path 两段式）：授权根 containment（realpath 规范化）→
 * lstat 末段拒 symlink/非 regular → O_NOFOLLOW open → fstat S_ISREG 白名单
 * → ino 对比收 TOCTOU 窗 → size 对资源界 → 同一 fd 流式读（chunk ≤64KiB，
 * 每 chunk 边界查 AbortSignal）→ 读毕 fstat 复核 ino/size。
 * 非法 ID（含 `..`/路径形）→ invalidRequest；未知 scope → scopeDenied；
 * 文件不存在 → notFound；权限/非 regular → ioUnavailable{retryable:false}；
 * 读取中身份变化 → ioUnavailable{retryable:true}；超界 → resourceLimit。
 * 零写面；不默认回落 HOME；scopeId ↔ storageDir 显式映射。
 */

import { constants as fsConstants } from 'node:fs'
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'

import { WebSessionError } from './errors'
import {
  DEFAULT_MAX_TRANSCRIPT_BYTES,
  HARD_MAX_TRANSCRIPT_BYTES,
  READ_CHUNK_SIZE,
  validateBoundedInt,
} from './limits'

export type SessionStoreScopes = ReadonlyArray<{
  scopeId: string
  storageDir: string
}>

export interface SessionFileEntry {
  sessionId: string
  filePath: string
  sizeBytes: number
  updatedAt: string
  createdAt: string | null
}

export interface SessionStoreAdapter {
  start(): Promise<void>
  listSessionFiles(scopeId: string): Promise<SessionFileEntry[]>
  readTranscript(
    scopeId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array>
  close(): Promise<void>
}

export interface NodeFsSessionStoreAdapterOptions {
  productId: string
  scopes: SessionStoreScopes
  limits?: { maxTranscriptBytes?: number }
}

interface AuthorizedRoot {
  scopeId: string
  /** realpath 规范化后的授权根（containment 断言基准）。 */
  canonical: string
  dir: string
}

const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function assertSessionIdShape(sessionId: string): void {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new WebSessionError(
      'invalidRequest',
      'sessionId must be a plain identifier (no path segments)',
    )
  }
}

function mapFsError(e: unknown, what: string): never {
  const code = (e as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT') {
    throw new WebSessionError('notFound', `${what} not found`)
  }
  if (code === 'EACCES' || code === 'EPERM') {
    throw new WebSessionError(
      'ioUnavailable',
      `${what} not readable (permission)`,
      false,
    )
  }
  throw new WebSessionError(
    'ioUnavailable',
    `${what} read failed: ${code ?? 'unknown'}`,
    true,
  )
}

export function createNodeFsSessionStoreAdapter(
  options: NodeFsSessionStoreAdapterOptions,
): SessionStoreAdapter {
  const maxTranscriptBytes = validateBoundedInt(
    'maxTranscriptBytes',
    options.limits?.maxTranscriptBytes,
    DEFAULT_MAX_TRANSCRIPT_BYTES,
    HARD_MAX_TRANSCRIPT_BYTES,
  )
  const roots = new Map<string, AuthorizedRoot>()
  let started = false

  function assertStarted(): void {
    if (!started) {
      throw new WebSessionError('closed', 'adapter not started')
    }
  }

  function assertScope(scopeId: string): AuthorizedRoot {
    const root = roots.get(scopeId)
    if (!root) {
      throw new WebSessionError('scopeDenied', `scope not authorized: ${scopeId}`)
    }
    return root
  }

  async function readTranscript(
    scopeId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    assertStarted()
    const root = assertScope(scopeId)
    assertSessionIdShape(sessionId)

    const filePath = join(root.dir, `${sessionId}.jsonl`)
    // containment 防御性复核（shape 已拒路径形；双保险）
    const resolved = resolve(filePath)
    if (!resolved.startsWith(root.canonical + sep)) {
      throw new WebSessionError(
        'scopeDenied',
        'path escapes authorized root',
      )
    }

    // 开读前身份锚：lstat 末段（拒 symlink / 非 regular），锚 ino 收 TOCTOU 窗
    let pre: Awaited<ReturnType<typeof lstat>>
    try {
      pre = await lstat(filePath)
    } catch (e) {
      mapFsError(e, 'transcript')
    }
    if (pre.isSymbolicLink() || !pre.isFile()) {
      throw new WebSessionError(
        'ioUnavailable',
        'transcript is not a regular file (symlink/device/fifo rejected)',
        false,
      )
    }

    let fh: Awaited<ReturnType<typeof open>>
    try {
      fh = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    } catch (e) {
      mapFsError(e, 'transcript open')
    }
    try {
      const st = await fh.stat()
      if (!st.isFile()) {
        throw new WebSessionError(
          'ioUnavailable',
          'opened fd is not a regular file',
          false,
        )
      }
      if (st.ino !== pre.ino) {
        throw new WebSessionError(
          'ioUnavailable',
          'file identity changed between lstat and open',
          true,
        )
      }
      if (st.size > maxTranscriptBytes) {
        throw new WebSessionError(
          'resourceLimit',
          `transcript exceeds limit (${st.size} > ${maxTranscriptBytes} bytes)`,
        )
      }

      // 同一 fd 流式读：chunk ≤64KiB，每 chunk 边界查 abort
      const chunks: Buffer[] = []
      let read = 0
      while (read < st.size) {
        if (signal?.aborted) {
          throw new WebSessionError('cancelled', 'read aborted')
        }
        const want = Math.min(READ_CHUNK_SIZE, st.size - read)
        const buf = Buffer.alloc(want)
        const { bytesRead } = await fh.read(buf, 0, want, read)
        if (bytesRead <= 0) break
        chunks.push(buf.subarray(0, bytesRead))
        read += bytesRead
      }

      // 读毕身份复核：ino/size 任一变 → 不连续（禁静默交付半旧半新）
      const st2 = await fh.stat()
      if (st2.ino !== st.ino || st2.size !== st.size) {
        throw new WebSessionError(
          'ioUnavailable',
          'file changed during read (not a stable snapshot)',
          true,
        )
      }
      return new Uint8Array(Buffer.concat(chunks))
    } finally {
      await fh.close()
    }
  }

  return {
    async start(): Promise<void> {
      if (options.productId !== 'atlascode') {
        throw new WebSessionError(
          'invalidRequest',
          `productId must be 'atlascode' (static ProductDefinition), got '${options.productId}'`,
        )
      }
      roots.clear()
      for (const { scopeId, storageDir } of options.scopes) {
        if (roots.has(scopeId)) {
          throw new WebSessionError(
            'invalidRequest',
            `duplicate scopeId: ${scopeId}`,
          )
        }
        if (!isAbsolute(storageDir)) {
          throw new WebSessionError(
            'invalidRequest',
            `storageDir must be absolute for scope ${scopeId}`,
          )
        }
        let canonical: string
        try {
          canonical = await realpath(storageDir)
        } catch (e) {
          mapFsError(e, `storage root for scope ${scopeId}`)
        }
        const st = await stat(canonical).catch(e => {
          mapFsError(e, `storage root for scope ${scopeId}`)
        })
        if (!st.isDirectory()) {
          throw new WebSessionError(
            'invalidRequest',
            `storage root for scope ${scopeId} is not a directory`,
          )
        }
        roots.set(scopeId, { scopeId, canonical, dir: storageDir })
      }
      started = true
    },

    async listSessionFiles(scopeId: string): Promise<SessionFileEntry[]> {
      assertStarted()
      const root = assertScope(scopeId)
      let dirents: import('node:fs').Dirent[]
      try {
        dirents = await readdir(root.dir, { withFileTypes: true })
      } catch (e) {
        mapFsError(e, `scope ${scopeId} directory`)
      }
      const entries: Array<SessionFileEntry & { mtimeMs: number }> = []
      for (const d of dirents) {
        if (!d.name.endsWith('.jsonl')) continue
        // 枚举面防御：symlink / 非 regular 直接跳过（不读、不投影）
        if (d.isSymbolicLink() || !d.isFile()) continue
        const sessionId = d.name.slice(0, -'.jsonl'.length)
        if (!SESSION_ID_RE.test(sessionId)) continue
        try {
          const st = await stat(join(root.dir, d.name))
          entries.push({
            sessionId,
            filePath: join(root.dir, d.name),
            sizeBytes: st.size,
            updatedAt: st.mtime.toISOString(),
            createdAt: st.birthtimeMs > 0 ? st.birthtime.toISOString() : null,
            mtimeMs: st.mtimeMs,
          })
        } catch {
          // stat 竞态（文件被删）：跳过，不伪完整单条
        }
      }
      entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
      return entries.map(({ mtimeMs: _mtimeMs, ...rest }) => rest)
    },

    readTranscript,

    async close(): Promise<void> {
      started = false
      roots.clear()
    },
  }
}
