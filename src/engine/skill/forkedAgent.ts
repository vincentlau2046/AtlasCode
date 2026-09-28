/**
 * engine/skill — forked 技能执行准备核层（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/forkedAgent.ts L143-240 核层落面：
 * createGetAppStateWithAllowedTools + prepareForkedCommandContext +
 * extractResultText）。
 *
 * 旧仓全文件（~900L）= forked query 循环族（CacheSafeParams 提示缓存共享 /
 * runForkedAgent 生成器 / createSubagentContext / usage tracking /
 * transcript 记录）→ 新仓对应执行面 = engine/tools/agent 的 runAgent
 * （§8.25 E-2 T-5b 已落，非本域）；本核层仅保留 fork 技能执行的前置
 * 准备 + 结果提取（S-E2b SkillTool fork 支消费）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① 旧 context.options.agentDefinitions.activeAgents → 新仓
 *      getBuiltInAgents()（agent 门面，coordinator 态自动返 coordinator
 *      族，见 engine/tools/agent/builtInAgents.ts）。
 *   ② 旧 extractResultText(Message[])（getLastAssistantMessage +
 *      extractTextContent）→ 新仓 runAgent 返回 AgentToolResult
 *      （content = 终态 assistant 文本块数组，agentToolUtils
 *      extractFinalText 先例）→ 入参改收 AgentToolResult['content']。
 *   ③ 旧 appState 完整型（toolPermissionContext 全字段）→ 窄 TPC 切片
 *      （同 skillCommand.ts AppStateTpcSlice 语义；新仓 appState =
 *      unknown，cast 收窄面）。
 *   ④ CacheSafeParams 提示缓存共享面（saveCacheSafeParams 槽 /
 *      post-turn fork 族）→ 裁（新仓提示缓存治理归 modelprovider 波）。
 */
import { getBuiltInAgents, type AgentDefinition } from '../tools/agent'
import { createUserMessage } from '../tools/files'
import { parseToolListFromCLI } from '../permissions'
import type { PromptCommand, SkillCommandContext } from './types'

/** 窄 TPC 切片（头注 ③）。 */
type AppStateTpcSlice = {
  toolPermissionContext?: {
    alwaysAllowRules?: { command?: string[] }
  }
}

/**
 * 造「appState 注入 allowed tools」的 getAppState（forked 技能执行授权
 * 面，逐字旧仓值替换语义）。
 */
export function createGetAppStateWithAllowedTools(
  baseGetAppState: () => unknown,
  allowedTools: string[],
): () => unknown {
  if (allowedTools.length === 0) {
    return baseGetAppState
  }
  return () => {
    const appState = baseGetAppState() as AppStateTpcSlice
    return {
      ...appState,
      toolPermissionContext: {
        ...appState.toolPermissionContext,
        alwaysAllowRules: {
          ...appState.toolPermissionContext?.alwaysAllowRules,
          command: [
            ...new Set([
              ...(appState.toolPermissionContext?.alwaysAllowRules?.command ||
                []),
              ...allowedTools,
            ]),
          ],
        },
      },
    }
  }
}

/** forked 命令执行准备结果。 */
export type PreparedForkedContext = {
  /** 参数替换后的 skill 内容 */
  skillContent: string
  /** 注入 allowed tools 的 getAppState（未提供时 = 透传基线） */
  modifiedGetAppState: () => unknown
  /** 执行用 agent 定义 */
  baseAgent: AgentDefinition
  /** 初始 prompt 消息 */
  promptMessages: ReturnType<typeof createUserMessage>[]
}

/**
 * 准备 forked 命令/技能执行上下文（SkillTool fork 支与 slash 命令共用
 * 的前置准备，逐字旧仓语义）。
 */
export async function prepareForkedCommandContext(
  command: PromptCommand,
  args: string,
  context: SkillCommandContext,
): Promise<PreparedForkedContext> {
  // 取参数替换后的 skill 内容
  const skillPrompt = await command.getPromptForCommand(args, context)
  const skillContent = skillPrompt
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('\n')

  // 解析并准备 allowed tools
  const allowedTools = parseToolListFromCLI(command.allowedTools ?? [])

  const baseGetAppState: () => unknown =
    context.getAppState ?? ((): unknown => ({}))
  const modifiedGetAppState = createGetAppStateWithAllowedTools(
    baseGetAppState,
    allowedTools,
  )

  // command.agent 指定时优先，否则 'general-purpose'
  const agentTypeName = command.agent ?? 'general-purpose'
  const agents = getBuiltInAgents()
  const baseAgent =
    agents.find(a => a.agentType === agentTypeName) ??
    agents.find(a => a.agentType === 'general-purpose') ??
    agents[0]

  if (!baseAgent) {
    throw new Error('No agent available for forked execution')
  }

  const promptMessages = [createUserMessage({ content: skillContent })]

  return {
    skillContent,
    modifiedGetAppState,
    baseAgent,
    promptMessages,
  }
}

/**
 * 从 agent 终态文本块提取结果文本（头注 ②：AgentToolResult['content']
 * 入参；全空 → defaultText）。
 */
export function extractResultText(
  content: Array<{ type: 'text'; text: string }>,
  defaultText = 'Execution completed',
): string {
  const textContent = content
    .map(block => block.text)
    .filter(text => text.length > 0)
    .join('\n')
  return textContent || defaultText
}
