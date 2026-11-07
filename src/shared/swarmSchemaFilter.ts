/**
 * shared/swarmSchemaFilter — swarm 扩参字段 wire 投影过滤面（0.1.93 W-D-A，
 * f4 批复五(c)：过滤面落 engine 单源 = shared 底层，modelprovider/params.ts
 * （print + TUI 双车道 wire 投影）与 tui/utils/api.ts 同消费）。
 *
 * 上游契约实锤（0.1.93 插桩 F2 + 本仓 tui/utils/api.ts SWARM_FIELDS_BY_TOOL
 * 对偶逐字）：Agent 扩 name/team_name/mode；ExitPlanMode 扩
 * launchSwarm/teammateCount。门 OFF 时两车道 wire schema 均剥除（判据④
 * 「门 OFF 缺省不可见」载体）；门 ON 原样保留。
 *
 * 纯函数面（无 engine 依赖——engine 工具名常量不可 import 进 shared，表键
 * = 字面量与 tui/engine 两侧常量值逐字同源：'Agent' / 'ExitPlanMode'）。
 */

/** 表键 = AGENT_TOOL_NAME / EXIT_PLAN_MODE_V2_TOOL_NAME 常量值（tui 与
 * engine 两侧单一事实源同值；LEGACY_AGENT_TOOL_NAME 'Task' 沿 tui 表先例
 * 不入——旧名工具面随 legacy alias 面，不在本波扩参域）。 */
export const SWARM_FIELDS_BY_TOOL: Record<string, string[]> = {
  Agent: ['name', 'team_name', 'mode'],
  ExitPlanMode: ['launchSwarm', 'teammateCount'],
}

/**
 * Filters swarm-related fields from a tool's input schema when swarms are
 * not enabled. Called at wire projection sites (params.ts / tui api.ts).
 * 非 swarm 表工具原样返回（零拷贝）。
 */
export function filterSwarmFieldsFromSchema(
  toolName: string,
  schema: Record<string, unknown> | undefined | null,
  swarmEnabled: boolean,
): Record<string, unknown> | undefined | null {
  if (swarmEnabled) return schema
  const fieldsToRemove = SWARM_FIELDS_BY_TOOL[toolName]
  if (!fieldsToRemove || fieldsToRemove.length === 0) return schema
  if (!schema || typeof schema !== 'object') return schema
  const props = schema.properties as Record<string, unknown> | undefined
  if (!props || typeof props !== 'object') return schema
  const nextProps = { ...props }
  for (const f of fieldsToRemove) delete nextProps[f]
  return { ...schema, properties: nextProps }
}
