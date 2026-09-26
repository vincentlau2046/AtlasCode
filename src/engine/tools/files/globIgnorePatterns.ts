/**
 * engine/tools/files — Glob ignore-pattern 面（§8.55 S-C2「ignore 2 函数
 * 随迁」，旧仓 src/utils/permissions/filesystem.ts 1781L 的 Glob 依赖闭包
 * 裁面随迁：normalizePatternsToPath + getFileReadIgnorePatterns 两导出 +
 * 私有闭包 4 函数）。
 *
 * 落点裁定：旧仓此 6 函数住 permissions 域，但新仓层序禁 permissions
 * import engine（ruleMatching 头注 L330/L394 裁定）而闭包需
 * getSettingsRootPathForSource（engine/config 面）+ FILE_READ/EDIT_TOOL_NAME
 * （engine/tools 面）→ 随唯一消费者（GlobTool glob()）落 files 域，
 * 从 permissions 门面取规则树面（getRuleByContentsForToolName，E-4 已迁）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - FILE_READ/FILE_EDIT_TOOL_NAME → ../toolNames（engine/tools 既有单一
 *    事实源，旧仓自 tools/*Tool/prompt.js 各取）。
 *  - rootPathForSource settings 支 → engine/config/settings
 *    getSettingsRootPathForSource（新仓语义裁定面：project/local 根 =
 *    process.cwd()，旧仓 settings 域同语义）；session 支 getOriginalCwd →
 *    bootstrap（新仓既有）。
 *  - 旧仓同文件其余面（checkReadPermissionForTool 等规则求值族）E-4 已迁
 *    permissions 域，不在此重复；本文件仅 glob() 消费闭包。
 */
import { homedir } from 'os'
import { posix } from 'path'
import { getOriginalCwd } from '../../../bootstrap'
import { getSettingsRootPathForSource } from '../../config/settings'
import {
  getRuleByContentsForToolName,
  type PermissionRule,
  type PermissionRuleSource,
} from '../../../permissions'
import {
  expandPath,
  getPlatform,
  type ToolPermissionContext,
} from '../../../shared'
import { FILE_EDIT_TOOL_NAME, FILE_READ_TOOL_NAME } from '../toolNames'

const DIR_SEP = posix.sep

function prependDirSep(path: string): string {
  return posix.join(DIR_SEP, path)
}

function normalizePatternToPath({
  patternRoot,
  pattern,
  rootPath,
}: {
  patternRoot: string
  pattern: string
  rootPath: string
}): string | null {
  // If the pattern root + pattern combination starts with our reference root
  const fullPattern = posix.join(patternRoot, pattern)
  if (patternRoot === rootPath) {
    // If the pattern root exactly matches our reference root no need to change
    return prependDirSep(pattern)
  } else if (fullPattern.startsWith(`${rootPath}${DIR_SEP}`)) {
    // Extract the relative part
    const relativePart = fullPattern.slice(rootPath.length)
    return prependDirSep(relativePart)
  } else {
    // Handle patterns that are inside the reference root but not starting with it
    const relativePath = posix.relative(rootPath, patternRoot)
    if (
      !relativePath ||
      relativePath.startsWith(`..${DIR_SEP}`) ||
      relativePath === '..'
    ) {
      // Pattern is outside the reference root, so it can be skipped
      return null
    } else {
      const relativePattern = posix.join(relativePath, pattern)
      return prependDirSep(relativePattern)
    }
  }
}

function patternWithRoot(
  pattern: string,
  source: PermissionRuleSource,
): {
  relativePattern: string
  root: string | null
} {
  if (pattern.startsWith(`${DIR_SEP}${DIR_SEP}`)) {
    // Patterns starting with // resolve relative to /
    const patternWithoutDoubleSlash = pattern.slice(1)

    // On Windows, check if this is a POSIX-style drive path like //c/Users/...
    // Note: UNC paths (//server/share) will not match this regex and will be
    // treated as root-relative patterns, which may need separate handling in
    // the future
    if (
      getPlatform() === 'windows' &&
      patternWithoutDoubleSlash.match(/^\/[a-z]\//i)
    ) {
      // Convert POSIX path to Windows format
      // The pattern is like /c/Users/... so we convert it to C:\Users\...
      const driveLetter = patternWithoutDoubleSlash[1]?.toUpperCase() ?? 'C'
      // Keep the pattern in POSIX format since relativePath returns POSIX paths
      const pathAfterDrive = patternWithoutDoubleSlash.slice(2)

      // Extract the drive root (C:\) and the rest of the pattern
      const driveRoot = `${driveLetter}:\\`
      const relativeFromDrive = pathAfterDrive.startsWith('/')
        ? pathAfterDrive.slice(1)
        : pathAfterDrive

      return {
        relativePattern: relativeFromDrive,
        root: driveRoot,
      }
    }

    return {
      relativePattern: patternWithoutDoubleSlash,
      root: DIR_SEP,
    }
  } else if (pattern.startsWith(`~${DIR_SEP}`)) {
    // Patterns starting with ~/ resolve relative to homedir
    return {
      relativePattern: pattern.slice(1),
      root: homedir().normalize('NFC'),
    }
  } else if (pattern.startsWith(DIR_SEP)) {
    // Patterns starting with / resolve relative to the directory where settings are stored (without getConfigDirName()/)
    return {
      relativePattern: pattern,
      root: rootPathForSource(source),
    }
  }
  // No root specified, put it with all the other patterns
  // Normalize patterns that start with "./" to remove the prefix
  // This ensures that patterns like "./.env" match files like ".env"
  let normalizedPattern = pattern
  if (pattern.startsWith(`.${DIR_SEP}`)) {
    normalizedPattern = pattern.slice(2)
  }
  return {
    relativePattern: normalizedPattern,
    root: null,
  }
}

function rootPathForSource(source: PermissionRuleSource): string {
  switch (source) {
    case 'cliArg':
    case 'command':
    case 'session':
      // delta（§8.55 S-C1 先例）：新 shared expandPath(path, baseDir) 双参必填；
      // 旧仓缺省 baseDir = 调用时 cwd。getOriginalCwd() 恒绝对路径 → expand
      // 恒等，baseDir 传其自身语义保真（任何 base 下结果相同）。
      return expandPath(getOriginalCwd(), getOriginalCwd())
    case 'userSettings':
    case 'policySettings':
    case 'projectSettings':
    case 'localSettings':
    case 'flagSettings':
      return getSettingsRootPathForSource(source)
  }
}

function getPatternsByRoot(
  toolPermissionContext: ToolPermissionContext,
  toolType: 'edit' | 'read',
  behavior: 'allow' | 'deny' | 'ask',
): Map<string | null, Map<string, PermissionRule>> {
  const toolName = (() => {
    switch (toolType) {
      case 'edit':
        // Apply Edit tool rules to any tool editing files
        return FILE_EDIT_TOOL_NAME
      case 'read':
        // Apply Read tool rules to any tool reading files
        return FILE_READ_TOOL_NAME
    }
  })()

  const rules = getRuleByContentsForToolName(
    toolPermissionContext,
    toolName,
    behavior,
  )
  // Resolve rules relative to path based on source
  const patternsByRoot = new Map<string | null, Map<string, PermissionRule>>()
  for (const [pattern, rule] of rules.entries()) {
    const { relativePattern, root } = patternWithRoot(pattern, rule.source)
    let patternsForRoot = patternsByRoot.get(root)
    if (patternsForRoot === undefined) {
      patternsForRoot = new Map<string, PermissionRule>()
      patternsByRoot.set(root, patternsForRoot)
    }
    // Store the rule keyed by the root
    patternsForRoot.set(relativePattern, rule)
  }
  return patternsByRoot
}

export function normalizePatternsToPath(
  patternsByRoot: Map<string | null, string[]>,
  root: string,
): string[] {
  // null root means the pattern can match anywhere
  const result = new Set(patternsByRoot.get(null) ?? [])

  for (const [patternRoot, patterns] of patternsByRoot.entries()) {
    if (patternRoot === null) {
      // already added
      continue
    }

    // Check each pattern to see if the full path starts with our reference root
    for (const pattern of patterns) {
      const normalizedPattern = normalizePatternToPath({
        patternRoot,
        pattern,
        rootPath: root,
      })
      if (normalizedPattern) {
        result.add(normalizedPattern)
      }
    }
  }
  return Array.from(result)
}

/**
 * Collects all deny rules for file read permissions and returns their ignore patterns
 * Each pattern must be resolved relative to its root (map key)
 * Null keys are used for patterns that don't have a root
 *
 * This is used to hide files that are blocked by Read deny rules.
 *
 * @param toolPermissionContext
 */
export function getFileReadIgnorePatterns(
  toolPermissionContext: ToolPermissionContext,
): Map<string | null, string[]> {
  const patternsByRoot = getPatternsByRoot(
    toolPermissionContext,
    'read',
    'deny',
  )
  const result = new Map<string | null, string[]>()
  for (const [patternRoot, patternMap] of patternsByRoot.entries()) {
    result.set(patternRoot, Array.from(patternMap.keys()))
  }

  return result
}
