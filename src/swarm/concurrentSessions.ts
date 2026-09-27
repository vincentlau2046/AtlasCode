/**
 * 并发 CLI 会话注册 / 探测（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/concurrentSessions.ts（204L）。
 *
 * import 面重映射：
 *   - getOriginalCwd/getSessionId → bootstrap 域门面
 *   - registerCleanup → 域内 cleanupRegistry（旧 utils/cleanupRegistry 镜像）
 *   - getAtlasConfigHomeDir → memory 域门面
 *   - errorMessage/isFsInaccessible/getPlatform → shared 域门面
 *   - isProcessRunning/jsonParse/jsonStringify/getAgentId → engine 域根门面
 *
 * 裁面/门控登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - R4 门控裁除 always-active：旧 bun:bundle feature('BG_SESSIONS')×3 /
 *     feature('UDS_INBOX')×1 门（新仓无 feature() 运行时门控，§8.66 R4
 *     裁定）→ envSessionKind 恒读 env / UDS messagingSocketPath 字段恒含 /
 *     BG name/logPath/agent 字段恒含 / updateSessionActivity 无早退支。
 *   - onSessionSwitch（旧 bootstrap/state 订阅面）裁除：旧仓本体为
 *     any-stub（`(() => ({})) as any` 零行为，H6 不当真行为）→ PID 文件
 *     sessionId 注册后不随 --resume 会话切换更新（旧语义即 stub 零行为，
 *     裁除零 delta）。
 *   - de-Claude 注释面：`claude ps` → `atlas ps` / "Windows-native Claude"
 *     → "Windows-native Atlas"。
 */
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'fs/promises'
import { join } from 'path'
import { getOriginalCwd, getSessionId } from '../bootstrap'
import {
  errorMessage,
  isFsInaccessible,
  logForDebugging,
  getPlatform,
} from '../shared'
import { getAtlasConfigHomeDir } from '../memory'
import { getAgentId, isProcessRunning, jsonParse, jsonStringify } from '../engine'
import { registerCleanup } from './cleanupRegistry'

export type SessionKind = 'interactive' | 'bg' | 'daemon' | 'daemon-worker'
export type SessionStatus = 'busy' | 'idle' | 'waiting'

function getSessionsDir(): string {
  return join(getAtlasConfigHomeDir(), 'sessions')
}

/**
 * Kind override from env. Set by the spawner (`atlas --bg`, daemon
 * supervisor) so the child can register without the parent having to
 * write the file for it — cleanup-on-exit wiring then works for free.
 *（R4：旧 feature('BG_SESSIONS') 门裁除 → 恒读 env，登记见头注。）
 */
function envSessionKind(): SessionKind | undefined {
  const k = process.env.ATLAS_SESSION_KIND
  if (k === 'bg' || k === 'daemon' || k === 'daemon-worker') return k
  return undefined
}

/**
 * True when this REPL is running inside a `atlas --bg` tmux session.
 * Exit paths (/exit, ctrl+c, ctrl+d) should detach the attached client
 * instead of killing the process.
 */
export function isBgSession(): boolean {
  return envSessionKind() === 'bg'
}

/**
 * Write a PID file for this session and register cleanup.
 *
 * Registers all top-level sessions — interactive CLI, SDK (vscode, desktop,
 * typescript, python, -p), bg/daemon spawns — so `atlas ps` sees everything
 * the user might be running. Skips only teammates/subagents, which would
 * conflate swarm usage with genuine concurrency and pollute ps with noise.
 *
 * Returns true if registered, false if skipped.
 * Errors logged to debug, never thrown.
 */
export async function registerSession(): Promise<boolean> {
  if (getAgentId() != null) return false

  const kind: SessionKind = envSessionKind() ?? 'interactive'
  const dir = getSessionsDir()
  const pidFile = join(dir, `${process.pid}.json`)

  registerCleanup(async () => {
    try {
      await unlink(pidFile)
    } catch {
      // ENOENT is fine (already deleted or never written)
    }
  })

  try {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700)
    await writeFile(
      pidFile,
      jsonStringify({
        pid: process.pid,
        sessionId: getSessionId(),
        cwd: getOriginalCwd(),
        startedAt: Date.now(),
        kind,
        entrypoint: process.env.ATLAS_ENTRYPOINT,
        // R4：旧 UDS_INBOX / BG_SESSIONS 门裁除 → 字段恒含（未设 env 为 undefined，
        // JSON 序列化自然省略）
        messagingSocketPath: process.env.ATLAS_MESSAGING_SOCKET,
        name: process.env.ATLAS_SESSION_NAME,
        logPath: process.env.ATLAS_SESSION_LOG,
        agent: process.env.ATLAS_AGENT,
      }),
    )
    return true
  } catch (e) {
    logForDebugging(`[concurrentSessions] register failed: ${errorMessage(e)}`)
    return false
  }
}

/**
 * Update this session's name in its PID registry file so ListPeers
 * can surface it. Best-effort: silently no-op if name is falsy, the
 * file doesn't exist (session not registered), or read/write fails.
 */
async function updatePidFile(patch: Record<string, unknown>): Promise<void> {
  const pidFile = join(getSessionsDir(), `${process.pid}.json`)
  try {
    const data = jsonParse(await readFile(pidFile, 'utf8')) as Record<
      string,
      unknown
    >
    await writeFile(pidFile, jsonStringify({ ...data, ...patch }))
  } catch (e) {
    logForDebugging(
      `[concurrentSessions] updatePidFile failed: ${errorMessage(e)}`,
    )
  }
}

export async function updateSessionName(
  name: string | undefined,
): Promise<void> {
  if (!name) return
  await updatePidFile({ name })
}

/**
 * Record this session's Remote Control session ID so peer enumeration can
 * dedup: a session reachable over both UDS and bridge should only appear
 * once (local wins). Cleared on bridge teardown so stale IDs don't
 * suppress a legitimately-remote session after reconnect.
 */
export async function updateSessionBridgeId(
  bridgeSessionId: string | null,
): Promise<void> {
  await updatePidFile({ bridgeSessionId })
}

/**
 * Push live activity state for `atlas ps`. Fire-and-forget from REPL's
 * status-change effect — a dropped write just means ps falls back to
 * transcript-tail derivation for one refresh.
 *（R4：旧 feature('BG_SESSIONS') 早退支裁除，登记见头注。）
 */
export async function updateSessionActivity(patch: {
  status?: SessionStatus
  waitingFor?: string
}): Promise<void> {
  await updatePidFile({ ...patch, updatedAt: Date.now() })
}

/**
 * Count live concurrent CLI sessions (including this one).
 * Filters out stale PID files (crashed sessions) and deletes them.
 * Returns 0 on any error (conservative).
 */
export async function countConcurrentSessions(): Promise<number> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (e) {
    if (!isFsInaccessible(e)) {
      logForDebugging(`[concurrentSessions] readdir failed: ${errorMessage(e)}`)
    }
    return 0
  }

  let count = 0
  for (const file of files) {
    // Strict filename guard: only `<pid>.json` is a candidate. parseInt's
    // lenient prefix-parsing means `2026-03-14_notes.md` would otherwise
    // parse as PID 2026 and get swept as stale — silent user data loss.
    // See anthropics/claude-code#34210.
    if (!/^\d+\.json$/.test(file)) continue
    const pid = parseInt(file.slice(0, -5), 10)
    if (pid === process.pid) {
      count++
      continue
    }
    if (isProcessRunning(pid)) {
      count++
    } else if (getPlatform() !== 'wsl') {
      // Stale file from a crashed session — sweep it. Skip on WSL: if
      // ~/.atlas/sessions/ is shared with Windows-native Atlas (symlink
      // or ATLAS_CONFIG_DIR), a Windows PID won't be probeable from WSL
      // and we'd falsely delete a live session's file. This is just
      // telemetry so conservative undercount is acceptable.
      void unlink(join(dir, file)).catch(() => {})
    }
  }
  return count
}
