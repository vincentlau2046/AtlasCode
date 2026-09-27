/**
 * engine/tools/team — SnipTool 本体（C 桶 ③ shell·swarm 波 S-E2d；§8.66）。
 *
 * 旧仓来源（a8af45b）：src/tools/SnipTool/SnipTool.ts 74L 裁剪随迁
 *（buildTool 成员面 → 新 shared Tool 契约对象化，config/askUser/sendMessage
 * face 先例）。
 *
 * 门控槽（49 口径 ⑨ HISTORY_SNIP materialize，§8.66.1.4）：旧门
 * feature('HISTORY_SNIP') 裁 → 恒注册（isEnabled = () => true，⑲ ToolSearch
 * 门裁先例同型 = 门裁登记非新增门）。
 *
 * 族位裁定（§8.66.1.5「Snip → engine/tools/<S-E2 裁定族位>」）：归 team/
 * 子域（C 桶 ③ D 类归属件与 TeamCreate/TeamDelete 同族位、同 compose
 * baseTools 注入点；机制归族非语义归族——Snip 本体零团队面）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lazySchema z.strictObject().passthrough()（passthrough 尾变换优先）
 *    → 新纯 JSON schema additionalProperties: true（未知键透传面逐字）；
 *    strict 双字段面无消费点（pipeline 只消费 inputJSONSchema），strict 字段
 *    裁不写（configTool L113 先例双字段仅 strict-object 型）。
 *  ② 旧 outputSchema 成员（zod {snipped, savedTokens}）裁 → 新契约
 *    outputSchema 可选槽不实现（config/askUser delta ① 先例）。
 *  ③ 旧 def description()/prompt() 双面 → 新 description() 单面 = PROMPT
 *    （delta ⑧ 先例）；短描述面经 team/ 子门面 SNIP_DESCRIPTION 别名
 *    re-export（web 族口径）。
 *  ④ 旧 def 缺成员 buildTool 缺省值 → 新契约必选成员显化（缺省值逐字）：
 *    isEnabled = () => true（buildTool L786；registry ⑨ 恒注册裁定）/
 *    isDestructive = () => false（history 裁剪非破坏面）/
 *    userFacingName = () => 'Snip'（buildTool L828 缺省 = def.name）/
 *    toAutoClassifierInput = () => ''（buildTool L795 缺省，无安全相关
 *    分类器输入面）/ checkPermissions = { behavior: 'allow', updatedInput }
 *    （buildTool L790 缺省 = defer 到通用权限系统）。
 *  ⑤ 旧 call 5 参（input/context/canUseTool/parentMessage/onProgress）全不
 *    消费（纯 no-op 返固定值）→ 新 0 参（pipeline 调用上下文 =
 *    { signal, checkPermission }，本工具零消费面）。
 *  ⑥ mapToolResultToToolResultBlockParam = 旧 def 缺成员（buildTool 缺省
 *    jsonStringify 面）→ 显化 jsonStringify 面（sendMessageTool 先例）。
 *  ⑦ shouldDefer = 旧成员缺（不 defer），新契约可选成员裁不写。
 *  ⑧ renderToolUseMessage 返 null 逐字（旧成员在位）。
 *
 * 消费方 = `team/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径注册位
 *（恒注册；本体经 ToolRegistryDeps.baseTools 组合根注入，注册表机制不变）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { jsonStringify } from '../../session/json'
import { SNIP_TOOL_NAME } from '../toolNames'
import { PROMPT } from './snipPrompt'

/** 输入面（旧 zod strictObject().passthrough() 3 字段转写，delta ①）。 */
export const SNIP_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Optional pre-written summary to use for the snipped history.',
    },
    keepLastN: {
      type: 'number',
      description: 'How many recent turns to keep verbatim.',
    },
  },
  // delta ①：passthrough 尾变换优先 = 未知键透传
  additionalProperties: true,
}

/** 输入 duck（旧 z.infer 转写）。 */
export type SnipInput = {
  summary?: string
  keepLastN?: number
}

/** 输出面（旧 outputSchema z.infer 转写，delta ② 本体输出型）。 */
export type SnipOutput = {
  /** Whether the history was actually snipped. */
  snipped: boolean
  /** Approximate tokens freed. */
  savedTokens?: number
}

// Tool 契约非参数化（readTool face 先例）；mapToolResult 返回型收窄（web
// face 先例，落盘面 = jsonStringify 单面）。
type SnipToolFace = Tool & {
  mapToolResultToToolResultBlockParam(
    data: SnipOutput,
    toolUseID: string,
  ): ToolResultBlockParam
}

export const SnipTool: SnipToolFace = {
  name: SNIP_TOOL_NAME,
  inputSchema: SNIP_TOOL_INPUT_SCHEMA,
  inputJSONSchema: SNIP_TOOL_INPUT_SCHEMA,
  searchHint: 'summarize and replace old conversation history to free context',
  maxResultSizeChars: 10_000,
  // 门控槽（49 口径 ⑨ materialize）：旧门 feature('HISTORY_SNIP') 裁 → 恒注册
  isEnabled: () => true,
  isReadOnly: () => false,
  isConcurrencySafe: () => true,
  isDestructive: () => false,
  userFacingName: () => 'Snip',

  toAutoClassifierInput: () => '',

  async checkPermissions(input: unknown) {
    // delta ④：旧 buildTool 缺省面（defer 到通用权限系统）
    return { behavior: 'allow' as const, updatedInput: input }
  },

  async description(): Promise<string> {
    // delta ③：旧 prompt() 面 → PROMPT
    return PROMPT
  },

  mapToolResultToToolResultBlockParam(
    data: SnipOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: jsonStringify(data),
        },
      ],
    }
  },

  // 旧 5 参全不消费（delta ⑤）→ 0 参；纯 no-op 返固定值（旧 call 体逐字）
  async call(): Promise<ToolResult<SnipOutput>> {
    return {
      data: {
        snipped: true,
        savedTokens: 0,
      },
    }
  },

  // delta ⑧：旧 renderToolUseMessage 返 null 逐字
  renderToolUseMessage(): unknown {
    return null
  },
}
