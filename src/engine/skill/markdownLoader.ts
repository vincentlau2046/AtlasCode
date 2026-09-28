/**
 * engine/skill — markdown 配置目录装载器（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/markdownConfigLoader.ts skill 域消费子集）。
 *
 * 落面 = MarkdownFile 型 + extractDescriptionFromMarkdown（描述兜底：
 * 首个非空行，标题前缀剥离，100 字截断）+ frontmatter 工具列表解析族
 * （parseToolListString → parseAgentToolsFromFrontmatter /
 * parseSlashCommandToolsFromFrontmatter，经 engine/permissions 门面
 * parseToolListFromCLI）+ getProjectDirsUpToHome（向上走 home/git-root
 * 收 .atlas/<subdir>）+ loadMarkdownFilesForSubdir（managed>user>project
 * 优先级 + dev:ino 去重 + worktree 主仓 fallback）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① ripgrep 搜索支（旧 ATLAS_USE_NATIVE_FILE_SEARCH 门控双实现）→
 *      新仓无 rg 依赖（3 依赖纪律）→ native walk 唯一活路径，env 门裁。
 *   ② isRestrictedToPluginOnly('agents') plugin-only 策略门 → 新仓 0 命中
 *      （plugin 波前向接缝）→ 门裁（isSettingSourceEnabled 门保留）。
 *   ③ resolveStopBoundary 的「嵌套仓 widening」（session project-root 态
 *      对比 nearest .git）→ 新仓 session project-root 态未落（bootstrap
 *      getProjectRoot 已裁）→ 退化为「停在最近 .git」（worktree .git
 *      file 停点语义保留；嵌套 submodule 场景残留守）。
 *   ④ 文件搜索超时面：旧 ripGrep 的 AbortSignal 超时语义保留为 native
 *      walk 的 abort 检查（3s，逐字值）。
 *   ⑤ dev:ino 身份（lstat bigint）= node:fs 直用（FsOperations 无
 *      bigint lstat 面；func 层真 FS 消费）。
 *   ⑥ CONFIG_SUBDIRS 'templates'（旧 feature('TEMPLATES') 门控）→ 裁
 *      （新仓 feature 机制未落；templates 面零消费）。
 */
import { statSync } from 'fs'
import { lstat, readdir, readFile, stat, realpath } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'

import {
  getConfigDirName,
  isFsInaccessible,
  logForDebugging,
} from '../../shared'
import type { FrontmatterData } from '../../memory'
import { parseFrontmatter } from '../../memory'
import {
  getAtlasConfigHomeDir,
  getManagedSettingsDir,
  isSettingSourceEnabled,
  type SettingSource,
} from '../config'
import { parseToolListFromCLI } from '../permissions'
import { findCanonicalGitRoot, findGitRoot } from '../worktree'
import { normalizePathForComparison } from '../tools/files'
import { memoize } from './memoize'

export const CONFIG_SUBDIRS = [
  'commands',
  'agents',
  'output-styles',
  'skills',
  'workflows',
] as const

export type ConfigSubDir = (typeof CONFIG_SUBDIRS)[number]

export type MarkdownFile = {
  filePath: string
  baseDir: string
  frontmatter: FrontmatterData
  content: string
  source: SettingSource
}

/**
 * 从 markdown 内容提取描述（首个非空行；标题前缀剥离；100 字截断）。
 */
export function extractDescriptionFromMarkdown(
  content: string,
  defaultDescription: string = 'Custom item',
): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      // 标题行剥离 # 前缀
      const headerMatch = trimmed.match(/^#+\s+(.+)$/)
      const text = headerMatch?.[1] ?? trimmed

      // 限长返回
      return text.length > 100 ? text.substring(0, 97) + '...' : text
    }
  }
  return defaultDescription
}

/**
 * 解析 frontmatter 工具列表（字符串 / 数组双形态）。
 * 缺失/null → null（调用方定默认）；空值 → []（无工具）；含 '*' → ['*']。
 */
function parseToolListString(toolsValue: unknown): string[] | null {
  if (toolsValue === undefined || toolsValue === null) {
    return null
  }

  if (!toolsValue) {
    return []
  }

  let toolsArray: string[] = []
  if (typeof toolsValue === 'string') {
    toolsArray = [toolsValue]
  } else if (Array.isArray(toolsValue)) {
    toolsArray = toolsValue.filter(
      (item): item is string => typeof item === 'string',
    )
  }

  if (toolsArray.length === 0) {
    return []
  }

  const parsedTools = parseToolListFromCLI(toolsArray)
  if (parsedTools.includes('*')) {
    return ['*']
  }
  return parsedTools
}

/**
 * 解析 agent frontmatter 工具列表。
 * 缺失 = undefined（全工具）；空 = []（无工具）；'*' = undefined（全工具）。
 */
export function parseAgentToolsFromFrontmatter(
  toolsValue: unknown,
): string[] | undefined {
  const parsed = parseToolListString(toolsValue)
  if (parsed === null) {
    return toolsValue === undefined ? undefined : []
  }
  if (parsed.includes('*')) {
    return undefined
  }
  return parsed
}

/**
 * 解析 slash command frontmatter allowed-tools。
 * 缺失或空 = []（无额外工具授权）。
 */
export function parseSlashCommandToolsFromFrontmatter(
  toolsValue: unknown,
): string[] {
  const parsed = parseToolListString(toolsValue)
  if (parsed === null) {
    return []
  }
  return parsed
}

/**
 * 文件物理身份（device:inode，bigint 防 ExFAT 大 inode 精度丢失）。
 * 部分文件系统（NFS/FUSE/网络挂载）dev=0 且 ino=0 → null 跳过去重。
 * stat 失败 → null（fail open，Windows 部分配置下去重可能失效，逐字语义）。
 */
async function getFileIdentity(filePath: string): Promise<string | null> {
  try {
    const stats = await lstat(filePath, { bigint: true })
    if (stats.dev === 0n && stats.ino === 0n) {
      return null
    }
    return `${stats.dev}:${stats.ino}`
  } catch {
    return null
  }
}

/**
 * getProjectDirsUpToHome 的向上走停点（旧仓 resolveStopBoundary 裁剪版，
 * 见头注 ③：nested-repo widening 残留守，停最近 .git）。
 */
function resolveStopBoundary(cwd: string): string | null {
  return findGitRoot(cwd)
}

/**
 * 从 cwd 向上走到 git root（或 home，非 git 仓时），收集沿途
 * .atlas/<subdir> 目录。
 *
 * 停在 git root 防止仓库外父目录的 commands/skills 泄漏进项目
 * （~/projects/.atlas/commands/ 不出现在 ~/projects/my-repo/，
 * 若 my-repo 是 git 仓）。
 *
 * @returns 目录路径数组，从最具体（cwd）到最不具体
 */
export function getProjectDirsUpToHome(
  subdir: ConfigSubDir,
  cwd: string,
): string[] {
  const home = resolve(homedir()).normalize('NFC')
  const gitRoot = resolveStopBoundary(cwd)
  let current = resolve(cwd)
  const dirs: string[] = []

  while (true) {
    // 到 home 停（home 单独作为 userDir 加载，不重复查）
    if (
      normalizePathForComparison(current) === normalizePathForComparison(home)
    ) {
      break
    }

    const configSubdir = join(current, getConfigDirName(), subdir)
    // 过滤到存在目录（native walk 的 perf 过滤 + worktree fallback 依赖
    // 此存在性信号）。statSync + 显式错误处理：非 FS 不可达错误重抛
    // （不静默吞；下游 loadMarkdownFiles 处理 TOCTOU 窗口）。
    try {
      statSync(configSubdir)
      dirs.push(configSubdir)
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e
    }

    // 处理完 git root 目录即停（防仓库外父目录命令泄漏）
    if (
      gitRoot &&
      normalizePathForComparison(current) ===
        normalizePathForComparison(gitRoot)
    ) {
      break
    }

    const parent = dirname(current)
    // 父 = 自身 = 到根
    if (parent === current) {
      break
    }
    current = parent
  }

  return dirs
}

/**
 * 装载 managed / user / project 三源 markdown 文件（memoize 双参键）。
 * 优先级 managed > user > project；dev:ino 去重（同物理文件多路径）。
 * worktree 主仓 fallback：worktree 未检出 .atlas/<subdir>（sparse-checkout）
 * 时补主仓副本（标准 `git worktree add` 全检出时不补，防全量重复装载）。
 */
export const loadMarkdownFilesForSubdir = memoize(
  async function (
    subdir: ConfigSubDir,
    cwd: string,
  ): Promise<MarkdownFile[]> {
    const userDir = join(getAtlasConfigHomeDir(), subdir)
    const managedDir = join(getManagedSettingsDir(), getConfigDirName(), subdir)
    const projectDirs = getProjectDirsUpToHome(subdir, cwd)

    // worktree fallback（见头注）
    const gitRoot = findGitRoot(cwd)
    const canonicalRoot = findCanonicalGitRoot(cwd)
    if (gitRoot && canonicalRoot && canonicalRoot !== gitRoot) {
      const worktreeSubdir = normalizePathForComparison(
        join(gitRoot, getConfigDirName(), subdir),
      )
      const worktreeHasSubdir = projectDirs.some(
        dir => normalizePathForComparison(dir) === worktreeSubdir,
      )
      if (!worktreeHasSubdir) {
        const mainConfigSubdir = join(canonicalRoot, getConfigDirName(), subdir)
        if (!projectDirs.includes(mainConfigSubdir)) {
          projectDirs.push(mainConfigSubdir)
        }
      }
    }

    const [managedFiles, userFiles, projectFilesNested] = await Promise.all([
      // managed（policy settings）恒载
      loadMarkdownFiles(managedDir).then(_ =>
        _.map(file => ({
          ...file,
          baseDir: managedDir,
          source: 'policySettings' as const,
        })),
      ),
      // user 条件载
      isSettingSourceEnabled('userSettings')
        ? loadMarkdownFiles(userDir).then(_ =>
            _.map(file => ({
              ...file,
              baseDir: userDir,
              source: 'userSettings' as const,
            })),
          )
        : Promise.resolve([]),
      // project 条件载（沿目录链全部）
      isSettingSourceEnabled('projectSettings')
        ? Promise.all(
            projectDirs.map(projectDir =>
              loadMarkdownFiles(projectDir).then(_ =>
                _.map(file => ({
                  ...file,
                  baseDir: projectDir,
                  source: 'projectSettings' as const,
                })),
              ),
            ),
          )
        : Promise.resolve([]),
    ])

    const projectFiles = projectFilesNested.flat()

    // 优先级合并：managed > user > project
    const allFiles = [...managedFiles, ...userFiles, ...projectFiles]

    // 同物理文件（同 inode）去重 —— 防 ~/.atlas 符号链接进项目目录树
    // 致同文件多路径重复装载
    const fileIdentities = await Promise.all(
      allFiles.map(file => getFileIdentity(file.filePath)),
    )

    const seenFileIds = new Map<string, SettingSource>()
    const deduplicatedFiles: MarkdownFile[] = []

    for (const [i, file] of allFiles.entries()) {
      const fileId = fileIdentities[i] ?? null
      if (fileId === null) {
        // 无法识别的文件包含（fail open）
        deduplicatedFiles.push(file)
        continue
      }
      const existingSource = seenFileIds.get(fileId)
      if (existingSource !== undefined) {
        logForDebugging(
          `Skipping duplicate file '${file.filePath}' from ${file.source} (same inode already loaded from ${existingSource})`,
        )
        continue
      }
      seenFileIds.set(fileId, file.source)
      deduplicatedFiles.push(file)
    }

    const duplicatesRemoved = allFiles.length - deduplicatedFiles.length
    if (duplicatesRemoved > 0) {
      logForDebugging(
        `Deduplicated ${duplicatesRemoved} files in ${subdir} (same inode via symlinks or hard links)`,
      )
    }

    return deduplicatedFiles
  },
  // 自定义 resolver：双参（subdir + cwd）造缓存键
  (subdir: ConfigSubDir, cwd: string) => `${subdir}:${cwd}`,
)

/**
 * native markdown 搜索（node:fs walk，符号链接跟随 + dev:ino 环检测）。
 * 不尊重 .gitignore（旧仓 ripgrep --no-ignore 等价语义，逐字保留）。
 *
 * @param dir 搜索目录
 * @param signal 超时/中止信号（旧仓 3s 超时语义保留，见头注 ④）
 */
async function findMarkdownFilesNative(
  dir: string,
  signal: AbortSignal,
): Promise<string[]> {
  const files: string[] = []
  const visitedDirs = new Set<string>()

  async function walk(currentDir: string): Promise<void> {
    if (signal.aborted) {
      return
    }

    // 环检测：dev:ino 跟踪（bigint 防 ExFAT 大 inode 精度丢失）
    try {
      const stats = await stat(currentDir, { bigint: true })
      if (stats.isDirectory()) {
        const dirKey =
          stats.dev !== undefined && stats.ino !== undefined
            ? `${stats.dev}:${stats.ino}` // Unix/Linux
            : await realpath(currentDir) // Windows 回落规范路径

        if (visitedDirs.has(dirKey)) {
          logForDebugging(
            `Skipping already visited directory (circular symlink): ${currentDir}`,
          )
          return
        }
        visitedDirs.add(dirKey)
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logForDebugging(`Failed to stat directory ${currentDir}: ${errorMessage}`)
      return
    }

    try {
      const entries = await readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        if (signal.aborted) {
          break
        }

        const fullPath = join(currentDir, entry.name)

        try {
          // 符号链接：isFile()/isDirectory() 对链接返回 false，stat 跟随
          if (entry.isSymbolicLink()) {
            try {
              const stats = await stat(fullPath)
              if (stats.isDirectory()) {
                await walk(fullPath)
              } else if (stats.isFile() && entry.name.endsWith('.md')) {
                files.push(fullPath)
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error)
              logForDebugging(
                `Failed to follow symlink ${fullPath}: ${errorMessage}`,
              )
            }
          } else if (entry.isDirectory()) {
            await walk(fullPath)
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath)
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          logForDebugging(`Failed to access ${fullPath}: ${errorMessage}`)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logForDebugging(`Failed to read directory ${currentDir}: ${errorMessage}`)
    }
  }

  await walk(dir)
  return files
}

/**
 * 从指定目录装载 markdown 文件（解析 frontmatter + 内容）。
 * 搜索策略 = native walk 唯一路径（头注 ①）。
 */
async function loadMarkdownFiles(
  dir: string,
): Promise<
  {
    filePath: string
    frontmatter: FrontmatterData
    content: string
  }[]
> {
  const signal = AbortSignal.timeout(3000)
  let files: string[]
  try {
    files = await findMarkdownFilesNative(dir, signal)
  } catch (e: unknown) {
    // 目录缺失/不可达直接处理（不预查存在性，TOCTOU；native walk 内部
    // 已捕获目录级错误，此处兜底 fs 不可达语义）
    if (isFsInaccessible(e)) return []
    throw e
  }

  const results = await Promise.all(
    files.map(async filePath => {
      try {
        const rawContent = await readFile(filePath, { encoding: 'utf-8' })
        const { frontmatter, content } = parseFrontmatter(rawContent, filePath)

        return {
          filePath,
          frontmatter,
          content,
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        logForDebugging(
          `Failed to read/parse markdown file:  ${filePath}: ${errorMessage}`,
        )
        return null
      }
    }),
  )

  return results.filter(_ => _ !== null)
}
