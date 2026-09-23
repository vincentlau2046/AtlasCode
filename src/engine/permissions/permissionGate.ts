/**
 * engine/permissions — 权限门工厂（E-4 S-4d ①，§8.36）
 *
 * createPermissionGate：把域规则求值树（S-4b checkRuleBasedPermissions 规则支
 * 1a-1g）包成 pipeline PermissionGate 闭包（3 值 verdict，§8.36 裁定）：
 *   - null（无规则反对）→ { allowed: true }
 *   - deny 决策 → { allowed: false, reason: decision.message }
 *   - ask 决策 → { allowed: false, ask: true, reason: decision.message }
 *     （ask = 需用户确认；新仓无 prompt 面（TUI 弹窗）→ pipeline 映射支
 *     fail-closed is_error + 确认标记，残留守登记防静默语义洞）
 *
 * 桥接 cast 登记（L3 层唯一一处，§8.36 分析）：
 *   - shared Tool.checkPermissions 返 `Promise<unknown>`（窄 spine 契约），
 *     域 RuleTool 窄视图要求 `Promise<PermissionResult>` → 结构不可赋值 →
 *     `tool as RuleTool`。运行时实现随旧仓工具契约返 PermissionResult 形状
 *     （E-6 工具面回填时填实）；未实现者返 null/undefined = 1c 鸭子支
 *     passthrough-safe（E-2 setup 测 mkTool 口径）。
 *
 * 消费面（H6 实挂）：engine/query loop.ts AgentLoopDeps.checkPermission?
 * 透传（runToolBatch 唯一点）+ 组合根装配（E-wave-end compose.ts 接线位）。
 */
import type { RuleTool } from '../../permissions'
import { checkRuleBasedPermissions } from '../../permissions'
import type { PermissionGate } from '../pipeline'
import type { ToolPermissionContext } from '../../shared'

/**
 * 构造绑定 ToolPermissionContext 的权限门（规则支裁定；工具面 1c 鸭子分发
 * 随 tool.checkPermissions 实现在 E-6 工具面回填时生效）。
 */
export function createPermissionGate(
  context: ToolPermissionContext,
): PermissionGate {
  return async (tool, input) => {
    const decision = await checkRuleBasedPermissions(
      tool as RuleTool,
      (input ?? {}) as Record<string, unknown>,
      { getToolPermissionContext: () => context },
    )
    if (decision === null) {
      return { allowed: true }
    }
    if (decision.behavior === 'deny') {
      return { allowed: false, reason: decision.message }
    }
    // ask → fail-closed（prompt 面残留守，§8.36 3 值 verdict 裁定）
    return { allowed: false, ask: true, reason: decision.message }
  }
}
