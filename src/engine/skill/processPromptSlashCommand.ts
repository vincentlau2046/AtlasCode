/**
 * engine/skill — prompt 型 slash 命令处理核层（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/processUserInput/processSlashCommand.tsx prompt 子集落面：
 * processPromptSlashCommand + getMessagesForPromptSlashCommand +
 * formatCommandLoadingMetadata 族 + userInvocable 门 + recordSkillUsage）。
 *
 * 旧仓全文件 ≈900L（local-jsx 命令执行 / forked slash 命令 / compact
 * 边界 / MCP settle 轮询 / 附件消息族）→ 新仓本核层仅 prompt 路径
 * （local-jsx 族 = TUI 波，forked slash = S-E2b SkillTool fork 支，
 * 附件 / compact 面见裁面登记）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① coordinator 摘要支门控：旧 feature('COORDINATOR_MODE') +
 *      isEnvTruthy(ATLAS_COORDINATOR_MODE) → 新仓 isCoordinatorMode()
 *      （coordinator 门面，ON_BY_DEFAULT + kill-switch 语义）；
 *      !context.agentId 判据逐字保留（worker 子代理穿透取真 skill 内容）。
 *   ② registerSkillHooks（skill hooks 注册 + isSourceAdminTrusted 源
 *      信任门）→ 新仓 0 命中（hooks 波前向接缝）。
 *   ③ addInvokedSkill（compaction 保全 invoked-skill 态，bootstrap 面）
 *      → 新仓 bootstrap 为窄 spine 桩 → 裁。
 *   ④ 附件消息族（getAttachmentMessages @-mention/MCP 资源抽取 /
 *      createAttachmentMessage command_permissions）→ 新仓 0 命中；
 *      additionalAllowedTools 仍解析并随结果返回（调用方消费面）。
 *   ⑤ 粘贴图片 / precedingInputBlocks 合并面 → 裁（新仓无图片粘贴面，
 *      参数收窄，调用方波回填）。
 *   ⑥ uuid 参数（旧 dedup 面）→ 新 createUserMessage 自产 uuid，参裁。
 *   ⑦ 错误渲染面（AbortError 中断消息 / local-command-stderr 包装 /
 *      local-command-stdout 族）→ TUI 波；本核层 MalformedCommandError
 *      返单消息（e.message 直出），其余异常上抛由调用方渲染。
 */
import {
  type ContentBlockParam,
  type EffortValue,
} from '../../shared'
import { isCoordinatorMode } from '../coordinator'
import { parseToolListFromCLI } from '../permissions'
import { createUserMessage, type InDomainUserMessage } from '../tools/files'
import {
  COMMAND_ARGS_TAG,
  COMMAND_MESSAGE_TAG,
  COMMAND_NAME_TAG,
} from './constants'
import { findCommand } from './commands'
import { MalformedCommandError } from './errors'
import { recordSkillUsage } from './usageTracking'
import type { Command, SkillCommandContext } from './types'

/** prompt 型 slash 命令处理结果（旧 SlashCommandResult 窄化，头注 ⑤⑦）。 */
export type SlashCommandResult = {
  messages: InDomainUserMessage[]
  shouldQuery: boolean
  allowedTools?: string[]
  model?: string
  effort?: EffortValue
  command: Command
}

/**
 * 技能装载消息元数据（Skill 工具与子代理技能预载用，逐字旧仓值）。
 */
export function formatSkillLoadingMetadata(
  skillName: string,
  _progressMessage: string = 'loading',
): string {
  return [
    `<${COMMAND_MESSAGE_TAG}>${skillName}</${COMMAND_MESSAGE_TAG}>`,
    `<${COMMAND_NAME_TAG}>${skillName}</${COMMAND_NAME_TAG}>`,
    `<skill-format>true</skill-format>`,
  ].join('\n')
}

/** slash 命令装载消息元数据（/name 形式）。 */
function formatSlashCommandLoadingMetadata(
  commandName: string,
  args?: string,
): string {
  return [
    `<${COMMAND_MESSAGE_TAG}>${commandName}</${COMMAND_MESSAGE_TAG}>`,
    `<${COMMAND_NAME_TAG}>/${commandName}</${COMMAND_NAME_TAG}>`,
    args ? `<${COMMAND_ARGS_TAG}>${args}</${COMMAND_ARGS_TAG}>` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * 命令装载元数据（技能或 slash 命令）。
 * 用户可调用技能用 slash 形式（/name）；模型专用技能用技能形式
 * （"The X skill is running" 渲染面）。
 */
export function formatCommandLoadingMetadata(
  command: Command,
  args?: string,
): string {
  // 用 command.name（含插件前缀的限定名）而非 userFacingName()（后者
  // 可能经 displayName 回落剥掉插件前缀）。
  if (command.userInvocable !== false) {
    return formatSlashCommandLoadingMetadata(command.name, args)
  }
  if (
    command.loadedFrom === 'skills' ||
    command.loadedFrom === 'plugin' ||
    command.loadedFrom === 'mcp'
  ) {
    return formatSkillLoadingMetadata(command.name, command.progressMessage)
  }
  return formatSlashCommandLoadingMetadata(command.name, args)
}

/**
 * 处理 prompt 型 slash 命令（`/name args` 用户输入路径）。
 * 未知命令 / 非 prompt 型命令抛 MalformedCommandError（调用方渲染面）。
 */
export async function processPromptSlashCommand(
  commandName: string,
  args: string,
  commands: Command[],
  context: SkillCommandContext,
): Promise<SlashCommandResult> {
  const command = findCommand(commandName, commands)
  if (!command) {
    throw new MalformedCommandError(`Unknown command: ${commandName}`)
  }

  // 技能使用追踪（排序用，仅用户可调用 prompt 命令）
  if (command.userInvocable !== false) {
    recordSkillUsage(commandName)
  }

  // 用户不可调用技能仅模型经 SkillTool 调用 —— 直接引导用户
  if (command.userInvocable === false) {
    return {
      messages: [
        createUserMessage({ content: `/${commandName}` }),
        createUserMessage({
          content: `This skill can only be invoked by Atlas, not directly by users. Ask Atlas to use the "${commandName}" skill for you.`,
        }),
      ],
      shouldQuery: false,
      command,
    }
  }

  return getMessagesForPromptSlashCommand(command, args, context)
}

async function getMessagesForPromptSlashCommand(
  command: Command,
  args: string,
  context: SkillCommandContext,
): Promise<SlashCommandResult> {
  // coordinator 模式（仅主线程）跳过装载完整 skill 内容与权限：
  // coordinator 只有 Agent + TaskStop 工具，skill 内容与 allowedTools
  // 无用 —— 发摘要指示 coordinator 委派 worker 执行。
  // worker 进程内继承 ATLAS_COORDINATOR_MODE 故再加 !context.agentId：
  // agentId 仅子代理设置，worker 调 Skill 工具时穿透取真内容（头注 ①）。
  if (isCoordinatorMode() && !context.agentId) {
    const metadata = formatCommandLoadingMetadata(command, args)
    const parts: string[] = [
      `Skill "/${command.name}" is available for workers.`,
    ]
    if (command.description) {
      parts.push(`Description: ${command.description}`)
    }
    if (command.whenToUse) {
      parts.push(`When to use: ${command.whenToUse}`)
    }
    const skillAllowedTools = command.allowedTools ?? []
    if (skillAllowedTools.length > 0) {
      parts.push(
        `This skill grants workers additional tool permissions: ${skillAllowedTools.join(', ')}`,
      )
    }
    parts.push(
      `\nInstruct a worker to use this skill by including "Use the /${command.name} skill" in your Agent prompt. The worker has access to the Skill tool and will receive the skill's content and permissions when it invokes it.`,
    )
    const summaryContent: ContentBlockParam[] = [
      { type: 'text', text: parts.join('\n') },
    ]
    return {
      messages: [
        createUserMessage({ content: metadata }),
        createUserMessage({ content: summaryContent, isMeta: true }),
      ],
      shouldQuery: true,
      model: command.model,
      effort: command.effort,
      command,
    }
  }

  const result = await command.getPromptForCommand(args, context)

  // skill hooks 注册裁（头注 ②）；invoked-skill 态裁（头注 ③）

  const metadata = formatCommandLoadingMetadata(command, args)
  const additionalAllowedTools = parseToolListFromCLI(command.allowedTools ?? [])

  // 图片粘贴 / preceding 块合并面裁（头注 ⑤）→ 主消息 = 技能内容块
  const mainMessageContent: ContentBlockParam[] = result

  // 附件消息族裁（头注 ④）：command_permissions 附件未落，
  // additionalAllowedTools 仍随结果返回供调用方消费。
  const messages: InDomainUserMessage[] = [
    createUserMessage({ content: metadata }),
    createUserMessage({ content: mainMessageContent, isMeta: true }),
  ]

  return {
    messages,
    shouldQuery: true,
    allowedTools: additionalAllowedTools,
    model: command.model,
    effort: command.effort,
    command,
  }
}
