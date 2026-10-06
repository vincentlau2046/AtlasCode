/**
 * engine/permissions — 权限门工厂（E-4 S-4d ①，§8.36；E-wave-end S-E1 I-1
 * 换回，§8.52 A1）
 *
 * createPermissionGate：把 base 域规则求值树包成 pipeline PermissionGate
 * 闭包（3 值 verdict，§8.36 裁定）：
 *   - allow 决策（2a 模式支 / 2b allow 规则 / 1c 工具面 allow 透传）→
 *     { allowed: true, updatedInput }（门改写 call 入参，executeToolUse
 *     门放行后采纳；非-passthrough 工具面实现自 S-B5 起 3 件
 *     （Bash S-B5 / Skill S-E2b / LSP S-E2c，E-4 头注「现零」措辞
 *     S-E3 修波订正）→ updatedInput 产出侧随实现增长，门采纳面不变）
 *   - deny 决策 → { allowed: false, reason: decision.message }
 *   - ask 决策 → { allowed: false, ask: true, reason: decision.message }
 *     （ask = 需用户确认；新仓无 prompt 面（TUI 弹窗）→ pipeline 映射支
 *     fail-closed is_error + 确认标记，残留守登记防静默语义洞）
 *
 * I-1 换回（E-wave-end S-E1，§8.52 A1）：消费面由 S-4d 的
 * checkRuleBasedPermissions（规则支 1a-1g，null = 无规则反对）换回 base
 * hasPermissionsToUseTool 全决策体（src/permissions/permissions.ts:100——
 * mode-level 支 2a / 2b allow 规则 / ⑥ sandbox 自动放行半落 / 1c 鸭子分发
 * + updatedInput / 无上下文薄骨架 allow）。动机 = 单决策体单一事实源：
 * 门为权限判定生产消费点（E-6 M-1 消费面事实订正：换回前
 * hasPermissionsToUseTool 零生产消费者，规则支为平行决策树——2a 模式支 /
 * ⑥ / 工具面 updatedInput 语义在门上分叉）。规则支 checkRuleBasedPermissions
 * 保留导出（域 API + 测试面），门不再消费。
 *
 * 桥接 cast 登记（L3 层唯一一处，§8.36 分析；I-1 换 RuleTool →
 * PermissionTool 窄视图同型）：
 *   - shared Tool.checkPermissions 返 `Promise<unknown>`（窄 spine 契约），
 *     域 PermissionTool 窄视图要求 `Promise<PermissionResult>` → 结构
 *     不可赋值 → `tool as PermissionTool`。运行时实现随旧仓工具契约返
 *     PermissionResult 形状（E-6 工具面回填时填实）；未实现者返
 *     null/undefined = 1c 鸭子支 passthrough-safe（E-2 setup 测 mkTool
 *     口径）。
 *
 * 消费面（H6 实挂）：engine/query loop.ts AgentLoopDeps.checkPermission?
 * 透传（runToolBatch 唯一点）+ pipeline call context（F1 子代理门透传，
 * S-E1）+ 组合根装配（E-wave-end S-E2 compose.ts 接线位）。
 */
import type { PermissionTool } from '../../permissions'
import { hasPermissionsToUseTool } from '../../permissions'
import { logForDebugging, type ToolPermissionContext } from '../../shared'
import type { GateVerdict, PermissionGate } from '../pipeline'

/**
 * 构造绑定 ToolPermissionContext 的权限门（全决策体裁定；工具面 1c 鸭子
 * 分发随 tool.checkPermissions 实现在工具本体波回填时生效）。
 *
 * opts.getAppState（D 波 S-E3 修波，审视 A 路 major-1）：工具面自决权限
 * 消费面注入——Skill/LSP 等工具面 checkPermissions（旧仓逐字随迁体）经
 * context.getAppState().toolPermissionContext 读活 TPC（旧仓富
 * ToolUseContext.getAppState() 窄视图，工具面消费者唯一读取字段）。
 * 未注入 = 1c catch 吞 TypeError 回落 passthrough（gate fail-closed），
 * 旧仓不变量失守——组合根（compose.ts ③）以活 TPC 窄视图注入。
 */
// P4（0.1.37 ④）：TPC 缺失 warn 锁（每进程一次）——headless 热路径单次
// 重建门（print.ts checkPermission 闭包），无锁则漏供 TPC 的 lane 每次
// 工具检查刷一条日志。
let noTpcWarned = false

export function createPermissionGate(
  context: ToolPermissionContext,
  opts: {
    getAppState?(): { toolPermissionContext: ToolPermissionContext }
  } = {},
): PermissionGate {
  // P4（0.1.37 ④）：TPC 缺失可观测化（trace 分析 P4 [MED]）——决策体薄
  // 骨架「无 TPC = allow」兼容默认 = 静默全放行风险；构造点打 warn 级
  // 启动日志（可观测化，共享默认不翻转——headless lane 经
  // createDontAskTpc 显式注入 dontAsk 语义 TPC fail-closed）。
  if (!context && !noTpcWarned) {
    noTpcWarned = true
    logForDebugging(
      '[permission gate] TPC 缺失 — headless lane 应注入 dontAsk 语义 TPC（createDontAskTpc，fail-closed）；决策体回落「无 TPC = allow」薄骨架兼容默认',
      { level: 'warn' },
    )
  }
  return async (tool, input): Promise<GateVerdict> => {
    const decision = await hasPermissionsToUseTool(
      tool as unknown as PermissionTool,
      (input ?? {}) as Record<string, unknown>,
      { getToolPermissionContext: () => context, getAppState: opts.getAppState },
    )
    if (decision.behavior === 'allow') {
      // #278 A4 allow 面（0.1.26，e2e A4F R2 根因）：allow 支携带 decisionReason
      // （rule-allow 2b / mode-bypass 2a / 工具面 1c 的「为何自动放行」结构体）——供
      // TUI 桥（loopPermissionBridge）在确定性 allow 快路径置 setAllowVerdict，成功卡渲
      // rule-allow/bypass 可解释句（A4 三 allow 句数据源）。deny/ask 才带 reason 字符串。
      return {
        allowed: true,
        updatedInput: decision.updatedInput,
        decisionReason: decision.decisionReason,
      }
    }
    if (decision.behavior === 'deny') {
      return { allowed: false, reason: decision.message }
    }
    // ask → fail-closed（prompt 面残留守，§8.36 3 值 verdict 裁定）
    return { allowed: false, ask: true, reason: decision.message }
  }
}
