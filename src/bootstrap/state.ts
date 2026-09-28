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
 * ⑤ hooks bootstrap 3 成员（E-5 S-5a，§8.38 C-5 三层断补齐）— hooks 域
 *    bootstrap-env 6 成员中本域缺的 3 源（getTranscriptPath/getMainThreadAgentType/
 *    hasTrustAccepted）。三者均**窄适配 + 前向接缝登记**（防假「真行为」声明）：
 *    transcript 持久化读写 = E-7 session 波 / --agent 标志 = CLI 面 / 信任对话框 =
 *    UI 波（各消费点见组合根 compose.ts setHooksBootstrapEnv 接线头注）。
 * ⑥ projectRoot（S-D2a §8.57 worktree 工具本体子波回填）— getProjectRoot
 *    （旧仓 L84 真逻辑：自 process.cwd() 上探最近 `.git` 条目，逐字；消费方 =
 *    ExitWorktree 工具本体 restoreSessionToOriginalCwd 的 projectRootIsWorktree
 *    判别支）+ setProjectRoot（旧仓 L344 no-op stub 语义逐字落地为真 no-op——
 *    旧仓本即无行为，勿把签名当真行为，登记）。
 *
 * 砍除残余（归 engine/modelprovider 波，复审勿当遗漏重提）：turn 级累加器
 * （_turnHook/_turnTool/_turnClassifier，REPL 逐 query turn 重置）/
 * mainLoopModelOverride + getInitialMainLoopModel（modelprovider 域）/
 * remoteMode / spSectionCache 等 engine 面状态（sessionPersistence 经
 * §8.71.1.4 S-C4 重裁归 CLI 波，落 ⑥ 族，见下）。
 */
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { getConfigDirName } from '../shared'

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

// ── project root（S-D2a §8.57 回填；头注 ⑥ 登记）──────────────────────────
/**
 * 旧仓 bootstrap/state.ts:84 逐字：自 process.cwd() 上探最近含 `.git` 条目
 * 的目录（worktree = .git 文件 / 普通仓 = .git 目录），达文件系统根回落
 * process.cwd()。旧仓为 inline require('fs'/'path')，新仓顶层 import
 * （idiom 登记，判定链逐字）。消费方 = ExitWorktree 工具本体（S-D2b）。
 */
export function getProjectRoot(): string {
  let dir = process.cwd()
  for (;;) {
    if (existsSync(join(dir, '.git'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return process.cwd()
    }
    dir = parent
  }
}

/**
 * 旧仓 bootstrap/state.ts:344 = no-op stub（重建 stub 语义，本即无行为）。
 * 新仓落地为真 no-op（no-op 语义逐字；`: any` stub 面不落地——勿把签名
 * 当真行为，头注 ⑥ 登记）。消费方 = ExitWorktree 的
 * restoreSessionToOriginalCwd projectRootIsWorktree 支（S-D2b）。
 */
export function setProjectRoot(_v: string): void {
  // no-op（旧仓 stub 语义）
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

// ── ⑥ CLI 入口状态族（CLI 公共域波 §8.71 S-C2；旧仓 bootstrap/state.js 同族）──
// 消费方：cli 域 dispatch（clientType/preview 格式/session 来源/旁路权限
// 标记）+ S-C4 会话持久化 kill-switch（parse --no-session-persistence 支
// setter / engine/session project.ts shouldSkipPersistence getter）。
let _clientType: string | undefined
let _questionPreviewFormat: 'markdown' | 'html' | undefined
let _sessionSource: string | undefined
let _sessionBypassPermissionsMode = false

export function setClientType(t: string): void {
  _clientType = t
}

export function getClientType(): string | undefined {
  return _clientType
}

export function setQuestionPreviewFormat(f: 'markdown' | 'html'): void {
  _questionPreviewFormat = f
}

export function getQuestionPreviewFormat(): 'markdown' | 'html' | undefined {
  return _questionPreviewFormat
}

export function setSessionSource(s: string): void {
  _sessionSource = s
}

export function getSessionSource(): string | undefined {
  return _sessionSource
}

export function setSessionBypassPermissionsMode(v: boolean): void {
  _sessionBypassPermissionsMode = v
}

export function getSessionBypassPermissionsMode(): boolean {
  return _sessionBypassPermissionsMode
}

// 会话持久化 kill-switch（S-C4 回填；旧仓 bootstrap/state.ts set/get 2 函数
// 逐字语义：旧仓 main.tsx --no-session-persistence 支 setter，sessionStorage
// shouldSkipPersistence 支 getter）。setter 消费方 = cli/parse.ts
// --no-session-persistence 支（--print 面）；getter 消费方 =
// engine/session/project.ts shouldSkipPersistence 回填支。
let _sessionPersistenceDisabled = false

export function isSessionPersistenceDisabled(): boolean {
  return _sessionPersistenceDisabled
}

export function setSessionPersistenceDisabled(v: boolean): void {
  _sessionPersistenceDisabled = v
}

// settings flag 持有面（--settings 路径 / --setting-sources 白名单）。
// 本地型定义（L3：bootstrap 不 import engine 的 SettingSource 型；结构同型
// 'user'|'project'|'local'，engine 侧消费经组合根适配器，前向接缝登记）。
export type CliSettingSource = 'user' | 'project' | 'local'

let _flagSettingsPath: string | undefined
let _allowedSettingSources: readonly CliSettingSource[] | undefined

export function setFlagSettingsPath(p: string): void {
  _flagSettingsPath = p
}

export function getFlagSettingsPath(): string | undefined {
  return _flagSettingsPath
}

export function setAllowedSettingSources(
  sources: readonly CliSettingSource[],
): void {
  _allowedSettingSources = sources
}

export function getAllowedSettingSources():
  | readonly CliSettingSource[]
  | undefined {
  return _allowedSettingSources
}

/** 测试复位（⑥ 族 7 成员恢复缺省；单进程连跑泄漏守卫先例同型）。 */
export function resetCliEntryStateForTests(): void {
  _clientType = undefined
  _questionPreviewFormat = undefined
  _sessionSource = undefined
  _sessionBypassPermissionsMode = false
  _sessionPersistenceDisabled = false
  _flagSettingsPath = undefined
  _allowedSettingSources = undefined
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
  sessionCreatedTeams.clear()
}

// ── ⑥ 会话创建 team 集合（C 桶 ③ shell·swarm 波 S-E2b 扩 bootstrap，§8.66）──
// 旧仓 bootstrap/state.ts getSessionCreatedTeams 逐字面（Set 模块态 +
// resetStateForTests 清，避 PR #17615 跨 shard 泄漏类）。消费 = swarm 域
// teamHelpers register/unregister/cleanupSessionTeams（gracefulShutdown
// 接线 = 组合根残留守）。
const sessionCreatedTeams = new Set<string>()

/** 本会话创建的 team 集合（swarm 域 teamHelpers 消费）。 */
export function getSessionCreatedTeams(): Set<string> {
  return sessionCreatedTeams
}

// ── ⑤ hooks bootstrap 3 成员（E-5 S-5a，§8.38 C-5；前向接缝登记见头注 ⑤）──
// transcript 目录解析（同 engine/config configRoot 两级序，叶域本地实现不跨域 import）：
// 1. ATLAS_CONFIG_DIR env —— 显式覆盖整个 ~/.atlas 根（目录级 env）。
// 2. homedir() / getConfigDirName()（shared/configDir 单一事实源 .atlas）。
// 本函数**只产路径不做 I/O**——transcript 持久化（读写）= E-7 session 波残留守，
// 届时经 setTranscriptDir 整换（测试面亦用此接缝）。
function defaultTranscriptDir(): string {
  const root = process.env.ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())
  return join(root, 'sessions')
}

let _transcriptDir: string | undefined

/** 覆写 transcript 目录（测试 / E-7 session 波整换；未覆写走 defaultTranscriptDir）。 */
export function setTranscriptDir(dir: string): void {
  _transcriptDir = dir
}

/** 会话转录文件路径（窄适配：<dir>/<sessionId>.jsonl；持久化残留守见上）。 */
export function getTranscriptPathForSession(sessionId: string): string {
  const dir = _transcriptDir ?? defaultTranscriptDir()
  return join(dir, `${sessionId}.jsonl`)
}

// --agent 标志的主线程代理类型：缺省 undefined（CLI 面残留守，启动装配时
// 经 setMainThreadAgentType 接线；hooks 域 createBaseHookInput 消费，子代理
// agentInfo.agentType 优先于本缺省值，域内语义不变）。
let _mainThreadAgentType: string | undefined

export function setMainThreadAgentType(agentType: string | undefined): void {
  _mainThreadAgentType = agentType
}

export function getMainThreadAgentType(): string | undefined {
  return _mainThreadAgentType
}

// 工作区信任接受：缺省 true = headless 信任隐式（同 hooks 域 shouldSkipHookDueToTrust
// isNonInteractive 短路语义——非交互恒执行，本缺省仅在交互式路径生效）；
// 信任对话框 = UI 波残留守，届时经 setTrustAccepted 接线。
let _trustAccepted = true

export function setTrustAccepted(accepted: boolean): void {
  _trustAccepted = accepted
}

export function hasTrustAccepted(): boolean {
  return _trustAccepted
}

/** 测试复位（⑤ 族 3 成员恢复缺省：transcript 目录覆写清 / agent type undefined / trust true）。 */
export function resetHooksBootstrapMembersForTests(): void {
  _transcriptDir = undefined
  _mainThreadAgentType = undefined
  _trustAccepted = true
}
