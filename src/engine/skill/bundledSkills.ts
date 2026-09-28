/**
 * engine/skill — 内置技能注册 + 引用文件提取（§8.67 D 波 S-E2a，
 * 旧仓 src/skills/bundledSkills.ts 逐字语义落面）。
 *
 * 内置技能随二进制注册（启动期 registerBundledSkill），与磁盘技能同契约：
 * `files` 字段 = 首次调用时惰性提取到 temp 目录（promise-memoize 防
 * 并发重复写），提示词前置 "Base directory for this skill: <dir>" 行。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① 旧 getBundledSkillsRoot = join(getAtlasTempDir(),'bundled-skills',
 *      MACRO.VERSION, nonce-16B-hex)（memoize）→ 新仓无构建期 MACRO
 *      VERSION → version 段裁（nonce 段保留 = 防 squatting 主防御逐字）；
 *      getAtlasTempDir 经顶层 permissions 门面（ATLAS_TMPDIR 可注，
 *      func 测试面）。
 *   ② 提取目录 0o700 + 文件 0o600 + O_NOFOLLOW|O_EXCL（win32 'wx'）
 *      逐字保留（预置符号链接攻击面防御，旧仓注释语义保留）。
 */
import { randomBytes } from 'crypto'
import { constants as fsConstants } from 'fs'
import { mkdir, open } from 'fs/promises'
import { dirname, isAbsolute, join, normalize, sep as pathSep } from 'path'

import { getAtlasTempDir } from '../../permissions'
import { logForDebugging, type ContentBlockParam } from '../../shared'
import type { HooksSettings } from '../config'
import type { Command, SkillCommandContext } from './types'

/**
 * 内置技能定义（随 CLI 分发，启动期程序化注册）。
 */
export type BundledSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  hooks?: HooksSettings
  context?: 'inline' | 'fork'
  agent?: string
  /**
   * 额外引用文件（首调用时提取到磁盘）。
   * 键 = 相对路径（正斜杠，禁 `..`），值 = 内容。
   * 设置后技能提示词前置 "Base directory for this skill: <dir>" 行，
   * 模型可按需 Read/Grep 这些文件 — 与磁盘技能同契约。
   */
  files?: Record<string, string>
  getPromptForCommand: (
    args: string,
    context: SkillCommandContext,
  ) => Promise<ContentBlockParam[]>
}

// 内置技能内部注册表
const bundledSkills: Command[] = []

/**
 * 注册内置技能（模块初始化或 init 函数期调用）。
 * 内置技能编译进 CLI 二进制，对所有用户可用。
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  const { files } = definition

  let skillRoot: string | undefined
  let getPromptForCommand = definition.getPromptForCommand

  if (files && Object.keys(files).length > 0) {
    skillRoot = getBundledSkillExtractDir(definition.name)
    // 闭包内 memoize：每进程提取一次。memoize 的是 promise（非结果）—
    // 并发调用 await 同一提取，避免竞态分写。
    let extractionPromise: Promise<string | null> | undefined
    const inner = definition.getPromptForCommand
    getPromptForCommand = async (args, ctx) => {
      extractionPromise ??= extractBundledSkillFiles(definition.name, files)
      const extractedDir = await extractionPromise
      const blocks = await inner(args, ctx)
      if (extractedDir === null) return blocks
      return prependBaseDir(blocks, extractedDir)
    }
  }

  const command: Command = {
    type: 'prompt',
    name: definition.name,
    description: definition.description,
    aliases: definition.aliases,
    hasUserSpecifiedDescription: true,
    allowedTools: definition.allowedTools ?? [],
    argumentHint: definition.argumentHint,
    whenToUse: definition.whenToUse,
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    contentLength: 0, // 内置技能不适用
    source: 'bundled',
    loadedFrom: 'bundled',
    hooks: definition.hooks,
    skillRoot,
    context: definition.context,
    agent: definition.agent,
    isEnabled: definition.isEnabled,
    isHidden: !(definition.userInvocable ?? true),
    progressMessage: 'running',
    getPromptForCommand,
  }
  bundledSkills.push(command)
}

/** 取全部已注册内置技能（返回拷贝，防外部篡改注册表）。 */
export function getBundledSkills(): Command[] {
  return [...bundledSkills]
}

/** 清空内置技能注册表（测试面）。 */
export function clearBundledSkills(): void {
  bundledSkills.length = 0
}

/** 内置技能引用文件提取根目录（每进程 nonce 防 squatting，见头注 ①）。 */
let _bundledSkillsRoot: string | null = null
export function getBundledSkillsRoot(): string {
  if (_bundledSkillsRoot === null) {
    const nonce = randomBytes(16).toString('hex')
    _bundledSkillsRoot = join(getAtlasTempDir(), 'bundled-skills', nonce)
  }
  return _bundledSkillsRoot
}

/** 内置技能引用文件确定性提取目录。 */
export function getBundledSkillExtractDir(skillName: string): string {
  return join(getBundledSkillsRoot(), skillName)
}

/**
 * 提取内置技能引用文件到磁盘（首调用惰性触发），模型可按需 Read/Grep。
 * 返回写入目录；写失败返回 null（技能继续可用，仅缺 base-directory 前缀）。
 */
async function extractBundledSkillFiles(
  skillName: string,
  files: Record<string, string>,
): Promise<string | null> {
  const dir = getBundledSkillExtractDir(skillName)
  try {
    await writeSkillFiles(dir, files)
    return dir
  } catch (e) {
    logForDebugging(
      `Failed to extract bundled skill '${skillName}' to ${dir}: ${e instanceof Error ? e.message : String(e)}`,
    )
    return null
  }
}

async function writeSkillFiles(
  dir: string,
  files: Record<string, string>,
): Promise<void> {
  // 按父目录分组：每个子树 mkdir 一次再写
  const byParent = new Map<string, [string, string][]>()
  for (const [relPath, content] of Object.entries(files)) {
    const target = resolveSkillFilePath(dir, relPath)
    const parent = dirname(target)
    const entry: [string, string] = [target, content]
    const group = byParent.get(parent)
    if (group) group.push(entry)
    else byParent.set(parent, [entry])
  }
  await Promise.all(
    [...byParent].map(async ([parent, entries]) => {
      await mkdir(parent, { recursive: true, mode: 0o700 })
      await Promise.all(entries.map(([p, c]) => safeWriteFile(p, c)))
    }),
  )
}

// getBundledSkillsRoot() 的 per-process nonce 是防预置符号链接/目录的
// 主防御。显式 0o700/0o600 保证 nonce 子树在 umask=0 下仍属主独占
// （监听可预测父目录 inotify 学到 nonce 的攻击者仍写不进去）。
// O_NOFOLLOW|O_EXCL 双保险（O_NOFOLLOW 仅保护末段）；有意不做
// EEXIST 时 unlink+retry — unlink() 同样跟随中间符号链接。
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
// Windows 用字符串 flag — 数值 O_EXCL 经 libuv 可能 EINVAL。
const SAFE_WRITE_FLAGS =
  process.platform === 'win32'
    ? 'wx'
    : fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      O_NOFOLLOW

async function safeWriteFile(p: string, content: string): Promise<void> {
  const fh = await open(p, SAFE_WRITE_FLAGS, 0o600)
  try {
    await fh.writeFile(content, 'utf8')
  } finally {
    await fh.close()
  }
}

/** 归一化并校验 skill 相对路径；穿越即抛。 */
function resolveSkillFilePath(baseDir: string, relPath: string): string {
  const normalized = normalize(relPath)
  if (
    isAbsolute(normalized) ||
    normalized.split(pathSep).includes('..') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`bundled skill file path escapes skill dir: ${relPath}`)
  }
  return join(baseDir, normalized)
}

function prependBaseDir(
  blocks: ContentBlockParam[],
  baseDir: string,
): ContentBlockParam[] {
  const prefix = `Base directory for this skill: ${baseDir}\n\n`
  if (blocks.length > 0 && blocks[0]!.type === 'text') {
    return [
      { type: 'text', text: prefix + blocks[0]!.text },
      ...blocks.slice(1),
    ]
  }
  return [{ type: 'text', text: prefix }, ...blocks]
}
