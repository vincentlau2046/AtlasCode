/**
 * 多智能体编排层（coordinatorMode spawn/fan-out + spawnDepth, L4.8; engine 编排子模块非顶层域）
 *
 * T-5b（§8.25 E-2）落 isCoordinatorMode 门控（ON_BY_DEFAULT 73631df + kill-switch）。
 * T-5d 补 worker 两源提示词（getCoordinatorWorkerSystemPrompt / WORKER_AGENT /
 * getCoordinatorAgents）+ coordinator 主提示词（getCoordinatorSystemPrompt）+
 * user context（getCoordinatorUserContext）+ 会话模式对齐（matchSessionMode）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - src 内已消费：isCoordinatorMode（builtInAgents coordinator 分支 + AgentTool call
 *     深度门）/ getCoordinatorAgents（builtInAgents.coordinator 分支）。
 *   - 组合根（compose.ts，E-wave-end，残留守⑦）forward-declared 导出，src 暂无生产
 *     消费点，经 engine/index.ts 门面 re-export 等待装配：matchSessionMode /
 *     getCoordinatorUserContext / getCoordinatorSystemPrompt / getCoordinatorWorkerSystemPrompt。
 *   - WORKER_AGENT：getCoordinatorAgents 内部已消费（L78 return [WORKER_AGENT]）；standalone
 *     `export { WORKER_AGENT }` + engine/index.ts 门面 re-export 无 src 直接消费点 → 残留守
 *     （D 波若需按名引用 worker 定义再留，否则随组合根 ⑦ 一并收）。
 */
export {
  isCoordinatorMode,
  matchSessionMode,
  getCoordinatorUserContext,
  getCoordinatorSystemPrompt,
} from './coordinatorMode'
export {
  getCoordinatorWorkerSystemPrompt,
  getCoordinatorAgents,
  WORKER_AGENT,
} from './workerAgent'

// E-7 S-7a（§8.46）：tasks 追踪层（状态机框架 + LocalAgent/LocalShell 任务态 +
// stopTask 三态守卫 + 两态注册表 + 通知注入窗口 + 域内 utils 六件套）——
// 域门面全量 re-export（~60 名；engine/index.ts 门面按消费面显式收窄）。
export * from './tasks'
