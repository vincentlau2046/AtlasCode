/**
 * engine/skill — 技能命令工厂 + frontmatter 字段解析（§8.67 D 波 S-E2a，
 * 旧仓 src/skills/loadSkillsDir.ts parseSkillFrontmatterFields /
 * createSkillCommand / parseHooksFromFrontmatter / parseSkillPaths /
 * estimateSkillFrontmatterTokens / getSkillsPath 逐字落面）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① getPromptForCommand 的 TPC alwaysAllowRules 覆写：仅当
 *      SkillCommandContext.getAppState 提供时执行（窄 spine 未提供 =
 *      跳过覆写直执 shell 块，权限门走 context.checkPermission 透传面）。
 *   ② model 解析经 skillModel.parseUserSpecifiedModel（role 别名 = 新模型
 *      车道角色标识身份映射，见 skillModel.ts 头注）。
 *   ③ 'inherit' model = 未指定（回落父 role，逐字语义）。
 */
import { join } from 'path'

import {
  EFFORT_LEVELS,
  getConfigDirName,
  logForDebugging,
  roughTokenCountEstimation,
  type ContentBlockParam,
  type EffortValue,
} from '../../shared'
import { parseEffortValue } from '../../modelprovider'
import { getSessionId } from '../../bootstrap'
import type { FrontmatterData } from '../../memory'
import {
  getAtlasConfigHomeDir,
  getManagedSettingsDir,
  HooksSchema,
  type HooksSettings,
  type SettingSource,
} from '../config'
import {
  parseArgumentNames,
  substituteArguments,
} from './argumentSubstitution'
import {
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseShellFrontmatter,
  splitPathInFrontmatter,
  type FrontmatterShell,
} from './frontmatterFields'
import {
  extractDescriptionFromMarkdown,
  parseSlashCommandToolsFromFrontmatter,
} from './markdownLoader'
import { parseUserSpecifiedModel } from './skillModel'
import { executeShellCommandsInPrompt } from './promptShellExecution'
import type {
  Command,
  LoadedFrom,
  PromptCommand,
  SkillCommandContext,
} from './types'

/** 返回 source 对应的 <dir> 配置目录路径（旧仓 getSkillsPath 逐字，
 *  managed 面 = 新仓 getManagedSettingsDir 落点）。 */
export function getSkillsPath(
  source: SettingSource | 'plugin',
  dir: 'skills' | 'commands',
): string {
  switch (source) {
    case 'policySettings':
      return join(getManagedSettingsDir(), getConfigDirName(), dir)
    case 'userSettings':
      return join(getAtlasConfigHomeDir(), dir)
    case 'projectSettings':
      return `${getConfigDirName()}/${dir}`
    case 'plugin':
      return 'plugin'
    default:
      return ''
  }
}

/**
 * 按 frontmatter（name/description/whenToUse）估算技能 token 量
 * （完整内容仅调用时加载）。
 */
export function estimateSkillFrontmatterTokens(skill: Command): number {
  const frontmatterText = [skill.name, skill.description, skill.whenToUse]
    .filter(Boolean)
    .join(' ')
  return roughTokenCountEstimation(frontmatterText)
}

/**
 * 从 frontmatter 解析并校验 hooks。未定义或非法 → undefined。
 */
function parseHooksFromFrontmatter(
  frontmatter: FrontmatterData,
  skillName: string,
): HooksSettings | undefined {
  if (!frontmatter.hooks) {
    return undefined
  }

  // 新仓 HooksSchema = zod 实例（旧仓工厂函数 → 实例，delta 见
  // engine/config/hooksSchema.ts 头注）
  const result = HooksSchema.safeParse(frontmatter.hooks)
  if (!result.success) {
    logForDebugging(
      `Invalid hooks in skill '${skillName}': ${result.error.message}`,
    )
    return undefined
  }

  return result.data
}

/**
 * 解析 paths frontmatter（同 ATLAS.md 规则格式）。
 * 未指定或全 pattern 为 match-all → undefined。
 */
export function parseSkillPaths(frontmatter: FrontmatterData): string[] | undefined {
  if (!frontmatter.paths) {
    return undefined
  }

  const patterns = splitPathInFrontmatter(frontmatter.paths)
    .map(pattern => {
      // 剥 /** 尾缀 — matcher 把 'path' 视为匹配 path 自身及其内部一切
      return pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern
    })
    .filter((p: string) => p.length > 0)

  // 全 ** （match-all）视为无 paths
  if (patterns.length === 0 || patterns.every((p: string) => p === '**')) {
    return undefined
  }

  return patterns
}

/**
 * 解析文件基 / MCP skill 加载共享的 frontmatter 字段。
 * 调用方提供 resolvedName + source/loadedFrom/baseDir/paths 字段。
 */
export function parseSkillFrontmatterFields(
  frontmatter: FrontmatterData,
  markdownContent: string,
  resolvedName: string,
  descriptionFallbackLabel: 'Skill' | 'Custom command' = 'Skill',
): {
  displayName: string | undefined
  description: string
  hasUserSpecifiedDescription: boolean
  allowedTools: string[]
  argumentHint: string | undefined
  argumentNames: string[]
  whenToUse: string | undefined
  version: string | undefined
  model: string | undefined
  disableModelInvocation: boolean
  userInvocable: boolean
  hooks: HooksSettings | undefined
  executionContext: 'fork' | undefined
  agent: string | undefined
  effort: EffortValue | undefined
  shell: FrontmatterShell | undefined
} {
  const validatedDescription = coerceDescriptionToString(
    frontmatter.description,
    resolvedName,
  )
  const description =
    validatedDescription ??
    extractDescriptionFromMarkdown(markdownContent, descriptionFallbackLabel)

  const userInvocable =
    frontmatter['user-invocable'] === undefined
      ? true
      : parseBooleanFrontmatter(frontmatter['user-invocable'])

  const model =
    frontmatter.model === 'inherit'
      ? undefined
      : frontmatter.model
        ? parseUserSpecifiedModel(frontmatter.model as string)
        : undefined

  const effortRaw = frontmatter['effort']
  const effort = effortRaw !== undefined ? parseEffortValue(effortRaw) : undefined
  if (effortRaw !== undefined && effort === undefined) {
    logForDebugging(
      `Skill ${resolvedName} has invalid effort '${effortRaw}'. Valid options: ${EFFORT_LEVELS.join(', ')} or an integer`,
    )
  }

  return {
    displayName:
      frontmatter.name != null ? String(frontmatter.name) : undefined,
    description,
    hasUserSpecifiedDescription: validatedDescription !== null,
    allowedTools: parseSlashCommandToolsFromFrontmatter(
      frontmatter['allowed-tools'],
    ),
    argumentHint:
      frontmatter['argument-hint'] != null
        ? String(frontmatter['argument-hint'])
        : undefined,
    argumentNames: parseArgumentNames(
      frontmatter.arguments as string | string[] | undefined,
    ),
    // S1（感知面反馈波）：连字符 `when-to-use`（与 allowed-tools /
    // disable-model-invocation 等兄弟键约定一致）此前静默丢失 → 模型
    // 「何时用此 skill」触发线索降级（自动触发能力直接降档）。双形式
    // 归一接受：连字符优先（约定面），下划线兼容（bundled ascend 技能
    // 现用形式，回归保护）。
    whenToUse: (frontmatter['when-to-use'] ??
      frontmatter.when_to_use) as string | undefined,
    version: frontmatter.version as string | undefined,
    model,
    disableModelInvocation: parseBooleanFrontmatter(
      frontmatter['disable-model-invocation'],
    ),
    userInvocable,
    hooks: parseHooksFromFrontmatter(frontmatter, resolvedName),
    executionContext: frontmatter.context === 'fork' ? 'fork' : undefined,
    agent: frontmatter.agent as string | undefined,
    effort,
    shell: parseShellFrontmatter(frontmatter.shell, resolvedName),
  }
}

/** TPC 覆写消费的 appState 窄骨架（新仓 appState = unknown，cast 收窄面）。 */
type AppStateTpcSlice = {
  toolPermissionContext?: {
    alwaysAllowRules?: { command?: string[] }
  }
}

/**
 * 由解析数据构造技能命令（旧仓 createSkillCommand 逐字语义 +
 * SkillCommandContext 最小 context 适配）。
 */
export function createSkillCommand({
  skillName,
  displayName,
  description,
  hasUserSpecifiedDescription,
  markdownContent,
  allowedTools,
  argumentHint,
  argumentNames,
  whenToUse,
  version,
  model,
  disableModelInvocation,
  userInvocable,
  source,
  baseDir,
  loadedFrom,
  hooks,
  executionContext,
  agent,
  paths,
  effort,
  shell,
}: {
  skillName: string
  displayName: string | undefined
  description: string
  hasUserSpecifiedDescription: boolean
  markdownContent: string
  allowedTools: string[]
  argumentHint: string | undefined
  argumentNames: string[]
  whenToUse: string | undefined
  version: string | undefined
  model: string | undefined
  disableModelInvocation: boolean
  userInvocable: boolean
  source: PromptCommand['source']
  baseDir: string | undefined
  loadedFrom: LoadedFrom
  hooks: HooksSettings | undefined
  executionContext: 'inline' | 'fork' | undefined
  agent: string | undefined
  paths: string[] | undefined
  effort: EffortValue | undefined
  shell: FrontmatterShell | undefined
}): Command {
  return {
    type: 'prompt',
    name: skillName,
    description,
    hasUserSpecifiedDescription,
    allowedTools,
    argumentHint,
    argNames: argumentNames.length > 0 ? argumentNames : undefined,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    context: executionContext,
    agent,
    effort,
    paths,
    contentLength: markdownContent.length,
    isHidden: !userInvocable,
    progressMessage: 'running',
    userFacingName(): string {
      return displayName || skillName
    },
    source,
    loadedFrom,
    hooks,
    skillRoot: baseDir,
    async getPromptForCommand(
      args: string,
      toolUseContext: SkillCommandContext,
    ): Promise<ContentBlockParam[]> {
      let finalContent = baseDir
        ? `Base directory for this skill: ${baseDir}\n\n${markdownContent}`
        : markdownContent

      finalContent = substituteArguments(
        finalContent,
        args,
        true,
        argumentNames,
      )

      // 替换 ${ATLAS_SKILL_DIR} 为技能自身目录（bash 注入 !`...` 引用
      // 内置脚本用）
      if (baseDir) {
        const skillDir =
          process.platform === 'win32' ? baseDir.replace(/\\/g, '/') : baseDir
        finalContent = finalContent.replace(/\$\{ATLAS_SKILL_DIR\}/g, skillDir)
      }

      // 替换 ${ATLAS_SESSION_ID} 为当前会话 ID
      finalContent = finalContent.replace(
        /\$\{ATLAS_SESSION_ID\}/g,
        getSessionId(),
      )

      // 安全：MCP skill 远端不可信 — 永不执行其 markdown 体内的内联
      // shell 命令（!`…` / ```! … ```）。${ATLAS_SKILL_DIR} 对 MCP
      // skill 亦无意义。
      if (loadedFrom !== 'mcp') {
        // TPC 覆写仅当 context.getAppState 提供（头注 ①）：skill 的
        // allowedTools 注入 alwaysAllowRules.command（逐字旧仓值替换）。
        const context: SkillCommandContext = toolUseContext.getAppState
          ? {
              ...toolUseContext,
              getAppState: () => {
                const appState = toolUseContext.getAppState!() as AppStateTpcSlice
                return {
                  ...appState,
                  toolPermissionContext: {
                    ...appState.toolPermissionContext,
                    alwaysAllowRules: {
                      ...appState.toolPermissionContext?.alwaysAllowRules,
                      command: allowedTools,
                    },
                  },
                }
              },
            }
          : toolUseContext

        finalContent = await executeShellCommandsInPrompt(
          finalContent,
          context,
          `/${skillName}`,
          shell,
        )
      }

      return [{ type: 'text', text: finalContent }]
    },
  }
}
