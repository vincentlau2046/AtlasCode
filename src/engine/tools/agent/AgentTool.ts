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
  ValidationResult,
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
// 0.1.93 W-D-A（f4 批复五(a)）：Form A teammate spawn 链
import {
  isAgentSwarmsEnabled,
  renderTeammatePrompt,
} from '../../../shared'
import {
  requireTeammateSpawnTrigger,
  type TeammateSpawnTriggerResult,
} from './teammateSpawnPort'
import {
  registerSpawnedTeammate,
  requireTeamServices,
} from '../team/teamServices'
// 0.1.100 W-D-B-1：spawn 成员 durable upsert（OFF 支 no-op；durable 支
// fail-visible 错误传播——spawn 链 await 消费）。
import { persistSpawnedTeammateDurable } from '../team/teamDurable'
import { getCwd } from '../../../bootstrap'

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
    // 0.1.93 W-D-A（f4 批复五(a)，上游 2.1.319 契约 SWARM_FIELDS_BY_TOOL
    // 对偶实锤）：Form A 临时小组扩参——name + team_name 携手 = teammate
    // spawn（TeamCreate members 名册按 name 检索渲染 prompt）；mode =
    // 上游对偶保留面（Form A 消费 name/team_name，mode 透传保留）。
    // 门 OFF 由 shared 过滤面在 wire 投影剥除（f4 批复五(c)），本 schema
    // 静态恒有；validateInput 门 OFF fail-closed 拒（C2 直证）。
    name: {
      type: 'string',
      description:
        'Teammate name for team-based delegation. Provide together with team_name to spawn a teammate into that team (TeamCreate first).',
    },
    team_name: {
      type: 'string',
      description:
        'Name of the team to spawn the teammate into (must match an active TeamCreate team).',
    },
    mode: {
      type: 'string',
      description: 'Teammate mode (upstream contract field).',
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
  /** 0.1.93 W-D-A：Form A teammate spawn 扩参。 */
  name?: string
  team_name?: string
  mode?: string
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

/** Form A teammate spawn 内核（AgentTool.call teammate 分支消费）：
 * 组态检索 → prompt 组装 → trigger → 成员注册。roster 缺成员 = 退化面
 * （名册未建仍可 spawn，prompt 只带身份行 + 任务原文；renderTeammatePrompt
 * 纯函数保证）。 */
async function spawnTeammateFromRoster(args: {
  name: string
  teamName: string
  prompt: string
  model?: ModelRole
}): Promise<TeammateSpawnTriggerResult> {
  const services = requireTeamServices()
  const teamCtx = services.getTeamContext()
  if (!teamCtx) {
    throw new Error(
      `No active team — call TeamCreate before spawning teammates (wanted team "${args.teamName}")`,
    )
  }
  if (teamCtx.teamName !== args.teamName) {
    throw new Error(
      `Team "${args.teamName}" is not the active team (leading "${teamCtx.teamName}") — one team per leader`,
    )
  }
  if (!args.name || args.name.trim().length === 0) {
    throw new Error('name (the teammate identity) is required for team-based delegation')
  }
  const rosterEntry = teamCtx.roster?.find(r => r.name === args.name)
  const composedPrompt = renderTeammatePrompt({
    name: args.name,
    role: rosterEntry?.role,
    goal: rosterEntry?.goal,
    backstory: rosterEntry?.backstory,
    prompt: args.prompt,
  })
  const trigger = requireTeammateSpawnTrigger()
  const result = await trigger({
    name: args.name,
    teamName: args.teamName,
    prompt: composedPrompt,
    ...(args.model ? { model: args.model } : {}),
    // headless 形态定谳（f4 批复）：成员 spawn 恒 allowPermissionPrompts=
    // false → TPC.shouldAvoidPermissionPrompts → gate ask 支 auto-deny
    //（fail-closed 权限不放大，delta ⑭ 既有面）。
    allowPermissionPrompts: false,
  })
  if (!result.success) {
    throw new Error(result.error ?? `teammate spawn failed for "${args.name}"`)
  }
  registerSpawnedTeammate({
    name: args.name,
    agentId: result.agentId,
    agentType: rosterEntry?.role,
    // A7：taskId 留痕（TeamDelete active-member 守卫 task 态查表锚）。
    ...(result.taskId ? { taskId: result.taskId } : {}),
  })
  // 0.1.100 W-D-B-1：durable 档成员 upsert 落盘（OFF 支 no-op；durable 支
  // 错误 fail-visible 传播 = spawn 失败可见，禁静默丢持久面）。
  await persistSpawnedTeammateDurable({
    teamName: args.teamName,
    member: {
      agentId: result.agentId,
      name: args.name,
      ...(rosterEntry?.role ? { agentType: rosterEntry.role } : {}),
      cwd: getCwd(),
    },
  })
  return result
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
  // 0.1.93 W-D-A（f4 批复五(a)）：Form A teammate 扩参校验——门 OFF 携带
  // name/team_name/mode = fail-closed 拒（schema 静态恒有，wire 投影由
  // shared 过滤面剥除；直接构造 tool call 的旁路由此守住）；team_name 缺
  // name 无效（无身份的组指向 = 输入错误）。常规路径零新增约束（恒过）。
  async validateInput(
    input: unknown,
    _context: unknown,
  ): Promise<ValidationResult> {
    const i = (input ?? {}) as AgentToolInput
    const hasTeammateFields = !!(i.name || i.team_name || i.mode)
    if (hasTeammateFields && !isAgentSwarmsEnabled()) {
      return {
        result: false,
        message:
          'Agent teammate parameters (name/team_name/mode) require the agent-teams gate (ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 or --agent-teams)',
        errorCode: 9,
      }
    }
    if (i.team_name && !i.name) {
      return {
        result: false,
        message: 'team_name requires name (the teammate identity) for team-based delegation',
        errorCode: 9,
      }
    }
    return { result: true }
  },
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

    // ── 0.1.93 W-D-A A3：Form A teammate spawn 分支（f4 批复五(a)）──
    // name(+team_name) 携手 → 组态（teamContext.roster，TeamCreate members
    // 名册）按 name 检索 → renderTeammatePrompt 组装 → teammateSpawnPort
    // 触发真 spawn（组合根接线 InProcessBackend.spawn + 嵌套守卫）→ 成员
    // 注册入 teamContext.teammates。门 OFF 已被 validateInput fail-closed
    // 拒；此分支双保险再拒（直接调 call 的旁路）。
    if (input.name || input.team_name) {
      if (!isAgentSwarmsEnabled()) {
        throw new Error(
          'Agent teammate spawn requires the agent-teams gate (ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 or --agent-teams)',
        )
      }
      const teamName = input.team_name
      if (!teamName) {
        throw new Error('team_name is required when spawning a teammate (name alone is ambiguous)')
      }
      const spawnResult = await spawnTeammateFromRoster({
        name: input.name ?? '',
        teamName,
        prompt: input.prompt,
        model: input.model,
      })
      return {
        data: {
          status: 'teammate_spawned',
          agentId: spawnResult.agentId,
          ...(spawnResult.taskId ? { taskId: spawnResult.taskId } : {}),
          name: input.name,
          team_name: teamName,
        },
      }
    }

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
