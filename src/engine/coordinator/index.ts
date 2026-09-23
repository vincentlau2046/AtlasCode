/**
 * 多智能体编排层（coordinatorMode spawn/fan-out + spawnDepth, L4.8; engine 编排子模块非顶层域）
 *
 * T-5b（§8.25 E-2）落 isCoordinatorMode 门控（ON_BY_DEFAULT 73631df + kill-switch）。
 * T-5d 补 worker 两源提示词（getCoordinatorWorkerSystemPrompt / getCoordinatorAgents）
 * + coordinator 主提示词 + user context。
 */
export { isCoordinatorMode } from './coordinatorMode'
