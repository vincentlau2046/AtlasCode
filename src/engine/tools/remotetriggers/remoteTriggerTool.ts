/**
 * engine/tools/remotetriggers — RemoteTriggerTool 本体（§8.68 remote 波
 * S-E2c R3；旧仓 src/tools/RemoteTriggerTool/RemoteTriggerTool.ts 158L
 * 裁剪随迁；49 本体 ③ 槽 AGENT_TRIGGERS_REMOTE materialize）。
 *
 * 依赖面：shared（Tool 契约 + isEnvTruthy 门单一事实源）+ toolNames
 * seed + 本子域 prompt/端口。HTTP/OAuth 面全部裁入 ⑫ 端口
 * （remoteTriggersPort.ts，[ATLAS-HOLD] 登记 throw 缺省供给方）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体
 * 逐字；复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema strictObject 3 字段) → 新 shared Tool
 *    契约：inputSchema = 纯 JSON schema 对象（逐字段转写：action 5 值
 *    enum / trigger_id regex + optional + describe / body record +
 *    optional + describe；strictObject 面 = additionalProperties: false）；
 *    旧 zod outputSchema（z.infer 推 Output 型）→ TS 型
 *    RemoteTriggerToolOutput 承载（引擎侧无 wire outputSchema 消费者，
 *    S-B5 delta ① 先例）。
 *  ② 旧 axios（3-dep 违规面）+ getOAuthTokens + getGlobalConfig
 *    oauthAccount + WIRE 头 + BASE_API_URL/v1/code/triggers [ATLAS-HOLD]
 *    URL 族 → ⑫ 注入端口（登记 throw 缺省；真供给方 = IFF 网关波 /
 *    CLI 波；旧 call 面全貌登记在 remoteTriggersPort.ts 头注）。
 *  ③ 旧双门 isEnabled（growthbook 'atlas_surreal_dali' 缺省 false +
 *    isPolicyAllowed('allow_remote_sessions')）+ feature('AGENT_TRIGGERS_REMOTE')
 *    编译期 OFF → 新自门控 isRemoteTriggersEnabled()（env
 *    ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS=1 opt-in 默认 OFF = 旧编译期
 *    OFF + growthbook 缺省 false 保真；growthbook/policy 支裁登记，
 *    ⑮ agentSwarmsEnabled 先例同型 = 门裁登记非新增门）。
 *  ④ prompt() 成员（与 description 重复位）→ 新契约 description 唯一
 *    prompt 面 = REMOTE_TRIGGER_DESCRIPTION（旧 DESCRIPTION 逐字）；
 *    REMOTE_TRIGGER_PROMPT 长面随迁导出（组合根/消费波按需接 prompt 位，
 *    S-B5 delta ③ 先例）。
 *  ⑤ 旧 UI.tsx：renderToolUseMessage 字符串面（L7）逐字保留；
 *    renderToolResultMessage 16L JSX（lines 计数 + dimColor）→ TUI 波裁
 *    （mapToolResult 面已承载内容展示）。
 *  ⑥ call 2 参 → 1 参声明（旧 context.abortController.signal 面随 ⑫
 *    供给方承载，工具本体不消费 context）。
 *  ⑦ bundled skill scheduleRemoteAgents 400L = 裁登记（⑬ 裁定：本体面
 *    全在 claude.ai 车道——getOAuthTokens 已删 / fetchEnvironments +
 *    createDefaultCloudEnvironment teleport 域 0-hit /
 *    checkRepoForRemoteAccess 0-hit / claude.ai URL 族；③ 槽
 *    materialize = 工具面 only，skill 复活 = 随 ⑫ 端口同供给方，本波
 *    头注登记）。
 *  ⑧ userFacingName = 'RemoteTrigger'（旧 def 无该成员，新契约必填位
 *    = 工具名回显，TaskCreate 先例同型）；checkPermissions = 旧
 *    buildTool 缺省面（{ behavior:'allow', updatedInput }，tasks 族
 *    先例）。
 *  ⑨ 5 动作 switch 校验文案逐字（'get requires trigger_id' 等 5 面）；
 *    schema 未过 validateInput 的缺 action 面 = 不可达（注册表先校验），
 *    default 防御 throw 登记。
 *
 * 残留守（防「以为已全」）：⑫ 端口真供给方 = IFF 网关波 / CLI 波
 * （[ATLAS-HOLD]）；UI React 渲染面 = TUI 波；组合根 baseTools 注册位
 * = S-E2d 回填。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from '../../../shared'
import { isEnvTruthy } from '../../../shared'
import { REMOTE_TRIGGER_TOOL_NAME } from '../toolNames'
import { REMOTE_TRIGGER_DESCRIPTION } from './remoteTriggerPrompt'
import { getRemoteTriggersPort } from './remoteTriggersPort'

/** 自门控（③ 裁定；env opt-in 默认 OFF，每次调用重读 env-live）。 */
export function isRemoteTriggersEnabled(): boolean {
  return isEnvTruthy(process.env.ATLAS_EXPERIMENTAL_REMOTE_TRIGGERS)
}

/** 输入 duck 型（旧 zod Input 型转写）。 */
export type RemoteTriggerToolInput = {
  action: 'list' | 'get' | 'create' | 'update' | 'run'
  trigger_id?: string
  body?: Record<string, unknown>
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type RemoteTriggerToolOutput = {
  status: number
  json: string
}

/**
 * 输入 JSON schema（旧 zod strictObject 3 字段逐字段转写，delta ①）。
 */
export const REMOTE_TRIGGER_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'get', 'create', 'update', 'run'],
    },
    trigger_id: {
      type: 'string',
      pattern: '^[\\w-]+$',
      description: 'Required for get, update, and run',
    },
    body: {
      type: 'object',
      description: 'JSON body for create and update',
    },
  },
  required: ['action'],
}

export const RemoteTriggerTool: Tool<
  typeof REMOTE_TRIGGER_TOOL_INPUT_SCHEMA,
  RemoteTriggerToolOutput
> = {
  name: REMOTE_TRIGGER_TOOL_NAME,
  inputSchema: REMOTE_TRIGGER_TOOL_INPUT_SCHEMA,
  inputJSONSchema: REMOTE_TRIGGER_TOOL_INPUT_SCHEMA,
  searchHint: 'manage scheduled remote agent triggers',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // ③ 裁定：旧双门 + 编译期 OFF → 自门控承载（默认 OFF 保真）
  isEnabled: () => isRemoteTriggersEnabled(),
  isConcurrencySafe: () => true,
  isReadOnly: (input: unknown) => {
    const action = (input as RemoteTriggerToolInput).action
    return action === 'list' || action === 'get'
  },
  toAutoClassifierInput: (input: unknown) => {
    const i = input as RemoteTriggerToolInput
    return `RemoteTrigger ${i.action}${i.trigger_id ? ` ${i.trigger_id}` : ''}`
  },
  userFacingName: () => 'RemoteTrigger',
  // ⑧：旧 buildTool 缺省面（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow' as const,
    updatedInput: input,
  }),
  // ④：description 唯一 prompt 面（旧 DESCRIPTION 逐字）
  description: async () => REMOTE_TRIGGER_DESCRIPTION,
  // ⑤：字符串面逐字（旧 UI.tsx L7；JSX 面 TUI 波）
  renderToolUseMessage(input: unknown): unknown {
    const i = input as Partial<RemoteTriggerToolInput>
    return `${i.action ?? ''}${i.trigger_id ? ` ${i.trigger_id}` : ''}`
  },
  // 旧 mapToolResult 面逐字
  mapToolResultToToolResultBlockParam(
    output: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const c = output as RemoteTriggerToolOutput
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `HTTP ${c.status}\n${c.json}`,
    }
  },
  // ⑥：1 参声明（signal 面随 ⑫ 供给方）
  async call(args: unknown): Promise<ToolResult<RemoteTriggerToolOutput>> {
    const input = (args ?? {}) as RemoteTriggerToolInput
    const port = getRemoteTriggersPort()
    const { action, trigger_id: triggerId, body } = input
    switch (action) {
      case 'list':
        return { data: await port.listTriggers() }
      case 'get':
        if (!triggerId) throw new Error('get requires trigger_id')
        return { data: await port.getTrigger(triggerId) }
      case 'create':
        if (!body) throw new Error('create requires body')
        return { data: await port.createTrigger(body) }
      case 'update':
        if (!triggerId) throw new Error('update requires trigger_id')
        if (!body) throw new Error('update requires body')
        return { data: await port.updateTrigger(triggerId, body) }
      case 'run':
        if (!triggerId) throw new Error('run requires trigger_id')
        return { data: await port.runTrigger(triggerId) }
      default:
        // ⑨：schema 校验面不可达（action 5 值 enum），防御 throw 登记
        throw new Error(`Unknown action: ${String(action)}`)
    }
  },
}
