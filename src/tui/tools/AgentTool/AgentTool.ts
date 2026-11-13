import { z } from 'zod/v4'
import { getSdkAgentProgressSummariesEnabled } from 'src/tui/bootstrapState.js'
import type { ToolResult } from '../../Tool.js'
import { buildTool } from '../../Tool.js'
import { logForDebugging } from '../../utils/debug'
import { logError } from '../../utils/log.js'
import { createUserMessage } from '../../utils/messages.js'
import { getAgentModel } from '../../utils/model/agent.js'
import type { ModelAlias } from '../../../kernel/model/aliases.js'
import { createAgentId } from '../../utils/uuid.js'
import { registerAsyncAgent } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import type { AgentToolProgress } from '../../../kernel/types/tools.js'
import { lazySchema } from '../../../kernel/utils/lazySchema.js'
import { isCoordinatorMode } from '../../coordinator/coordinatorMode.js'
import { MAX_WORKER_SPAWN_DEPTH } from '../../constants/tools.js'
import { getBuiltInAgents } from './builtInAgents.js'
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js'
import { AGENT_TOOL_NAME } from '../../../kernel/tools/AgentTool/constants.js'
import {
  buildForkedMessages,
  FORK_AGENT,
  isForkSubagentEnabled,
} from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'
import {
  agentToolResultSchema,
  computeChildSpawnDepth,
  finalizeAgentTool,
  runAsyncAgentLifecycle,
} from './agentToolUtils.js'
import { getPrompt } from './prompt.js'
import { runAgent } from './runAgent.js'
import { renderToolUseMessage } from './UI.js'
import { isEnvTruthy } from '../../../kernel/utils/envUtils.js'

/**
 * 0.1.66 Q3-2 a1：逃生舱 env——ATLAS_AGENT_DEFAULT_FOREGROUND=1 时回退前景默认
 * （现行为字节级恒等 = off 面恒等锚）。env 缺省/0/非法值 = 后台默认（on 面）。
 * engine 侧 AgentTool.ts 同构 helper（TUI 不导入 engine——两车道各自维护）。
 */
function isAgentBackgroundByDefault(): boolean {
  return !isEnvTruthy(process.env.ATLAS_AGENT_DEFAULT_FOREGROUND)
}

/**
 * 判定本次委派是否走后台路径（0.1.66 翻转核心位）。
 * - 后台默认（env 缺省）：undefined→true / false→false / true→true
 * - 前景默认（env=1）：undefined→false / false→false / true→true（现行为恒等）
 */
function shouldRunInBackground(runInBg: boolean | undefined): boolean {
  if (isAgentBackgroundByDefault()) {
    return runInBg !== false
  }
  return !!runInBg
}

export const inputSchema = lazySchema(() =>
  z.object({
    description: z.string().describe('A short (3-5 word) description of the task'),
    prompt: z.string().describe('The task for the agent to perform'),
    subagent_type: z
      .string()
      .optional()
      .describe('The type of specialized agent to use for this task'),
    model: z
      .enum(['small', 'premium', 'fast'])
      .optional()
      .describe("Optional model override for this agent. Takes precedence over the agent definition's model frontmatter. If omitted, uses the agent definition's model, or inherits from the parent."),
    run_in_background: z
      .boolean()
      .optional()
      .describe('Set to true to run this agent in the background. You will be notified when it completes.'),
    name: z
      .string()
      .optional()
      .describe('Name for the spawned agent. Makes it addressable via SendMessage({to: name}) while running.'),
    team_name: z
      .string()
      .optional()
      .describe('Team name for spawning. Uses current team context if omitted.'),
  })
)
export type AgentToolInput = z.infer<ReturnType<typeof inputSchema>>

export const outputSchema = lazySchema(() =>
  z.union([
    agentToolResultSchema().extend({
      status: z.literal('completed'),
      prompt: z.string(),
    }),
    z.object({
      status: z.literal('async_launched'),
      agentId: z.string().describe('The ID of the async agent'),
      description: z.string().describe('The description of the task'),
      prompt: z.string().describe('The prompt for the agent'),
      outputFile: z.string().describe('Path to the output file for checking agent progress'),
      canReadOutputFile: z
        .boolean()
        .optional()
        .describe('Whether the calling agent has Read/Bash tools to check progress'),
    }),
  ])
)
export type Out = z.infer<ReturnType<typeof outputSchema>>
export type Progress =
  | AgentToolProgress
  | { type: 'skill_progress'; skill: string; progress: number }

function resolveAgentDefinition(
  subagentType: string | undefined,
  agents: AgentDefinition[],
): AgentDefinition {
  if (!subagentType) return GENERAL_PURPOSE_AGENT
  const found = agents.find(a => a.agentType === subagentType)
  if (found) return found
  // Unknown type: fall back to general-purpose behavior but keep the requested type name.
  return {
    ...GENERAL_PURPOSE_AGENT,
    agentType: subagentType,
    whenToUse: 'Custom agent type: ' + subagentType,
  }
}

export const AgentTool: any = buildTool({
  name: AGENT_TOOL_NAME,
  searchHint: 'delegate a self-contained task to a subagent',
  maxResultSizeChars: 20_000,
  get inputSchema(): any {
    return inputSchema()
  },
  get outputSchema(): any {
    return outputSchema()
  },
  isEnabled: () => true,
  isReadOnly: () => false,
  async description(_input?: any): Promise<string> {
    const agents = getBuiltInAgents()
    return await getPrompt(agents)
  },
  async prompt(): Promise<string> {
    const agents = getBuiltInAgents()
    return await getPrompt(agents)
  },
  renderToolUseMessage,
  mapToolResultToToolResultBlockParam(content: unknown, toolUseID: string) {
    const c = content as any
    if (c && c.status === 'completed') {
      const text = Array.isArray(c.content)
        ? c.content.map((b: any) => b.text || '').join(String.fromCharCode(10))
        : String(c.content ?? '')
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: '[agent completed]' + String.fromCharCode(10) + text,
      } as any
    }
    if (c && c.status === 'async_launched') {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content:
          '[agent launched in background] agentId=' + c.agentId + ' output=' + c.outputFile,
      } as any
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: JSON.stringify(content),
    } as any
  },
  async call(
    args: AgentToolInput,
    context: any,
    canUseTool: any,
    parentMessage: any,
    onProgress?: (progress: any) => void,
  ): Promise<ToolResult<Out>> {
    const agents = getBuiltInAgents()
    // 0.1.66 Q3-2 a1：翻转为后台默认（env 缺省 = 后台 / env=1 = 前景默认恒等）。
    const isAsync = shouldRunInBackground(args.run_in_background)
    const agentId = createAgentId(args.description)
    const parentModel =
      (context &&
        context.options &&
        (context.options.mainLoopModel || context.options.model)) ||
      'small'
    logForDebugging(
      '[AGENT] launching agent, type=' +
        (args.subagent_type ?? (isForkSubagentEnabled() ? 'fork' : 'general-purpose')),
    )

    let agentDefinition: AgentDefinition
    let promptMessages: any[]
    let useExactTools = false
    if (!args.subagent_type && isForkSubagentEnabled()) {
      agentDefinition = FORK_AGENT
      promptMessages = buildForkedMessages(args.prompt, parentMessage)
      useExactTools = true
    } else {
      agentDefinition = resolveAgentDefinition(args.subagent_type, agents)
      promptMessages = [createUserMessage({ content: args.prompt })]
    }

    const resolvedModel = getAgentModel(
      agentDefinition.model as ModelAlias | undefined,
      parentModel,
      args.model,
    )
    const availableTools =
      (context && context.options && context.options.tools) || []

    const childSpawnDepth = computeChildSpawnDepth(context?.options)
    const allowFanOut = isCoordinatorMode() && childSpawnDepth < MAX_WORKER_SPAWN_DEPTH

    if (isAsync) {
      const outputFile = getTaskOutputPath(agentId)
      const startTime = Date.now()
      // 0.1.94 C-2（f4 §9③ TaskOutput agentId 契约缝附带修 + §11④ 批复）：
      // async spawn 路径补 registerAsyncAgent（对齐 resume 链
      // resumeAgent.ts:198 先例）——appState.tasks[agentId] 在场 =
      // TaskOutput task 态读面 + SendMessage 名路由 running/stopped 支正形
      //（裁 evicted 兜底支的前提补齐）。补注册须取 resume 链全形
      //（registerAsyncAgent + runAsyncAgentLifecycle）：lifecycle 托管
      // completed/failed/killed 终态写点 + finalize + 通知（裸
      // registerAsyncAgent 会把 task 永久钉在 running = 回归面）。
      const rootSetAppState =
        context.setAppStateForTasks ?? context.setAppState
      const agentBackgroundTask = registerAsyncAgent({
        agentId,
        description: args.description,
        prompt: args.prompt,
        selectedAgent: agentDefinition,
        setAppState: rootSetAppState,
        toolUseId: context.toolUseId,
      })
      const metadata = {
        prompt: args.prompt,
        resolvedAgentModel: resolvedModel,
        isBuiltInAgent: agentDefinition.source === 'built-in',
        startTime,
        agentType: agentDefinition.agentType,
        isAsync: true,
      }
      void runAsyncAgentLifecycle({
        taskId: agentBackgroundTask.agentId,
        abortController: agentBackgroundTask.abortController!,
        makeStream: onCacheSafeParams =>
          runAgent({
            agentDefinition,
            promptMessages,
            toolUseContext: context,
            canUseTool,
            isAsync: true,
            querySource: 'repl',
            model: resolvedModel as ModelAlias,
            availableTools,
            useExactTools,
            description: args.description,
            override: { agentId },
            spawnDepth: childSpawnDepth,
            allowFanOut,
            onQueryProgress: onProgress
              ? () => {
                  onProgress({
                    type: 'agent_progress',
                    agentId,
                    message: null,
                  })
                }
              : undefined,
            onCacheSafeParams,
          }),
        metadata,
        description: args.description,
        toolUseContext: context,
        rootSetAppState,
        agentIdForCleanup: agentId,
        enableSummarization:
          isCoordinatorMode() ||
          isForkSubagentEnabled() ||
          getSdkAgentProgressSummariesEnabled(),
        getWorktreeResult: async () => ({}),
      }).catch(err => {
        logError(err)
      })
      return {
        data: {
          status: 'async_launched',
          agentId,
          description: args.description,
          prompt: args.prompt,
          outputFile,
          canReadOutputFile: true,
        },
      }
    }

    const startTime = Date.now()
    const gen = runAgent({
      agentDefinition,
      promptMessages,
      toolUseContext: context,
      canUseTool,
      isAsync: false,
      querySource: 'repl',
      model: resolvedModel as ModelAlias,
      availableTools,
      useExactTools,
      description: args.description,
      override: { agentId },
      spawnDepth: childSpawnDepth,
      allowFanOut,
      onQueryProgress: onProgress
        ? () => {
            onProgress({ type: 'agent_progress', agentId, message: null })
          }
        : undefined,
    })
    const agentMessages: any[] = []
    for await (const m of gen) {
      if (m && m.type !== 'attachment') agentMessages.push(m)
    }
    const result = finalizeAgentTool(agentMessages, agentId, {
      prompt: args.prompt,
      resolvedAgentModel: resolvedModel,
      isBuiltInAgent: agentDefinition.source === 'built-in',
      startTime,
      agentType: agentDefinition.agentType,
      isAsync: false,
    })
    logForDebugging(
      '[AGENT] agent ' +
        agentId +
        ' completed, tokens=' +
        result.totalTokens +
        ' toolUses=' +
        result.totalToolUseCount,
    )
    return {
      data: {
        ...result,
        status: 'completed',
        prompt: args.prompt,
      },
    }
  },
})
