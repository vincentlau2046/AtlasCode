/**
 * inProcessRunner 前向接缝（C 桶 ③ shell·swarm 波 S-E2c；§8.66 域内跨切片接缝 ②）。
 *
 * 用途：InProcessBackend（S-E2c）spawn 支拉起 teammate agent loop 的唯一入口
 * = startInProcessTeammate（旧仓 utils/swarm/inProcessRunner.ts:107 调用面），
 * 其本体归 S-E2d（inProcessRunner 纵切，经 engine 根门面 runAgent 消费，
 * P-S1 直连裁定零 port）。域内跨切片物化接缝：S-E2c 落接缝（null 缺省），
 * S-E2d inProcessRunner 落位后由组合根（或 swarm 门面 initBackends 同批）
 * 调 setStartInProcessTeammate 接线（PRT-2：接线 = 显式装配语句，非模块
 * 顶层自注册）。
 *
 * 与 backends/port.ts（S-E2b 注入窗）同族：seam ② fail-fast 型——
 * InProcessBackend.spawn 消费端走 requireStartInProcessTeammate（未接线
 * = 编程错误早暴露）。
 *
 * 输入面 = 旧仓 InProcessBackend.ts:107-129 调用面逐字（identity 半 =
 * task 域 TeammateIdentity 单一事实源；toolUseContext = InProcessBackend
 * `{...this.context, messages: []}` 剥离产物——S-E2d 消费端经 engine 门面
 * 适配，接缝类型 = 生产端产物形，单一事实源在本文件）。
 */
import type { AgentDefinition } from '../../engine'
import type { Message } from '../../shared'
import type { TeammateIdentity } from '../../task'
import type { TeammateContext } from '../teammateContext'
import type { TeammateExecutorContext } from './types'

/** startInProcessTeammate 输入面（旧 inProcessRunner.ts:107-129 调用面逐字）。 */
export type StartInProcessTeammateArgs = {
  /** teammate 身份（task 域 TeammateIdentity 逐字）。 */
  identity: TeammateIdentity
  taskId: string
  prompt: string
  /** AsyncLocalStorage 隔离上下文（teammateContext 域单一事实源）。 */
  teammateContext: TeammateContext
  /**
   * 剥离透传上下文：InProcessBackend `{...this.context, messages: []}`
   *（teammate 从不读父会话 messages——runAgent 经 createSubagentContext
   * 覆写；透传父会话将 pin 住整个父对话面，旧仓 L119-121 注释逐字）。
   */
  toolUseContext: TeammateExecutorContext & { messages: Message[] }
  abortController: AbortController
  model?: string
  systemPrompt?: string
  systemPromptMode?: 'default' | 'replace' | 'append'
  /**
   * delta ⑭ 消费端（S-E2d 接缝回填，旧 runAgent L475-488 session 规则语义
   * 逐字）：allowedTools → TPC alwaysAllowRules.session（session 规则 ≠ 池
   * 限制；cliArg 保留支 = hub TPC 本地构造 cliArg map 恒空，零差登记）。
   * 生产调用方 = InProcessBackend config.permissions 透传（活消费端；旧仓
   * 同站点透传，逐字）。
   */
  allowedTools?: string[]
  /**
   * delta ⑭ 消费端（S-E2d 接缝回填，旧 inProcessRunner.ts:1178 逐字）：
   * canShowPermissionPrompts = allowPermissionPrompts ?? true；=== false →
   * TPC.shouldAvoidPermissionPrompts（旧 runAgent L450-459 isAsync 显式支
   * 语义）→ gate ask 支 auto-deny（无交互提示；新仓权限决策体无该 flag
   * 消费端，gate 为唯一消费点）。生产调用方 = InProcessBackend
   * config.allowPermissionPrompts 透传（?? true 缺省恒活提示面，零行为差
   * 不变）。
   */
  allowPermissionPrompts?: boolean
  /**
   * delta ⑭ agent 注册表回填（S-E2d）：自定义 agent 定义 duck 面（= 新
   * engine AgentDefinition 消费面 Pick：getSystemPrompt 自定义指令追加支 /
   * tools 池限制（∪ team-essential 7 件 Set-union 保底）/ disallowedTools
   * 禁用集剔除 / model 角色传播）。旧 CustomAgentDefinition 的
   * memory/permissionMode 字段随 delta ②⑥⑦ 裁除（新 AgentDefinition 无该
   * 字段，memory 空支 analytics 面随遥测 #143 波）。生产调用方零设值（旧
   * spawn 路径零命中，注册表输入面保留；消费端 = hub
   * buildTeammateSystemPrompt + resolveTeammateAgentFace，未设 = 全量池 +
   * 无自定义指令支，零行为差）。
   */
  agentDefinition?: Pick<
    AgentDefinition,
    'getSystemPrompt' | 'tools' | 'disallowedTools' | 'model'
  >
}

export type StartInProcessTeammateFn = (args: StartInProcessTeammateArgs) => void

let startFn: StartInProcessTeammateFn | null = null

/** 注入 startInProcessTeammate 实现（S-E2d 落位后组合根 / swarm 门面调用）。 */
export function setStartInProcessTeammate(fn: StartInProcessTeammateFn): void {
  startFn = fn
}

/** 测试复位（teardown 用）。 */
export function resetStartInProcessTeammate(): void {
  startFn = null
}

/** fail-fast 访问（seam ②：spawn 支未接线 = 初始化 bug，抛不吞）。 */
export function requireStartInProcessTeammate(): StartInProcessTeammateFn {
  if (!startFn) {
    throw new Error(
      'StartInProcessTeammate not wired — call setStartInProcessTeammate at composition root first (swarm inProcessRunner seam ②)',
    )
  }
  return startFn
}
