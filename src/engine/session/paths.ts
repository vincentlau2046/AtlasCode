/**
 * session 域 — transcript 路径 + session-stamp 解耦面（E-7 S-7d d1，
 * §8.49 详案 item 3；旧 sessionStorage.ts L191-260 + L407-438 逐字裁剪）
 *
 * 解耦登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - sessionProjectDir 机制（旧 getSessionProjectDir stub 恒 null，CC-34 原子对
 *     退化；新仓 bootstrap switchSession 单参同口径）→ getTranscriptPath 形 =
 *     `join(getProjectDir(getOriginalCwd()), ${id}.jsonl)`。
 *   - promptId / slug stamp（旧 getPromptId/getPlanSlugCache stub 退化）→
 *     TranscriptMessage stamp 只留存活 session 字段。
 *   - isSessionPersistenceDisabled（持久化 kill-switch 面归 CLI 波）。
 *   - stamp 解耦四件：userType 域内静态 'atlas'（旧 getUserType 逐字）/
 *     entrypoint = `ATLAS_ENTRYPOINT ?? 'cli'`（旧 getEntrypoint env 面 +
 *     §8.49 缺省裁定）/ gitBranch = 域内 getGitBranch（execFile
 *     `git rev-parse --abbrev-ref HEAD`，旧 utils/git.ts getBranch 语义；
 *     域自包含不跨域 import worktree exec 层，scheduler「域内小工具」先例）/
 *     VERSION = package.json version 读（'unknown' 回落；旧 MACRO.VERSION
 *     bun --define 面新仓无，头注登记）。
 *   - getProjectDir memoize：旧 lodash-es/memoize → 域本地 Map memoize
 *     （新仓无 lodash；键 = cwd 串，语义与旧逐字一致）。sanitizePath ←
 *     新仓 shared/path.ts（核验：与旧 portable 版同 Bun.hash 优先 + djb2
 *     兜底哈希线，目录名跨升级稳定）。
 */
import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { sanitizePath } from '../../shared'
import { getSessionEnv } from './env'

// Memoized: called 12+ times per turn via hooks createBaseHookInput
// (PostToolUse path, 5×/turn) + various save* functions. Input is a cwd
// string; homedir/env/regex are all session-invariant so the result is
// stable for a given input. Worktree switches just change the key — no
// cache clear needed.（旧 lodash memoize → 域本地 Map，头注登记。）
const _projectDirCache = new Map<string, string>()
export const getProjectDir = (projectDir: string): string => {
  const cached = _projectDirCache.get(projectDir)
  if (cached !== undefined) return cached
  const resolved = join(
    getSessionEnv().getProjectsDir(),
    sanitizePath(projectDir),
  )
  _projectDirCache.set(projectDir, resolved)
  return resolved
}

export function getProjectsDir(): string {
  return getSessionEnv().getProjectsDir()
}

export function getTranscriptPath(): string {
  const projectDir = getProjectDir(getSessionEnv().getOriginalCwd())
  return join(projectDir, `${getSessionEnv().getSessionId()}.jsonl`)
}

export function getTranscriptPathForSession(sessionId: string): string {
  // When asking for the CURRENT session's transcript, honor the original cwd
  // the same way getTranscriptPath() does. Without this, hooks get a
  // transcript_path computed from a stale cwd while the actual file was
  // written under the boot cwd — different directories, so the hook sees
  // MISSING (gh-30217).
  //
  // For OTHER session IDs we can only guess via originalCwd — we don't
  // track a sessionId→projectDir map. Callers wanting a specific other
  // session's path should pass fullPath explicitly (most save* functions
  // already accept this).
  if (sessionId === getSessionEnv().getSessionId()) {
    return getTranscriptPath()
  }
  const projectDir = getProjectDir(getSessionEnv().getOriginalCwd())
  return join(projectDir, `${sessionId}.jsonl`)
}

// 50 MB — session JSONL can grow to multiple GB (inc-3930). Callers that
// read the raw transcript must bail out above this threshold to avoid OOM.
export const MAX_TRANSCRIPT_READ_BYTES = 50 * 1024 * 1024

// In-memory map of agentId → subdirectory for grouping related subagent
// transcripts (e.g. workflow runs write to subagents/workflows/<runId>/).
// Populated before the agent runs; consulted by getAgentTranscriptPath.
const agentTranscriptSubdirs = new Map<string, string>()

export function setAgentTranscriptSubdir(
  agentId: string,
  subdir: string,
): void {
  agentTranscriptSubdirs.set(agentId, subdir)
}

export function clearAgentTranscriptSubdir(agentId: string): void {
  agentTranscriptSubdirs.delete(agentId)
}

export function getAgentTranscriptPath(agentId: string): string {
  const projectDir = getProjectDir(getSessionEnv().getOriginalCwd())
  const sessionId = getSessionEnv().getSessionId()
  const subdir = agentTranscriptSubdirs.get(agentId)
  const base = subdir
    ? join(projectDir, sessionId, 'subagents', subdir)
    : join(projectDir, sessionId, 'subagents')
  return join(base, `agent-${agentId}.jsonl`)
}

// ── session-stamp 解耦面 ─────────────────────────────────────────────────────

// 旧 getUserType 逐字（de-ANT: USER_TYPE 透传静态化，Atlas 构建恒 'atlas'）。
export function getUserType(): string {
  return 'atlas'
}

// 旧 getEntrypoint env 面（ATLAS_ENTRYPOINT — distinguishes cli/sdk-ts/
// sdk-py/etc.；§8.49 缺省裁定 'cli'）。
export function getEntrypoint(): string {
  return process.env.ATLAS_ENTRYPOINT ?? 'cli'
}

/**
 * 域内 git branch 探针（旧 utils/git.ts getBranch 语义；域自包含，scheduler
 * 「域内小工具」先例）。非 git 仓 / git 失败 → undefined（调用方
 * insertMessageChain 的 try/catch 逐字兜底）。
 *
 * 【审视 A-2 登记（E-7 d1 独立审视 MINOR，值 delta 裁定接受）】
 * 机制面：旧 getBranch = 缓存族（gitWatcher.get('branch', computeBranch)）
 * → 域内逐次 execFile spawn（无缓存，域自包含）。值面：detached-HEAD /
 * 非 git 仓 / HEAD 缺失时旧 computeBranch（gitFilesystem L500）返字符串
 * 'HEAD'；本实现 `branch !== 'HEAD' ? branch : undefined` 映射为字段
 * 缺省。消费面 = gitBranch 戳 CLI 列表展示（归 CLI 波），链完整性零
 * delta。
 */
export function getGitBranch(): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      (err, stdout) => {
        if (err) {
          resolve(undefined)
          return
        }
        const branch = stdout.trim()
        resolve(branch && branch !== 'HEAD' ? branch : undefined)
      },
    )
  })
}

// 旧 MACRO.VERSION（bun --define）面新仓无 → package.json version 读 +
// 'unknown' 回落（头注登记）。模块级缓存（旧仓同样模块级缓存防 async 上下文
// define bug，语义保留）。
const VERSION: string = (() => {
  try {
    // src/engine/session/paths.ts → 仓库根 package.json
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../package.json',
    )
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: string
    }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
})()

export function getVersion(): string {
  return VERSION
}
