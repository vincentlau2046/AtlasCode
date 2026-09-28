/**
 * engine/skill — 技能目录装载（§8.67 D 波 S-E2a，
 * 旧仓 src/skills/loadSkillsDir.ts 落面：/skills/ 目录 + legacy /commands/
 * 目录 + 动态发现 + 条件技能（paths frontmatter）激活）。
 *
 * 装载源（getSkillDirCommands，memoize by cwd）：
 *   managed（policy，/etc/atlas）> user（~/.atlas/skills）> project
 *   （getProjectDirsUpToHome 目录链 .atlas/skills）— realpath 去重
 *   （符号链接 / 重叠父目录同文件只装一次）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① isBareMode（--bare 自动发现跳过面）→ 新仓 0 命中（--bare 波）裁；
 *      恒走全发现路径。
 *   ② getAdditionalDirectoriesForClaudeMd（--add-dir 附加目录面，
 *      bootstrap/state 旧面）→ 新仓 0 命中（--add-dir 波）裁；
 *      additionalDirs 恒空（接口保留，壳接线波回填）。
 *   ③ isRestrictedToPluginOnly('skills') plugin-only 策略门 → 新仓 0 命中
 *      （plugin 波）裁；skillsLocked 恒 false。
 *   ④ registerMCPSkillBuilders（MCP skill 发现注册，mcpSkillBuilders
 *      间接层）→ 裁（remote 波前向接缝；createSkillCommand /
 *      parseSkillFrontmatterFields 经子门面导出供该波直接消费）。
 *   ⑤ 条件技能 gitignore 风格匹配：旧 `ignore` 库 → 本地最小 matcher
 *      （./patternMatch.ts，3 依赖纪律，语义差登记见该文件头注）。
 *   ⑥ ATLAS_DISABLE_POLICY_SKILLS env 门保留（managed 源跳过，逐字语义）。
 */
import { realpath } from 'fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep as pathSep,
} from 'path'

import {
  getFsImplementation,
  isEnvTruthy,
  isENOENT,
  isFsInaccessible,
  logError,
  logForDebugging,
} from '../../shared'
import { parseFrontmatter } from '../../memory'
import {
  getAtlasConfigHomeDir,
  getManagedSettingsDir,
  isSettingSourceEnabled,
  type SettingSource,
} from '../config'
import { createSignal } from '../messaging'
import { isPathGitignored } from './gitignore'
import {
  getProjectDirsUpToHome,
  loadMarkdownFilesForSubdir,
  type MarkdownFile,
} from './markdownLoader'
import { memoize } from './memoize'
import { gitignoreMatch } from './patternMatch'
import {
  createSkillCommand,
  parseSkillFrontmatterFields,
  parseSkillPaths,
} from './skillCommand'
import type { Command, LoadedFrom } from './types'
import { NO_CONTENT_MESSAGE } from './constants'

export type { LoadedFrom }

/**
 * 返回 source 对应的 <dir> 配置目录路径（旧仓 getSkillsPath 经
 * skillCommand 再导出）。
 */
export { getSkillsPath } from './skillCommand'

/**
 * 技能文件唯一身份（realpath 解符号链接到规范路径）。
 * 防「不同路径同一文件」重复装载（符号链接 / 重叠父目录）。
 * 文件不存在或不可解析 → null。
 */
async function getFileIdentity(filePath: string): Promise<string | null> {
  try {
    return await realpath(filePath)
  } catch {
    return null
  }
}

// 内部型：skill + 文件路径（去重用）
type SkillWithPath = {
  skill: Command
  filePath: string
}

/**
 * 从 /skills/ 目录路径装载技能。
 * 仅支持目录形态：skill-name/SKILL.md（单 .md 文件不支持）。
 */
async function loadSkillsFromSkillsDir(
  basePath: string,
  source: SettingSource,
): Promise<SkillWithPath[]> {
  const fs = getFsImplementation()

  let entries
  try {
    entries = await fs.readdir(basePath)
  } catch (e: unknown) {
    if (!isFsInaccessible(e)) logError(e)
    return []
  }

  const results = await Promise.all(
    entries.map(async (entry): Promise<SkillWithPath | null> => {
      try {
        // 仅目录形态：skill-name/SKILL.md
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          // 单 .md 文件在 /skills/ 目录不支持
          return null
        }

        const skillDirPath = join(basePath, entry.name)
        const skillFilePath = join(skillDirPath, 'SKILL.md')

        let content: string
        try {
          content = await fs.readFile(skillFilePath, { encoding: 'utf-8' })
        } catch (e: unknown) {
          // SKILL.md 缺失则跳过此条目；非 ENOENT 错误（EACCES/EPERM/EIO）
          // 记日志便于诊断权限/IO 问题
          if (!isENOENT(e)) {
            logForDebugging(`[skills] failed to read ${skillFilePath}: ${e}`)
          }
          return null
        }

        const { frontmatter, content: markdownContent } = parseFrontmatter(
          content,
          skillFilePath,
        )

        const skillName = entry.name
        const parsed = parseSkillFrontmatterFields(
          frontmatter,
          markdownContent,
          skillName,
        )
        const paths = parseSkillPaths(frontmatter)

        return {
          skill: createSkillCommand({
            ...parsed,
            skillName,
            markdownContent,
            source,
            baseDir: skillDirPath,
            loadedFrom: 'skills',
            paths,
          }),
          filePath: skillFilePath,
        }
      } catch (error) {
        logError(error)
        return null
      }
    }),
  )

  return results.filter((r): r is SkillWithPath => r !== null)
}

// --- legacy /commands/ 装载器 ---

function isSkillFile(filePath: string): boolean {
  return /^skill\.md$/i.test(basename(filePath))
}

/**
 * 处理 legacy /commands/ 目录的 "skill" 命令 markdown 变换。
 * 目录内存在 SKILL.md 时仅加载该文件，且取父目录名。
 */
function transformSkillFiles(files: MarkdownFile[]): MarkdownFile[] {
  const filesByDir = new Map<string, MarkdownFile[]>()

  for (const file of files) {
    const dir = dirname(file.filePath)
    const dirFiles = filesByDir.get(dir) ?? []
    dirFiles.push(file)
    filesByDir.set(dir, dirFiles)
  }

  const result: MarkdownFile[] = []

  for (const [dir, dirFiles] of filesByDir) {
    const skillFiles = dirFiles.filter(f => isSkillFile(f.filePath))
    if (skillFiles.length > 0) {
      const skillFile = skillFiles[0]!
      if (skillFiles.length > 1) {
        logForDebugging(
          `Multiple skill files found in ${dir}, using ${basename(skillFile.filePath)}`,
        )
      }
      result.push(skillFile)
    } else {
      result.push(...dirFiles)
    }
  }

  return result
}

function buildNamespace(targetDir: string, baseDir: string): string {
  const normalizedBaseDir = baseDir.endsWith(pathSep)
    ? baseDir.slice(0, -1)
    : baseDir

  if (targetDir === normalizedBaseDir) {
    return ''
  }

  const relativePath = targetDir.slice(normalizedBaseDir.length + 1)
  return relativePath ? relativePath.split(pathSep).join(':') : ''
}

function getSkillCommandName(filePath: string, baseDir: string): string {
  const skillDirectory = dirname(filePath)
  const parentOfSkillDir = dirname(skillDirectory)
  const commandBaseName = basename(skillDirectory)

  const namespace = buildNamespace(parentOfSkillDir, baseDir)
  return namespace ? `${namespace}:${commandBaseName}` : commandBaseName
}

function getRegularCommandName(filePath: string, baseDir: string): string {
  const fileName = basename(filePath)
  const fileDirectory = dirname(filePath)
  const commandBaseName = fileName.replace(/\.md$/, '')

  const namespace = buildNamespace(fileDirectory, baseDir)
  return namespace ? `${namespace}:${commandBaseName}` : commandBaseName
}

function getSkillCmdName(file: MarkdownFile): string {
  const isSkill = isSkillFile(file.filePath)
  return isSkill
    ? getSkillCommandName(file.filePath, file.baseDir)
    : getRegularCommandName(file.filePath, file.baseDir)
}

/**
 * 从 legacy /commands/ 目录装载技能。
 * 支持目录形态（SKILL.md）与单 .md 文件形态。
 * /commands/ 的命令默认 user-invocable: true。
 */
async function loadSkillsFromCommandsDir(
  cwd: string,
): Promise<SkillWithPath[]> {
  try {
    const markdownFiles = await loadMarkdownFilesForSubdir('commands', cwd)
    const processedFiles = transformSkillFiles(markdownFiles)

    const skills: SkillWithPath[] = []

    for (const {
      baseDir,
      filePath,
      frontmatter,
      content,
      source,
    } of processedFiles) {
      try {
        const isSkillFormat = isSkillFile(filePath)
        const skillDirectory = isSkillFormat ? dirname(filePath) : undefined
        const cmdName = getSkillCmdName({
          baseDir,
          filePath,
          frontmatter,
          content,
          source,
        })

        const parsed = parseSkillFrontmatterFields(
          frontmatter,
          content,
          cmdName,
          'Custom command',
        )

        skills.push({
          skill: createSkillCommand({
            ...parsed,
            skillName: cmdName,
            displayName: undefined,
            markdownContent: content,
            source,
            baseDir: skillDirectory,
            loadedFrom: 'commands_DEPRECATED',
            paths: undefined,
          }),
          filePath,
        })
      } catch (error) {
        logError(error)
      }
    }

    return skills
  } catch (error) {
    logError(error)
    return []
  }
}

/**
 * 从 /skills/ 与 legacy /commands/ 目录装载全部技能（memoize by cwd）。
 *
 * /skills/ 目录：仅目录形态（skill-name/SKILL.md），默认
 * user-invocable: true（frontmatter user-invocable: false 可关）。
 * legacy /commands/：双形态，默认 user-invocable: true（用户可 /cmd）。
 *
 * @param cwd 项目目录遍历起点
 */
export const getSkillDirCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const userSkillsDir = join(getAtlasConfigHomeDir(), 'skills')
    const managedSkillsDir = join(
      getManagedSettingsDir(),
      '.atlas',
      'skills',
    )
    const projectSkillsDirs = getProjectDirsUpToHome('skills', cwd)

    logForDebugging(
      `Loading skills from: managed=${managedSkillsDir}, user=${userSkillsDir}, project=[${projectSkillsDirs.join(', ')}]`,
    )

    // --add-dir 附加目录（头注 ②：面未落，恒空）
    const additionalDirs: string[] = []
    const skillsLocked = false // 头注 ③
    const projectSettingsEnabled =
      isSettingSourceEnabled('projectSettings') && !skillsLocked

    // --bare 面裁（头注 ①）→ 恒全发现路径

    const [
      managedSkills,
      userSkills,
      projectSkillsNested,
      additionalSkillsNested,
      legacyCommands,
    ] = await Promise.all([
      isEnvTruthy(process.env.ATLAS_DISABLE_POLICY_SKILLS)
        ? Promise.resolve([])
        : loadSkillsFromSkillsDir(managedSkillsDir, 'policySettings'),
      isSettingSourceEnabled('userSettings') && !skillsLocked
        ? loadSkillsFromSkillsDir(userSkillsDir, 'userSettings')
        : Promise.resolve([]),
      projectSettingsEnabled
        ? Promise.all(
            projectSkillsDirs.map(dir =>
              loadSkillsFromSkillsDir(dir, 'projectSettings'),
            ),
          )
        : Promise.resolve([]),
      projectSettingsEnabled
        ? Promise.all(
            additionalDirs.map(dir =>
              loadSkillsFromSkillsDir(
                join(dir, '.atlas', 'skills'),
                'projectSettings',
              ),
            ),
          )
        : Promise.resolve([]),
      // legacy commands-as-skills 经 markdownConfigLoader（subdir='commands'）
      // 装载。skillsLocked 时阻塞（这些就是技能，与目录形态无关）—
      // 头注 ③ skillsLocked 恒 false，此支恒载（markdownLoader 内项目
      // 层仍经 isSettingSourceEnabled('projectSettings') 源门）。
      skillsLocked ? Promise.resolve([]) : loadSkillsFromCommandsDir(cwd),
    ])

    // 扁平合并全部技能
    const allSkillsWithPaths = [
      ...managedSkills,
      ...userSkills,
      ...projectSkillsNested.flat(),
      ...additionalSkillsNested.flat(),
      ...legacyCommands,
    ]

    // 按 resolved path 去重（符号链接 / 重叠父目录）。realpath 调用独立
    // 并行预计算，随后同步去重（顺序相关 first-wins）。
    const fileIds = await Promise.all(
      allSkillsWithPaths.map(({ skill, filePath }) =>
        skill.type === 'prompt'
          ? getFileIdentity(filePath)
          : Promise.resolve(null),
      ),
    )

    const seenFileIds = new Map<string, string>()
    const deduplicatedSkills: Command[] = []

    for (let i = 0; i < allSkillsWithPaths.length; i++) {
      const entry = allSkillsWithPaths[i]
      if (entry === undefined || entry.skill.type !== 'prompt') continue
      const { skill } = entry

      const fileId = fileIds[i]
      if (fileId === null || fileId === undefined) {
        deduplicatedSkills.push(skill)
        continue
      }

      const existingSource = seenFileIds.get(fileId)
      if (existingSource !== undefined) {
        logForDebugging(
          `Skipping duplicate skill '${skill.name}' from ${skill.source} (same file already loaded from ${existingSource})`,
        )
        continue
      }

      seenFileIds.set(fileId, skill.source)
      deduplicatedSkills.push(skill)
    }

    const duplicatesRemoved =
      allSkillsWithPaths.length - deduplicatedSkills.length
    if (duplicatesRemoved > 0) {
      logForDebugging(`Deduplicated ${duplicatesRemoved} skills (same file)`)
    }

    // 条件技能（paths frontmatter）与无条件技能分离
    const unconditionalSkills: Command[] = []
    const newConditionalSkills: Command[] = []
    for (const skill of deduplicatedSkills) {
      if (
        skill.type === 'prompt' &&
        skill.paths &&
        skill.paths.length > 0 &&
        !activatedConditionalSkillNames.has(skill.name)
      ) {
        newConditionalSkills.push(skill)
      } else {
        unconditionalSkills.push(skill)
      }
    }

    // 条件技能暂存，匹配文件触碰后激活
    for (const skill of newConditionalSkills) {
      conditionalSkills.set(skill.name, skill)
    }

    if (newConditionalSkills.length > 0) {
      logForDebugging(
        `[skills] ${newConditionalSkills.length} conditional skills stored (activated when matching files are touched)`,
      )
    }

    logForDebugging(
      `Loaded ${deduplicatedSkills.length} unique skills (${unconditionalSkills.length} unconditional, ${newConditionalSkills.length} conditional, managed: ${managedSkills.length}, user: ${userSkills.length}, project: ${projectSkillsNested.flat().length}, additional: ${additionalSkillsNested.flat().length}, legacy commands: ${legacyCommands.length})`,
    )

    return unconditionalSkills
  },
)

export function clearSkillCaches(): void {
  getSkillDirCommands.cache?.clear?.()
  loadMarkdownFilesForSubdir.cache?.clear?.()
  conditionalSkills.clear()
  activatedConditionalSkillNames.clear()
}

// --- 动态技能发现 ---

// 动态发现技能状态
const dynamicSkillDirs = new Set<string>()
const dynamicSkills = new Map<string, Command>()

// --- 条件技能（path 过滤）---

// 未激活的 paths frontmatter 技能
const conditionalSkills = new Map<string, Command>()
// 已激活技能名（会话内 cache clear 不丢）
const activatedConditionalSkillNames = new Set<string>()

// 动态技能装载完成信号
const skillsLoaded = createSignal()

/**
 * 注册动态技能装载完成回调（其他模块清缓存用，防 import 环）。
 * 返回退订函数。
 */
export function onDynamicSkillsLoaded(callback: () => void): () => void {
  // subscribe 期包一层：抛错监听器记日志跳过，不中断 skillsLoaded.emit()
  // 破坏技能装载（createSignal.emit() 无 per-listener try/catch）
  return skillsLoaded.subscribe(() => {
    try {
      callback()
    } catch (error) {
      logError(error)
    }
  })
}

/**
 * 从文件路径向上走到 cwd 发现技能目录。
 * 仅发现 cwd 之下的目录（cwd 级技能启动时已装载）。
 *
 * @param filePaths 待查文件路径数组
 * @param cwd 当前工作目录（发现上界）
 * @returns 新发现技能目录数组，最深优先排序
 */
export async function discoverSkillDirsForPaths(
  filePaths: string[],
  cwd: string,
): Promise<string[]> {
  const fs = getFsImplementation()
  const resolvedCwd = cwd.endsWith(pathSep) ? cwd.slice(0, -1) : cwd
  const newDirs: string[] = []

  for (const filePath of filePaths) {
    // 从文件父目录起
    let currentDir = dirname(filePath)

    // 向上走到 cwd（不含 cwd 自身）— cwd 级技能启动已装，仅发现嵌套
    // 前缀 + 分隔符检查（cwd=/project 时不误匹配 /project-backup）
    while (currentDir.startsWith(resolvedCwd + pathSep)) {
      const skillDir = join(currentDir, '.atlas', 'skills')

      // 已查过的路径（命中/未命中）跳过 — 避免目录不存在时每次
      // Read/Write/Edit 重复 stat 同一失败路径（常见情形）
      if (!dynamicSkillDirs.has(skillDir)) {
        dynamicSkillDirs.add(skillDir)
        try {
          await fs.stat(skillDir)
          // 技能目录存在。装载前查父目录是否 gitignore — 挡
          // node_modules/pkg/.atlas/skills 类静默泄漏。git check-ignore
          // 覆盖嵌套 .gitignore / .git/info/exclude / 全局 gitignore。
          // git 仓外失败开放（exit 128 → false）；调用时信任对话才是
          // 实际安全边界。
          if (await isPathGitignored(currentDir, resolvedCwd)) {
            logForDebugging(
              `[skills] Skipped gitignored skills dir: ${skillDir}`,
            )
            continue
          }
          newDirs.push(skillDir)
        } catch {
          // 目录不存在 — 已记录，继续
        }
      }

      // 上移父目录
      const parent = dirname(currentDir)
      if (parent === currentDir) break // 到根
      currentDir = parent
    }
  }

  // 按路径深度排序（最深优先，近文件的技能优先）
  return newDirs.sort(
    (a, b) => b.split(pathSep).length - a.split(pathSep).length,
  )
}

/**
 * 从给定目录装载技能并并入动态技能 map。
 * 近文件目录（更深路径）的技能优先。
 *
 * @param dirs 技能目录数组（应已最深优先排序）
 */
export async function addSkillDirectories(dirs: string[]): Promise<void> {
  if (!isSettingSourceEnabled('projectSettings')) {
    logForDebugging(
      '[skills] Dynamic skill discovery skipped: projectSettings disabled or plugin-only policy',
    )
    return
  }
  if (dirs.length === 0) {
    return
  }

  // 全部目录装载
  const loadedSkills = await Promise.all(
    dirs.map(dir => loadSkillsFromSkillsDir(dir, 'projectSettings')),
  )

  // 逆序处理（浅层先）使深层路径覆盖
  for (let i = loadedSkills.length - 1; i >= 0; i--) {
    for (const { skill } of loadedSkills[i] ?? []) {
      if (skill.type === 'prompt') {
        dynamicSkills.set(skill.name, skill)
      }
    }
  }

  const newSkillCount = loadedSkills.flat().length
  if (newSkillCount > 0) {
    logForDebugging(
      `[skills] Dynamically discovered ${newSkillCount} skills from ${dirs.length} directories`,
    )
  }

  // 通知监听者（清缓存）
  skillsLoaded.emit()
}

/** 取全部动态发现技能（会话内从文件路径发现的）。 */
export function getDynamicSkills(): Command[] {
  return Array.from(dynamicSkills.values())
}

/**
 * 激活 path pattern 匹配给定文件路径的条件技能。
 * 激活技能并入动态技能 map，模型可见。
 *
 * 本地最小 matcher（./patternMatch.ts，旧 `ignore` 库裁面，头注 ⑤）。
 *
 * @param filePaths 操作中的文件路径数组
 * @param cwd 当前工作目录（路径相对 cwd 匹配）
 * @returns 新激活技能名数组
 */
export function activateConditionalSkillsForPaths(
  filePaths: string[],
  cwd: string,
): string[] {
  if (conditionalSkills.size === 0) {
    return []
  }

  const activated: string[] = []

  for (const [name, skill] of conditionalSkills) {
    if (skill.type !== 'prompt' || !skill.paths || skill.paths.length === 0) {
      continue
    }

    for (const filePath of filePaths) {
      const relativePath = isAbsolute(filePath)
        ? relative(cwd, filePath)
        : filePath

      // matcher 对空串 / 越出基目录（../）/ 绝对路径（Windows 跨盘
      // relative 返回绝对）会抛或误判 — 这些文件本就不可能匹配 cwd 相对
      // pattern，直接跳过
      if (
        !relativePath ||
        relativePath.startsWith('..') ||
        isAbsolute(relativePath)
      ) {
        continue
      }

      if (gitignoreMatch(skill.paths, relativePath)) {
        // 激活 = 移入动态技能
        dynamicSkills.set(name, skill)
        conditionalSkills.delete(name)
        activatedConditionalSkillNames.add(name)
        activated.push(name)
        logForDebugging(
          `[skills] Activated conditional skill '${name}' (matched path: ${relativePath})`,
        )
        break
      }
    }
  }

  if (activated.length > 0) {
    // 通知监听者（清缓存）
    skillsLoaded.emit()
  }

  return activated
}

/** 取待激活条件技能数（测试/调试面）。 */
export function getConditionalSkillCount(): number {
  return conditionalSkills.size
}

/** 清空动态技能状态（测试面）。 */
export function clearDynamicSkills(): void {
  dynamicSkillDirs.clear()
  dynamicSkills.clear()
  conditionalSkills.clear()
  activatedConditionalSkillNames.clear()
}

/**
 * getProjectDirsUpToHome 再导出（skill 域消费 + 未来 agents 域共用）。
 */
export { getProjectDirsUpToHome } from './markdownLoader'

/** NO_CONTENT_MESSAGE 再导出（skill 内容空哨兵，TUI/消息面共用）。 */
export { NO_CONTENT_MESSAGE }
