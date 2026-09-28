/**
 * in-process teammate 工具池 ToolRegistryDeps 注入窗
 * （C 桶 ③ shell·swarm 波 S-E3 修波；§8.66 delta ⑧ 回填，A 路 blocker 裁定）。
 *
 * 背景：in-process teammate 工具池（inProcessRunner.ts delta ⑧）S-E2d
 * 首切 = getTools(最小 TPC) 零 deps 最小池（仅 AgentTool）——旧仓 teammate
 * 池 = inProcessRunner.ts:1184 availableTools: toolUseContext.options.tools
 * （父会话全量池，40+ 工具含 SendMessage 族），最小池 = 登记失实（头注
 * 「MCP/Ascend 池 = 组合根注入 deps」无 runner 侧注入通路）。S-E3 A 路
 * blocker 裁定：补组合根注入窗（本模块，与 backends/port.ts 注入窗 /
 * inProcessRunnerPort.ts seam ② 同族；PRT-2 = 显式装配语句，非模块顶层
 * 自注册）——组合根（atlascode/compose.ts ⑫）注 registry 3 工具
 * materialize 底线（Snip/TeamCreate/TeamDelete）；createAgentLoopDeps
 * 构建期以全量 toolRegistryDeps 同名重建本窗（= 父会话 loop 池 ≡
 * teammate 池等价面，旧仓 options.tools 同源）。
 *
 * fail-soft：未设窗 = 零 deps 最小池（getTools 缺省参语义），不抛
 * （池恒可用；对比 seam ② fail-fast = spawn 支未接线属初始化 bug）。
 */
import type { ToolRegistryDeps } from '../../engine'

let deps: ToolRegistryDeps | undefined

/** 注入 teammate 工具池 registry deps（组合根显式装配；重复调用后写覆盖）。 */
export function setTeammateToolRegistryDeps(d: ToolRegistryDeps): void {
  deps = d
}

/** 测试复位（teardown 用）。 */
export function resetTeammateToolRegistryDeps(): void {
  deps = undefined
}

/** fail-soft 读：未设 = 零 deps（最小池）。 */
export function getTeammateToolRegistryDeps(): ToolRegistryDeps {
  return deps ?? {}
}
