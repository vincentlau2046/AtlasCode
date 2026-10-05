/**
 * W3-3b（§8.74.15）：TUI 交互权限桥——engine 权限门 × TUI canUseTool 弹窗面。
 *
 * REPL 活态装配消费（onQueryImpl 的 checkPermission 接缝）：把 TUI 交互权限权威
 * （useCanUseTool 弹窗队列）包成 engine loop 期望的 PermissionGate。桥语义：
 *   ① engine createPermissionGate（活 TPC + getAppState 活读）先跑全决策体
 *      （allow/deny 确定性规则支——快路径，非交互）；
 *   ② verdict.ask（需用户确认；engine 窄 spine 本 fail-closed）→ 转 TUI
 *      canUseTool 交互弹窗（allow/deny remap；updatedInput 透传）。
 *
 * 双决策体裁定（临场裁回设计记录）：engine 门（src/permissions 全决策体）与
 * TUI canUseTool（src/tui/utils/permissions，含弹窗队列/classifier/swarm/coordinator
 * 交互面）是双工具面去重后的两域实现——本桥只在 ask 支才落 TUI 面（确定性
 * allow/deny 走 engine 快路径不重跑 TUI），交互确认唯一经 canUseTool = 旧 REPL
 * 行为保真（旧仓 query 的 canUseTool 即交互权威）。
 *
 * 纯函数 = 判别单测面（fake engine gate + fake canUseTool，无 React 无 store）；
 * 生产消费 = REPL onQueryImpl 活态装配（活 TPC 经 getAppState 读 store 活对象）。
 */
import {
  createPermissionGate,
  type GateVerdict,
  type PermissionCallContext,
  type PermissionGate,
} from 'src/engine'
import type { ToolPermissionContext } from 'src/shared'
import type { Tool as TuiTool, ToolUseContext } from './Tool'
import type { AssistantMessage } from './types/message'
import type { CanUseToolFn } from './hooks/useCanUseTool'
import { setAllowVerdict } from './utils/allowVerdicts'
import type {
  PermissionDecisionReason as TuiPermissionDecisionReason,
  PermissionMode,
} from './types/permissions'

/**
 * 活 TPC 窄视图（入参面宽化 = unknown，装配体内部 cast 到 shared TPC）——
 * REPL 侧 TPC 是 tui DeepImmutable 形（Tool.ts），engine 门消费 shared TPC
 * （types-session readonly 形），两形运行态同对象（store 活 TPC 单源），
 * 类型边界在桥内单点 cast（跨域 cast 登记：运行态 store TPC 结构同源，
 * 门只读 mode/alwaysAllowRules/denyWithinAllow 等共有字段）。
 */
export interface InteractiveGateParams {
  /** 活 TPC（REPL = store.toolPermissionContext 闭包值；门 ① 全决策体消费）。 */
  toolPermissionContext: unknown
  /**
   * 活 TPC 读面（门 1c 工具面自决权限 getAppState().toolPermissionContext 窄视图；
   * REPL 注入 () => toolUseContext.getAppState() 活读 store，= 旧仓富
   * ToolUseContext getAppState 同不变量；未注 = 1c catch 吞 TypeError 回落
   * passthrough fail-closed）。
   */
  getAppState?(): { toolPermissionContext: unknown }
  /** TUI 交互权限权威（useCanUseTool 产物；ask 支弹窗队列）。 */
  canUseTool: CanUseToolFn
  /** 本 turn 的 ToolUseContext（canUseTool 第 3 参；活 options/getAppState）。 */
  toolUseContext: ToolUseContext
}

/**
 * 构造 REPL 交互权限门（engine 门 + ask-bridge → TUI canUseTool）。
 * 返回 engine PermissionGate（3 参；callContext 携 tu.id/assistantMsg 供
 * canUseTool 弹窗队列键控——engine executeToolUse 门消费点填充，§8.74.15）。
 */
export function buildInteractiveGate(params: InteractiveGateParams): PermissionGate {
  // 跨域 TPC cast 单点（tui DeepImmutable 形 → shared readonly 形；运行态同源）。
  const engineGate = createPermissionGate(
    params.toolPermissionContext as unknown as ToolPermissionContext,
    {
      getAppState: params.getAppState
        ? () => ({
            toolPermissionContext:
              params.getAppState!().toolPermissionContext as unknown as ToolPermissionContext,
          })
        : undefined,
    },
  )
  return async (
    tool,
    input,
    callContext?: PermissionCallContext,
  ): Promise<GateVerdict> => {
    const verdict = await engineGate(tool, input)
    if (!verdict.ask) {
      // #278 A4 allow 面（0.1.26，e2e A4F R2 根因）：engine 门确定性 allow 快路径
      // （rule-allow 2b / bypass 2a / 工具面 allow 1c）不经 canUseTool（其 allow 支才
      // setAllowVerdict）→ allowVerdicts Map 空 → 成功卡 rule-allow/bypass 可解释句不渲染
      // （a4rallow/a4bypass 0 命中）。修：门 verdict 携 decisionReason（GateVerdict 加性
      // 字段）时在此置 setAllowVerdict（跨域 cast 单点：base 7 变体 decisionReason ⊆ TUI
      // 11 变体，运行态同结构，verdictLine 消费面全覆盖）。mode 活读门 1c 同源（getAppState
      // 活 TPC 回落构造 TPC）——成功卡 bypass 支据 mode === 'bypassPermissions' 判。
      // classifier-approved 句不在本路径：engine 门不跑 yolo LLM 分类器（仅 canUseTool 活模型
      // 支产 classifier decisionReason）→ 该句仍经 setYoloClassifierApproval（活模型可达时），
      // PTY 不可强制 = INCONCLUSIVE，非本修范围（红线①：engine 门判定零改动，仅加性携带）。
      if (verdict.allowed && verdict.decisionReason) {
        const tpc = (
          params.getAppState?.() ?? {
            toolPermissionContext: params.toolPermissionContext,
          }
        ).toolPermissionContext
        const tpcMode = (tpc as { mode?: PermissionMode } | undefined)?.mode ?? 'default'
        setAllowVerdict(callContext?.toolUseId ?? '', {
          reason: verdict.decisionReason as unknown as TuiPermissionDecisionReason,
          mode: tpcMode,
        })
      }
      return verdict
    }
    // ask → TUI 交互弹窗（canUseTool 内部含 hasPermissionsToUseTool 重判 +
    // 弹窗队列/classifier/swarm/coordinator 全交互面；allow/deny remap）。
    const decision = await params.canUseTool(
      tool as unknown as TuiTool,
      (input ?? {}) as Record<string, unknown>,
      params.toolUseContext,
      callContext?.assistantMessage as AssistantMessage,
      callContext?.toolUseId ?? '',
    )
    if (decision.behavior === 'allow') {
      return { allowed: true, updatedInput: decision.updatedInput }
    }
    // deny / 弹窗未决（abort 等）→ fail-closed（engine 窄 spine 同语义，
    // reason = TUI 决策 message 逐字透传）。
    return { allowed: false, reason: decision.message ?? 'permission denied' }
  }
}
