/**
 * engine/permissions — 权限门工厂（E-4 S-4d ①，§8.36；E-wave-end S-E1 I-1
 * 换回，§8.52 A1）
 *
 * createPermissionGate：把 base 域规则求值树包成 pipeline PermissionGate
 * 闭包（3 值 verdict，§8.36 裁定）：
 *   - allow 决策（2a 模式支 / 2b allow 规则 / 1c 工具面 allow 透传）→
 *     { allowed: true, updatedInput }（门改写 call 入参，executeToolUse
 *     门放行后采纳；现零非-passthrough 工具面 checkPermissions 实现
 *     （updatedInput 产出侧为零，审视 M-3 措辞订正）→ 恒 fallback
 *     原入参，行为惰性）
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
import type { ToolPermissionContext } from '../../shared'
import type { GateVerdict, PermissionGate } from '../pipeline'

/**
 * 构造绑定 ToolPermissionContext 的权限门（全决策体裁定；工具面 1c 鸭子
 * 分发随 tool.checkPermissions 实现在工具本体波回填时生效）。
 */
export function createPermissionGate(
  context: ToolPermissionContext,
): PermissionGate {
  return async (tool, input): Promise<GateVerdict> => {
    const decision = await hasPermissionsToUseTool(
      tool as unknown as PermissionTool,
      (input ?? {}) as Record<string, unknown>,
      { getToolPermissionContext: () => context },
    )
    if (decision.behavior === 'allow') {
      return { allowed: true, updatedInput: decision.updatedInput }
    }
    if (decision.behavior === 'deny') {
      return { allowed: false, reason: decision.message }
    }
    // ask → fail-closed（prompt 面残留守，§8.36 3 值 verdict 裁定）
    return { allowed: false, ask: true, reason: decision.message }
  }
}
