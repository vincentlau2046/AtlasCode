/**
 * Team memory 判定 / 摘要面（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/teamMemoryOps.ts（88L 逐字）+ 旧
 * memdir/teamMemPaths.ts isTeamMemFile/isTeamMemPath/isTeamMemoryEnabled
 * 判定链（新仓 memory 域 team-memory 支未落——memoryFileDetection delta
 * 「TEAMMEM team 支裁」→ 判定链经 memory 域门面组合域内重建）。
 *
 * import 面重映射：
 *   - FILE_EDIT_TOOL_NAME/FILE_WRITE_TOOL_NAME → engine 域根门面
 *     （engine/tools/toolNames 单一事实源，旧 tools 域内常量面）
 *   - isTeamMemFile 判定链 = 域内本地（isAutoMemoryEnabled/getAutoMemPath
 *     经 memory 域门面）
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 旧 isTeamMemoryEnabled 的 getFeatureValue_CACHED_MAY_BE_STALE
 *     ('atlas_herring_clock') GrowthBook 门裁除（新仓无 GrowthBook 门控面，
 *     feature vs GrowthBook 分离裁定 R3b 同型）→ 判定 = isAutoMemoryEnabled
 *     单条件。
 */
import { join, resolve, sep } from 'path'
import { getAutoMemPath, isAutoMemoryEnabled } from '../memory'
import { FILE_EDIT_TOOL_NAME, FILE_WRITE_TOOL_NAME } from '../engine'

/**
 * Team memory 是否启用（重建 ①：GrowthBook 门裁除，登记见头注）。
 */
function isTeamMemoryEnabled(): boolean {
  return isAutoMemoryEnabled()
}

/**
 * Team memory 路径：&lt;memoryBase&gt;/projects/&lt;sanitized-project-root&gt;/memory/team/
 * 为 auto-memory 目录子目录，按项目作用域。（旧 teamMemPaths 逐字式。）
 */
function getTeamMemPath(): string {
  return (join(getAutoMemPath(), 'team') + sep).normalize('NFC')
}

/**
 * Check if a file path is within the team memory directory
 * and team memory is enabled.
 */
export function isTeamMemFile(filePath: string): boolean {
  return isTeamMemoryEnabled() && isTeamMemPath(filePath)
}

/**
 * 路径判定（旧 teamMemPaths L214-219 逐字）。
 */
function isTeamMemPath(filePath: string): boolean {
  // SECURITY: resolve() converts to absolute and eliminates .. segments,
  // preventing path traversal attacks (e.g. "team/../../etc/passwd")
  const resolvedPath = resolve(filePath)
  const teamDir = getTeamMemPath()
  return resolvedPath.startsWith(teamDir)
}

/**
 * Check if a search tool use targets team memory files by examining its path.
 */
export function isTeamMemorySearch(toolInput: unknown): boolean {
  const input = toolInput as
    | { path?: string; pattern?: string; glob?: string }
    | undefined
  if (!input) {
    return false
  }
  if (input.path && isTeamMemFile(input.path)) {
    return true
  }
  return false
}

/**
 * Check if a Write or Edit tool use targets a team memory file.
 */
export function isTeamMemoryWriteOrEdit(
  toolName: string,
  toolInput: unknown,
): boolean {
  if (toolName !== FILE_WRITE_TOOL_NAME && toolName !== FILE_EDIT_TOOL_NAME) {
    return false
  }
  const input = toolInput as { file_path?: string; path?: string } | undefined
  const filePath = input?.file_path ?? input?.path
  return filePath !== undefined && isTeamMemFile(filePath)
}

/**
 * Append team memory summary parts to the parts array.
 * Encapsulates all team memory verb/string logic for getSearchReadSummaryText.
 *（消费面 = spinner/status 文案 TUI 波；本波零活消费者 = 惰性接缝登记。）
 */
export function appendTeamMemorySummaryParts(
  memoryCounts: {
    teamMemoryReadCount?: number
    teamMemorySearchCount?: number
    teamMemoryWriteCount?: number
  },
  isActive: boolean,
  parts: string[],
): void {
  const teamReadCount = memoryCounts.teamMemoryReadCount ?? 0
  const teamSearchCount = memoryCounts.teamMemorySearchCount ?? 0
  const teamWriteCount = memoryCounts.teamMemoryWriteCount ?? 0
  if (teamReadCount > 0) {
    const verb = isActive
      ? parts.length === 0
        ? 'Recalling'
        : 'recalling'
      : parts.length === 0
        ? 'Recalled'
        : 'recalled'
    parts.push(
      `${verb} ${teamReadCount} team ${teamReadCount === 1 ? 'memory' : 'memories'}`,
    )
  }
  if (teamSearchCount > 0) {
    const verb = isActive
      ? parts.length === 0
        ? 'Searching'
        : 'searching'
      : parts.length === 0
        ? 'Searched'
        : 'searched'
    parts.push(`${verb} team memories`)
  }
  if (teamWriteCount > 0) {
    const verb = isActive
      ? parts.length === 0
        ? 'Writing'
        : 'writing'
      : parts.length === 0
        ? 'Wrote'
        : 'wrote'
    parts.push(
      `${verb} ${teamWriteCount} team ${teamWriteCount === 1 ? 'memory' : 'memories'}`,
    )
  }
}
