import { feature } from 'src/shared'
import memoize from 'lodash-es/memoize.js'
import {
  getAdditionalDirectoriesForClaudeMd,
  setCachedClaudeMdContent,
} from 'src/tui/bootstrapState.js'
import { getLocalISODate } from './constants/common.js'
import {
  filterInjectedMemoryFiles,
  getClaudeMds,
  getMemoryFiles,
} from './utils/memoryFiles.js'
import { logForDiagnosticsNoPII } from './utils/diagLogs.js'
import { isBareMode, isEnvTruthy } from './utils/envUtils.js'
import { execFileNoThrow } from './utils/execFileNoThrow.js'
import { getBranch, getDefaultBranch, getIsGit, gitExe } from './utils/git.js'
import { shouldIncludeGitInstructions } from './utils/gitSettings.js'
import { logError } from './utils/log.js'

const MAX_STATUS_CHARS = 2000

// System prompt injection for cache breaking (ant-only, ephemeral debugging state)
let systemPromptInjection: string | null = null

export function getSystemPromptInjection(): string | null {
  return systemPromptInjection
}

export function setSystemPromptInjection(value: string | null): void {
  systemPromptInjection = value
  // Clear context caches immediately when injection changes
  getUserContext.cache.clear?.()
  getSystemContext.cache.clear?.()
}

/**
 * git status 结构化块（0.1.69 D-5：session 起始快照 / 当前态两文案面共享，
 * 变更判定锚 = 块 JSON 同一性）。
 */
export interface GitStatusBlocks {
  branch: string
  mainBranch: string
  /** git status --short（2k 截断）；空串 = clean。 */
  status: string
  log: string
  userName: string
}

async function fetchGitStatusBlocks(): Promise<GitStatusBlocks | null> {
  if (process.env.NODE_ENV === 'test') {
    // Avoid cycles in tests
    return null
  }

  const startTime = Date.now()
  logForDiagnosticsNoPII('info', 'git_status_started')

  const isGitStart = Date.now()
  const isGit = await getIsGit()
  logForDiagnosticsNoPII('info', 'git_is_git_check_completed', {
    duration_ms: Date.now() - isGitStart,
    is_git: isGit,
  })

  if (!isGit) {
    logForDiagnosticsNoPII('info', 'git_status_skipped_not_git', {
      duration_ms: Date.now() - startTime,
    })
    return null
  }

  try {
    const gitCmdsStart = Date.now()
    const [branch, mainBranch, status, log, userName] = await Promise.all([
      getBranch(),
      getDefaultBranch(),
      execFileNoThrow(gitExe(), ['--no-optional-locks', 'status', '--short'], {
        preserveOutputOnError: false,
      }).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(
        gitExe(),
        ['--no-optional-locks', 'log', '--oneline', '-n', '5'],
        {
          preserveOutputOnError: false,
        },
      ).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(gitExe(), ['config', 'user.name'], {
        preserveOutputOnError: false,
      }).then(({ stdout }) => stdout.trim()),
    ])

    logForDiagnosticsNoPII('info', 'git_commands_completed', {
      duration_ms: Date.now() - gitCmdsStart,
      status_length: status.length,
    })

    // Check if status exceeds character limit
    const truncatedStatus =
      status.length > MAX_STATUS_CHARS
        ? status.substring(0, MAX_STATUS_CHARS) +
          '\n... (truncated because it exceeds 2k characters. If you need more information, run "git status" using BashTool)'
        : status

    logForDiagnosticsNoPII('info', 'git_status_completed', {
      duration_ms: Date.now() - startTime,
      truncated: status.length > MAX_STATUS_CHARS,
    })

    return { branch, mainBranch, status: truncatedStatus, log, userName }
  } catch (error) {
    logForDiagnosticsNoPII('error', 'git_status_failed', {
      duration_ms: Date.now() - startTime,
    })
    logError(error)
    return null
  }
}

/** session 起始快照文案（修前逐字节恒等 = 零回归锚）。 */
const GIT_STATUS_START_HEADER =
  'This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.'

/** 0.1.69 D-5：当前态重注文案（取代 session 起始快照）。 */
const GIT_STATUS_FRESH_HEADER =
  'This is the current git status, re-injected after context compaction. It reflects the working tree as of now and supersedes any earlier session-start snapshot.'

function formatGitStatus(blocks: GitStatusBlocks, header: string): string {
  return [
    header,
    `Current branch: ${blocks.branch}`,
    `Main branch (you will usually use this for PRs): ${blocks.mainBranch}`,
    ...(blocks.userName ? [`Git user: ${blocks.userName}`] : []),
    `Status:\n${blocks.status || '(clean)'}`,
    `Recent commits:\n${blocks.log}`,
  ].join('\n\n')
}

/** 0.1.69 D-5：session 起始快照块（null = 非 git / 测试 env / 尚未抓取）。 */
let sessionStartGitStatusBlocks: GitStatusBlocks | null = null

export const getGitStatus = memoize(async (): Promise<string | null> => {
  const blocks = await fetchGitStatusBlocks()
  if (!blocks) return null
  // 0.1.69 D-5：留 session 起始快照块（post-compact 重注变更判定锚；
  // post-compact reset 清单不清 getGitStatus memo → 基线 = 真 session 起始态）
  sessionStartGitStatusBlocks = blocks
  return formatGitStatus(blocks, GIT_STATUS_START_HEADER)
})

/** 0.1.69 D-5：当前态 git status（非 memoized；post-compact 重注面）。 */
export function getGitStatusFresh(): Promise<
  { text: string; blocks: GitStatusBlocks } | null
> {
  return fetchGitStatusBlocks().then(blocks =>
    blocks
      ? { text: formatGitStatus(blocks, GIT_STATUS_FRESH_HEADER), blocks }
      : null,
  )
}

/** 0.1.69 D-5：session 起始快照块读取面（变更判定；未抓取 = null = 不注）。 */
export function getSessionStartGitStatusBlocks(): GitStatusBlocks | null {
  return sessionStartGitStatusBlocks
}

/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
export const getSystemContext = memoize(
  async (): Promise<{
    [k: string]: string
  }> => {
    const startTime = Date.now()
    logForDiagnosticsNoPII('info', 'system_context_started')

    // Skip git status in CCR (unnecessary overhead on resume) or when git instructions are disabled
    const gitStatus =
      isEnvTruthy((process.env.ATLAS_REMOTE)) ||
      !shouldIncludeGitInstructions()
        ? null
        : await getGitStatus()

    // Include system prompt injection if set (for cache breaking, ant-only)
    const injection = feature('BREAK_CACHE_COMMAND')
      ? getSystemPromptInjection()
      : null

    logForDiagnosticsNoPII('info', 'system_context_completed', {
      duration_ms: Date.now() - startTime,
      has_git_status: gitStatus !== null,
      has_injection: injection !== null,
    })

    return {
      ...(gitStatus && { gitStatus }),
      ...(feature('BREAK_CACHE_COMMAND') && injection
        ? {
            cacheBreaker: `[CACHE_BREAKER: ${injection}]`,
          }
        : {}),
    }
  },
)

/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
export const getUserContext = memoize(
  async (): Promise<{
    [k: string]: string
  }> => {
    const startTime = Date.now()
    logForDiagnosticsNoPII('info', 'user_context_started')

    // ATLAS_DISABLE_MDS: hard off, always.
    // --bare: skip auto-discovery (cwd walk), BUT honor explicit --add-dir.
    // --bare means "skip what I didn't ask for", not "ignore what I asked for".
    const shouldDisableClaudeMd =
      isEnvTruthy((process.env.ATLAS_DISABLE_MDS)) ||
      (isBareMode() && getAdditionalDirectoriesForClaudeMd().length === 0)
    // Await the async I/O (readFile/readdir directory walk) so the event
    // loop yields naturally at the first fs.readFile.
    const claudeMd = shouldDisableClaudeMd
      ? null
      : getClaudeMds(filterInjectedMemoryFiles(await getMemoryFiles()))
    // Cache for the auto-mode classifier (yoloClassifier.ts reads this
    // instead of importing memoryFiles.ts directly, which would create a
    // cycle through permissions/filesystem → permissions → yoloClassifier).
    setCachedClaudeMdContent(claudeMd || null)

    logForDiagnosticsNoPII('info', 'user_context_completed', {
      duration_ms: Date.now() - startTime,
      claudemd_length: claudeMd?.length ?? 0,
      claudemd_disabled: Boolean(shouldDisableClaudeMd),
    })

    return {
      ...(claudeMd && { claudeMd }),
      currentDate: `Today's date is ${getLocalISODate()}.`,
    }
  },
)
