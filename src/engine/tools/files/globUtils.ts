/**
 * engine/tools/files — Glob 搜索面（§8.55 S-C2，旧仓 src/utils/glob.ts
 * 132L 逐字随迁；delta 仅 import 重指 + 1 处插件排除裁，函数体逐字不变）。
 *
 * 消费面：GlobTool 本体（S-C4 随迁）`glob(filePattern, cwd, {limit,
 * offset}, abortSignal, toolPermissionContext)`。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - getGlobExclusionsForPluginCache（旧仓 utils/plugins/orphanedPluginFilter
 *    孤儿插件版本目录排除）裁——新仓无 plugins 域 / 孤儿插件缓存目录
 *    （plugin 市场波未物化），glob 排除循环同裁。前向接缝：plugin 波
 *    物化时恢复。
 *  - ripGrep → sandbox 门面（B 波随迁裁剪版：system rg / 超时 / EAGAIN
 *    重试口径照旧仓）。
 *  - getFileReadIgnorePatterns / normalizePatternsToPath → ./globIgnorePatterns
 *    （§8.55 S-C2「ignore 2 函数随迁」，旧仓 permissions 域闭包裁面）。
 *  - ToolPermissionContext / getPlatform / isEnvTruthy → shared（新仓
 *    types-session 冻结面 + C1 叶子下沉面）。
 *  - ATLAS_GLOB_NO_IGNORE / ATLAS_GLOB_HIDDEN env 名冻结（ATLAS_ 前缀
 *    统一 2026-09-17），语义逐字（|| 'true' 空串 = 未设 → 默认开）。
 *  - 逐字怪癖登记（勿当缺陷修复，func 测固化可观察面）：
 *    ① isEnvTruthy(env) || 'true' 恒真 → 两 env 实为 no-op（旧仓注释
 *       「set ...=false to exclude」陈旧，'false' → false || 'true' 仍启用）；
 *    ② rg 14.x 实测否定 glob 怪癖：`--glob !sub/**` 不排除子树，
 *       `--glob !sub` 排整子树（globset 否定支版本特异）。
 */
import { basename, dirname, isAbsolute, join, sep } from 'path'
import type { ToolPermissionContext } from '../../../shared'
import { getPlatform, isEnvTruthy } from '../../../shared'
import { ripGrep } from '../../../sandbox'
import {
  getFileReadIgnorePatterns,
  normalizePatternsToPath,
} from './globIgnorePatterns'

/**
 * Extracts the static base directory from a glob pattern.
 * The base directory is everything before the first glob special character (* ? [ {).
 * Returns the directory portion and the remaining relative pattern.
 */
export function extractGlobBaseDirectory(pattern: string): {
  baseDir: string
  relativePattern: string
} {
  // Find the first glob special character: *, ?, [, {
  const globChars = /[*?[{]/
  const match = pattern.match(globChars)

  if (!match || match.index === undefined) {
    // No glob characters - this is a literal path
    // Return the directory portion and filename as pattern
    const dir = dirname(pattern)
    const file = basename(pattern)
    return { baseDir: dir, relativePattern: file }
  }

  // Get everything before the first glob character
  const staticPrefix = pattern.slice(0, match.index)

  // Find the last path separator in the static prefix
  const lastSepIndex = Math.max(
    staticPrefix.lastIndexOf('/'),
    staticPrefix.lastIndexOf(sep),
  )

  if (lastSepIndex === -1) {
    // No path separator before the glob - pattern is relative to cwd
    return { baseDir: '', relativePattern: pattern }
  }

  let baseDir = staticPrefix.slice(0, lastSepIndex)
  const relativePattern = pattern.slice(lastSepIndex + 1)

  // Handle root directory patterns (e.g., /*.txt on Unix or C:/*.txt on Windows)
  // When lastSepIndex is 0, baseDir is empty but we need to use '/' as the root
  if (baseDir === '' && lastSepIndex === 0) {
    baseDir = '/'
  }

  // Handle Windows drive root paths (e.g., C:/*.txt)
  // 'C:' means "current directory on drive C" (relative), not root
  // We need 'C:/' or 'C:\' for the actual drive root
  if (getPlatform() === 'windows' && /^[A-Za-z]:$/.test(baseDir)) {
    baseDir = baseDir + sep
  }

  return { baseDir, relativePattern }
}

export async function glob(
  filePattern: string,
  cwd: string,
  { limit, offset }: { limit: number; offset: number },
  abortSignal: AbortSignal,
  toolPermissionContext: ToolPermissionContext,
): Promise<{ files: string[]; truncated: boolean }> {
  let searchDir = cwd
  let searchPattern = filePattern

  // Handle absolute paths by extracting the base directory and converting to relative pattern
  // ripgrep's --glob flag only works with relative patterns
  if (isAbsolute(filePattern)) {
    const { baseDir, relativePattern } = extractGlobBaseDirectory(filePattern)
    if (baseDir) {
      searchDir = baseDir
      searchPattern = relativePattern
    }
  }

  const ignorePatterns = normalizePatternsToPath(
    getFileReadIgnorePatterns(toolPermissionContext),
    searchDir,
  )

  // Use ripgrep for better memory performance
  // --files: list files instead of searching content
  // --glob: filter by pattern
  // --sort=modified: sort by modification time (oldest first)
  // --no-ignore: don't respect .gitignore (default true, set ATLAS_GLOB_NO_IGNORE=false to respect .gitignore)
  // --hidden: include hidden files (default true, set ATLAS_GLOB_HIDDEN=false to exclude)
  // Note: use || instead of ?? to treat empty string as unset (defaulting to true)
  const noIgnore = isEnvTruthy(process.env.ATLAS_GLOB_NO_IGNORE) || 'true'
  const hidden = isEnvTruthy(process.env.ATLAS_GLOB_HIDDEN) || 'true'
  const args = [
    '--files',
    '--glob',
    searchPattern,
    // NOTE: --sort=modified is dropped — the vendored WASM ripgrep
    // rejects it ("sorting by last modified isn't supported on this
    // platform"). Omit it so glob listing works.
    ...(noIgnore ? ['--no-ignore'] : []),
    ...(hidden ? ['--hidden'] : []),
  ]

  // Add ignore patterns
  for (const pattern of ignorePatterns) {
    args.push('--glob', `!${pattern}`)
  }

  // delta（C 组裁定）：getGlobExclusionsForPluginCache 孤儿插件排除循环
  // 裁（新仓无 plugins 域，见头注前向接缝）。

  const allPaths = await ripGrep(args, searchDir, abortSignal)

  // ripgrep returns relative paths, convert to absolute
  const absolutePaths = allPaths.map(p =>
    isAbsolute(p) ? p : join(searchDir, p),
  )

  const truncated = absolutePaths.length > offset + limit
  const files = absolutePaths.slice(offset, offset + limit)

  return { files, truncated }
}
