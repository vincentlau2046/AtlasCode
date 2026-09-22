/**
 * bootstrap 域 — 进程/会话级全局状态（真子集，C-Deep 切片 3，任务清单 T1 之 bootstrap 部分）
 *
 * 旧仓 bootstrap/state.ts 373L 是"重建 stub"（头注明示 "stub exports"），本域只取
 * **真实现子集**（§8.14 裁定），~250 个 `: any` stub 导出整砍（勿把 `: any` stub
 * 签名当真行为）：
 * ① cwd 两状态 — originalCwd（进程启动，不可变语义）/ cwdState（可变，setup/setCwd
 *    细化）；executor BootstrapStatePort 适配器消费 + shell cd 跟踪（物理路径
 *    解析 / 目录消失恢复回落 originalCwd）
 * ② session id — randomUUID 初值，switchSession（/resume 等）
 * ③ interactive 标志 — -p/non-TTY 分支（旧仓 main.tsx 置位；no-op stub 会让
 *    headless 分支仍挂 Ink TUI → stdout 污染）
 * ④ cost state 累加器族 — 会话用量累加（/cost 显示 & 退出汇总；token 总量
 *    读时从 per-model usage 派生，单一事实源）
 *
 * 砍除残余（归 engine/modelprovider 波，复审勿当遗漏重提）：turn 级累加器
 * （_turnHook/_turnTool/_turnClassifier，REPL 逐 query turn 重置）/
 * mainLoopModelOverride + getInitialMainLoopModel（modelprovider 域）/
 * remoteMode / projectRoot / sessionPersistence / spSectionCache 等 engine 面状态。
 */
import { randomUUID } from 'crypto'

// ── ① cwd 两状态 ────────────────────────────────────────────────────────────
// originalCwd = 进程启动 cwd（不可变语义：当前 cwd 被命令删除时的回退目标）。
// cwdState = 当前工作目录，模块加载时以 process.cwd()（用户启动 TUI 的目录）
// 初始化，setup（setCwd → setCwdState）细化。
let _originalCwd: string = process.cwd()
let _cwdState: string = process.cwd()

export function getOriginalCwd(): string {
  return _originalCwd
}

export function setOriginalCwd(v: string): void {
  _originalCwd = v
}

export function getCwdState(): string {
  return _cwdState
}

export function setCwdState(v: string): void {
  _cwdState = v
}

// ── ② session id ────────────────────────────────────────────────────────────
let _sessionId: string = randomUUID()

export function getSessionId(): string {
  return _sessionId
}

export function switchSession(id: string, _projectDir?: string | null): void {
  if (id) _sessionId = id
}

// ── ③ interactive 标志 ──────────────────────────────────────────────────────
// 旧仓 main.tsx 在 -p/non-TTY 启动时置位。
let _isNonInteractiveSession = false

export function getIsInteractive(): boolean {
  return !_isNonInteractiveSession
}

export function getIsNonInteractiveSession(): boolean {
  return _isNonInteractiveSession
}

export function setIsInteractive(v: boolean): void {
  _isNonInteractiveSession = !v
}

// ── ④ cost state 累加器族（会话用量累加器）─────────────────────────────────
// 消费方：cost-tracker formatTotalCost() → /cost 显示 & 退出汇总。
// 写入方：toolExecution.addToToolDuration / diff.addToTotalLinesChanged /
// cost-tracker.addToTotalSessionCost → addToTotalCostState。
// 恢复/重置：setCostStateForRestore（/resume）、resetCostState（/clear）。
export type CostModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  contextWindow: number
  maxOutputTokens: number
}

export type CostState = {
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  modelUsage: Record<string, CostModelUsage>
}

function freshCostState(): CostState {
  return {
    totalAPIDuration: 0,
    totalAPIDurationWithoutRetries: 0,
    totalToolDuration: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    modelUsage: {},
  }
}

let _costState: CostState = freshCostState()

export function addToTotalCostState(modelUsage: CostModelUsage, model: string): void {
  // Token 总量读时从 per-model usage 派生（镜像原单一事实源设计）。
  _costState.modelUsage[model] = { ...modelUsage }
}

export function addToTotalDurationState(
  withRetries: number,
  withoutRetries: number,
): void {
  _costState.totalAPIDuration += withRetries
  _costState.totalAPIDurationWithoutRetries += withoutRetries
}

export function addToToolDuration(durationMs: number): void {
  _costState.totalToolDuration += durationMs
}

export function addToTotalLinesChanged(added: number, removed: number): void {
  _costState.totalLinesAdded += added
  _costState.totalLinesRemoved += removed
}

export function getModelUsage(): Record<string, CostModelUsage> {
  return _costState.modelUsage
}

export function getUsageForModel(model: string): CostModelUsage | undefined {
  return _costState.modelUsage[model]
}

export function getTotalAPIDuration(): number {
  return _costState.totalAPIDuration
}

export function getTotalAPIDurationWithoutRetries(): number {
  return _costState.totalAPIDurationWithoutRetries
}

export function getTotalToolDuration(): number {
  return _costState.totalToolDuration
}

export function getTotalDuration(): number {
  // Wall duration ≈ API duration + tool duration（原实现单独追踪 wall time，
  // 此近似保持 /cost 口径 sane）。
  return _costState.totalAPIDuration + _costState.totalToolDuration
}

export function getTotalLinesAdded(): number {
  return _costState.totalLinesAdded
}

export function getTotalLinesRemoved(): number {
  return _costState.totalLinesRemoved
}

export function getTotalInputTokens(): number {
  return Object.values(_costState.modelUsage).reduce(
    (sum, u) => sum + u.inputTokens,
    0,
  )
}

export function getTotalOutputTokens(): number {
  return Object.values(_costState.modelUsage).reduce(
    (sum, u) => sum + u.outputTokens,
    0,
  )
}

export function getTotalCacheReadInputTokens(): number {
  return Object.values(_costState.modelUsage).reduce(
    (sum, u) => sum + u.cacheReadInputTokens,
    0,
  )
}

export function getTotalCacheCreationInputTokens(): number {
  return Object.values(_costState.modelUsage).reduce(
    (sum, u) => sum + u.cacheCreationInputTokens,
    0,
  )
}

export function getTotalWebSearchRequests(): number {
  return Object.values(_costState.modelUsage).reduce(
    (sum, u) => sum + u.webSearchRequests,
    0,
  )
}

/** /resume 恢复（/resume 语义：从会话记录重建累加器）。 */
export function setCostStateForRestore(data: {
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  modelUsage?: Record<string, CostModelUsage>
}): void {
  _costState = {
    totalAPIDuration: data.totalAPIDuration ?? 0,
    totalAPIDurationWithoutRetries: data.totalAPIDurationWithoutRetries ?? 0,
    totalToolDuration: data.totalToolDuration ?? 0,
    totalLinesAdded: data.totalLinesAdded ?? 0,
    totalLinesRemoved: data.totalLinesRemoved ?? 0,
    modelUsage: data.modelUsage ? { ...data.modelUsage } : {},
  }
}

/** /clear 重置。 */
export function resetCostState(): void {
  _costState = freshCostState()
}

/** 测试复位（与 resetCostState 同语义，保留旧仓名）。 */
export function resetStateForTests(): void {
  _costState = freshCostState()
}
