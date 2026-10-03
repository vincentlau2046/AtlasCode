/**
 * engine/tools/skill — SkillTool 本体（§8.67 D 波 S-E2b；旧仓
 * src/tools/SkillTool/SkillTool.ts 915L R2 裁面落 + prompt 213L
 * （skillPrompt.ts）+ UI.tsx 字符串面）。
 *
 * 消费方 = `skill/` 子门面 + `tools/` 门面 re-export + 组合根 baseTools
 * 注册（S-E2d 回填）；旧注册表 49 口径 30/49 位（tools/index.ts 头注，
 * §8.63 29/49 之上再缩 1）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod lazySchema input/output) → 新 shared Tool 契约：
 *    输入 = 纯 JSON schema 对象 SKILL_TOOL_INPUT_SCHEMA（旧 z.object 非
 *    strict → 无 strict 字段，readTool delta ① 先例）；输出 = TS 联合
 *    SkillToolOutput（skillToolInput.ts delta ①）；旧 outputSchema zod
 *    面 → 裁（TS 型承载）。
 *  ② 旧 ToolUseContext 富 context → SkillToolCallContext 窄 duck
 *    （pipeline 只填 { signal, checkPermission }；组合根可再填
 *    getAppState/agentId/tools/modelProvider/parentRole；遥测字段族
 *    queryTracking/discoveredSkillNames/getAgentContext = 裁）。
 *  ③ 旧 executeRemoteSkill 整支（+ extractUrlScheme + remoteSkillModules
 *    条件 require + feature('EXPERIMENTAL_SKILL_SEARCH') 门）→ 裁
 *    （R2-1；remote-skill 搜索 = remote 波）。
 *  ④ 旧 getAllCommands MCP skill 支（context.getAppState().mcp.commands
 *    filter loadedFrom==='mcp' + lodash uniqBy 去重）→ 裁（R2-2：MCP
 *    skill 注入窗 = remote 波 task #142 前向接缝；注入窗未注册 → 本地
 *    命令池 only，uniqBy 去重面随单源失效）。
 *  ⑤ 旧 executeForkedSkill 生成器 runAgent（逐消息 yield + onProgress
 *    逐条 skill_progress + normalizeMessages tool-use 判据）→ 新
 *    runAgent 单 Promise（onProgress 槽位保留但不逐条发 = 前向接缝
 *    登记，R2-10）；extractResultText 取 result.result.content
 *    （AgentToolResult content 面，skill 域 forkedAgent 先例）+
 *    defaultText 'Skill execution completed' 逐字；旧 durationMs =
 *    Date.now()-startTime → 新 AgentToolResult.totalDurationMs（同语义）。
 *  ⑥ 旧 agentId = createAgentId()（`a` + 8B hex）→ 新仓无 createAgentId
 *    → 本地等价 'skill-' + randomUUID（R2-9）。
 *  ⑦ 旧 effort 合并链（fork agentDefinition effort 合并 + call
 *    contextModifier effortValue 链 + SlashCommandResult.effort 消费）
 *    → 裁（R2-8：新 AgentDefinition 无 effort 字段，effort 链同步裁）。
 *  ⑧ 旧遥测字段族（forkedSanitizedName/wasDiscoveredField/
 *    pluginMarketplace/queryDepth/parentAgentId + inline 支
 *    sanitizedCommandName 族）→ 裁（遥测面已删，新仓 0 消费）。
 *  ⑨ 旧 contextModifier allowedTools 链（getAppState 包装 TPC
 *    alwaysAllowRules.command Set-union）→ 复用 skill 域
 *    createGetAppStateWithAllowedTools（S-E2a 已落同形，语义逐字）；
 *    model 链 = resolveSkillModelOverride（新仓直通）。
 *  ⑩ 旧 getToolUseIDFromParentMessage / tagMessagesWithToolUseID
 *    （tools/utils.ts）→ 域内本地等价；新仓消息块面 = message.content
 *    （agentToolUtils.messageBlocks 先例，兜底顶层 content 旧仓形）→
 *    双取窄 cast；InDomainUserMessage 无 sourceToolUseID 字段 →
 *    本地扩展型（cast，登记）；旧 Message 'progress' 型过滤支 = 新
 *    InDomainUserMessage 单形死支保留逐字（登记）。
 *  ⑪ 旧 UI.tsx JSX 面（renderToolResultMessage/ProgressMessage/
 *    RejectedMessage/ErrorMessage React 组件 + MAX_PROGRESS_MESSAGES_
 *    TO_SHOW/INITIALIZING_TEXT 常量 + Progress 型）→ 裁（R2-12，TUI
 *    波）；renderToolUseMessage 纯字符串面随迁逐字（options.commands
 *    duck cast；loadedFrom === 'commands_DEPRECATED' → '/'+skill）。
 *  ⑫ 旧 call 入口 recordSkillUsage(commandName) 无条件 + 新
 *    processPromptSlashCommand 内 recordSkillUsage（userInvocable !==
 *    false）双记 → 60s 防抖吸收第二记（旧逐字语义，两记均保留）。
 *  ⑬ 旧 newMessages/contextModifier 消费方（消息/REPL 渲染）= 新
 *    pipeline toolExecution call 站点 0 消费 → 逐字产出，消费 =
 *    消息/REPL 波前向接缝（登记）。
 *  ⑭ validateInput 码 5（type !== 'prompt'）= 新 Command prompt 单形
 *    死支保留逐字（S-E2a 裁面 ① 登记）。
 *  ⑮ 旧 skill.model override（ModelAlias 链 + ModelAlias cast）→ 新
 *    runAgent overrideRole（ModelRole 3 值）；role 别名（skillModel
 *    parseUserSpecifiedModel 已小写归一）透传，自定义模型名 override =
 *    裁（非 role 值不进 overrideRole，语义差登记）。
 *  ⑯ 旧 finally clearInvokedSkillsForAgent(agentId) → 新仓 0 命中
 *    （invoked-skill 态裁，bootstrap 窄 spine）→ finally 残留守
 *    （no-op，登记）。
 *  ⑰ 旧 COMMANDS ~70 TUI 命令 / skillChangeDetector 304L /
 *    REMOTE_SAFE·BRIDGE_SAFE → TUI 波 / remote 波（R2 裁定 ④⑥⑤，
 *    本文件 0 消费）。
 */
import { randomUUID } from 'crypto'

import {
  type AssistantMessage,
  type PermissionResult,
  type PermissionUpdate,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
  logForDebugging,
} from '../../../shared'
import { getRuleByContentsForTool } from '../../../permissions'
import {
  getModelProvider,
  MODEL_ROLES,
  type ModelRole,
} from '../../../modelprovider'
import {
  COMMAND_MESSAGE_TAG,
  createGetAppStateWithAllowedTools,
  extractResultText,
  findCommand,
  getCommands,
  prepareForkedCommandContext,
  processPromptSlashCommand,
  recordSkillUsage,
  resolveSkillModelOverride,
  type Command,
  type SkillCommandContext,
} from '../../skill'
import { runAgent } from '../agent'
import { SKILL_TOOL_NAME } from '../toolNames'
import type { InDomainUserMessage } from '../files'
import { getSkillPrompt } from './skillPrompt'
import {
  type SkillToolCallContext,
  type SkillToolCheckContext,
  type SkillToolContextModifierCtx,
  type SkillToolInput,
  type SkillToolOutput,
} from './skillToolInput'

/** 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①；旧 z.object 非 strict → 无 strict 字段）。 */
export const SKILL_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    skill: {
      type: 'string',
      description: 'The skill name. E.g., "commit", "review-pr", or "pdf"',
    },
    args: { type: 'string', description: 'Optional arguments for the skill' },
  },
  required: ['skill'],
}

// Tool 契约非参数化（Input 泛参位 = JSON schema 对象型，非 duck 输入型，
// readTool face 先例）；face 扩型 = checkPermissions 返回型收窄
// Promise<PermissionResult<SkillToolInput>>（契约位 Promise<unknown>
// 不满足 RuleTool 目标型，扩型收窄 = getRuleByContentsForTool 直接
// 传值免 cast，webFetchTool face 先例）。
type SkillToolFace = Tool & {
  checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<SkillToolInput>>
}

/**
 * 取全部本地命令池（delta ④：MCP skill 支裁，remote 波 task #142
 * 注入窗前向接缝——注入窗未注册时恒返回本地池）。
 */
async function getAllCommands(): Promise<Command[]> {
  // #261（#259 验收缺口）：根锚定 getProjectRoot()→process.cwd()（主 init 一致；
  // 非 git 工作区 / git 子目录 .atlas/skills 漏扫收口，git 项目零变化）
  return getCommands(process.cwd())
}

/**
 * 旧 tools/utils.ts getToolUseIDFromParentMessage 本地等价（delta ⑩：
 * 新仓消息块面 = message.content（agentToolUtils.messageBlocks 先例：
 * 新仓 assistant/user 消息块在 message.content，兜底顶层 content 旧仓
 * 形）→ 双取 + 块数组窄 cast）。
 */
function getToolUseIDFromParentMessage(
  parentMessage: AssistantMessage | undefined,
  toolName: string,
): string | undefined {
  if (!parentMessage) return undefined
  const raw =
    (parentMessage.message as { content?: unknown } | undefined)?.content ??
    parentMessage.content ??
    []
  const content = raw as Array<{
    type?: string
    name?: string
    id?: string
  }>
  const toolUseBlock = content.find(
    block => block.type === 'tool_use' && block.name === toolName,
  )
  return toolUseBlock?.id
}

/** delta ⑩：InDomainUserMessage 无 sourceToolUseID 字段 → 本地扩展型。 */
type TaggedUserMessage = InDomainUserMessage & { sourceToolUseID?: string }

/** 旧 tools/utils.ts tagMessagesWithToolUseID 本地等价（delta ⑩）。 */
function tagMessagesWithToolUseID(
  messages: InDomainUserMessage[],
  toolUseID: string | undefined,
): TaggedUserMessage[] {
  if (!toolUseID) return messages
  return messages.map(m => ({ ...m, sourceToolUseID: toolUseID }))
}

/**
 * 在 forked 子代理上下文执行技能（delta ⑤⑥⑦⑮⑯；旧 executeForkedSkill
 * 生成器 → 新 runAgent 单 Promise）。
 */
async function executeForkedSkill(
  command: Command,
  commandName: string,
  args: string | undefined,
  context: SkillToolCallContext,
): Promise<ToolResult<SkillToolOutput>> {
  // delta ⑥：旧 createAgentId() → 'skill-' + randomUUID 本地等价
  const agentId = `skill-${randomUUID()}`

  const { skillContent, baseAgent } = await prepareForkedCommandContext(
    command,
    args || '',
    {
      signal: context.signal,
      checkPermission: context.checkPermission,
      getAppState: context.getAppState,
      agentId: context.agentId,
    },
  )

  // delta ⑮：skill.model = role 别名（已小写归一）→ overrideRole；
  // 自定义模型名 override 裁（非 role 值不进 overrideRole）
  const overrideRole =
    (MODEL_ROLES as readonly string[]).includes(command.model ?? '')
      ? (command.model as ModelRole)
      : undefined

  logForDebugging(
    `SkillTool executing forked skill ${commandName} with agent ${baseAgent.agentType}`,
  )

  try {
    const runResult = await runAgent({
      agentDefinition: baseAgent,
      prompt: skillContent,
      tools: context.tools ?? [],
      modelProvider: context.modelProvider ?? getModelProvider(),
      parentRole: context.parentRole ?? 'small',
      overrideRole,
      agentId,
      signal: context.signal,
      checkPermission: context.checkPermission,
    })

    const resultText = extractResultText(
      runResult.result.content,
      'Skill execution completed',
    )

    logForDebugging(
      `SkillTool forked skill ${commandName} completed in ${runResult.result.totalDurationMs}ms`,
    )

    return {
      data: {
        success: true,
        commandName,
        status: 'forked',
        agentId,
        result: resultText,
      },
    }
  } finally {
    // delta ⑯：旧 clearInvokedSkillsForAgent(agentId) 残留守（no-op）
  }
}

// Allowlist of PromptCommand property keys that are safe and don't require permission.
// If a skill has any property NOT in this set with a meaningful value, it requires
// permission. This ensures new properties added to PromptCommand in the future
// default to requiring permission until explicitly reviewed and added here.
const SAFE_SKILL_PROPERTIES = new Set([
  // PromptCommand properties
  'type',
  'progressMessage',
  'contentLength',
  'argNames',
  'model',
  'effort',
  'source',
  'pluginInfo',
  'disableNonInteractive',
  'skillRoot',
  'context',
  'agent',
  'getPromptForCommand',
  'frontmatterKeys',
  // CommandBase properties
  'name',
  'description',
  'hasUserSpecifiedDescription',
  'isEnabled',
  'isHidden',
  'aliases',
  'isMcp',
  'argumentHint',
  'whenToUse',
  'paths',
  'version',
  'disableModelInvocation',
  'userInvocable',
  'loadedFrom',
  'immediate',
  'userFacingName',
])

function skillHasOnlySafeProperties(command: Command): boolean {
  for (const key of Object.keys(command)) {
    if (SAFE_SKILL_PROPERTIES.has(key)) {
      continue
    }
    // Property not in safe allowlist - check if it has a meaningful value
    const value = (command as Record<string, unknown>)[key]
    if (value === undefined || value === null) {
      continue
    }
    if (Array.isArray(value) && value.length === 0) {
      continue
    }
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue
    }
    return false
  }
  return true
}

export const SkillTool: SkillToolFace = {
  name: SKILL_TOOL_NAME,
  inputSchema: SKILL_TOOL_INPUT_SCHEMA,
  inputJSONSchema: SKILL_TOOL_INPUT_SCHEMA,
  searchHint: 'invoke a slash-command skill',
  // 100K chars - tool result persistence threshold
  maxResultSizeChars: 100_000,
  isEnabled: () => true,
  // Only one skill/command should run at a time, since the tool expands the
  // command into a full prompt that Claude must process before continuing.
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  userFacingName: () => 'Skill',
  toAutoClassifierInput(input: unknown) {
    const { skill } = input as SkillToolInput
    // Skill-coach needs the skill name to avoid false-positive "you could have
    // used skill X" suggestions when X was actually invoked.
    return skill ?? ''
  },
  async description() {
    // delta ④（skillPrompt）：新契约唯一 prompt 面 = 旧 prompt() 体
    return getSkillPrompt(process.cwd()) // #261：cwd 锚定（同上）
  },
  async checkPermissions(
    input: unknown,
    context: unknown,
  ): Promise<PermissionResult<SkillToolInput>> {
    const { skill, args } = input as SkillToolInput

    // Skills are just skill names, no arguments
    const trimmed = skill.trim()

    // Remove leading slash if present (for compatibility)
    const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed

    const appState = (context as SkillToolCheckContext).getAppState()
    const permissionContext = appState.toolPermissionContext

    // Look up the command object to pass as metadata
    const commands = await getAllCommands()
    const commandObj = findCommand(commandName, commands)

    // Helper function to check if a rule matches the skill
    // Normalizes both inputs by stripping leading slashes for consistent matching
    const ruleMatches = (ruleContent: string): boolean => {
      // Normalize rule content by stripping leading slash
      const normalizedRule = ruleContent.startsWith('/')
        ? ruleContent.substring(1)
        : ruleContent

      // Check exact match (using normalized commandName)
      if (normalizedRule === commandName) {
        return true
      }
      // Check prefix match (e.g., "review:*" matches "review-pr 123")
      if (normalizedRule.endsWith(':*')) {
        const prefix = normalizedRule.slice(0, -2) // Remove ':*'
        return commandName.startsWith(prefix)
      }
      return false
    }

    // Check for deny rules
    const denyRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool,
      'deny',
    )
    for (const [ruleContent, rule] of denyRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: 'deny',
          message: `Skill execution blocked by permission rules`,
          decisionReason: {
            type: 'rule',
            rule,
          },
        }
      }
    }

    // Check for allow rules
    const allowRules = getRuleByContentsForTool(
      permissionContext,
      SkillTool,
      'allow',
    )
    for (const [ruleContent, rule] of allowRules.entries()) {
      if (ruleMatches(ruleContent)) {
        return {
          behavior: 'allow',
          updatedInput: { skill, args },
          decisionReason: {
            type: 'rule',
            rule,
          },
        }
      }
    }

    // Auto-allow skills that only use safe properties.
    // This is an allowlist: if a skill has any property NOT in this set with a
    // meaningful value, it requires permission. This ensures new properties added
    // in the future default to requiring permission.
    // delta ⑭：旧 commandObj?.type === 'prompt' 判据 = 新单形恒真 →
    // 收敛为存在性判据（undefined 时跳过 auto-allow，旧逐字语义）
    if (commandObj && skillHasOnlySafeProperties(commandObj)) {
      return {
        behavior: 'allow',
        updatedInput: { skill, args },
        decisionReason: undefined,
      }
    }

    // Prepare suggestions for exact skill and prefix
    // Use normalized commandName (without leading slash) for consistent rules
    const suggestions: PermissionUpdate[] = [
      // Exact skill suggestion
      {
        type: 'addRules',
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: commandName,
          },
        ],
        behavior: 'allow',
        destination: 'localSettings',
      },
      // Prefix suggestion to allow any args
      {
        type: 'addRules',
        rules: [
          {
            toolName: SKILL_TOOL_NAME,
            ruleContent: `${commandName}:*`,
          },
        ],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ]

    // Default behavior: ask user for permission
    return {
      behavior: 'ask',
      message: `Execute skill: ${commandName}`,
      decisionReason: undefined,
      suggestions,
      updatedInput: { skill, args },
      metadata: commandObj ? { command: commandObj } : undefined,
    }
  },
  async validateInput(input: unknown): Promise<ValidationResult> {
    const { skill } = input as SkillToolInput
    // Skills are just skill names, no arguments
    const trimmed = skill.trim()
    if (!trimmed) {
      return {
        result: false,
        message: `Invalid skill format: ${skill}`,
        errorCode: 1,
      }
    }

    // Remove leading slash if present (for compatibility)
    const hasLeadingSlash = trimmed.startsWith('/')
    const normalizedCommandName = hasLeadingSlash
      ? trimmed.substring(1)
      : trimmed

    // Get available commands（delta ④：MCP 支裁 = 本地池）
    const commands = await getAllCommands()

    // Check if command exists
    const foundCommand = findCommand(normalizedCommandName, commands)
    if (!foundCommand) {
      return {
        result: false,
        message: `Unknown skill: ${normalizedCommandName}`,
        errorCode: 2,
      }
    }

    // Check if command has model invocation disabled
    if (foundCommand.disableModelInvocation) {
      return {
        result: false,
        message: `Skill ${normalizedCommandName} cannot be used with ${SKILL_TOOL_NAME} tool due to disable-model-invocation`,
        errorCode: 4,
      }
    }

    // Check if command is a prompt-based command（delta ⑭：新 Command
    // prompt 单形死支保留逐字）
    if (foundCommand.type !== 'prompt') {
      return {
        result: false,
        message: `Skill ${normalizedCommandName} is not a prompt-based skill`,
        errorCode: 5,
      }
    }

    return { result: true }
  },
  // delta ⑪：旧 UI.tsx renderToolUseMessage 纯字符串面逐字（JSX 面裁）
  renderToolUseMessage(
    input: unknown,
    options: { theme: unknown; verbose: boolean; commands?: unknown[] },
  ) {
    const { skill } = (input ?? {}) as Partial<SkillToolInput>
    if (!skill) {
      return null
    }
    // Look up the command to check if it came from the legacy /commands folder
    const commands = (options.commands ?? []) as Command[]
    const command = commands.find(c => c.name === skill)
    const displayName =
      command?.loadedFrom === 'commands_DEPRECATED' ? `/${skill}` : skill
    return displayName
  },
  async call(
    args: unknown,
    context: unknown,
    _canUseTool: unknown,
    parentMessage: AssistantMessage,
  ): Promise<ToolResult<SkillToolOutput>> {
    // At this point, validateInput has already confirmed:
    // - Skill format is valid
    // - Skill exists
    // - Skill can be loaded
    // - Skill doesn't have disableModelInvocation
    // - Skill is a prompt-based skill

    const callCtx = context as SkillToolCallContext

    // Skills are just names, with optional arguments
    const { skill, args: skillArgs } = args as SkillToolInput
    const trimmed = skill.trim()

    // Remove leading slash if present (for compatibility)
    const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed

    const commands = await getAllCommands()
    const command = findCommand(commandName, commands)

    // Track skill usage for ranking（delta ⑫：双记 60s 防抖吸收）
    recordSkillUsage(commandName)

    // Check if skill should run as a forked sub-agent
    //（delta ⑭：新 Command prompt 单形 → type 判据裁，context === 'fork' 逐字）
    if (command?.context === 'fork') {
      return executeForkedSkill(
        command,
        commandName,
        skillArgs,
        callCtx,
      )
    }

    // Process the skill with optional args
    const skillCmdCtx: SkillCommandContext = {
      signal: callCtx.signal,
      checkPermission: callCtx.checkPermission,
      getAppState: callCtx.getAppState,
      agentId: callCtx.agentId,
    }
    const processedCommand = await processPromptSlashCommand(
      commandName,
      skillArgs || '', // Pass args if provided
      commands,
      skillCmdCtx,
    )

    if (!processedCommand.shouldQuery) {
      throw new Error('Command processing failed')
    }

    // Extract metadata from the command
    const allowedTools = processedCommand.allowedTools || []
    const model = processedCommand.model

    // Get the tool use ID from the parent message for linking newMessages
    const toolUseID = getToolUseIDFromParentMessage(
      parentMessage,
      SKILL_TOOL_NAME,
    )

    // Tag user messages with sourceToolUseID so they stay transient until this tool resolves
    const newMessages = tagMessagesWithToolUseID(
      processedCommand.messages.filter(m => {
        // 旧 Message 'progress' 型过滤支 = 新 InDomainUserMessage 单形死支
        // 保留逐字（delta ⑩）
        if ((m as { type: string }).type === 'progress') {
          return false
        }
        // Filter out command-message since SkillTool handles display
        const content = m.message?.content
        if (
          typeof content === 'string' &&
          content.includes(`<${COMMAND_MESSAGE_TAG}>`)
        ) {
          return false
        }
        return true
      }),
      toolUseID,
    )

    logForDebugging(
      `SkillTool returning ${newMessages.length} newMessages for skill ${commandName}`,
    )

    // Note: addInvokedSkill and registerSkillHooks are called inside
    // processPromptSlashCommand (via getMessagesForPromptSlashCommand), so
    // calling them again here would double-register hooks and rebuild
    // skillContent redundantly.（两族均已裁，头注 ⑯ 残留守）

    // Return success with newMessages and contextModifier（delta ⑬ 消费接缝）
    return {
      data: {
        success: true,
        commandName,
        allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
        model,
      },
      newMessages,
      contextModifier(ctx) {
        let modifiedContext = ctx as SkillToolContextModifierCtx

        // Update allowed tools if specified
        if (allowedTools.length > 0) {
          // delta ⑨：TPC Set-union 语义 = skill 域
          // createGetAppStateWithAllowedTools（S-E2a 已落同形）
          const baseGetAppState =
            modifiedContext.getAppState ?? ((): unknown => ({}))
          modifiedContext = {
            ...modifiedContext,
            getAppState: createGetAppStateWithAllowedTools(
              baseGetAppState,
              allowedTools,
            ),
          }
        }

        // resolveSkillModelOverride：skill 声明的模型对当前模型的覆盖（新仓直通）
        // delta ⑦：effort 链随裁（新 AgentDefinition 无 effort 字段）
        if (model) {
          modifiedContext = {
            ...modifiedContext,
            options: {
              ...modifiedContext.options,
              mainLoopModel: resolveSkillModelOverride(
                model,
                modifiedContext.options?.mainLoopModel,
              ),
            },
          }
        }

        return modifiedContext
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    result: SkillToolOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    // Handle forked skill result
    if ('status' in result && result.status === 'forked') {
      return {
        type: 'tool_result' as const,
        tool_use_id: toolUseID,
        content: `Skill "${result.commandName}" completed (forked execution).\n\nResult:\n${result.result}`,
      }
    }

    // Inline skill result (default)
    return {
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: `Launching skill: ${result.commandName}`,
    }
  },
}
