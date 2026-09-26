/**
 * memory 域 — 记忆文件/目录/命令 检测族（§8.55 S-C2，旧仓
 * src/utils/memoryFileDetection.ts 289L 逐字随迁，delta 仅 import 重指 +
 * 3 处死面裁剪，函数体逐字不变）。
 *
 * 消费面（engine/tools/files 工具本体波）：FileReadTool isAutoMemFile /
 * Grep·Glob isMemoryDirectory + detectSessionPatternType /
 * 后续 Bash 折叠面 isShellCommandTargetingMemory。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - TEAMMEM 族裁（3 支）：`feature('TEAMMEM')` 新仓恒 false（bun:bundle
 *    内建模块不可注入，TEAMMEM 特性未定义 → false）且新仓无
 *    memdir/teamMemPaths 域 → teamMemPaths lazy-require 块 +
 *    memoryScopeForPath team 支 / isAutoManagedMemoryFile team 支 /
 *    isMemoryDirectory team 块 同裁。MemoryScope 型 'team' 字面量保留
 *    （联合型契约，team-memory 波物化时恢复真支）。
 *  - isAgentMemoryPath / isAgentMemFile 裁：旧仓消费 = tools/AgentTool/
 *    agentMemory.js（agent 持久记忆域），新仓 agent 域未物化
 *    （src/engine/tools/agent 无 agentMemory，无 agent-memory 目录创建
 *    消费点）→ isAutoManagedMemoryFile 单调用点同裁。前向接缝：agent
 *    记忆波物化时恢复（isMemoryDirectory 的 '/agent-memory/' 纯字符串
 *    支无域依赖，保留逐字）。
 *  - getAutoMemPath / isAutoMemPath projectRoot 参缺省面（memory/paths 域
 *    既有裁定，非本波裁）：旧仓全局 project root = bootstrap getProjectRoot
 *    （.git 上探 worktree 感知）；新仓 memory 域断 bootstrap 依赖（paths.ts
 *    头注：改为 projectRoot 参，缺省 process.cwd()，canonical git root
 *    恢复 = git 域迁移 TODO 前向接缝）→ 本文件调用点零参走域缺省
 *    （isAutoMemPath(filePath) / getAutoMemPath()），.git 上探差 = 域登记
 *    TODO 继承，不重复实现第三份上探。
 *  - import 重指：memdir/paths → ./paths（4 函数 memory 域既有）/
 *    envUtils → ./envUtils（getAtlasConfigHomeDir 域内既有）/
 *    windowsPaths → shared（§8.55 S-C2 提升，memory + bash 双消费）。
 */
import { normalize, posix, win32 } from 'path'
import { getAtlasConfigHomeDir } from './envUtils'
import {
  getAutoMemPath,
  getMemoryBaseDir,
  isAutoMemoryEnabled,
  isAutoMemPath,
} from './paths'
import { posixPathToWindowsPath, windowsPathToPosixPath } from '../shared'

const IS_WINDOWS = process.platform === 'win32'

// Normalize path separators to posix (/). Does NOT translate drive encoding.
function toPosix(p: string): string {
  return p.split(win32.sep).join(posix.sep)
}

// Convert a path to a stable string-comparable form: forward-slash separated,
// and on Windows, lowercased (Windows filesystems are case-insensitive).
function toComparable(p: string): string {
  const posixForm = toPosix(p)
  return IS_WINDOWS ? posixForm.toLowerCase() : posixForm
}

/**
 * Detects if a file path is a session-related file under ~/.atlas.
 * Returns the type of session file or null if not a session file.
 */
export function detectSessionFileType(
  filePath: string,
): 'session_memory' | 'session_transcript' | null {
  const configDir = getAtlasConfigHomeDir()
  // Compare in forward-slash form; on Windows also case-fold. The caller
  // (isShellCommandTargetingMemory) converts MinGW /c/... → native before
  // reaching here, so we only need separator + case normalization.
  const normalized = toComparable(filePath)
  const configDirCmp = toComparable(configDir)
  if (!normalized.startsWith(configDirCmp)) {
    return null
  }
  if (normalized.includes('/session-memory/') && normalized.endsWith('.md')) {
    return 'session_memory'
  }
  if (normalized.includes('/projects/') && normalized.endsWith('.jsonl')) {
    return 'session_transcript'
  }
  return null
}

/**
 * Checks if a glob/pattern string indicates session file access intent.
 * Used for Grep/Glob tools where we check patterns, not actual file paths.
 */
export function detectSessionPatternType(
  pattern: string,
): 'session_memory' | 'session_transcript' | null {
  const normalized = pattern.split(win32.sep).join(posix.sep)
  if (
    normalized.includes('session-memory') &&
    (normalized.includes('.md') || normalized.endsWith('*'))
  ) {
    return 'session_memory'
  }
  if (
    normalized.includes('.jsonl') ||
    (normalized.includes('projects') && normalized.includes('*.jsonl'))
  ) {
    return 'session_transcript'
  }
  return null
}

/**
 * Check if a file path is within the memdir directory.
 */
export function isAutoMemFile(filePath: string): boolean {
  if (isAutoMemoryEnabled()) {
    // projectRoot 缺省面（memory/paths 域裁定，见头注 delta）
    return isAutoMemPath(filePath)
  }
  return false
}

export type MemoryScope = 'personal' | 'team'

/**
 * Determine which memory store (if any) a path belongs to.
 *
 * Team dir is a subdirectory of memdir (getTeamMemPath = join(getAutoMemPath, 'team')),
 * so a team path matches both isTeamMemFile and isAutoMemFile. Check team first.
 *
 * Use this for scope-keyed telemetry where a single event name distinguishes
 * by scope field — the existing atlas_memdir_* / atlas_team_mem_* event-name
 * hierarchy handles the overlap differently (team writes intentionally fire both).
 */
export function memoryScopeForPath(filePath: string): MemoryScope | null {
  // delta（C 组裁定）：TEAMMEM team 支裁（feature 恒 false + teamMemPaths
  // 域不随迁，见头注）——'team' 值随 team-memory 波恢复。
  if (isAutoMemFile(filePath)) {
    return 'personal'
  }
  return null
}

/**
 * Check if a file is a Claude-managed memory file (NOT user-managed instruction files).
 * Includes: auto-memory (memdir), agent memory, session memory/transcripts.
 * Excludes: ATLAS.md, ATLAS.local.md, .claude/rules/*.md (user-managed).
 *
 * Use this for collapse/badge logic where user-managed files should show full diffs.
 */
export function isAutoManagedMemoryFile(filePath: string): boolean {
  if (isAutoMemFile(filePath)) {
    return true
  }
  // delta（C 组裁定）：TEAMMEM team 支 + isAgentMemFile（isAgentMemoryPath）
  // 单调用点裁（域未物化，见头注前向接缝）。
  if (detectSessionFileType(filePath) !== null) {
    return true
  }
  return false
}

// Check if a directory path is a memory-related directory.
// Used by Grep/Glob which take a directory `path` rather than a specific file.
// Checks both configDir and memoryBaseDir to handle custom memory dir paths.
export function isMemoryDirectory(dirPath: string): boolean {
  // SECURITY: Normalize to prevent path traversal bypasses via .. segments.
  // On Windows this produces backslashes; toComparable flips them back for
  // string matching. MinGW /c/... paths are converted to native before
  // reaching here (extraction-time in isShellCommandTargetingMemory), so
  // normalize() never sees them.
  const normalizedPath = normalize(dirPath)
  const normalizedCmp = toComparable(normalizedPath)
  // Agent memory directories can be under cwd (project scope), configDir, or memoryBaseDir
  if (
    isAutoMemoryEnabled() &&
    (normalizedCmp.includes('/agent-memory/') ||
      normalizedCmp.includes('/agent-memory-local/'))
  ) {
    return true
  }
  // Team memory directories live under <autoMemPath>/team/
  // delta（C 组裁定）：TEAMMEM 块裁（feature 恒 false，见头注）。
  // Check the auto-memory path override (ATLAS_COWORK_MEMORY_PATH_OVERRIDE)
  if (isAutoMemoryEnabled()) {
    const autoMemPath = getAutoMemPath()
    const autoMemDirCmp = toComparable(autoMemPath.replace(/[/\\]+$/, ''))
    const autoMemPathCmp = toComparable(autoMemPath)
    if (
      normalizedCmp === autoMemDirCmp ||
      normalizedCmp.startsWith(autoMemPathCmp)
    ) {
      return true
    }
  }

  const configDirCmp = toComparable(getAtlasConfigHomeDir())
  const memoryBaseCmp = toComparable(getMemoryBaseDir())
  const underConfig = normalizedCmp.startsWith(configDirCmp)
  const underMemoryBase = normalizedCmp.startsWith(memoryBaseCmp)

  if (!underConfig && !underMemoryBase) {
    return false
  }
  if (normalizedCmp.includes('/session-memory/')) {
    return true
  }
  if (underConfig && normalizedCmp.includes('/projects/')) {
    return true
  }
  if (isAutoMemoryEnabled() && normalizedCmp.includes('/memory/')) {
    return true
  }
  return false
}

/**
 * Check if a shell command string (Bash or PowerShell) targets memory files
 * by extracting absolute path tokens and checking them against memory
 * detection functions. Used for Bash/PowerShell grep/search commands in the
 * collapse logic.
 */
export function isShellCommandTargetingMemory(command: string): boolean {
  const configDir = getAtlasConfigHomeDir()
  const memoryBase = getMemoryBaseDir()
  const autoMemDir = isAutoMemoryEnabled()
    ? getAutoMemPath().replace(/[/\\]+$/, '')
    : ''

  // Quick check: does the command mention the config, memory base, or
  // auto-mem directory? Compare in forward-slash form (PowerShell on Windows
  // may use either separator while configDir uses the platform-native one).
  // On Windows also check the MinGW form (/c/...) since BashTool runs under
  // Git Bash which emits that encoding. On Linux/Mac, configDir is already
  // posix so only one form to check — and crucially, windowsPathToPosixPath
  // is NOT called, so Linux paths like /m/foo aren't misinterpreted as MinGW.
  const commandCmp = toComparable(command)
  const dirs = [configDir, memoryBase, autoMemDir].filter(Boolean)
  const matchesAnyDir = dirs.some(d => {
    if (commandCmp.includes(toComparable(d))) return true
    if (IS_WINDOWS) {
      // BashTool on Windows (Git Bash) emits /c/Users/... — check MinGW form too
      return commandCmp.includes(windowsPathToPosixPath(d).toLowerCase())
    }
    return false
  })
  if (!matchesAnyDir) {
    return false
  }

  // Extract absolute path-like tokens. Matches Unix absolute paths (/foo/bar),
  // Windows drive-letter paths (C:\foo, C:/foo), and MinGW paths (/c/foo —
  // they're /-prefixed so the regex already captures them). Bare backslash
  // tokens (\foo) are intentionally excluded — they appear in regex/grep
  // patterns and would cause false-positive memory classification after
  // normalization flips backslashes to forward slashes.
  const matches = command.match(/(?:[A-Za-z]:[/\\]|\/)[^\s'"]+/g)
  if (!matches) {
    return false
  }

  for (const match of matches) {
    // Strip trailing shell metacharacters that could be adjacent to a path
    const cleanPath = match.replace(/[,;|&>]+$/, '')
    // On Windows, convert MinGW /c/... → native C:\... at this single
    // point. Downstream predicates (isAutoManagedMemoryFile, isMemoryDirectory,
    // isAutoMemPath, isAgentMemoryPath) then receive native paths and only
    // need toComparable() for matching. On other platforms, paths are already
    // native — no conversion, so /m/foo etc. pass through unmodified.
    const nativePath = IS_WINDOWS
      ? posixPathToWindowsPath(cleanPath)
      : cleanPath
    if (isAutoManagedMemoryFile(nativePath) || isMemoryDirectory(nativePath)) {
      return true
    }
  }

  return false
}

// Check if a glob/pattern targets auto-managed memory files only.
// Excludes ATLAS.md, ATLAS.local.md, .claude/rules/ (user-managed).
// Used for collapse badge logic where user-managed files should not be
// counted as "memory" operations.
export function isAutoManagedMemoryPattern(pattern: string): boolean {
  if (detectSessionPatternType(pattern) !== null) {
    return true
  }
  if (
    isAutoMemoryEnabled() &&
    (pattern.replace(/\\/g, '/').includes('agent-memory/') ||
      pattern.replace(/\\/g, '/').includes('agent-memory-local/'))
  ) {
    return true
  }
  return false
}
