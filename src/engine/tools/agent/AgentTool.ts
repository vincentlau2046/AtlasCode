/**
 * engine/tools/agent — AgentTool（§8.25 E-2 T-5b，旧仓 tools/AgentTool/AgentTool.ts 裁剪）
 *
 * 一等注册 Tool：委托一个自包含任务给子代理（子代理在隔离上下文跑 queryAgentLoop）。
 * 旧仓 buildTool(zod schema) → 新仓 shared Tool 契约（inputSchema = 纯 JSON schema 对象）。
 *
 * 真核心：
 *   - 完整 Tool 契约（name/call/description/isConcurrencySafe/checkPermissions/
 *     mapToolResultToToolResultBlockParam/…）
 *   - call 同步路径：resolveAgentDefinition → spawn 深度门（computeChildSpawnDepth +
 *     isCoordinatorMode + MAX_WORKER_SPAWN_DEPTH → allowFanOut）→ resolveAgentTools
 *     → runAgent（复用 queryAgentLoop）→ finalize → 终态。
 *   - 模型 override：input.model（ModelRole）> agentDef.model > parentRole。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 异步 agent（run_in_background → runAsyncAgentLifecycle / 通知队列）→
 *     **Q3-1 已落**（0.1.65）：input schema 加回 run_in_background + call() 异步分支
 *     （run_in_background:true → void runAsyncAgentLifecycle → 立即返回 async_launched；
 *     默认缺省 = 同步路径字节级恒等）。TUI 侧 React 耦合面（后台摘要 summarization /
 *     progress tracker / teammate 共享任务面）→ 残留守。
 *   - 内建 agent 注册表已接线（T-5c）：call/description 遍历 getBuiltInAgents()（含
 *     coordinator 分支 T-5d：isCoordinatorMode 真 → 仅内建 worker，见 builtInAgents）；
 *     statusline/explore/plan/guide/verification 内建体 → 残留守（builtInAgents 头注登记）。
 *   - user/plugin 自定义 agent（loadAgentDefinitions 注入面，parseAgentFromMarkdown 解析
 *     产物）当前无 src 消费点，call/description 仅见内建表 → 残留守：自定义 agent 的
 *     注册表装配归组合根（E-wave-end，getAllBaseTools 同批）；旧仓 call 传全量 override
 *     列表（getAgentDefinitionsWithOverrides），本版未接线。
 *   - fork 子代理机制已 port（T-5c forkSubagent：isForkSubagentEnabled + FORK_AGENT +
 *     buildForkedMessages + buildChildMessage + isInForkChild）；但 AgentTool.call 的
 *     fork 路径接线（!subagent_type 触发 + useExactTools 字节级命中 + 父消息/系统提示词
 *     threading + 全异步 spawn）→ 残留守（需父消息 threading，未落）。
 *   - 权限规则求值（checkPermissions 具体 deny/allow 规则）→ E-4；本版 passthrough。
 *   - renderToolUseMessage / UI（React 进度渲染）→ 残留守（TUI 面，非 TUI 不消费）。
 */
import { randomUUID } from 'crypto'
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResultBlockParam,
  Tools,
} from '../../../shared'
import { getModelProvider, type ModelProvider, type ModelRole } from '../../../modelprovider'
import { GENERAL_PURPOSE_AGENT, type AgentDefinition } from './agentDefinition'
import { getBuiltInAgents } from './builtInAgents'
import {
  computeChildSpawnDepth,
  resolveAgentTools,
} from './agentToolUtils'
import { AGENT_TOOL_NAME, MAX_WORKER_SPAWN_DEPTH } from './constants'
import { getPrompt } from './prompt'
import { runAgent, runAsyncAgentLifecycle } from './runAgent'
import { isCoordinatorMode } from '../../coordinator'
import type { PermissionGate } from '../../pipeline'
import { getTaskOutputPath } from '../../../task'
import { enqueueAgentNotification } from '../../coordinator/tasks/localAgentTask'
import { isEnvTruthy } from '../../../shared'
import { trackBackgroundAgent } from './backgroundTracker'

/**
 * 0.1.66 Q3-2 a1：逃生舱 env——ATLAS_AGENT_DEFAULT_FOREGROUND=1 时回退前景默认
 * （现行为字节级恒等 = off 面恒等锚）。env 缺省/0/非法值 = 后台默认（on 面）。
 * 0.1.63 ATLAS_GOAL_CHECKIN_MINUTES env 门同构先例。
 */
function isAgentBackgroundByDefault(): boolean {
  return !isEnvTruthy(process.env.ATLAS_AGENT_DEFAULT_FOREGROUND)
}

/**
 * 判定本次委派是否走后台路径（0.1.66 翻转核心位）。
 * - 后台默认（env 缺省）：undefined→true / false→false / true→true
 * - 前景默认（env=1）：undefined→false / false→false / true→true（现行为恒等）
 */
function shouldRunInBackground(
  runInBg: boolean | undefined,
): boolean {
  if (isAgentBackgroundByDefault()) {
    return runInBg !== false
  }
  return !!runInBg
}

/** 输入 JSON schema（旧仓 zod inputSchema 裁剪；Q3-1 加回 run_in_background）。 */
const AGENT_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'A short (3-5 word) description of the task',
    },
    prompt: {
      type: 'string',
      description: 'The task for the agent to perform',
    },
    subagent_type: {
      type: 'string',
      description: 'The type of specialized agent to use for this task',
    },
    model: {
      enum: ['small', 'premium', 'fast'],
      description:
        "Optional model override for this agent. Takes precedence over the agent definition's model. If omitted, inherits from the parent.",
    },
    run_in_background: {
      type: 'boolean',
      description:
        'Set to true to run this agent in the background. You will be notified when it completes.',
    },
  },
  required: ['description', 'prompt'],
}

interface AgentToolInput {
  description: string
  prompt: string
  subagent_type?: string
  model?: ModelRole
  run_in_background?: boolean
}

/**
 * call 第 2 参 context（旧仓 ToolUseContext 裁剪）。pipeline 透传 { signal,
 * checkPermission }（F1 子代理门透传，§8.52 A2：父 loop 门经 call context 入
 * 子 loop 同门执行）；组合根（E-wave-end S-E2）可再填 tools / modelProvider /
 * parentRole / spawnDepth（父线程工具池 + 单例 provider 注入窗口 + 父 role +
 * spawn 深度）。未填 → 空工具池 / 单例 provider / 'small' / 深度 0（安全退化，
 * 非假能力）。
 */
interface AgentToolCallContext {
  signal?: AbortSignal
  tools?: Tools
  modelProvider?: ModelProvider
  parentRole?: ModelRole
  spawnDepth?: number
  /** 权限门（F1，§8.52 A2）：父 loop 门 → 子 loop 同门执行（runAgent 透传）。 */
  checkPermission?: PermissionGate
}

/** 未知 type 回落 general-purpose 语义但保留请求 type 名 + 自定义 whenToUse（旧仓 resolveAgentDefinition 同义）。 */
function resolveAgentDefinition(
  subagentType: string | undefined,
  agents: readonly AgentDefinition[],
): AgentDefinition {
  if (!subagentType) return GENERAL_PURPOSE_AGENT
  const found = agents.find((a) => a.agentType === subagentType)
  if (found) return found
  return {
    ...GENERAL_PURPOSE_AGENT,
    agentType: subagentType,
    whenToUse: 'Custom agent type: ' + subagentType,
  }
}

export const AgentTool: Tool = {
  name: AGENT_TOOL_NAME,
  inputSchema: AGENT_TOOL_INPUT_SCHEMA,
  inputJSONSchema: AGENT_TOOL_INPUT_SCHEMA,
  maxResultSizeChars: 20_000,
  searchHint: 'delegate a self-contained task to a subagent',
  isConcurrencySafe: () => false,
  isEnabled: () => true,
  isReadOnly: () => false,
  // 旧仓 MCPTool 基类同义：Agent 工具须权限，具体规则求值归 E-4（残留守）。
  checkPermissions: async () => ({
    behavior: 'passthrough',
    message: 'Agent tool requires permission.',
  }),
  toAutoClassifierInput: (input: unknown) => input,
  description: async () => getPrompt(getBuiltInAgents()),
  userFacingName: (input: unknown) => {
    const desc = (input as AgentToolInput | undefined)?.description
    return desc ? `${desc} (Agent)` : 'Agent'
  },
  // TUI 渲染残留守（见头注）；非 TUI 面（pipeline/loop）不消费此返回。
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const c = content as { status?: string; content?: Array<{ text?: string }>; agentId?: string; outputFile?: string } | undefined
    if (c && c.status === 'completed') {
      const text = (c.content ?? [])
        .map((b) => b?.text ?? '')
        .join('\n')
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: '[agent completed]\n' + text,
      }
    }
    if (c && c.status === 'async_launched') {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content:
          '[agent launched in background] agentId=' + (c.agentId ?? '') + ' output=' + (c.outputFile ?? ''),
      }
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: JSON.stringify(content ?? null),
    }
  },
  async call(args: unknown, context: unknown): Promise<{ data: unknown }> {
    const input = (args ?? {}) as AgentToolInput
    const ctx = (context ?? {}) as AgentToolCallContext
    const parentRole: ModelRole = ctx.parentRole ?? 'small'
    const modelProvider: ModelProvider = ctx.modelProvider ?? getModelProvider()

    // 内建注册表遍历（T-5c）：未知 type 回落 general-purpose（保留请求 type 名）。
    const agentDefinition = resolveAgentDefinition(
      input.subagent_type,
      getBuiltInAgents(),
    )
    const availableTools = ctx.tools ?? []
    const childSpawnDepth = computeChildSpawnDepth({ spawnDepth: ctx.spawnDepth })
    const allowFanOut = isCoordinatorMode() && childSpawnDepth < MAX_WORKER_SPAWN_DEPTH
    const resolvedTools = resolveAgentTools(
      agentDefinition,
      availableTools,
      allowFanOut,
    ).resolvedTools

    const agentId = 'agent-' + randomUUID()

    // Q3-1（0.1.65）+ Q3-2 a1（0.1.66 翻转）：
    // 异步路径——shouldRunInBackground 判定（env 缺省=后台默认 / env=1=前景默认恒等）。
    // 0.1.66 前 = `if (input.run_in_background)`（缺省前景）；0.1.66 后 = 翻转为后台默认。
    if (shouldRunInBackground(input.run_in_background)) {
      const outputFile = getTaskOutputPath(agentId)
      // 后台跑子代理到终态 + 投递完成/失败通知（既有通知链消费，零新建队列）。
      // R4：promise 经 trackBackgroundAgent 追踪——headless/-p 进程退出前 drain。
      const bgPromise = runAsyncAgentLifecycle({
        agentDefinition,
        prompt: input.prompt,
        tools: resolvedTools,
        modelProvider,
        parentRole,
        overrideRole: input.model,
        agentId,
        spawnDepth: childSpawnDepth,
        signal: ctx.signal,
        checkPermission: ctx.checkPermission,
        description: input.description,
      }).catch((err) => {
        // 最终兜底：runAsyncAgentLifecycle 自身异常（通知构造失败等）→
        // 再试一次 bare 通知（防静默丢失）。
        enqueueAgentNotification({
          taskId: agentId,
          description: input.description,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        })
      })
      // R4：追踪后台 promise——headless/-p 进程退出前 drain（防 fire-and-forget 随进程死亡）。
      trackBackgroundAgent(bgPromise)
      return {
        data: {
          status: 'async_launched',
          agentId,
          description: input.description,
          prompt: input.prompt,
          outputFile,
        },
      }
    }

    const { result } = await runAgent({
      agentDefinition,
      prompt: input.prompt,
      tools: resolvedTools,
      modelProvider,
      parentRole,
      overrideRole: input.model,
      agentId,
      spawnDepth: childSpawnDepth,
      signal: ctx.signal,
      checkPermission: ctx.checkPermission,
    })

    return {
      data: {
        ...result,
        status: 'completed',
        prompt: input.prompt,
      },
    }
  },
}
