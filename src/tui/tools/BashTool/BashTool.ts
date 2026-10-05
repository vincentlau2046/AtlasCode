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
 *    **#265 S2 修订（2026-10-05）**：恒-allow stub 实证为安全洞（gate 1c 拿到
 *    'allow' 后 step 3 只转 passthrough → TUI 车道 default 模式全命令静默放行，
 *    审批卡永不弹 = 0.1.24 残留 A1×3 INCONCLUSIVE 根因）。修订为**模式门控
 *    委托**：非 auto 模式一线接线 engine bashToolHasPermission（单一事实源 =
 *    engine；非 auto 分支不触 speculative 缓存 → 原一致性约束不触发）；auto
 *    模式返 passthrough（→ 弹窗层 TUI 自属 classifier/AutoModeConfirm 权威，
 *    tui 缓存单源存续 = 原裁定理由保留）。全模式委托 = C 桶 ② engine 分类器
 *    真族回填 + 两缓存合一后的 H6 接缝（engine 分类器现为 61L stub
 *    enabled=false 惰性面，双缓存失配风险当前休眠，修订零回归面）。
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
import { bashToolHasPermission, BashTool as EngineBashTool } from 'src/engine'
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
  // 裁定①（#265 S2 修订，2026-10-05）：旧恒-allow stub 是安全洞——gate 1c 鸭子
  // 分发拿到 'allow' → step 3 只把 passthrough 转 ask → TUI 车道任何 Bash 命令
  // 在 default 等模式静默放行，审批卡永不弹（0.1.24 残留 A1×3 INCONCLUSIVE
  // 根因）。修订 = 模式门控委托：
  //  - 非 auto 模式：一线接线 engine bashToolHasPermission（engine BashTool
  //    delta ⑤ 先例同款；全规则匹配 + 只读自动放行 + fail-closed ask，单一
  //    事实源 = engine）。非 auto 分支不进入分类器 speculative 缓存 → 裁定①
  //    原一致性约束（tui/engine 双缓存失配）不触发。窄 gate context 缺
  //    abortController/options 时（分类器启用后的 Haiku 支）= 1c catch →
  //    passthrough → ask，fail-safe 方向（H6 接缝：C 桶 ② 换真族后随两缓存
  //    合一再扩面）。
  //  - auto 模式：passthrough（→ gate step 3 ask → 弹窗层 → TUI 自属
  //    classifier/AutoModeConfirm 权威；tui speculative 缓存保持单源 = 裁定①
  //    原裁定理由存续；engine 分类器真族回填后 H6 接缝切全模式委托）。
  //    修前 auto 模式 gate 亦静默放行（stub allow 绕过 AutoModeConfirm 确认门）。
  async checkPermissions(
    input: BashToolInput,
    context: unknown,
  ): Promise<unknown> {
    const ctx = context as {
      getAppState?(): { toolPermissionContext?: { mode?: string } }
      getToolPermissionContext?(): { mode?: string }
    }
    const mode =
      ctx?.getAppState?.()?.toolPermissionContext?.mode ??
      ctx?.getToolPermissionContext?.()?.mode
    if (mode === 'auto') {
      return {
        behavior: 'passthrough',
        message: 'Bash command in auto mode requires confirmation',
      }
    }
    return bashToolHasPermission(
      input,
      context as Parameters<typeof bashToolHasPermission>[1],
    )
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
