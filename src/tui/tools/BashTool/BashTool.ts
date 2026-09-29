/**
 * tui/tools/BashTool — W2-2b 桥适配器（§8.74.8/§8.74.12，Bash 族 pilot）：
 * 行为成员委托 engine 本体（src/engine 门面 BashTool，C-Deep 全量纵切 §8.54），
 * prompt 文本族 + 渲染叠加层 KEEP tui（prompt.ts / UI.tsx / BashToolResultMessage.tsx），
 * inputSchema 保 tui zod 面（orchestrator 三消费点 tool.inputSchema.safeParse 实测：
 * toolExecution.ts:536 / StreamingToolExecutor.ts:104 / toolOrchestration.ts:102，
 * 非 JSON 透传 = 裁定「zod 保留」），外部 import 路径 + 导出名不变
 * （BashTool / BashToolInput / Out）。
 *
 * 裁定登记（临场裁回设计记录，不变式 1；复审勿当遗漏重提）：
 *  ① checkPermissions = tui 本地缺省（buildTool 默认 `{ allow, updatedInput }`
 *    旧行为），**不委托** engine bashToolHasPermission（delta ⑤ 升级面）——
 *    speculative classifier 态一致性：tui 独占 2 函数 awaitClassifierAutoApproval /
 *    executeAsyncClassifierCheck（engine 0-hit 实测）消费 tui bashPermissions 模块态
 *    speculative 缓存；engine 链若消费 engine 侧缓存 = 预计算结果失配（auto-mode
 *    投机支行为回归）。engine 升级接缝 = W3 活链路接线 / W-opt（状态一致性裁定后
 *    两缓存合一再切，H6 登记）。
 *  ② 同 ① 之 2 tui 独占函数 → tui bashPermissions.ts 为**部分 KEEP**（9 外部站点
 *    import 路径不变；辅助模块族 bashSecurity/readOnlyValidation/pathValidation/
 *    sedValidation/sedEditParser/commandSemantics/modeValidation/destructiveCommandWarning
 *    随其保留 = 残留守，整族删净归 2e 全局探针 + W3 状态一致性裁定后）。
 *  ③ BgTask 读面（getBackgroundTask/listBackgroundTasks）外部 0 消费方实测 →
 *    适配器不 re-export；engine 本体 call 后台任务态 = engine 模块内单态（无分裂
 *    消费方，安全）。旧 tui BgTask map 随本体删。
 *  ④ prompt/description = tui prompt.ts getSimplePrompt（与 engine bashPrompt 同源
 *    逐字，零行为；叠加层 KEEP）。
 *  ⑤ isReadOnly = 委托 engine（engine bashReadOnly 域内单一事实源，旧 tui 本地函数
 *    逐字移植体，无状态）。
 */
import { z } from 'zod/v4'
import type { ToolResult } from '../../Tool.js'
import { BashTool as EngineBashTool } from 'src/engine'
import { getSimplePrompt } from './prompt.js'
import { renderToolUseMessage } from './UI.js'
import { BASH_TOOL_NAME } from './toolName.js'

const inputSchema = z.object({
  command: z
    .string()
    .describe('The bash command to execute.'),
  description: z
    .string()
    .optional()
    .describe('Clear, concise description of what this command does (shown in the UI).'),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry.'),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Timeout in milliseconds (alias accepted by the shared tool-execution layer).'),
  _simulatedSedEdit: z
    .object({
      filePath: z.string(),
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
  run_in_background: z
    .boolean()
    .optional()
    .describe('Run in the background and return a task id immediately (collect with TaskOutput, stop with TaskStop).'),
  dangerouslyDisableSandbox: z
    .boolean()
    .optional()
    .describe('Run the command outside the sandbox (use only when sandbox restrictions caused the failure).'),
})

export type BashToolInput = z.infer<typeof inputSchema>

export type BashProgress = any

export type Out = {
  stdout: string
  stderr: string
  exitCode: number | null
  interrupted: boolean
  isImage?: boolean
  returnCodeInterpretation?: string | null
  noOutputExpected?: boolean
  backgroundTaskId?: string | null
}

export const BashTool: any = {
  name: BASH_TOOL_NAME,
  searchHint: 'run shell commands via bash',
  maxResultSizeChars: 20_000,
  inputSchema: inputSchema,
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: (input: BashToolInput) => EngineBashTool.isReadOnly(input),
  isDestructive: () => false,
  toAutoClassifierInput: () => '',
  userFacingName: () => BASH_TOOL_NAME,
  async description(): Promise<string> {
    return getSimplePrompt()
  },
  async prompt(): Promise<string> {
    return getSimplePrompt()
  },
  // 裁定①：旧 buildTool 默认面（委托通用权限系统），零行为
  async checkPermissions(input: { [key: string]: unknown }): Promise<unknown> {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage,
  mapToolResultToToolResultBlockParam: EngineBashTool.mapToolResultToToolResultBlockParam,
  // 行为委托 engine 本体（duck 可选链语义 = 旧 any 三判守卫等价，delta ⑦）；
  // 尾 3 参（canUseTool/parentMessage/onProgress）旧体不消费（delta ⑩），不透传。
  // engine 本体以共享 Tool 接口标注（call 4 必参签名），此处 2 参收窄调用
  async call(
    args: BashToolInput,
    context: unknown,
    _canUseTool: unknown,
    _parentMessage: unknown,
    _onProgress?: unknown,
  ): Promise<ToolResult<Out>> {
    const engineCall = EngineBashTool.call as (a: unknown, c: unknown) => Promise<ToolResult<Out>>
    return engineCall(args, context)
  },
}
